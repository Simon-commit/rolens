import { SOURCES } from '../../core/sources';
import type { ItemValue, SourceId } from '../../core/types';
import { el } from '../dom';
import type { RenderContext } from './context';
import { glyph, icon } from './icons';
import {
  demandStat,
  detailsCss,
  flagPills,
  rapInsight,
  rapStat,
  routilityStat,
  sourceLine,
  trendStat,
  usdStat,
  valueHeadline,
} from './item-details';
import { createWidget } from './shadow';

const css = `
:host { display: block; margin: 14px 0 18px; max-width: 640px; }
.card {
  position: relative; overflow: hidden;
  padding: 18px 20px;
  border-radius: var(--rl-radius-lg);
  border: 1px solid var(--rl-border);
  background: var(--rl-bg-raised);
  box-shadow: var(--rl-shadow);
  animation: rl-rise 0.3s ease both;
}
.card::before {
  content: ''; position: absolute; inset: 0 0 auto 0; height: 3px;
  background: linear-gradient(90deg, var(--rl-brand-a), var(--rl-brand-b));
}
.card.is-rare::before { background: var(--rl-rare-line); }
.head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.head-left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.link {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 12px; font-weight: 600; color: var(--rl-text-2); text-decoration: none;
  transition: color 0.15s ease;
}
.link:hover { color: var(--rl-accent); }
.links { display: flex; gap: 14px; }
.link .rl-icon { width: 12px; height: 12px; }
.main { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin: 18px 0 16px; }
.big { font-size: 34px; font-weight: 700; letter-spacing: -0.03em; line-height: 1; margin-top: 6px; }
.big-note { margin-top: 8px; font-size: 12.5px; color: var(--rl-text-2); }
.usd-block { text-align: right; }
.usd-block .stat-value { justify-content: flex-end; font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
.usd-block .stat-note { text-align: right; }
.strip { display: grid; grid-template-columns: repeat(4, max-content); justify-content: space-between; gap: 16px; padding-top: 14px; border-top: 1px solid var(--rl-border); }
.foot { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--rl-border); font-size: 11px; color: var(--rl-text-3); }
${detailsCss}
`;

/** The full stats card on a catalog item page. */
export function createItemHero(item: ItemValue, ctx: RenderContext): HTMLElement {
  const { host, root } = createWidget('panel', css, 'section');
  host.dataset.rolensId = String(item.id);

  const sourceLink = (id: SourceId) => {
    const link = el('a', 'link', SOURCES[id].label, icon('external'));
    link.href = SOURCES[id].itemUrl(item.id);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
  };
  // Links to the sources this card's figures came from.
  const links = el(
    'div',
    'links',
    ctx.settings.useRolimons ? sourceLink('rolimons') : null,
    item.routility || !ctx.settings.useRolimons ? sourceLink('routility') : null,
  );

  const usd = usdStat(item, ctx);
  const card = el(
    'div',
    item.rare ? 'card is-rare' : 'card',
    el(
      'div',
      'head',
      el('div', 'head-left', el('span', 'rl-brand', glyph(18), 'RoLens'), el('div', 'flags', ...flagPills(item))),
      links,
    ),
    el(
      'div',
      'main',
      el(
        'div',
        '',
        ...valueHeadline(item, ctx),
        el('div', 'big-note', rapInsight(item) ?? (item.value === null ? 'No published value' : '')),
      ),
      usd ? el('div', 'usd-block', usd) : null,
    ),
    el('div', 'strip', rapStat(item, ctx), routilityStat(item, ctx), demandStat(item), trendStat(item)),
    el('div', 'foot', sourceLine(ctx, Boolean(item.routility))),
  );
  root.append(card);
  return host;
}
