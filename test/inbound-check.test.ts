import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkInbound, type InboundReader } from '../src/background/inbound-alerts';
import type { TradeOffers, TradeSummaryRow } from '../src/content/roblox-api';

let storage: Record<string, unknown> = {};

beforeEach(() => {
  storage = {};
  vi.stubGlobal('chrome', {
    permissions: { contains: () => Promise.resolve(true) },
    storage: {
      local: {
        get: (keys: string | string[]) =>
          Promise.resolve(
            Object.fromEntries(
              [keys]
                .flat()
                .filter((k) => k in storage)
                .map((k) => [k, storage[k]]),
            ),
          ),
        set: (items: Record<string, unknown>) => Promise.resolve(void Object.assign(storage, items)),
      },
    },
  });
  storage.alerts = { enabled: true, ntfyTopic: 'rolens-test-topic' };
  storage.robloxUserId = 1;
});

afterEach(() => vi.unstubAllGlobals());

const row = (id: number): TradeSummaryRow =>
  ({
    id,
    partner: { id: 50, name: 'trader', displayName: 'Trader' },
    created: null,
    expires: null,
    status: 'Open',
  }) as TradeSummaryRow;

const offers: TradeOffers = {
  give: { itemIds: [1], names: ['A'], robux: 0 },
  receive: { itemIds: [2], names: ['B'], robux: 0 },
};

function reader(rows: TradeSummaryRow[] | null, failure: string | null = null): InboundReader {
  return {
    list: () => Promise.resolve(rows ? { rows } : null),
    offers: () => Promise.resolve(offers),
    failure: () => failure,
  };
}

const values = { lookup: () => Promise.resolve(new Map()), sources: () => Promise.resolve("Rolimon's") };

describe('checkInbound', () => {
  it('notes existing trades on the first check, then alerts only new ones', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('ok')));
    vi.stubGlobal('fetch', fetchMock);
    const first = await checkInbound(values, reader([row(1), row(2)]));
    expect(first).toMatchObject({ primed: true, newTrades: 0, error: null });
    expect(fetchMock).not.toHaveBeenCalled();

    const second = await checkInbound(values, reader([row(3), row(1), row(2)]));
    expect(second).toMatchObject({ primed: false, newTrades: 1, alerted: 1, error: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('records why Roblox did not return the trades', async () => {
    const result = await checkInbound(values, reader(null, 'HTTP 401'));
    expect(result?.error).toMatch(/HTTP 401/);
    expect((storage.alertState as { lastError: string }).lastError).toMatch(/HTTP 401/);
  });

  it('reports a destination it may not reach instead of skipping it silently', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await checkInbound(values, reader([row(1)]));
    (chrome.permissions as { contains: unknown }).contains = ({ origins }: { origins?: string[] }) =>
      Promise.resolve(!origins?.includes('https://ntfy.sh/*'));
    const result = await checkInbound(values, reader([row(2), row(1)]));
    expect(result?.error).toMatch(/ntfy \(access not allowed\)/);
  });

  it('does nothing while alerts are off', async () => {
    storage.alerts = { enabled: false };
    expect(await checkInbound(values, reader([row(1)]))).toBeNull();
  });
});
