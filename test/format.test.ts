import { describe, expect, it } from 'vitest';
import { formatAge, formatDelta, formatPercent, formatRobux, percentChange } from '../src/core/format';

describe('format', () => {
  it('formats Robux compactly above 10K', () => {
    expect(formatRobux(9_999)).toBe('9,999');
    expect(formatRobux(430_000)).toBe('430K');
    expect(formatRobux(1_234_567)).toBe('1.2M');
    expect(formatRobux(1_234_567, false)).toBe('1,234,567');
  });

  it('formats signed deltas', () => {
    expect(formatDelta(12_500)).toBe('+12.5K');
    expect(formatDelta(-3_000)).toBe('−3,000');
    expect(formatDelta(0)).toBe('±0');
  });

  it('computes percentages safely', () => {
    expect(percentChange(50, 200)).toBe(25);
    expect(percentChange(5, 0)).toBeNull();
    expect(formatPercent(12.345)).toBe('+12.3%');
    expect(formatPercent(-4)).toBe('-4%');
  });

  it('describes cache age', () => {
    const now = 10_000_000;
    expect(formatAge(now - 5_000, now)).toBe('just now');
    expect(formatAge(now - 3 * 60_000, now)).toBe('3 min ago');
    expect(formatAge(now - 2 * 3_600_000, now)).toBe('2 h ago');
  });
});
