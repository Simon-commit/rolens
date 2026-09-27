import { localiseDigits } from './format';
import type { Settings } from './settings';
import { effectiveValue, type ItemValue, type UsdEstimate } from './types';

/**
 * The USD estimate to show for an item: the source's own estimate when there is one,
 * otherwise the user's rate applied to the item's value, otherwise none.
 */
export function usdFor(item: ItemValue, settings: Settings): UsdEstimate | null {
  if (!settings.showUsd) return null;
  if (item.usd) return item.usd;
  if (settings.usdRate === null) return null;
  return { value: (effectiveValue(item) / 1000) * settings.usdRate, confidence: null, origin: 'rate' };
}

/** Sum of USD estimates, or null if any item lacks one (a partial total would mislead). */
export function totalUsd(items: readonly ItemValue[], settings: Settings): number | null {
  let total = 0;
  for (const item of items) {
    const usd = usdFor(item, settings);
    if (!usd) return null;
    total += usd.value;
  }
  return total;
}

const usdCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const usdSmall = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const usdWhole = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/** $0.85, $42, $1,290, or $12.5K when compact. */
export function formatUsd(amount: number, compact = true): string {
  const abs = Math.abs(amount);
  if (compact && abs >= 10_000) return localiseDigits(usdCompact.format(amount));
  return localiseDigits(abs < 100 ? usdSmall.format(amount) : usdWhole.format(amount));
}

export function formatUsdDelta(amount: number, compact = true): string {
  if (amount === 0) return '±$0';
  return (amount > 0 ? '+' : '−') + formatUsd(Math.abs(amount), compact);
}
