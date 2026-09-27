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
  all: 'Cancel all outbound trades',
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
      const confirmButton = button('', 'danger');
      const keep = button('Keep trades');
      const paint = () => {
        const count = [...boxes.values()].filter((box) => box.checked).length;
        confirmButton.textContent = `Cancel ${plural(count, 'trade')}`;
        confirmButton.disabled = count === 0;
      };
      for (const box of boxes.values()) box.addEventListener('change', paint);
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
