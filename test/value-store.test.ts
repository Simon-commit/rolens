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
});
