import type { Settings } from './settings';
import { effectiveValue, type ItemValue } from './types';
import { usdFor } from './usd';

export interface InventoryEntry {
  item: ItemValue;
  /** Copies owned. */
  count: number;
}

export interface InventorySummary {
  /** Every valued or RAP-only item owned, most valuable first. */
  entries: InventoryEntry[];
  /** Sum of effective values (value, or RAP when unvalued), counting every copy. */
  value: number;
  rap: number;
  copies: number;
  rare: number;
  /** Items the sources have no data for; left out of the totals. */
  unlisted: number;
  /** USD total over the copies that have a figure, or null when none has. */
  usd: {
    value: number;
    /** True when any figure was calculated at the fallback rate. */
    estimated: boolean;
    /** Copies included in `value`; fewer than `copies` means the total is partial. */
    covered: number;
  } | null;
}

/** Totals for one player's inventory, from the item values RoLens already has. */
export function summariseInventory(
  counts: Record<string, number>,
  lookup: (id: number) => ItemValue | null | undefined,
  settings: Settings,
): InventorySummary {
  const summary: InventorySummary = { entries: [], value: 0, rap: 0, copies: 0, rare: 0, unlisted: 0, usd: null };
  let usd = 0;
  let estimated = false;
  let covered = 0;
  for (const [key, count] of Object.entries(counts)) {
    const item = lookup(Number(key));
    if (!item) {
      summary.unlisted += count;
      continue;
    }
    summary.entries.push({ item, count });
    summary.value += effectiveValue(item) * count;
    summary.rap += item.rap * count;
    summary.copies += count;
    if (item.rare) summary.rare += count;
    const figure = usdFor(item, settings);
    if (figure) {
      usd += figure.value * count;
      covered += count;
      if (figure.origin === 'rate') estimated = true;
    }
  }
  summary.entries.sort((a, b) => effectiveValue(b.item) - effectiveValue(a.item) || b.count - a.count);
  if (covered > 0) summary.usd = { value: usd, estimated, covered };
  return summary;
}
