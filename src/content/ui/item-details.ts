import { formatAge, formatDemand, formatRobux, formatTrend } from '../../core/format';
import { demandLevel, type ItemValue } from '../../core/types';
import { formatUsd, usdFor } from '../../core/usd';
import { el } from '../dom';
import { confidenceDots, demandMeter, pill, TREND_ICON, TREND_TONE } from './atoms';
import type { RenderContext } from './context';
import { icon } from './icons';

/** Building blocks shared by the hover card and the item page panel. */

export function stat(label: string, ...value: (Node | string | null)[]): HTMLElement {
  return el('div', 'stat', el('div', 'rl-eyebrow', label), el('div', 'stat-value', ...value));
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
  const node = stat(
    'Trend',
    item.trend ? icon(TREND_ICON[item.trend]) : null,
    el('span', 'stat-text', formatTrend(item.trend)),
  );
  if (item.trend) node.dataset.tone = TREND_TONE[item.trend];
  return node;
}

/** USD estimate with its confidence, or null when there is none to show. */
export function usdStat(item: ItemValue, ctx: RenderContext): HTMLElement | null {
  const usd = usdFor(item, ctx.settings);
  if (!usd) return null;
  const compact = ctx.settings.compactNumbers;
  const range =
    usd.low !== undefined && usd.high !== undefined
      ? `${formatUsd(usd.low, compact)}–${formatUsd(usd.high, compact)}`
      : null;
  const node = stat(
    'USD',
    el('span', 'usd', formatUsd(usd.value, compact)),
    usd.confidence ? confidenceDots(usd.confidence) : null,
  );
  const confidence = usd.confidence
    ? `${usd.confidence.charAt(0).toUpperCase()}${usd.confidence.slice(1)} confidence`
    : null;
  const note = usd.origin === 'rate' ? 'At your rate' : [range, confidence].filter(Boolean).join(' · ') || null;
  if (note) node.append(el('div', 'stat-note', note));
  return node;
}

/**
 * How RAP compares with value: a quick read on whether an item is trading above or
 * below what the community thinks it's worth.
 */
export function rapInsight(item: ItemValue): string | null {
  if (item.value === null || item.value === 0 || item.rap === 0) return null;
  const pct = Math.round(((item.rap - item.value) / item.value) * 100);
  if (Math.abs(pct) < 3) return 'RAP is in line with value';
  return `RAP is ${Math.abs(pct)}% ${pct > 0 ? 'above' : 'below'} value`;
}

export function flagPills(item: ItemValue): HTMLElement[] {
  const pills: HTMLElement[] = [];
  if (item.rare) pills.push(pill('Rare', 'rare', 'gem'));
  if (item.projected) pills.push(pill('Projected', 'warn', 'warning'));
  if (item.hyped) pills.push(pill('Hyped', undefined, 'flame'));
  return pills;
}

export function sourceLine(ctx: RenderContext): string {
  const age = ctx.status?.fetchedAt ? ` · ${formatAge(ctx.status.fetchedAt)}` : '';
  return `${ctx.provider.label}${age}`;
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
.stat[data-tone='win'] .stat-value { color: var(--rl-win); }
.stat[data-tone='loss'] .stat-value { color: var(--rl-loss); }
.stat[data-tone='warn'] .stat-value { color: var(--rl-warn); }
.usd { color: var(--rl-accent); }
.flags { display: flex; flex-wrap: wrap; gap: 6px; }
`;
