import type { Demand, Trend } from './types';

const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const full = new Intl.NumberFormat('en-US');

let separators = { group: ',', decimal: '.' };

/**
 * Matches Roblox's digit grouping, e.g. "3.507" and "1,5M" for Danish or German, while
 * keeping the short K/M suffixes traders use everywhere.
 */
export function setNumberLocale(locale: string | undefined): void {
  separators = { group: ',', decimal: '.' };
  if (!locale) return;
  try {
    for (const part of new Intl.NumberFormat(locale).formatToParts(12345.6)) {
      if (part.type === 'group') separators.group = part.value.trim() ? part.value : '\u00a0';
      if (part.type === 'decimal') separators.decimal = part.value;
    }
  } catch {
    // Unknown locale: keep the default.
  }
}

/** Rewrites an en-US formatted number with the current locale's separators. */
export function localiseDigits(text: string): string {
  if (separators.group === ',' && separators.decimal === '.') return text;
  return text.replace(/[,.]/g, (mark) => (mark === ',' ? separators.group : separators.decimal));
}

/** Formats Robux amounts, e.g. 1234567 -> "1.2M" (compact) or "1,234,567". */
export function formatRobux(amount: number, useCompact = true): string {
  return localiseDigits(useCompact && Math.abs(amount) >= 10_000 ? compact.format(amount) : full.format(amount));
}

/** Formats a signed difference, e.g. +12.5K or −3,000. */
export function formatDelta(amount: number, useCompact = true): string {
  if (amount === 0) return '±0';
  const sign = amount > 0 ? '+' : '−';
  return sign + formatRobux(Math.abs(amount), useCompact);
}

/** Percentage change of `gain` relative to `base`, or null when base is zero. */
export function percentChange(gain: number, base: number): number | null {
  if (base === 0) return null;
  return (gain / base) * 100;
}

export function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return localiseDigits(`${rounded > 0 ? '+' : ''}${rounded}%`);
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function formatDemand(demand: Demand | null): string {
  return demand ? capitalise(demand) : 'Unrated';
}

export function formatTrend(trend: Trend | null): string {
  return trend ? capitalise(trend) : 'Unrated';
}

/** Human "time ago" for cache freshness. */
export function formatAge(fetchedAt: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - fetchedAt) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}
