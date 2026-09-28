import { formatAge, formatDelta, formatRobux } from '../../core/format';
import { filterHistory, netOf, summariseHistory, type HistoryEntry } from '../../core/trade-history';
import { el } from '../dom';
import type { ValuedTrade } from '../trade-values';
import { icon } from './icons';
import { button, openModal } from './modal';

/*
 * Trade history: totals for completed trades over a chosen period, the best and worst
 * trade, and every trade with its result. Partner search narrows everything at once.
 */

export interface HistoryTrade extends HistoryEntry {
  valued: ValuedTrade | null;
}

const RANGES: { label: string; days: number | null }[] = [
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: 'All', days: null },
];

const css = `
.controls { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 0 12px; }
.chip {
  height: 28px; padding: 0 11px; border: 1px solid var(--rl-border); border-radius: 999px; background: var(--rl-bg-raised);
  color: var(--rl-text-2); font: inherit; font-size: 12px; font-weight: 650; cursor: pointer;
}
.chip:hover { background: var(--rl-surface); color: var(--rl-text); }
.chip[aria-pressed='true'] { border-color: var(--rl-accent); color: var(--rl-accent); background: color-mix(in srgb, var(--rl-accent) 8%, var(--rl-bg-raised)); }
.chip:focus-visible { outline: 2px solid var(--rl-accent); outline-offset: 1px; }
.search { margin-left: auto; display: flex; align-items: center; gap: 6px; height: 28px; width: 190px; padding: 0 9px; border-radius: 8px; background: var(--rl-surface); color: var(--rl-text-3); }
.search:focus-within { box-shadow: inset 0 0 0 1px var(--rl-accent); }
.search .rl-icon { flex: none; width: 13px; height: 13px; }
.search input { flex: 1; min-width: 0; border: 0; background: none; color: var(--rl-text); font: inherit; font-size: 12px; outline: none; }
.search input::placeholder { color: var(--rl-text-3); }
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 0 0 8px; }
.stat { padding: 9px 11px; border-radius: 10px; background: var(--rl-surface); min-width: 0; }
.stat b { display: block; font-size: 15px; font-weight: 750; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stat span { display: block; margin-top: 1px; font-size: 11px; font-weight: 600; color: var(--rl-text-3); white-space: nowrap; }
[data-verdict='win'] { color: var(--rl-win); }
[data-verdict='loss'] { color: var(--rl-loss); }
.extremes { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 0 0 12px; }
.extreme { display: flex; align-items: baseline; gap: 6px; padding: 7px 11px; border-radius: 10px; border: 1px solid var(--rl-border); font-size: 12px; min-width: 0; }
.extreme .label { flex: none; font-weight: 650; color: var(--rl-text-3); }
.extreme .who { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--rl-text-2); }
.extreme b { flex: none; font-variant-numeric: tabular-nums; }
.list { display: grid; gap: 4px; padding-bottom: 4px; }
.trade { display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; padding: 8px 11px; border-radius: 10px; background: var(--rl-surface); }
.trade .who { font-size: 12.5px; font-weight: 650; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.trade .when { font-weight: 500; color: var(--rl-text-3); }
.trade .net { font-size: 12.5px; font-weight: 700; font-variant-numeric: tabular-nums; }
.trade .items { grid-column: 1 / 3; font-size: 11.5px; color: var(--rl-text-2); line-height: 1.45; }
.trade .items .label { color: var(--rl-text-3); }
.empty { padding: 28px 12px; text-align: center; font-size: 13px; color: var(--rl-text-3); }
.progress { height: 4px; margin: 4px 0 16px; border-radius: 999px; background: var(--rl-surface); overflow: hidden; }
.progress i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, var(--rl-brand-a), var(--rl-brand-b)); transition: width 0.3s ease; }
`;

export interface HistoryDialog {
  progress(message: string, share?: number, onStop?: () => void): void;
  message(text: string): void;
  show(trades: HistoryTrade[], now: number, note: string): void;
}

const verdict = (net: number) => (net > 0 ? 'win' : net < 0 ? 'loss' : 'even');

function names(side: ValuedTrade['give']): string {
  const parts = side.items.map((entry) => entry.name || 'Unnamed item');
  if (side.robux) parts.push(`${side.robux} Robux`);
  return parts.join(', ') || 'nothing';
}

function tradeRow(trade: HistoryTrade, now: number, compact: boolean): HTMLElement {
  const net = netOf(trade);
  const netNode = el('span', 'net', net === null ? '' : formatDelta(net, compact));
  if (net !== null) netNode.dataset.verdict = verdict(net);
  const when = trade.created === null ? '' : ` · ${formatAge(trade.created, now)}`;
  const items = trade.valued
    ? el(
        'div',
        'items',
        el('span', 'label', 'You gave '),
        names(trade.valued.give),
        el('span', 'label', ' for '),
        names(trade.valued.receive),
      )
    : el('div', 'items', el('span', 'label', 'Items could not be read'));
  return el('div', 'trade', el('span', 'who', trade.partner, el('span', 'when', when)), netNode, items);
}

function stat(value: string, label: string, tone?: string): HTMLElement {
  const node = el('div', 'stat', el('b', '', value), el('span', '', label));
  if (tone) node.firstElementChild!.setAttribute('data-verdict', tone);
  return node;
}

export function openHistoryDialog(opener: HTMLElement | null, compact: boolean): HistoryDialog {
  const modal = openModal('history-dialog', 'Trade history', opener, { css, width: 640 });
  const bar = el('i');
  const status = el('div', 'status');
  const close = button('Close');
  close.addEventListener('click', modal.close);

  const showStatus = (text: string, share?: number) => {
    modal.body.replaceChildren(status);
    status.textContent = text;
    if (share !== undefined) {
      bar.style.width = `${Math.round(Math.min(1, Math.max(0, share)) * 100)}%`;
      modal.body.append(el('div', 'progress', bar));
    }
  };
  showStatus('Reading your completed trades…');
  modal.foot.replaceChildren(el('span', 'note', 'Trades you have read before are not read again.'), close);

  return {
    progress(text, share, onStop) {
      showStatus(text, share);
      if (onStop && !modal.foot.querySelector('[data-stop]')) {
        const stop = button('Show results so far');
        stop.dataset.stop = '';
        stop.addEventListener('click', onStop);
        modal.foot.replaceChildren(el('span', 'note', 'Roblox allows about one trade per second.'), close, stop);
      }
    },
    message(text) {
      showStatus(text);
      modal.foot.replaceChildren(el('span', 'note'), close);
    },
    show(trades, now, note) {
      // Ninety days when there are trades in that period, otherwise everything.
      let days: number | null = filterHistory(trades, 90, '', now).length ? 90 : null;
      const query = el('input');
      query.type = 'search';
      query.placeholder = 'Filter by partner';
      query.setAttribute('aria-label', 'Filter by partner');
      const chips = RANGES.map((range) => {
        const chip = el('button', 'chip', range.label);
        chip.type = 'button';
        chip.addEventListener('click', () => {
          days = range.days;
          paint();
        });
        return { chip, range };
      });
      const content = el('div');
      const paint = () => {
        for (const { chip, range } of chips) chip.setAttribute('aria-pressed', String(range.days === days));
        const shown = filterHistory(trades, days, query.value, now);
        const summary = summariseHistory(shown);
        if (!shown.length) {
          content.replaceChildren(el('div', 'empty', 'No completed trades match.'));
          return;
        }
        const extreme = (label: string, entry: HistoryEntry | null) => {
          const net = entry ? netOf(entry)! : null;
          const value = el('b', '', net === null ? '' : formatDelta(net, compact));
          if (net !== null) value.dataset.verdict = verdict(net);
          return el('div', 'extreme', el('span', 'label', label), el('span', 'who', entry?.partner ?? 'None'), value);
        };
        content.replaceChildren(
          el(
            'div',
            'stats',
            stat(
              summary.valued ? formatDelta(summary.net, compact) : '—',
              'Net value',
              summary.valued ? verdict(summary.net) : undefined,
            ),
            stat(formatRobux(summary.given, compact), 'Value given'),
            stat(formatRobux(summary.received, compact), 'Value received'),
            stat(`${summary.wins} of ${summary.valued}`, 'Trades that gained'),
          ),
          el('div', 'extremes', extreme('Best', summary.best), extreme('Worst', summary.worst)),
          el('div', 'list', ...shown.map((trade) => tradeRow(trade, now, compact))),
        );
      };
      query.addEventListener('input', paint);
      modal.body.replaceChildren(
        el('div', 'controls', ...chips.map(({ chip }) => chip), el('label', 'search', icon('search'), query)),
        content,
      );
      paint();
      modal.foot.replaceChildren(el('span', 'note', note), close);
    },
  };
}
