import { formatDelta, formatPercent, formatRobux, percentChange } from '../../core/format';
import type { TradeBalance } from '../../core/trade';
import type { ItemValue } from '../../core/types';
import { formatUsd, formatUsdDelta } from '../../core/usd';
import { el } from '../dom';
import { pill } from './atoms';
import type { RenderContext } from './context';
import { glyph, icon, type IconName } from './icons';
import { sourceLine, sourcesDisagree } from './item-details';
import { createWidget } from './shadow';
import { attachTip } from './tooltip';

/*
 * The trade analysis is a single 44px bar by default, so it never pushes the trade
 * down. The verdict, net value and warnings are all in that one line; per-side detail
 * slides open on demand and the choice is remembered.
 */
const css = `
:host { display: block; margin: 14px 0 12px; }
.wrap {
  position: relative; overflow: hidden;
  border-radius: var(--rl-radius);
  border: 1px solid var(--rl-border);
  background: var(--rl-bg-raised);
  box-shadow: var(--rl-shadow-sm);
  animation: rl-rise 0.3s ease both;
}
.bar { display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 6px 0 12px; min-width: 0; }
.bar .rl-pill { height: 22px; font-size: 11.5px; padding: 0 8px; }
.delta { font-size: 15px; font-weight: 700; letter-spacing: -0.02em; white-space: nowrap; }
.wrap[data-verdict='win'] .delta { color: var(--rl-win); }
.wrap[data-verdict='loss'] .delta { color: var(--rl-loss); }
.usd-delta { font-size: 13px; font-weight: 650; color: var(--rl-accent); white-space: nowrap; }
.usd-delta.is-loss { color: var(--rl-loss); }
.meta { font-size: 12px; color: var(--rl-text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.spacer { flex: 1; }
.flags { display: flex; gap: 4px; flex: none; }
.flag {
  display: inline-flex; align-items: center; gap: 3px; height: 22px; padding: 0 6px;
  border-radius: 999px; font-size: 11px; font-weight: 650; background: var(--rl-surface); color: var(--rl-text-2);
}
.flag { cursor: help; outline: none; transition: filter 0.15s ease; }
.flag:hover, .flag:focus-visible { filter: brightness(0.95) saturate(1.3); }
.flag:focus-visible { box-shadow: 0 0 0 2px var(--rl-accent); }
.flag .rl-icon { width: 12px; height: 12px; }
.flag--rare { background: var(--rl-rare-soft); color: var(--rl-rare-text); }
.flag--warn { background: var(--rl-warn-soft); color: var(--rl-warn); }
.btn {
  display: grid; place-items: center; flex: none; width: 30px; height: 30px;
  border: 0; border-radius: 8px; background: transparent; color: var(--rl-text-3); cursor: pointer;
}
.btn:hover { background: var(--rl-surface); color: var(--rl-text); }
.btn:focus-visible { outline: 2px solid var(--rl-accent); outline-offset: 1px; }
.btn.is-done { color: var(--rl-win); }
.chev { transition: transform 0.25s cubic-bezier(0.2, 0, 0, 1); }
.wrap.is-open .chev { transform: rotate(180deg); }

.balance { position: absolute; left: 0; right: 0; bottom: 0; display: flex; height: 2px; }
.balance .give { background: var(--rl-surface-2); }
.balance .get { background: linear-gradient(90deg, var(--rl-brand-a), var(--rl-brand-b)); }
.wrap[data-verdict='loss'] .balance .get { background: var(--rl-loss); }

.details { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 0.3s cubic-bezier(0.2, 0, 0, 1); }
.wrap.is-open .details { grid-template-rows: 1fr; }
.details > div { overflow: hidden; }
.inner { padding: 2px 12px 14px; }
.sides { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.side { padding: 10px 12px; border-radius: 10px; background: var(--rl-surface); min-width: 0; }
.side .total { margin: 2px 0 6px; font-size: 16px; font-weight: 700; letter-spacing: -0.02em; }
.row { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--rl-text-2); line-height: 1.7; }
.row b { font-weight: 600; color: var(--rl-text); }
.row .usd { color: var(--rl-accent); }
.source { margin-top: 10px; font-size: 11px; color: var(--rl-text-3); }
@media (max-width: 560px) { .meta { display: none; } }
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

function flag(iconName: IconName, text: string, tip: [string, string], variant?: 'rare' | 'warn'): HTMLElement {
  return attachTip(el('span', variant ? `flag flag--${variant}` : 'flag', icon(iconName), text), ...tip);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

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

function iconButton(name: IconName, label: string): HTMLButtonElement {
  const button = el('button', 'btn', icon(name));
  button.type = 'button';
  button.title = label;
  button.setAttribute('aria-label', label);
  return button;
}

function chevron(): SVGSVGElement {
  const svg = icon('flat', 'rl-icon chev');
  svg.replaceChildren();
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M6 9l6 6 6-6');
  svg.append(path);
  return svg;
}

export function createTradeCard(view: TradeView, ctx: RenderContext): HTMLElement {
  const compact = ctx.settings.compactNumbers;
  const { balance } = view;
  const verdict = verdictOf(balance.valueDelta);
  const pct = percentChange(balance.valueDelta, balance.give.value);
  const usdDelta = view.give.usd !== null && view.receive.usd !== null ? view.receive.usd - view.give.usd : null;
  const { host, root } = createWidget('trade', css, 'section');
  host.setAttribute('aria-label', 'RoLens trade analysis');

  const flags: HTMLElement[] = [];
  const rare = [...view.give.items, ...view.receive.items].filter((item) => item.rare).length;
  if (rare) {
    flags.push(
      flag(
        'gem',
        String(rare),
        [
          'Rare items',
          `${plural(rare, 'item')} in this trade ${rare === 1 ? 'is' : 'are'} rare, with few copies in circulation.`,
        ],
        'rare',
      ),
    );
  }
  if (balance.give.hasProjected || balance.receive.hasProjected) {
    flags.push(
      flag(
        'warning',
        'Projected',
        ['Projected RAP', 'An item here has a RAP pushed up by a few inflated sales. Trust its value, not its RAP.'],
        'warn',
      ),
    );
  }
  const allItems = [...view.give.items, ...view.receive.items];
  const disagree = allItems.filter(sourcesDisagree).length;
  if (disagree) {
    flags.push(
      flag(
        'split',
        String(disagree),
        [
          'Sources disagree',
          `Rolimon's and RoUtility value ${plural(disagree, 'item')} 15% or more apart. Check ${disagree === 1 ? 'it' : 'them'} before accepting.`,
        ],
        'warn',
      ),
    );
  }
  const unknown = balance.give.unknownIds.length + balance.receive.unknownIds.length;
  if (unknown) {
    flags.push(
      flag('help', String(unknown), [
        'No value data',
        `${plural(unknown, 'item')} ${unknown === 1 ? 'has' : 'have'} no value yet and ${unknown === 1 ? "isn't" : "aren't"} counted in the totals.`,
      ]),
    );
  }

  const copy = iconButton('copy', 'Copy trade summary');
  copy.addEventListener('click', () => {
    void navigator.clipboard.writeText(tradeSummaryText(view, compact)).then(() => {
      copy.classList.add('is-done');
      copy.replaceChildren(icon('check'));
      window.setTimeout(() => {
        copy.classList.remove('is-done');
        copy.replaceChildren(icon('copy'));
      }, 1600);
    });
  });

  const toggle = el('button', 'btn', chevron());
  toggle.type = 'button';
  toggle.setAttribute('aria-label', 'Show trade details');

  const meta = [
    `${formatRobux(balance.give.value, compact)} → ${formatRobux(balance.receive.value, compact)}`,
    `${formatDelta(balance.rapDelta, compact)} RAP`,
  ]
    .filter(Boolean)
    .join(' · ');

  const wrap = el(
    'div',
    'wrap',
    el(
      'div',
      'bar',
      glyph(16),
      pill(
        `${verdict === 'win' ? 'Win' : verdict === 'loss' ? 'Loss' : 'Even'}${pct === null ? '' : ` ${formatPercent(pct)}`}`,
        verdict === 'even' ? undefined : verdict,
      ),
      el('span', 'delta', formatDelta(balance.valueDelta, compact)),
      usdDelta === null
        ? null
        : el('span', usdDelta < 0 ? 'usd-delta is-loss' : 'usd-delta', formatUsdDelta(usdDelta, compact)),
      el('span', 'meta', meta),
      el('span', 'spacer'),
      el('span', 'flags', ...flags),
      copy,
      toggle,
    ),
    el(
      'div',
      'details',
      el(
        'div',
        '',
        el(
          'div',
          'inner',
          el(
            'div',
            'sides',
            sideBlock('You give', balance.give.value, balance.give.rap, view.give, ctx),
            sideBlock('You get', balance.receive.value, balance.receive.rap, view.receive, ctx),
          ),
          el(
            'div',
            'source',
            `Values from ${sourceLine(
              ctx,
              allItems.some((item) => item.routility),
            )}`,
          ),
        ),
      ),
    ),
    el('div', 'balance', el('span', 'give'), el('span', 'get')),
  );
  wrap.dataset.verdict = verdict;

  const setOpen = (open: boolean) => {
    wrap.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.title = open ? 'Hide details' : 'Show details';
  };
  setOpen(ctx.settings.tradeDetails);
  toggle.addEventListener('click', () => {
    const open = !wrap.classList.contains('is-open');
    setOpen(open);
    ctx.saveTradeDetails?.(open);
  });

  const total = balance.give.value + balance.receive.value;
  const giveShare = total === 0 ? 0.5 : balance.give.value / total;
  const [give, get] = wrap.querySelectorAll<HTMLElement>('.balance span');
  give!.style.flexGrow = String(giveShare);
  get!.style.flexGrow = String(1 - giveShare);

  root.append(wrap);
  host.dataset.verdict = verdict;
  return host;
}

/** A small total shown beside each side's heading, e.g. "2,300 · RAP 1,800". */
export function createSideTotal(total: number, rap: number, ctx: RenderContext): HTMLElement {
  const compact = ctx.settings.compactNumbers;
  const { host, root } = createWidget(
    'side-total',
    `:host { display: inline-block; margin-left: 10px; vertical-align: middle; }
     .t { display: inline-flex; align-items: center; gap: 6px; height: 22px; padding: 0 8px 0 4px;
          border-radius: 999px; background: var(--rl-surface); font-size: 12px; font-weight: 650; }
     .t .rl-glyph { width: 14px; height: 14px; }
     .rap { color: var(--rl-text-3); font-weight: 550; }`,
  );
  root.append(
    el('span', 't', glyph(14), formatRobux(total, compact), el('span', 'rap', `RAP ${formatRobux(rap, compact)}`)),
  );
  return host;
}
