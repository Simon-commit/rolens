import { formatRobux } from '../../core/format';
import { SOURCES } from '../../core/sources';
import { effectiveValue, type ItemValue, type SourceId } from '../../core/types';
import { formatUsd, usdFor } from '../../core/usd';
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
/* Folding: the full card and the one-line bar swap with a height and fade transition. */
.fold { display: grid; grid-template-rows: 1fr; transition: grid-template-rows 0.32s cubic-bezier(0.2, 0, 0, 1), opacity 0.24s ease; }
.fold > div { min-height: 0; overflow: hidden; }
.card.is-collapsed .fold--full, .card:not(.is-collapsed) .fold--bar { grid-template-rows: 0fr; opacity: 0; }
.full { padding: 18px 20px; }
.bar {
  display: flex; align-items: center; gap: 12px; width: 100%; padding: 11px 16px 11px 18px;
  border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer;
  transition: background-color 0.15s ease;
}
.bar:hover { background: var(--rl-surface); }
.bar:focus-visible, .close:focus-visible { outline: 2px solid var(--rl-accent); outline-offset: -2px; }
.bar-value { font-size: 15px; font-weight: 700; letter-spacing: -0.01em; }
.bar-usd { font-size: 13px; font-weight: 650; color: var(--rl-win); }
.bar-usd.is-estimate { color: var(--rl-text-2); }
.bar-sep { width: 1px; height: 14px; background: var(--rl-border); }
.bar-more { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--rl-text-2); }
.bar-more .rl-icon { width: 14px; height: 14px; }
.close {
  display: grid; place-items: center; flex: none; width: 26px; height: 26px; margin: -4px -6px -4px 0;
  border: 0; border-radius: 999px; background: transparent; color: var(--rl-text-3); cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.close:hover { background: var(--rl-surface); color: var(--rl-text); }
.close .rl-icon { width: 14px; height: 14px; }
.head-right { display: flex; align-items: center; gap: 14px; }
@media (prefers-reduced-motion: reduce) { .fold { transition: none; } }
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
  const close = el('button', 'close', icon('close'));
  close.type = 'button';
  close.title = 'Collapse';
  close.setAttribute('aria-label', 'Collapse RoLens card');

  // The folded card: a single line with the value and USD. Clicking it opens the card again.
  const figure = usdFor(item, ctx.settings);
  const estimate = figure?.origin === 'rate';
  const bar = el(
    'button',
    'bar',
    el('span', 'rl-brand', glyph(16), 'RoLens'),
    el('span', 'bar-sep'),
    el('span', 'bar-value', formatRobux(effectiveValue(item), ctx.settings.compactNumbers)),
    figure && ctx.settings.showUsd
      ? el(
          'span',
          estimate ? 'bar-usd is-estimate' : 'bar-usd',
          `${estimate ? '≈' : ''}${formatUsd(figure.value, ctx.settings.compactNumbers)}`,
        )
      : null,
    el('span', 'bar-more', 'Show details', icon('chevron')),
  );
  bar.type = 'button';
  bar.setAttribute('aria-label', 'Expand RoLens card');

  const full = el(
    'div',
    'full',
    el(
      'div',
      'head',
      el('div', 'head-left', el('span', 'rl-brand', glyph(18), 'RoLens'), el('div', 'flags', ...flagPills(item))),
      el('div', 'head-right', links, close),
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
  const barFold = el('div', 'fold fold--bar', el('div', '', bar));
  const fullFold = el('div', 'fold fold--full', el('div', '', full));
  const card = el('div', item.rare ? 'card is-rare' : 'card', barFold, fullFold);

  const setCollapsed = (collapsed: boolean, event?: MouseEvent) => {
    card.classList.toggle('is-collapsed', collapsed);
    // The hidden half can't be reached with the keyboard or a screen reader.
    barFold.inert = !collapsed;
    fullFold.inert = collapsed;
    if (!event) return;
    ctx.saveItemCard?.(collapsed);
    // Keyboard users keep their place on the control that replaced the one they pressed.
    if (event.detail === 0) (collapsed ? bar : close).focus({ preventScroll: true });
  };
  close.addEventListener('click', (event) => setCollapsed(true, event));
  bar.addEventListener('click', (event) => setCollapsed(false, event));
  setCollapsed(ctx.settings.itemCardCollapsed);

  root.append(card);
  return host;
}
