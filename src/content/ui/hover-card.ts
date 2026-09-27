import { formatRobux } from '../../core/format';
import type { ItemValue } from '../../core/types';
import { el } from '../dom';
import type { RenderContext } from './context';
import { glyph } from './icons';
import {
  demandStat,
  detailsCss,
  flagPills,
  rapInsight,
  rapStat,
  routilityStat,
  sourceLine,
  stat,
  trendStat,
  usdStat,
  valueHeadline,
} from './item-details';
import { attachPopover, createPopover } from './popover';

const WIDTH = 272;

/** Full details for one item, shown when hovering or focusing its chip. */
const hoverCard = createPopover(
  'hovercard',
  `:host { z-index: 2147483000; }
.panel {
  width: ${WIDTH}px; padding: 14px;
  border-radius: var(--rl-radius-lg);
  border: 1px solid var(--rl-border);
  background: var(--rl-bg-raised);
  box-shadow: var(--rl-shadow-lg);
  opacity: 0; transform: translateY(4px) scale(0.98);
  transition: opacity 0.14s ease, transform 0.14s ease;
}
.panel.is-open { opacity: 1; transform: none; }
.head { display: flex; align-items: center; gap: 8px; min-width: 0; }
.name { flex: 1; min-width: 0; font-size: 13px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.acronym { font-size: 11px; font-weight: 600; color: var(--rl-text-3); }
.hero { display: flex; align-items: flex-end; justify-content: space-between; margin: 12px 0; }
.big { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; line-height: 1; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; padding: 12px 0; border-top: 1px solid var(--rl-border); }
.insight { font-size: 11.5px; color: var(--rl-text-2); padding-top: 10px; border-top: 1px solid var(--rl-border); }
.flags { margin-top: 10px; }
.foot { display: flex; justify-content: space-between; margin-top: 10px; font-size: 11px; color: var(--rl-text-3); }
${detailsCss}`,
  { width: WIDTH, placement: 'below', hideDelay: 80 },
);

export function buildHoverCard(item: ItemValue, ctx: RenderContext): HTMLElement[] {
  const insight = rapInsight(item);
  const flags = flagPills(item);
  const nodes: (HTMLElement | null)[] = [
    el(
      'div',
      'head',
      glyph(18),
      el('span', 'name', item.name),
      item.acronym ? el('span', 'acronym', item.acronym) : null,
    ),
    el('div', 'hero', el('div', '', ...valueHeadline(item, ctx))),
    el(
      'div',
      'grid',
      rapStat(item, ctx),
      usdStat(item, ctx) ?? stat('USD', el('span', 'rl-faint', '—')),
      demandStat(item),
      trendStat(item),
      routilityStat(item, ctx),
      item.routility?.copies ? stat('Copies', formatRobux(item.routility.copies, false)) : null,
    ),
    insight ? el('div', 'insight', insight) : null,
    flags.length ? el('div', 'flags', ...flags) : null,
    el('div', 'foot', el('span', '', sourceLine(ctx, Boolean(item.routility))), el('span', '', 'RoLens')),
  ];
  const result = nodes.filter((node): node is HTMLElement => node !== null);
  // The hover card is itself a tooltip that can't be pointed at, so its tags stay out of the tab order.
  for (const node of result) for (const tip of node.querySelectorAll('[data-tip]')) tip.removeAttribute('tabindex');
  return result;
}

export function attachHoverCard(anchor: HTMLElement, item: ItemValue, ctx: RenderContext): void {
  attachPopover(anchor, hoverCard, () => buildHoverCard(item, ctx));
}
