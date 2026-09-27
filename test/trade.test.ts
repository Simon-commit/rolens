import { describe, expect, it } from 'vitest';
import { balanceTrade, totalSide } from '../src/core/trade';
import { item } from './fixtures/items';

const table = new Map([
  [1, item({ id: 1, rap: 1000, value: 1500 })],
  [2, item({ id: 2, rap: 800 })],
  [3, item({ id: 3, rap: 5000, value: 4000, projected: true })],
]);
const lookup = (id: number) => table.get(id);

describe('trade totals', () => {
  it('uses value when present and RAP otherwise', () => {
    expect(totalSide([1, 2], lookup)).toMatchObject({ value: 2300, rap: 1800, known: 2, hasProjected: false });
  });

  it('counts duplicates and tracks unknown items', () => {
    const totals = totalSide([1, 1, 99], lookup);
    expect(totals.value).toBe(3000);
    expect(totals.unknownIds).toEqual([99]);
  });

  it('flags projected items and computes the balance', () => {
    const balance = balanceTrade(totalSide([1, 2], lookup), totalSide([3], lookup));
    expect(balance.receive.hasProjected).toBe(true);
    expect(balance.valueDelta).toBe(1700);
    expect(balance.rapDelta).toBe(3200);
  });
});
