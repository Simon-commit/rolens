import { formatRobux } from '../../core/format';
import type { InventorySummary } from '../../core/inventory';
import { effectiveValue } from '../../core/types';
import { formatUsd } from '../../core/usd';
import { el } from '../dom';
import type { Tip } from './copy';

/** How many of the most valuable items the composition bar names; the rest are "Other". */
const SEGMENTS = 5;

/** "≈$3,600", "$3,600", or null when no copy has a USD figure. */
export function inventoryUsd(summary: InventorySummary, compact: boolean): string | null {
  if (!summary.usd) return null;
  const partial = summary.usd.covered < summary.copies;
  return `${summary.usd.estimated || partial ? '≈' : ''}${formatUsd(summary.usd.value, compact)}`;
}

/** Explains how an inventory's USD total was put together. */
export function inventoryUsdTip(summary: InventorySummary): Tip {
  const usd = summary.usd!;
  const parts = [
    usd.estimated
      ? 'This total combines RoUtility estimates with figures calculated at the fallback rate for items RoUtility does not price.'
      : 'This total is the sum of RoUtility estimates.',
  ];
  if (usd.covered < summary.copies) {
    parts.push(`It covers ${usd.covered} of ${summary.copies} items; the remainder have no USD figure.`);
  }
  parts.push('It should be regarded as indicative only.');
  return ['Estimated USD value', parts.join(' ')];
}

export interface Segment {
  label: string;
  share: number;
  /** 1-6 for the named items, 0 for "Other". */
  series: number;
}

/** The most valuable items' share of the inventory's value, for the composition bar. */
export function composition(summary: InventorySummary): Segment[] {
  if (summary.value <= 0) return [];
  // Ranked by what each holding is worth in total, so several copies of an item count together.
  const holdings = summary.entries
    .map((entry) => ({ entry, worth: effectiveValue(entry.item) * entry.count }))
    .sort((a, b) => b.worth - a.worth);
  const segments: Segment[] = holdings.slice(0, SEGMENTS).map(({ entry, worth }, index) => ({
    label: entry.item.acronym || entry.item.name,
    share: worth / summary.value,
    series: index + 1,
  }));
  const rest = 1 - segments.reduce((sum, segment) => sum + segment.share, 0);
  if (rest > 0.005) segments.push({ label: 'Other', share: rest, series: 0 });
  return segments;
}

export function compositionBar(segments: Segment[], className = 'mix'): HTMLElement {
  const bar = el('div', className);
  bar.setAttribute('aria-hidden', 'true');
  for (const segment of segments) {
    const part = el('span', 'mix-part');
    part.style.flexGrow = String(segment.share);
    part.dataset.series = String(segment.series);
    bar.append(part);
  }
  return bar;
}

/** Styles for the composition bar and its legend, shared by the profile box and panel. */
export const compositionCss = `
.mix { display: flex; gap: 2px; height: 6px; border-radius: 999px; overflow: hidden; background: var(--rl-surface-2); }
.mix-part { min-width: 3px; transition: flex-grow 0.6s cubic-bezier(0.2, 0, 0, 1); }
[data-series='0'] { --series: var(--rl-surface-2); }
[data-series='1'] { --series: var(--rl-series-1); }
[data-series='2'] { --series: var(--rl-series-2); }
[data-series='3'] { --series: var(--rl-series-3); }
[data-series='4'] { --series: var(--rl-series-4); }
[data-series='5'] { --series: var(--rl-series-5); }
.mix-part { background: var(--series); }
.legend { display: flex; flex-wrap: wrap; gap: 6px 14px; }
.legend-item { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--rl-text-2); white-space: nowrap; }
.legend-item::before { content: ''; width: 8px; height: 8px; border-radius: 3px; background: var(--series); }
.legend-item b { font-weight: 650; color: var(--rl-text); }
`;

export function legend(segments: Segment[]): HTMLElement {
  return el(
    'div',
    'legend',
    ...segments.map((segment) => {
      const item = el('span', 'legend-item', segment.label, el('b', '', `${Math.round(segment.share * 100)}%`));
      item.dataset.series = String(segment.series);
      return item;
    }),
  );
}

/** "48 items · 3 rare". */
export function countLine(summary: InventorySummary): string {
  const items = `${formatRobux(summary.copies, false)} ${summary.copies === 1 ? 'item' : 'items'}`;
  return summary.rare ? `${items} · ${summary.rare} rare` : items;
}
