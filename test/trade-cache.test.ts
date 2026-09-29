import { describe, expect, it, vi } from 'vitest';
import { TRADE_CACHE_KEY, TRADE_CACHE_MAX, TRADE_CACHE_TTL_MS, TradeCache } from '../src/core/trade-cache';

const trade = (id: number) => ({
  give: { itemIds: [id], names: ['A'], robux: 0 },
  receive: { itemIds: [id + 1], names: ['B'], robux: 10 },
});

function memoryStorage(initial: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = structuredClone(initial);
  return {
    data,
    get: vi.fn((key: string) => Promise.resolve({ [key]: structuredClone(data[key]) })),
    set: vi.fn((items: Record<string, unknown>) => {
      Object.assign(data, structuredClone(items));
      return Promise.resolve();
    }),
  };
}

describe('TradeCache', () => {
  it('saves trades per account and reads them back', async () => {
    vi.useFakeTimers();
    const storage = memoryStorage();
    const cache = new TradeCache(storage);
    await cache.save(1, 500, trade(1));
    vi.advanceTimersByTime(1000);
    expect(storage.set).toHaveBeenCalledTimes(1);
    const fresh = new TradeCache(storage);
    expect((await fresh.all(1)).get(500)).toEqual(trade(1));
    // Another account on the same browser never sees these trades.
    expect((await fresh.all(2)).size).toBe(0);
    vi.useRealTimers();
  });

  it('drops expired and malformed entries', async () => {
    const now = 10 * TRADE_CACHE_TTL_MS;
    const storage = memoryStorage({
      [TRADE_CACHE_KEY]: {
        userId: 1,
        entries: {
          '1': { trade: trade(1), savedAt: now - TRADE_CACHE_TTL_MS - 1 },
          '2': { trade: trade(2), savedAt: now - 1000 },
          '3': { trade: { give: { itemIds: ['x'] } }, savedAt: now },
        },
      },
    });
    const cache = new TradeCache(storage, () => now);
    expect([...(await cache.all(1)).keys()]).toEqual([2]);
  });

  it('keeps only the most recent trades', async () => {
    vi.useFakeTimers();
    let now = 1;
    const storage = memoryStorage();
    const cache = new TradeCache(storage, () => now);
    for (let id = 1; id <= TRADE_CACHE_MAX + 5; id += 1) {
      now += 1;
      await cache.save(1, id, trade(id));
    }
    vi.advanceTimersByTime(1000);
    const saved = storage.data[TRADE_CACHE_KEY] as { entries: Record<string, unknown> };
    expect(Object.keys(saved.entries)).toHaveLength(TRADE_CACHE_MAX);
    expect(saved.entries['1']).toBeUndefined();
    vi.useRealTimers();
  });
});
