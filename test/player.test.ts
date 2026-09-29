import { describe, expect, it } from 'vitest';
import { summariseInventory } from '../src/core/inventory';
import { parsePlayerAssets, rolimonsPlayerUrl } from '../src/core/player';
import { PLAYER_BACKOFF_MS, PLAYER_MIN_GAP_MS, PLAYER_TTL_MS, PlayerCache } from '../src/core/player-cache';
import { DEFAULT_SETTINGS } from '../src/core/settings';
import { item } from './fixtures/items';

const body = {
  success: true,
  playerTerminated: false,
  playerPrivacyEnabled: false,
  chartNominalScanTime: 1_790_000_000,
  playerAssets: { '1': [11, 12], '2': [21], '3': [], nope: [1] },
  holds: [11],
};

describe('parsePlayerAssets', () => {
  it('counts copies per item and reads the scan time', () => {
    expect(parsePlayerAssets(body, 7)).toEqual({
      status: 'ok',
      userId: 7,
      counts: { '1': 2, '2': 1 },
      scannedAt: 1_790_000_000_000,
      held: 1,
    });
  });

  it('reports private, terminated and unusable answers', () => {
    expect(parsePlayerAssets({ ...body, playerPrivacyEnabled: true }, 7).status).toBe('private');
    expect(parsePlayerAssets({ ...body, playerTerminated: true }, 7).status).toBe('terminated');
    expect(parsePlayerAssets({ success: false }, 7).status).toBe('unknown');
    expect(parsePlayerAssets('<html>', 7).status).toBe('unknown');
  });
});

function fakeClock() {
  let now = 1_000_000;
  const waits: number[] = [];
  return {
    now: () => now,
    advance: (ms: number) => (now += ms),
    wait: (ms: number) => {
      waits.push(ms);
      now += ms;
      return Promise.resolve();
    },
    waits,
  };
}

describe('PlayerCache', () => {
  const json = (status: number, payload: unknown = body) =>
    Promise.resolve(new Response(JSON.stringify(payload), { status }));

  it('fetches without cookies, reuses answers and shares requests in flight', async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const clock = fakeClock();
    const cache = new PlayerCache(
      ((url: string, init?: RequestInit) => {
        calls.push([url, init]);
        return json(200);
      }) as typeof fetch,
      clock.now,
      clock.wait,
    );
    const [a, b] = await Promise.all([cache.get(7), cache.get(7)]);
    expect(a).toBe(b);
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe(rolimonsPlayerUrl(7));
    expect(calls[0]![1]?.credentials).toBe('omit');
    await cache.get(7);
    expect(calls).toHaveLength(1);
    clock.advance(PLAYER_TTL_MS);
    await cache.get(7);
    expect(calls).toHaveLength(2);
  });

  it("spaces requests out and backs off when Rolimon's limits them", async () => {
    const clock = fakeClock();
    let status = 200;
    const cache = new PlayerCache((() => json(status)) as unknown as typeof fetch, clock.now, clock.wait);
    await cache.get(1);
    await cache.get(2);
    expect(clock.waits).toEqual([PLAYER_MIN_GAP_MS]);
    status = 429;
    await expect(cache.get(3)).rejects.toThrow(/limiting requests/);
    await expect(cache.get(4)).rejects.toThrow(/limiting requests/);
    clock.advance(PLAYER_BACKOFF_MS);
    status = 200;
    await expect(cache.get(4)).resolves.toMatchObject({ status: 'ok' });
  });

  it('treats an unknown player as not yet scanned', async () => {
    const cache = new PlayerCache((() => json(404, {})) as unknown as typeof fetch);
    await expect(cache.get(9)).resolves.toEqual({ status: 'unknown', userId: 9 });
  });

  it('explains a network failure formally', async () => {
    const cache = new PlayerCache((() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch);
    await expect(cache.get(9)).rejects.toThrow(
      "Rolimon's could not be reached. Please check your connection and try again.",
    );
  });
});

describe('summariseInventory', () => {
  const table = new Map([
    [
      1,
      item({
        id: 1,
        name: 'Big',
        rap: 900,
        value: 1000,
        rare: true,
        usd: { value: 5, confidence: 'high', origin: 'routility' },
      }),
    ],
    [2, item({ id: 2, name: 'Small', rap: 300 })],
  ]);
  const lookup = (id: number) => table.get(id) ?? null;

  it('totals every copy, most valuable first, and leaves unlisted items out', () => {
    const summary = summariseInventory({ '1': 2, '2': 1, '3': 4 }, lookup, { ...DEFAULT_SETTINGS, usdRate: null });
    expect(summary.entries.map((entry) => entry.item.id)).toEqual([1, 2]);
    expect(summary).toMatchObject({ value: 2300, rap: 2100, copies: 3, rare: 2, unlisted: 4 });
    expect(summary.usd).toEqual({ value: 10, estimated: false, covered: 2 });
  });

  it('marks the USD total as estimated when the fallback rate fills gaps', () => {
    const summary = summariseInventory({ '1': 1, '2': 1 }, lookup, { ...DEFAULT_SETTINGS, usdRate: 3 });
    expect(summary.usd).toEqual({ value: 5.9, estimated: true, covered: 2 });
  });
});
