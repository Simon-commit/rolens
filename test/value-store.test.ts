import { describe, expect, it, vi } from 'vitest';
import type { ItemsResponse } from '../src/core/messages';
import { ValueStore } from '../src/content/value-store';
import { item, routilityData } from './fixtures/items';

const status = (itemCount: number) => ({ source: 'rolimons' as const, fetchedAt: 1, itemCount, error: null });

describe('ValueStore', () => {
  it('batches lookups made in the same tick', async () => {
    const transport = vi.fn(async (ids: number[]): Promise<ItemsResponse> => ({
      items: Object.fromEntries(ids.filter((id) => id === 1).map((id) => [id, item({ id })])),
      status: status(100),
    }));
    const store = new ValueStore(transport);
    await Promise.all([store.load([1, 2]), store.load([2, 3])]);
    expect(transport).toHaveBeenCalledOnce();
    expect(transport.mock.calls[0]?.[0].sort()).toEqual([1, 2, 3]);
    expect(store.peek(1)?.id).toBe(1);
    expect(store.peek(2)).toBeNull();

    await store.load([1, 2, 3]);
    expect(transport).toHaveBeenCalledOnce();
  });

  it('ignores answers to lookups made before it was cleared', async () => {
    let answer!: (response: ItemsResponse) => void;
    const store = new ValueStore(() => new Promise((resolve) => (answer = resolve)));
    const loading = store.load([1]);
    await Promise.resolve();
    store.clearValues();
    answer({ items: { '1': item({ id: 1 }) }, status: status(100) });
    await loading;
    expect(store.peek(1)).toBeUndefined();
  });

  it('retries ids when the value table was empty', async () => {
    const transport = vi.fn(async (): Promise<ItemsResponse> => ({ items: {}, status: status(0) }));
    const store = new ValueStore(transport);
    await store.load([5]);
    await store.load([5]);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(store.peek(5)).toBeUndefined();
  });

  it('layers RoUtility data on known limiteds, asking once per item', async () => {
    const store = new ValueStore(async (ids) => ({
      items: Object.fromEntries(ids.filter((id) => id < 10).map((id) => [id, item({ id, value: 1000 })])),
      status: status(100),
    }));
    await store.load([1, 2, 50]);
    const routility = vi.fn(async (ids: number[]) => ({
      items: Object.fromEntries(
        ids.map((id) => [id, routilityData({ value: 1200, usd: 4, confidence: 'medium', rare: true })]),
      ),
      status: { lastSuccess: 1, error: null, blockedUntil: null },
    }));
    expect(await store.loadRoutility([1, 2, 50], routility)).toBe(true);
    expect(routility.mock.calls[0]?.[0]).toEqual([1, 2]);
    expect(store.peek(1)?.usd?.value).toBe(4);
    expect(store.peek(1)?.rare).toBe(true);
    expect(await store.loadRoutility([1, 2], routility)).toBe(false);
    expect(routility).toHaveBeenCalledOnce();
  });

  it("runs on RoUtility alone when Rolimon's is off", async () => {
    const rolimons = vi.fn(async (): Promise<ItemsResponse> => ({ items: {}, status: status(100) }));
    const store = new ValueStore(rolimons);
    store.useRolimons = false;
    await store.load([1, 2]);
    expect(rolimons).not.toHaveBeenCalled();
    const routility = vi.fn(async (ids: number[]) => ({
      items: {
        [ids[0]!]: routilityData({ name: 'Solo Hat', rap: 900, value: 1000, usd: 3, demand: 'high' }),
        [ids[1]!]: null,
      },
      status: { lastSuccess: 1, error: null, blockedUntil: null },
    }));
    expect(await store.loadRoutility([1, 2], routility)).toBe(true);
    expect(routility.mock.calls[0]?.[0]).toEqual([1, 2]);
    expect(store.peek(1)).toMatchObject({ name: 'Solo Hat', value: 1000, rap: 900, demand: 'high' });
    expect(store.peek(1)?.usd?.value).toBe(3);
    expect(store.peek(1)?.routility).toBeUndefined();
    expect(store.peek(2)).toBeNull();
  });
});
