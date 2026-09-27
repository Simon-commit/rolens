import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/core/settings';
import { formatUsd, formatUsdDelta, totalUsd, usdFor } from '../src/core/usd';
import { item } from './fixtures/items';

const source = { value: 50, confidence: 'medium' as const, origin: 'routility' as const };

describe('usdFor', () => {
  it('prefers a source estimate over the user rate', () => {
    expect(usdFor(item({ id: 1, value: 1000, usd: source }), { ...DEFAULT_SETTINGS, usdRate: 3 })).toBe(source);
  });

  it('applies the user rate to value, or RAP when unvalued', () => {
    const settings = { ...DEFAULT_SETTINGS, usdRate: 3 };
    expect(usdFor(item({ id: 1, value: 2000 }), settings)?.value).toBe(6);
    expect(usdFor(item({ id: 1, rap: 1000 }), settings)).toEqual({ value: 3, confidence: null, origin: 'rate' });
  });

  it('shows nothing without a rate or when USD is off', () => {
    expect(usdFor(item({ id: 1 }), DEFAULT_SETTINGS)).toBeNull();
    expect(usdFor(item({ id: 1, usd: source }), { ...DEFAULT_SETTINGS, showUsd: false })).toBeNull();
  });
});

describe('totalUsd', () => {
  it('sums, but refuses partial totals', () => {
    const settings = DEFAULT_SETTINGS;
    expect(totalUsd([item({ id: 1, usd: source }), item({ id: 2, usd: source })], settings)).toBe(100);
    expect(totalUsd([item({ id: 1, usd: source }), item({ id: 2 })], settings)).toBeNull();
  });
});

describe('formatUsd', () => {
  it('formats small, medium and large amounts', () => {
    expect(formatUsd(0.85)).toBe('$0.85');
    expect(formatUsd(42)).toBe('$42');
    expect(formatUsd(1.5)).toBe('$1.50');
    expect(formatUsd(1290)).toBe('$1,290');
    expect(formatUsd(12_500)).toBe('$12.5K');
    expect(formatUsd(12_500, false)).toBe('$12,500');
    expect(formatUsdDelta(-6.8)).toBe('−$6.80');
  });
});
