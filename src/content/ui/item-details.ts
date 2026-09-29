import {
  capitalise,
  formatAge,
  formatDemand,
  formatPercent,
  formatRobux,
  formatTrend,
  percentChange,
} from '../../core/format';
import { DISAGREEMENT_THRESHOLD, valueDisagreement } from '../../core/routility';
import { sourceNames } from '../../core/sources';
import { demandLevel, effectiveValue, type ItemValue, type SourceId } from '../../core/types';
import { formatUsd, usdFor } from '../../core/usd';
import { el } from '../dom';
import { confidenceDots, demandMeter, pill, TREND_ICON, TREND_TONE } from './atoms';
import type { RenderContext } from './context';
import { disagreeTip, rateTip, TIPS, TREND_TIPS } from './copy';
import { icon } from './icons';
import { attachTip } from './tooltip';

/** Building blocks shared by the hover card and the item page panel. */

export function stat(label: string, ...value: (Node | string | null)[]): HTMLElement {
  return el('div', 'stat', el('div', 'rl-eyebrow', label), el('div', 'stat-value', ...value));
}

/** The eyebrow and large figure that lead both cards: the value, or the RAP when there is none. */
export function valueHeadline(item: ItemValue, ctx: RenderContext): [HTMLElement, HTMLElement] {
  return [
    el('div', 'rl-eyebrow', item.value === null ? 'RAP (no value)' : 'Value'),
    el('div', 'big', formatRobux(effectiveValue(item), ctx.settings.compactNumbers)),
  ];
}

export function rapStat(item: ItemValue, ctx: RenderContext): HTMLElement {
  const node = stat('RAP', formatRobux(item.rap, ctx.settings.compactNumbers));
  if (item.projected) node.dataset.tone = 'warn';
  return node;
}

export function demandStat(item: ItemValue): HTMLElement {
  return stat('Demand', demandMeter(demandLevel(item.demand)), el('span', 'stat-text', formatDemand(item.demand)));
}

export function trendStat(item: ItemValue): HTMLElement {
  const label = formatTrend(item.trend);
  const text = el('span', 'stat-text', label);
  const node = stat(
    'Trend',
    item.trend
      ? attachTip(el('span', 'tip-anchor', icon(TREND_ICON[item.trend]), text), label, TREND_TIPS[item.trend])
      : text,
  );
  if (item.trend) node.dataset.tone = TREND_TONE[item.trend];
  return node;
}

/** USD estimate with its confidence, or null when there is none to show. */
export function usdStat(item: ItemValue, ctx: RenderContext): HTMLElement | null {
  const usd = usdFor(item, ctx.settings);
  if (!usd) return null;
  const compact = ctx.settings.compactNumbers;
  if (usd.origin === 'rate') {
    const node = stat('USD', el('span', 'usd is-estimate', `≈${formatUsd(usd.value, compact)}`));
    const note = el('span', 'stat-note', 'Estimate at fallback rate');
    node.append(
      ctx.settings.usdRate === null
        ? note
        : attachTip(el('span', 'tip-anchor', note), ...rateTip(ctx.settings.usdRate)),
    );
    return node;
  }
  const node = stat(
    'USD',
    el('span', 'usd', formatUsd(usd.value, compact)),
    usd.confidence ? confidenceDots(usd.confidence) : null,
  );
  const note = [
    usd.confidence ? `${capitalise(usd.confidence)} confidence` : null,
    usd.low !== undefined && usd.high !== undefined
      ? `${formatUsd(usd.low, compact)}–${formatUsd(usd.high, compact)}`
      : null,
    usd.rate ? `${formatUsd(usd.rate, false)}/1K` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  if (note) node.append(el('div', 'stat-note', note));
  if (usd.reason) node.title = usd.reason;
  return node;
}

/** True when RoUtility's value differs from the main value by at least the threshold. */
export function sourcesDisagree(item: ItemValue): boolean {
  const diff = valueDisagreement(item);
  return diff !== null && Math.abs(diff) >= DISAGREEMENT_THRESHOLD;
}

/** RoUtility's value next to the main one, with the difference; null without RoUtility data. */
export function routilityStat(item: ItemValue, ctx: RenderContext): HTMLElement | null {
  const other = item.routility?.value;
  if (!other) return null;
  const diff = valueDisagreement(item);
  const node = stat(
    'RoUtility value',
    formatRobux(other, ctx.settings.compactNumbers),
    diff === null ? null : el('span', 'stat-diff', formatPercent(Math.round(diff * 100))),
  );
  if (sourcesDisagree(item)) node.dataset.tone = 'warn';
  return node;
}

/**
 * How RAP compares with value: a quick read on whether an item is trading above or
 * below what the community thinks it's worth.
 */
export function rapInsight(item: ItemValue): string | null {
  if (item.value === null || item.rap === 0) return null;
  const pct = Math.round(percentChange(item.rap - item.value, item.value) ?? 0);
  if (Math.abs(pct) < 3) return 'RAP is in line with value';
  return `RAP is ${Math.abs(pct)}% ${pct > 0 ? 'above' : 'below'} value`;
}

export function flagPills(item: ItemValue): HTMLElement[] {
  const pills: HTMLElement[] = [];
  if (item.rare) pills.push(attachTip(pill('Rare', 'rare', 'gem'), ...TIPS.rare));
  if (item.projected) pills.push(attachTip(pill('Projected', 'warn', 'warning'), ...TIPS.projected));
  if (item.hyped) pills.push(attachTip(pill('Hyped', undefined, 'flame'), ...TIPS.hyped));
  if (sourcesDisagree(item)) {
    pills.push(attachTip(pill('Sources disagree', 'warn', 'split'), ...disagreeTip(valueDisagreement(item)!)));
  }
  return pills;
}

/**
 * Where the figures shown came from, e.g. "Sources: Rolimon's and RoUtility · Updated 3
 * minutes ago". RoUtility is named only when it contributed to what is shown.
 */
export function sourceLine(ctx: RenderContext, withRoutility = false): string {
  const ids: SourceId[] = ctx.settings.useRolimons ? ['rolimons'] : [];
  if (withRoutility || !ctx.settings.useRolimons) ids.push('routility');
  const age = ctx.settings.useRolimons && ctx.status?.fetchedAt ? ` · Updated ${formatAge(ctx.status.fetchedAt)}` : '';
  return `${ids.length > 1 ? 'Sources' : 'Source'}: ${sourceNames(ids)}${age}`;
}

/** Styles for the blocks above, included by widgets that use them. */
export const detailsCss = `
.stat { min-width: 0; }
.stat .rl-eyebrow { margin-bottom: 4px; }
.stat-value {
  display: flex; align-items: center; gap: 6px;
  font-size: 14px; font-weight: 650; color: var(--rl-text); white-space: nowrap;
}
.stat-text { overflow: hidden; text-overflow: ellipsis; }
.stat-note { margin-top: 3px; font-size: 11px; color: var(--rl-text-3); }
.stat > .tip-anchor { display: flex; margin-top: 3px; }
.tip-anchor > .stat-note { margin-top: 0; text-decoration: underline dotted; text-underline-offset: 2px; }
.stat[data-tone='win'] .stat-value { color: var(--rl-win); }
.stat[data-tone='loss'] .stat-value { color: var(--rl-loss); }
.stat[data-tone='warn'] .stat-value { color: var(--rl-warn); }
.stat-diff { font-size: 11px; font-weight: 600; color: var(--rl-text-3); }
.stat[data-tone='warn'] .stat-diff { color: var(--rl-warn); }
.flags { display: flex; flex-wrap: wrap; gap: 6px; }
.tip-anchor { display: inline-flex; align-items: center; gap: 6px; min-width: 0; cursor: help; outline: none; border-radius: var(--rl-radius-sm); }
.flags .rl-pill { cursor: help; outline: none; }
.tip-anchor:focus-visible, .flags .rl-pill:focus-visible { box-shadow: 0 0 0 2px var(--rl-accent); }
`;
