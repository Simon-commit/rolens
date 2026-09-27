import { describe, expect, it, vi } from 'vitest';
import { parseConfidence, parseRoutilityItem, valueDisagreement, withRoutility } from '../src/core/routility';
import {
  ROUTILITY_BACKOFF_MS,
  ROUTILITY_TTL_MS,
  RoutilityCache,
  type RoutilityEntry,
} from '../src/core/routility-cache';
import { item } from './fixtures/items';

/** Real response for Silver King of the Night, shared by Simon on 2026-09-27. */
const skotn = {
  item_id: '439945661',
  item_name: 'Silver King of the Night ',
  item_acronym: 'SKOTN',
  item_icons: '',
  item_thumb: 'https://tr.rbxcdn.com/180DAY-570a262a110ba320a89eaee2784fd60d/420/420/Hat/Png/noFilter',
  item_price: 390000,
  item_rap: 387196,
  item_value: 500000,
  item_roli_value: 440000,
  item_demand: 'Amazing',
  item_trend: 'Stable',
  item_usd: 1400.0,
  item_rate: null,
  item_copies: 3973,
  item_premium_copies: 348,
  item_marketcap: 5562200.0,
  item_confidence: null,
  item_confidence_reason: null,
  item_reasoning: null,
  item_rare: false,
  item_projected: false,
  item_hyped: false,
};

describe('parseRoutilityItem', () => {
  it('parses the real response', () => {
    expect(parseRoutilityItem(skotn, 439945661)).toEqual({
      value: 500000,
      usd: 1400,
      rate: null,
      confidence: null,
      confidenceReason: null,
      rare: false,
      projected: false,
      hyped: false,
      copies: 3973,
    });
  });

  it('rejects a response for a different item or a malformed body', () => {
    expect(parseRoutilityItem(skotn, 1)).toBeNull();
    expect(parseRoutilityItem('nope', 439945661)).toBeNull();
    expect(parseRoutilityItem([skotn], 439945661)).toBeNull();
  });

  it('drops negative or non-numeric numbers', () => {
    expect(parseRoutilityItem({ ...skotn, item_usd: -5, item_value: 'lots' }, 439945661)).toMatchObject({
      usd: null,
      value: null,
    });
  });
});

describe('parseConfidence', () => {
  it('understands words and scores', () => {
    expect(parseConfidence('High')).toBe('high');
    expect(parseConfidence('moderate')).toBe('medium');
    expect(parseConfidence(0.9)).toBe('high');
    expect(parseConfidence(55)).toBe('medium');
    expect(parseConfidence('20%')).toBe('low');
    expect(parseConfidence(null)).toBeNull();
    expect(parseConfidence(250)).toBeNull();
  });
});

describe('withRoutility', () => {
  const base = item({ id: 439945661, value: 440000, rap: 387196 });

  it('adds the USD estimate and RoUtility value', () => {
    const merged = withRoutility(base, { ...parseRoutilityItem(skotn, 439945661)!, confidence: 'high', rate: 2.8 });
    expect(merged.usd).toEqual({ value: 1400, confidence: 'high', origin: 'routility', rate: 2.8 });
    expect(merged.routility?.value).toBe(500000);
    expect(valueDisagreement(merged)).toBeCloseTo(0.136, 3);
  });

  it("ORs RoUtility's flags into the item", () => {
    const merged = withRoutility(base, { ...parseRoutilityItem(skotn, 439945661)!, rare: true });
    expect(merged.rare).toBe(true);
  });

  it('leaves the item alone without data', () => {
    expect(withRoutility(base, null)).toBe(base);
  });
});

describe('RoutilityCache', () => {
  function setup(responder: (id: number) => Response) {
    let now = 1_000_000;
    const saved: Record<string, RoutilityEntry>[] = [];
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      const id = Number(/item\/(\d+)\//.exec(String(url))?.[1]);
      return responder(id);
    });
    const cache = new RoutilityCache(
      fetchFn as unknown as typeof fetch,
      {
        load: async () => ({}),
        save: async (entries) => void saved.push(entries),
      },
      () => now,
    );
    return { cache, fetchFn, advance: (ms: number) => (now += ms) };
  }
  const ok = (id: number) => new Response(JSON.stringify({ ...skotn, item_id: String(id) }), { status: 200 });

  it('fetches each item once and serves it from cache', async () => {
    const { cache, fetchFn } = setup(ok);
    const first = await cache.get([1, 2, 2]);
    expect(first['1']?.usd).toBe(1400);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe('https://routility.io/item/1/details');
    await cache.get([1, 2]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(cache.status().lastSuccess).not.toBeNull();
  });

  it('refetches after the cache expires', async () => {
    const { cache, fetchFn, advance } = setup(ok);
    await cache.get([1]);
    advance(ROUTILITY_TTL_MS + 1);
    await cache.get([1]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('remembers items RoUtility does not know', async () => {
    const { cache, fetchFn } = setup(() => new Response('', { status: 404 }));
    expect(await cache.get([5])).toEqual({ '5': null });
    await cache.get([5]);
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it('backs off when blocked or rate limited', async () => {
    let status = 429;
    const { cache, fetchFn, advance } = setup((id) => (status === 200 ? ok(id) : new Response('', { status })));
    expect(await cache.get([1, 2, 3, 4, 5])).toEqual({});
    const calls = fetchFn.mock.calls.length;
    expect(calls).toBeLessThanOrEqual(3);
    expect(cache.status().blockedUntil).not.toBeNull();
    await cache.get([1]);
    expect(fetchFn.mock.calls.length).toBe(calls);
    status = 200;
    advance(ROUTILITY_BACKOFF_MS + 1);
    expect((await cache.get([1]))['1']?.usd).toBe(1400);
  });

  it('caps how many items one request can fetch', async () => {
    const { cache, fetchFn } = setup(ok);
    await cache.get(Array.from({ length: 100 }, (_, i) => i + 1));
    expect(fetchFn).toHaveBeenCalledTimes(40);
  });
});
