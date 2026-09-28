import { formatAge, formatDelta, plural } from '../../core/format';
import { el } from '../dom';
import type { ValuedTrade } from '../trade-values';
import { button, openModal } from './modal';

/*
 * The confirmation for cancelling outbound trades. It lists every trade that will be
 * cancelled, each with a checkbox, and nothing is cancelled until the user presses the
 * button naming how many. While cancelling, the dialog cannot be closed and shows progress.
 */

export type CancelMode = 'all' | 'unowned';

export interface CancelCandidate {
  id: number;
  partner: string;
  created: number | null;
  /** Null when the trade's items have not been read. */
  valued: ValuedTrade | null;
  /** Positions in `valued.give.items` of items the user no longer owns. */
  missing: number[];
}

const css = `
.intro { margin: 0 0 12px; font-size: 13px; color: var(--rl-text-2); line-height: 1.5; }
.list { display: grid; gap: 6px; padding-bottom: 4px; }
.trade {
  display: grid; grid-template-columns: 20px 1fr auto; gap: 4px 12px; align-items: start;
  padding: 10px 12px; border-radius: 12px; background: var(--rl-surface); cursor: pointer;
}
.trade input { margin: 2px 0 0; width: 16px; height: 16px; accent-color: var(--rl-loss); cursor: pointer; }
.who { font-size: 13px; font-weight: 650; }
.when { font-weight: 500; color: var(--rl-text-3); }
.net { font-size: 12.5px; font-weight: 700; font-variant-numeric: tabular-nums; }
.net[data-verdict='win'] { color: var(--rl-win); }
.net[data-verdict='loss'] { color: var(--rl-loss); }
.items { grid-column: 2 / 4; font-size: 12px; color: var(--rl-text-2); line-height: 1.5; }
.items .gone { color: var(--rl-loss); font-weight: 600; }
.items .label { color: var(--rl-text-3); }
.select { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 0 10px; }
.select .label { font-size: 12px; font-weight: 650; color: var(--rl-text-3); margin-right: 2px; }
.chip {
  display: inline-flex; align-items: center; gap: 4px; height: 28px; padding: 0 10px; border: 1px solid var(--rl-border);
  border-radius: 999px; background: var(--rl-bg-raised); color: var(--rl-text-2); font: inherit; font-size: 12px; font-weight: 650; cursor: pointer;
}
.chip:hover { background: var(--rl-surface); color: var(--rl-text); }
.chip:focus-visible, .chip select:focus-visible { outline: 2px solid var(--rl-accent); outline-offset: 1px; }
.chip[aria-pressed='true'] { border-color: var(--rl-accent); color: var(--rl-accent); background: color-mix(in srgb, var(--rl-accent) 8%, var(--rl-bg-raised)); }
.chip select {
  height: 20px; border: 0; border-radius: 5px; background: var(--rl-surface); color: inherit; font: inherit; cursor: pointer;
}
.progress { height: 4px; margin: 4px 0 16px; border-radius: 999px; background: var(--rl-surface); overflow: hidden; }
.progress i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, var(--rl-brand-a), var(--rl-brand-b)); transition: width 0.3s ease; }
`;

export interface CancelDialog {
  progress(message: string, share?: number): void;
  message(text: string): void;
  confirm(candidates: CancelCandidate[], now: number, onConfirm: (ids: number[]) => void): void;
  done(text: string, onReload: () => void): void;
}

const TITLES: Record<CancelMode, string> = {
  all: 'Review outbound trades',
  unowned: 'Cancel trades with items you no longer own',
};

function itemsLine(candidate: CancelCandidate): HTMLElement {
  const line = el('div', 'items');
  if (!candidate.valued) {
    line.append(el('span', 'label', 'Items not read yet'));
    return line;
  }
  line.append(el('span', 'label', 'You give '));
  const give = candidate.valued.give;
  give.items.forEach((entry, i) => {
    if (i > 0) line.append(', ');
    const name = entry.name || 'Unnamed item';
    line.append(
      candidate.missing.includes(i) ? el('span', 'gone', `${name} (no longer owned)`) : document.createTextNode(name),
    );
  });
  if (give.robux) line.append(`${give.items.length ? ', ' : ''}${give.robux} Robux`);
  if (!give.items.length && !give.robux) line.append('nothing');
  const receive = candidate.valued.receive;
  const received = [...receive.items.map((entry) => entry.name || 'Unnamed item')];
  if (receive.robux) received.push(`${receive.robux} Robux`);
  line.append(el('span', 'label', ' for '), received.join(', ') || 'nothing');
  return line;
}

const DAY = 86_400_000;
const AGES = [3, 7, 14, 30];

/**
 * Quick selections above the list: all, none, trades older than a chosen number of days,
 * and trades in which you give more value than you receive. Each sets the checkboxes,
 * which stay editable one by one.
 */
function selectionChips(
  candidates: CancelCandidate[],
  now: number,
  boxes: Map<number, HTMLInputElement>,
  changed: () => void,
): { element: HTMLElement; clear: () => void } {
  const chips: HTMLButtonElement[] = [];
  const chip = (label: string | Node[], pick: (candidate: CancelCandidate) => boolean) => {
    const node = el('button', 'chip', ...(typeof label === 'string' ? [label] : label));
    node.type = 'button';
    node.setAttribute('aria-pressed', 'false');
    const apply = () => {
      for (const candidate of candidates) boxes.get(candidate.id)!.checked = pick(candidate);
      for (const other of chips) other.setAttribute('aria-pressed', String(other === node));
      changed();
    };
    node.addEventListener('click', (event) => {
      if ((event.target as Element).closest('select')) return;
      apply();
    });
    chips.push(node);
    return Object.assign(node, { apply });
  };
  const age = el('select');
  age.setAttribute('aria-label', 'Minimum age in days');
  for (const days of AGES) {
    const option = el('option', '', `${days} days`);
    option.value = String(days);
    age.append(option);
  }
  age.value = '7';
  const older = chip(
    [document.createTextNode('Older than'), age],
    (candidate) => candidate.created !== null && now - candidate.created > Number(age.value) * DAY,
  );
  age.addEventListener('change', () => older.apply());
  const losing = chip('Losing value', (candidate) => (candidate.valued?.balance.valueDelta ?? 0) < 0);
  const all = chip('All', () => true);
  const none = chip('None', () => false);
  const element = el('div', 'select', el('span', 'label', 'Select'), all, older, losing, none);
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', 'Select trades');
  all.setAttribute('aria-pressed', 'true');
  return { element, clear: () => chips.forEach((node) => node.setAttribute('aria-pressed', 'false')) };
}

export function openCancelDialog(mode: CancelMode, opener: HTMLElement | null, compact: boolean): CancelDialog {
  const modal = openModal('cancel-dialog', TITLES[mode], opener, { css, width: 620 });
  const bar = el('i');
  const status = el('div', 'status');

  const showStatus = (text: string, share?: number) => {
    modal.body.replaceChildren(status);
    status.textContent = text;
    if (share !== undefined) {
      bar.style.width = `${Math.round(Math.min(1, Math.max(0, share)) * 100)}%`;
      modal.body.append(el('div', 'progress', bar));
    }
  };
  showStatus('Reading your outbound trades…');
  modal.foot.replaceChildren(el('span', 'note', 'Nothing is cancelled until you confirm.'));

  return {
    progress: showStatus,
    message(text) {
      modal.setBusy(false);
      showStatus(text);
      const close = button('Close');
      close.addEventListener('click', modal.close);
      modal.foot.replaceChildren(el('span', 'note'), close);
    },
    confirm(candidates, now, onConfirm) {
      const boxes = new Map<number, HTMLInputElement>();
      const rows = candidates.map((candidate) => {
        const box = el('input');
        box.type = 'checkbox';
        box.checked = true;
        box.setAttribute('aria-label', `Cancel the trade with ${candidate.partner}`);
        boxes.set(candidate.id, box);
        const net = candidate.valued
          ? el('span', 'net', formatDelta(candidate.valued.balance.valueDelta, compact))
          : el('span');
        if (candidate.valued) {
          const delta = candidate.valued.balance.valueDelta;
          net.dataset.verdict = delta > 0 ? 'win' : delta < 0 ? 'loss' : 'even';
        }
        const when = candidate.created === null ? '' : ` · sent ${formatAge(candidate.created, now)}`;
        return el(
          'label',
          'trade',
          box,
          el('span', 'who', candidate.partner, el('span', 'when', when)),
          net,
          itemsLine(candidate),
        );
      });
      const select = selectionChips(candidates, now, boxes, () => paint());
      const confirmButton = button('', 'danger');
      const keep = button('Keep trades');
      const paint = () => {
        const count = [...boxes.values()].filter((box) => box.checked).length;
        confirmButton.textContent = `Cancel ${plural(count, 'trade')}`;
        confirmButton.disabled = count === 0;
      };
      for (const box of boxes.values()) box.addEventListener('change', () => (select.clear(), paint()));
      paint();
      keep.addEventListener('click', modal.close);
      confirmButton.addEventListener('click', () => {
        const ids = [...boxes].filter(([, box]) => box.checked).map(([id]) => id);
        if (!ids.length) return;
        modal.setBusy(true);
        modal.foot.replaceChildren(el('span', 'note', 'Cancelling. Please keep this tab open.'));
        onConfirm(ids);
      });
      const intro =
        mode === 'unowned'
          ? `${plural(candidates.length, 'outbound trade')} ${candidates.length === 1 ? 'offers' : 'offer'} items you no longer own, so Roblox can never complete ${candidates.length === 1 ? 'it' : 'them'}.`
          : `You have ${plural(candidates.length, 'outbound trade')}.`;
      modal.body.replaceChildren(
        el('p', 'intro', `${intro} The selected trades will be cancelled on Roblox. This cannot be undone.`),
        ...(candidates.length > 1 ? [select.element] : []),
        el('div', 'list', ...rows),
      );
      modal.foot.replaceChildren(el('span', 'note'), keep, confirmButton);
      keep.focus();
    },
    done(text, onReload) {
      modal.setBusy(false);
      showStatus(text);
      const reload = button('Reload trades', 'primary');
      reload.addEventListener('click', onReload);
      const close = button('Close');
      close.addEventListener('click', modal.close);
      modal.foot.replaceChildren(el('span', 'note'), close, reload);
    },
  };
}
