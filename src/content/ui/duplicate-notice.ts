import { formatAge, formatDelta, formatRobux, plural } from '../../core/format';
import { effectiveValue } from '../../core/types';
import { el } from '../dom';
import type { ValuedSide, ValuedTrade } from '../trade-values';
import type { RenderContext } from './context';
import { icon } from './icons';
import { attachPopover, createPopover } from './popover';
import { createWidget } from './shadow';

/*
 * A one-line notice on the send-trade page when a trade to the same player is still
 * pending, so the same offer is not sent twice. Hovering or focusing it shows the
 * earlier trades with their items and values.
 */

export interface PendingTrade {
  id: number;
  created: number | null;
  expires: number | null;
  /** The trade's contents and values; null while loading or when they could not be read. */
  valued: ValuedTrade | null;
}

export interface DuplicateView {
  partner: string;
  /** The newest pending trades, shown in the details. */
  trades: PendingTrade[];
  /** All pending trades with this player, which may be more than are shown. */
  count: number;
  now: number;
}

const css = `
:host { display: block; margin: 0 0 10px; }
.notice {
  display: flex; align-items: center; gap: 10px; min-height: 36px; padding: 6px 12px 6px 8px;
  border-radius: 10px; outline: none; cursor: default;
  background: var(--rl-warn-soft); color: var(--rl-text);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--rl-warn) 22%, transparent);
  font-size: 12.5px; line-height: 1.35;
  animation: rl-rise 0.24s ease both;
}
.notice:focus-visible { box-shadow: inset 0 0 0 1px var(--rl-warn), 0 0 0 2px color-mix(in srgb, var(--rl-warn) 35%, transparent); }
.badge {
  flex: none; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 999px;
  background: color-mix(in srgb, var(--rl-warn) 16%, transparent); color: var(--rl-warn);
}
.badge .rl-icon { width: 13px; height: 13px; }
.text { flex: 1; min-width: 0; }
.text b { font-weight: 650; }
.more { flex: none; font-size: 11.5px; font-weight: 600; color: var(--rl-warn); white-space: nowrap; }
`;

const panelCss = `
:host { z-index: 2147483000; }
.panel {
  width: 340px; padding: 6px;
  border-radius: var(--rl-radius-lg); border: 1px solid var(--rl-border);
  background: var(--rl-bg-raised); box-shadow: var(--rl-shadow-lg);
  opacity: 0; transform: translateY(4px) scale(0.98);
  transition: opacity 0.14s ease, transform 0.14s ease;
}
.panel.is-open { opacity: 1; transform: none; }
.trade { padding: 10px; }
.trade + .trade { border-top: 1px solid var(--rl-border); }
.head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
.when { flex: 1; min-width: 0; font-size: 12px; font-weight: 650; }
.ago { font-weight: 500; color: var(--rl-text-3); }
.net { font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; }
.net[data-verdict='win'] { color: var(--rl-win); }
.net[data-verdict='loss'] { color: var(--rl-loss); }
.side { display: flex; gap: 8px; font-size: 11.5px; }
.rows { flex: 1; min-width: 0; display: grid; gap: 3px; }
.side + .side { margin-top: 6px; }
.label { flex: none; width: 58px; color: var(--rl-text-3); font-weight: 600; font-size: 10.5px; letter-spacing: 0.04em; text-transform: uppercase; padding-top: 1px; }
.item { display: flex; gap: 8px; min-width: 0; }
.name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--rl-text-2); }
.value { flex: none; font-weight: 650; font-variant-numeric: tabular-nums; }
.value.is-missing { font-weight: 500; color: var(--rl-text-3); }
.muted { font-size: 11.5px; color: var(--rl-text-3); }
`;

const panel = createPopover('duplicate-panel', panelCss, { width: 340, placement: 'below', hideDelay: 120 });

const dateFormat = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

function sideRows(label: string, side: ValuedSide, compact: boolean): HTMLElement {
  const rows: HTMLElement[] = side.items.map(({ name, item }) =>
    el(
      'span',
      'item',
      el('span', 'name', name || 'Unnamed item'),
      item
        ? el('span', 'value', formatRobux(effectiveValue(item), compact))
        : el('span', 'value is-missing', 'No value'),
    ),
  );
  if (side.robux > 0) {
    rows.push(el('span', 'item', el('span', 'name', 'Robux'), el('span', 'value', formatRobux(side.robux, compact))));
  }
  if (rows.length === 0) rows.push(el('span', 'item', el('span', 'name', 'Nothing')));
  return el('div', 'side', el('span', 'label', label), el('div', 'rows', ...rows));
}

function tradeDetails(trade: PendingTrade, now: number, compact: boolean): HTMLElement {
  const when = trade.created === null ? 'Sent' : `Sent ${dateFormat.format(trade.created)}`;
  const head = el(
    'div',
    'head',
    el('span', 'when', when, trade.created === null ? null : el('span', 'ago', ` · ${formatAge(trade.created, now)}`)),
  );
  if (!trade.valued) return el('div', 'trade', head, el('div', 'muted', 'Loading the items in this trade.'));
  const { balance, unlisted } = trade.valued;
  const net = el('span', 'net', formatDelta(balance.valueDelta, compact));
  net.dataset.verdict = balance.valueDelta > 0 ? 'win' : balance.valueDelta < 0 ? 'loss' : 'even';
  if (unlisted) net.title = `${unlisted} unvalued ${unlisted === 1 ? 'item is' : 'items are'} not counted`;
  head.append(net);
  return el(
    'div',
    'trade',
    head,
    sideRows('You give', trade.valued.give, compact),
    sideRows('You get', trade.valued.receive, compact),
  );
}

function message(view: DuplicateView): (Node | string)[] {
  const [latest] = view.trades;
  const since = latest?.created ? formatAge(latest.created, view.now) : null;
  if (view.count === 1) {
    return ['You already have a pending trade with ', el('b', '', view.partner), since ? `, sent ${since}.` : '.'];
  }
  return [
    `You already have ${plural(view.count, 'pending trade')} with `,
    el('b', '', view.partner),
    since ? `. The latest was sent ${since}.` : '.',
  ];
}

/** Creates or updates the notice in place. */
export function renderDuplicateNotice(
  existing: HTMLElement | null,
  view: DuplicateView,
  ctx: RenderContext,
): HTMLElement {
  const compact = ctx.settings.compactNumbers;
  const key = JSON.stringify([
    view.partner,
    view.count,
    view.trades.map((trade) => [trade.id, trade.valued?.balance.valueDelta ?? null]),
    Math.floor(view.now / 60_000),
    compact,
  ]);
  if (existing?.dataset.state === key) return existing;
  const host = existing ?? createWidget('duplicate-notice', css, 'div').host;
  host.dataset.state = key;
  const root = host.shadowRoot!;
  root.querySelector('.notice')?.remove();

  const notice = el(
    'div',
    'notice',
    el('span', 'badge', icon('warning')),
    el('span', 'text', ...message(view)),
    el('span', 'more', view.count === 1 ? 'View trade' : 'View trades'),
  );
  notice.tabIndex = 0;
  notice.setAttribute('role', 'note');
  const hidden = view.count - view.trades.length;
  attachPopover(notice, panel, () => [
    ...view.trades.map((trade) => tradeDetails(trade, view.now, compact)),
    hidden > 0 ? el('div', 'trade muted', `${plural(hidden, 'older trade')} not shown.`) : '',
  ]);
  root.append(notice);
  return host;
}
