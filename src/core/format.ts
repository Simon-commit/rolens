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

/** Uses the given separators directly, e.g. when read from numbers Roblox displays. */
export function setNumberSeparators(group: string, decimal: string): void {
  separators = { group, decimal };
}

/** Current separators, so callers can tell whether a change needs a re-render. */
export function numberSeparators(): { group: string; decimal: string } {
  return { ...separators };
}

/**
 * Reads the digit grouping Roblox uses from amounts it displays. Robux amounts are whole
 * numbers, so "14.186" can only mean a dot is the thousands separator. Null when no
 * amount on the page is large enough to tell.
 */
export function detectSeparators(samples: Iterable<string>): { group: string; decimal: string } | null {
  for (const sample of samples) {
    const match = /^\s*\d{1,3}([.,\u00a0\u202f ])\d{3}(?:\1\d{3})*\s*$/.exec(sample);
    if (!match) continue;
    const group = match[1]!;
    return { group, decimal: group === '.' ? ',' : '.' };
  }
  return null;
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

/** A signed percentage with one decimal where it matters: +12.5%, −3%, ±0%. */
export function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '±';
  return localiseDigits(`${sign}${Math.abs(rounded)}%`);
}

export const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "1 item", "3 items". */
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function formatDemand(demand: Demand | null): string {
  return demand ? capitalise(demand) : 'Unrated';
}

/** Rolimon's names trends "raising" and "lowering"; RoLens shows them in plain English. */
const TREND_LABELS: Record<Trend, string> = {
  raising: 'Rising',
  lowering: 'Falling',
  stable: 'Stable',
  unstable: 'Unstable',
  fluctuating: 'Fluctuating',
};

export function formatTrend(trend: Trend | null): string {
  return trend ? TREND_LABELS[trend] : 'Unrated';
}

/** Human "time ago" for cache freshness. */
export function formatAge(fetchedAt: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - fetchedAt) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${plural(minutes, 'minute')} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${plural(hours, 'hour')} ago`;
  return `${plural(Math.round(hours / 24), 'day')} ago`;
}
