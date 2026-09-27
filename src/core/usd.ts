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

export interface UsdTotal {
  value: number;
  /** True when any item's figure was calculated at the fallback rate. */
  estimated: boolean;
}

/** Sum of USD estimates, or null if any item lacks one (a partial total would mislead). */
export function totalUsd(items: readonly ItemValue[], settings: Settings): UsdTotal | null {
  const total: UsdTotal = { value: 0, estimated: false };
  for (const item of items) {
    const usd = usdFor(item, settings);
    if (!usd) return null;
    total.value += usd.value;
    if (usd.origin === 'rate') total.estimated = true;
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

/** $0.85, $42, $54 (never $54.00), $1,290, or $12.5K when compact. */
export function formatUsd(amount: number, compact = true): string {
  const abs = Math.abs(amount);
  if (compact && abs >= 10_000) return localiseDigits(usdCompact.format(amount));
  const whole = abs >= 100 || Math.round(abs * 100) % 100 === 0;
  return localiseDigits(whole ? usdWhole.format(amount) : usdSmall.format(amount));
}

export function formatUsdDelta(amount: number, compact = true): string {
  if (amount === 0) return '±$0';
  return (amount > 0 ? '+' : '−') + formatUsd(Math.abs(amount), compact);
}
