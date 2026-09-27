import { formatDelta, formatPercent, formatRobux, percentChange } from '../../core/format';
import type { TradeBalance } from '../../core/trade';
import type { ItemValue } from '../../core/types';
import { formatUsd, formatUsdDelta } from '../../core/usd';
import { el } from '../dom';
import { pill } from './atoms';
import type { RenderContext } from './context';
import { glyph, icon } from './icons';
import { sourceLine } from './item-details';
import { createWidget } from './shadow';

const css = `
:host { display: block; margin: 18px 0 14px; }
.card {
  padding: 16px 18px;
  border-radius: var(--rl-radius-lg);
  border: 1px solid var(--rl-border);
  background: var(--rl-bg-raised);
  box-shadow: var(--rl-shadow);
  animation: rl-rise 0.3s ease both;
}
.head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.head .source { font-size: 11px; color: var(--rl-text-3); }
.verdict { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 14px 0 12px; }
.delta { font-size: 30px; font-weight: 700; letter-spacing: -0.03em; line-height: 1; }
.sub { margin-top: 6px; font-size: 12px; color: var(--rl-text-2); }
.card[data-verdict='win'] .delta { color: var(--rl-win); }
.card[data-verdict='loss'] .delta { color: var(--rl-loss); }
.verdict .rl-pill { height: 24px; padding: 0 10px; font-size: 12px; }

.bar { position: relative; display: flex; height: 8px; gap: 3px; margin: 4px 0 14px; }
.bar span { border-radius: 999px; transition: flex-grow 0.4s ease; min-width: 6px; }
.bar .give { background: var(--rl-surface-2); }
.bar .get { background: linear-gradient(90deg, var(--rl-brand-a), var(--rl-brand-b)); }
.card[data-verdict='loss'] .bar .get { background: var(--rl-loss); opacity: 0.85; }
.bar::after {
  content: ''; position: absolute; left: 50%; top: -3px; bottom: -3px; width: 2px;
  margin-left: -1px; border-radius: 1px; background: var(--rl-text-3); opacity: 0.35;
}

.sides { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.side { padding: 12px; border-radius: var(--rl-radius); background: var(--rl-surface); min-width: 0; }
.side .total { margin: 4px 0 8px; font-size: 18px; font-weight: 700; letter-spacing: -0.02em; }
.row { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--rl-text-2); line-height: 1.7; }
.row b { font-weight: 600; color: var(--rl-text); }
.row .usd { color: var(--rl-accent); }

.foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 12px; }
.notes { display: flex; flex-wrap: wrap; gap: 6px; }
.copy {
  display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px;
  border-radius: 8px; border: 1px solid var(--rl-border-strong);
  background: transparent; color: var(--rl-text-2);
  font: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}
.copy:hover { color: var(--rl-text); background: var(--rl-surface); }
.copy:focus-visible { outline: 2px solid var(--rl-accent); outline-offset: 2px; }
.copy.is-done { color: var(--rl-win); border-color: var(--rl-win); }
`;

export interface TradeSide {
  items: ItemValue[];
  usd: number | null;
}

export interface TradeView {
  balance: TradeBalance;
  give: TradeSide;
  receive: TradeSide;
}

function verdictOf(delta: number): 'win' | 'loss' | 'even' {
  return delta > 0 ? 'win' : delta < 0 ? 'loss' : 'even';
}

/** Plain-text summary for pasting into Discord or a trade ad. */
export function tradeSummaryText(view: TradeView, compact: boolean): string {
  const names = (items: ItemValue[]) => items.map((item) => item.acronym || item.name).join(', ') || 'nothing';
  const { balance } = view;
  const pct = percentChange(balance.valueDelta, balance.give.value);
  return [
    `Give: ${names(view.give.items)} (${formatRobux(balance.give.value, compact)})`,
    `Get: ${names(view.receive.items)} (${formatRobux(balance.receive.value, compact)})`,
    `Net: ${formatDelta(balance.valueDelta, compact)} value${pct === null ? '' : ` (${formatPercent(pct)})`}, ${formatDelta(balance.rapDelta, compact)} RAP`,
    'Values: Rolimons via RoLens',
  ].join('\n');
}

function sideBlock(label: string, total: number, rap: number, side: TradeSide, ctx: RenderContext): HTMLElement {
  const compact = ctx.settings.compactNumbers;
  const rare = side.items.filter((item) => item.rare).length;
  return el(
    'div',
    'side',
    el('div', 'rl-eyebrow', label),
    el('div', 'total', formatRobux(total, compact)),
    el('div', 'row', el('span', '', 'RAP'), el('b', '', formatRobux(rap, compact))),
    side.usd === null ? null : el('div', 'row', el('span', '', 'USD'), el('b', 'usd', formatUsd(side.usd, compact))),
    el('div', 'row', el('span', '', 'Items'), el('b', '', `${side.items.length}${rare ? ` · ${rare} rare` : ''}`)),
  );
}

export function createTradeCard(view: TradeView, ctx: RenderContext): HTMLElement {
  const compact = ctx.settings.compactNumbers;
  const { balance } = view;
  const verdict = verdictOf(balance.valueDelta);
  const pct = percentChange(balance.valueDelta, balance.give.value);
  const usdDelta = view.give.usd !== null && view.receive.usd !== null ? view.receive.usd - view.give.usd : null;
  const { host, root } = createWidget('trade', css, 'section');

  const totalValue = balance.give.value + balance.receive.value;
  const giveShare = totalValue === 0 ? 1 : balance.give.value / totalValue;

  const notes: HTMLElement[] = [];
  const rare = [...view.give.items, ...view.receive.items].filter((item) => item.rare).length;
  if (rare) notes.push(pill(`${rare} rare`, 'rare', 'gem'));
  if (balance.give.hasProjected || balance.receive.hasProjected) notes.push(pill('Projected item', 'warn', 'warning'));
  const unknown = balance.give.unknownIds.length + balance.receive.unknownIds.length;
  if (unknown) notes.push(pill(`${unknown} without data`, undefined, 'help'));

  const copy = el('button', 'copy', icon('copy'), 'Copy summary');
  copy.type = 'button';
  copy.addEventListener('click', () => {
    void navigator.clipboard.writeText(tradeSummaryText(view, compact)).then(() => {
      copy.classList.add('is-done');
      copy.replaceChildren(icon('check'), 'Copied');
      window.setTimeout(() => {
        copy.classList.remove('is-done');
        copy.replaceChildren(icon('copy'), 'Copy summary');
      }, 1600);
    });
  });

  const card = el(
    'div',
    'card',
    el('div', 'head', el('span', 'rl-brand', glyph(16), 'RoLens'), el('span', 'source', sourceLine(ctx))),
    el(
      'div',
      'verdict',
      el(
        'div',
        '',
        el('div', 'rl-eyebrow', 'Net value'),
        el('div', 'delta', formatDelta(balance.valueDelta, compact)),
        el(
          'div',
          'sub',
          `${formatDelta(balance.rapDelta, compact)} RAP`,
          usdDelta === null ? '' : ` · ${formatUsdDelta(usdDelta, compact)}`,
        ),
      ),
      pill(
        `${verdict === 'win' ? 'Win' : verdict === 'loss' ? 'Loss' : 'Even'}${pct === null ? '' : ` ${formatPercent(pct)}`}`,
        verdict === 'even' ? undefined : verdict,
      ),
    ),
    el('div', 'bar', el('span', 'give'), el('span', 'get')),
    el(
      'div',
      'sides',
      sideBlock('You give', balance.give.value, balance.give.rap, view.give, ctx),
      sideBlock('You get', balance.receive.value, balance.receive.rap, view.receive, ctx),
    ),
    el('div', 'foot', el('div', 'notes', ...notes), copy),
  );
  card.dataset.verdict = verdict;
  const [give, get] = card.querySelectorAll<HTMLElement>('.bar span');
  give!.style.flexGrow = String(giveShare);
  get!.style.flexGrow = String(1 - giveShare);
  root.append(card);
  host.dataset.verdict = verdict;
  return host;
}
