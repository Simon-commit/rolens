import { describe, expect, it, vi } from 'vitest';
import type { ItemsResponse } from '../src/core/messages';
import { ValueStore } from '../src/content/value-store';
import { item } from './fixtures/items';

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
        ids.map((id) => [
          id,
          {
            value: 1200,
            usd: 4,
            rate: null,
            confidence: 'medium' as const,
            confidenceReason: null,
            rare: true,
            projected: false,
            hyped: false,
            copies: null,
          },
        ]),
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
});
