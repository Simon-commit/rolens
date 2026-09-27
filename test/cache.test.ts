import { describe, expect, it, vi } from 'vitest';
import { MIN_FETCH_INTERVAL_MS, STALE_AFTER_MS, ValueCache, type SnapshotStore } from '../src/core/cache';
import type { ValueSnapshot } from '../src/core/types';
import { item } from './fixtures/items';

function setup(stored: ValueSnapshot | null = null) {
  let now = 1_000_000;
  const saved: ValueSnapshot[] = [];
  const store: SnapshotStore = {
    load: async () => stored,
    save: async (snapshot) => void saved.push(snapshot),
  };
  const fetchItems = vi.fn(async () => ({ '1': item({ id: 1 }) }));
  const cache = new ValueCache({ source: 'rolimons', fetchItems }, store, () => now);
  return { cache, fetchItems, saved, advance: (ms: number) => (now += ms), now: () => now };
}

describe('ValueCache', () => {
  it('fetches on first use and persists the snapshot', async () => {
    const { cache, fetchItems, saved } = setup();
    const snapshot = await cache.get();
    expect(fetchItems).toHaveBeenCalledOnce();
    expect(snapshot?.items['1']?.id).toBe(1);
    expect(saved).toHaveLength(1);
  });

  it('serves fresh data without refetching', async () => {
    const { cache, fetchItems, advance } = setup();
    await cache.get();
    advance(STALE_AFTER_MS - 1);
    await cache.get();
    expect(fetchItems).toHaveBeenCalledOnce();
  });

  it('serves stale data immediately while refreshing', async () => {
    const stale: ValueSnapshot = { source: 'rolimons', fetchedAt: 0, items: { '2': item({ id: 2 }) } };
    const { cache, fetchItems } = setup(stale);
    const snapshot = await cache.get();
    expect(snapshot?.items['2']).toBeDefined();
    expect(fetchItems).toHaveBeenCalledOnce();
  });

  it('respects the rate limit even when forced', async () => {
    const { cache, fetchItems, advance } = setup();
    await cache.refresh(true);
    await cache.refresh(true);
    expect(fetchItems).toHaveBeenCalledOnce();
    advance(MIN_FETCH_INTERVAL_MS);
    await cache.refresh(true);
    expect(fetchItems).toHaveBeenCalledTimes(2);
  });

  it('keeps old data and reports the error when a fetch fails', async () => {
    const stale: ValueSnapshot = { source: 'rolimons', fetchedAt: 0, items: { '2': item({ id: 2 }) } };
    const { cache, fetchItems } = setup(stale);
    fetchItems.mockRejectedValueOnce(new Error('HTTP 429'));
    await cache.refresh(true);
    expect(cache.status()).toMatchObject({ itemCount: 1, error: 'HTTP 429' });
  });
});
