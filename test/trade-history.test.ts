import { afterEach, describe, expect, it } from 'vitest';
import { filterHistory, summariseHistory, type HistoryEntry } from '../src/core/trade-history';
import { openHistory } from '../src/content/trade-history';
import type { TradeOffers, TradeSummaryRow } from '../src/content/roblox-api';
import type { RenderContext } from '../src/content/ui/context';
import { DEFAULT_SETTINGS } from '../src/core/settings';
import { item } from './fixtures/items';

const day = 86_400_000;
const now = Date.parse('2026-09-28T12:00:00Z');
const entry = (id: number, partner: string, given: number | null, received: number | null, days = 1): HistoryEntry => ({
  id,
  partner,
  created: now - days * day,
  given,
  received,
});

describe('trade history totals', () => {
  it('adds up valued trades and picks the best and worst', () => {
    const summary = summariseHistory([
      entry(1, 'Ava', 100, 150),
      entry(2, 'Ben', 200, 120),
      entry(3, 'Cy', 50, 60),
      entry(4, 'Dee', null, null),
    ]);
    expect(summary).toMatchObject({ count: 4, valued: 3, given: 350, received: 330, net: -20, wins: 2, losses: 1 });
    expect(summary.best?.partner).toBe('Ava');
    expect(summary.worst?.partner).toBe('Ben');
  });

  it('shows no worst trade when every trade gained', () => {
    const summary = summariseHistory([entry(1, 'Ava', 100, 150), entry(2, 'Ben', 100, 110)]);
    expect(summary.best?.partner).toBe('Ava');
    expect(summary.worst).toBeNull();
  });

  it('filters by period and partner', () => {
    const entries = [entry(1, 'Ava', 1, 2, 5), entry(2, 'Ben', 1, 2, 60), entry(3, 'Avalon', 1, 2, 200)];
    expect(filterHistory(entries, 30, '', now).map((e) => e.id)).toEqual([1]);
    expect(filterHistory(entries, 90, '', now).map((e) => e.id)).toEqual([1, 2]);
    expect(filterHistory(entries, null, 'ava', now).map((e) => e.id)).toEqual([1, 3]);
  });
});

describe('trade history dialog', () => {
  afterEach(() => {
    document.querySelector('[data-rolens="history-dialog"]')?.remove();
    document.head.querySelector('meta[name="user-data"]')?.remove();
  });

  it('reads completed trades once and shows totals at current values', async () => {
    const meta = document.createElement('meta');
    meta.name = 'user-data';
    meta.dataset.userid = '1';
    document.head.append(meta);
    const row = (id: number, name: string, days: number): TradeSummaryRow => ({
      id,
      partner: { id: id * 10, name, displayName: name },
      created: now - days * day,
      expires: null,
      status: 'Completed',
    });
    const offer = (give: number, receive: number, robux = 0): TradeOffers => ({
      give: { itemIds: [give], names: [`Item ${give}`], robux: 0 },
      receive: { itemIds: [receive], names: [`Item ${receive}`], robux },
    });
    const values: Record<number, number> = { 1: 100, 2: 180, 3: 300, 4: 200 };
    const read: number[] = [];
    await openHistory(
      { settings: { ...DEFAULT_SETTINGS, usdRate: null, compactNumbers: false }, status: null } as RenderContext,
      {
        loadValues: () => Promise.resolve(),
        lookup: (id) => item({ id, name: `Item ${id}`, value: values[id] ?? 0, rap: 1 }),
        fetchList: () => Promise.resolve({ rows: [row(10, 'Ava', 2), row(11, 'Ben', 40)], next: null }),
        fetchOffers: (id) => {
          read.push(id);
          return Promise.resolve(id === 10 ? offer(1, 2, 100) : offer(3, 4));
        },
        now: () => now,
      },
      null,
    );
    expect(read).toEqual([10, 11]);
    const root = document.querySelector('[data-rolens="history-dialog"]')!.shadowRoot!;
    const stats = [...root.querySelectorAll('.stat b')].map((node) => node.textContent);
    // Ava: 100 given, 180 + 70 (100 Robux after fee) received = +150. Ben: 300 for 200 = −100.
    expect(stats).toEqual(['+50', '400', '450', '1 of 2']);
    expect(root.querySelector('.extreme .who')?.textContent).toBe('Ava');
    root.querySelectorAll<HTMLButtonElement>('.chip')[0]!.click();
    expect([...root.querySelectorAll('.trade .who')].map((n) => n.firstChild?.textContent)).toEqual(['Ava']);
  });
});
