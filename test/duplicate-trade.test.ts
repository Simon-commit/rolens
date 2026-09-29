import { afterEach, describe, expect, it } from 'vitest';
import {
  pendingTradesWith,
  renderDuplicateTrade,
  resetDuplicateTrade,
  tradePartnerFromPath,
} from '../src/content/duplicate-trade';
import type { TradeSummaryRow } from '../src/content/roblox-api';
import type { RenderContext } from '../src/content/ui/context';
import { DEFAULT_SETTINGS } from '../src/core/settings';
import { item } from './fixtures/items';

const ctx: RenderContext = { settings: { ...DEFAULT_SETTINGS, usdRate: null }, status: null };
const HOUR = 3_600_000;
const NOW = Date.parse('2026-09-27T18:00:00Z');

const row = (id: number, partnerId: number, hoursAgo: number, status = 'Open'): TradeSummaryRow => ({
  id,
  partner: { id: partnerId, name: `user${partnerId}`, displayName: `Player ${partnerId}` },
  created: NOW - hoursAgo * HOUR,
  expires: null,
  status,
});

describe('duplicate trade helpers', () => {
  it('reads the partner from the send-trade address', () => {
    expect(tradePartnerFromPath('/users/42/trade')).toBe(42);
    expect(tradePartnerFromPath('/users/42/profile')).toBeNull();
    expect(tradePartnerFromPath('/trades')).toBeNull();
  });

  it('keeps pending trades with the same player, newest first', () => {
    const rows = [row(1, 7, 30), row(2, 8, 1), row(3, 7, 2), row(4, 7, 1, 'Declined')];
    expect(pendingTradesWith(rows, 7).map((trade) => trade.id)).toEqual([3, 1]);
  });
});

describe('duplicate trade notice', () => {
  afterEach(() => {
    resetDuplicateTrade();
    document.body.replaceChildren();
    document.head.querySelector('meta[name="user-data"]')?.remove();
    history.replaceState(null, '', '/trades');
  });

  it('warns about a pending trade with the same player and shows its items', async () => {
    const meta = document.createElement('meta');
    meta.name = 'user-data';
    meta.dataset.userid = '1';
    document.head.append(meta);
    history.replaceState(null, '', '/users/7/trade');
    const offers = document.createElement('div');
    offers.className = 'trade-request-window-offers';
    document.body.append(offers);

    const requested: number[] = [];
    let redraws = 0;
    const deps = {
      loadValues: () => Promise.resolve(),
      lookup: (id: number) => item({ id, name: `Item ${id}`, rap: id * 100, value: id * 1000 }),
      redraw: () => (redraws += 1),
      now: () => NOW,
      fetchList: () => Promise.resolve({ rows: [row(10, 7, 3), row(11, 9, 1), row(12, 7, 26)], next: null }),
      fetchOffers: (id: number) => {
        requested.push(id);
        return Promise.resolve({
          give: { itemIds: [1], names: ['Item 1'], robux: 0 },
          receive: { itemIds: [2], names: ['Item 2'], robux: 0 },
        });
      },
    };
    await renderDuplicateTrade(ctx, deps);
    for (let i = 0; i < 4; i++) await Promise.resolve();
    await renderDuplicateTrade(ctx, deps);
    for (let i = 0; i < 4; i++) await Promise.resolve();
    await renderDuplicateTrade(ctx, deps);

    const host = document.querySelector('[data-rolens="duplicate-notice"]');
    expect(host?.nextElementSibling).toBe(offers);
    const text = host?.shadowRoot?.querySelector('.notice')?.textContent;
    expect(text).toContain('You already have 2 pending trades with Player 7. The latest was sent 3 hours ago.');
    expect(requested.sort()).toEqual([10, 12]);
    expect(redraws).toBeGreaterThan(0);
  });

  it('stays hidden when no trade with the player is pending', async () => {
    const meta = document.createElement('meta');
    meta.name = 'user-data';
    meta.dataset.userid = '1';
    document.head.append(meta);
    history.replaceState(null, '', '/users/5/trade');
    const offers = document.createElement('div');
    offers.className = 'trade-request-window-offers';
    document.body.append(offers);
    const deps = {
      loadValues: () => Promise.resolve(),
      lookup: () => null,
      redraw: () => undefined,
      fetchList: () => Promise.resolve({ rows: [row(10, 7, 3)], next: null }),
    };
    await renderDuplicateTrade(ctx, deps);
    await Promise.resolve();
    await renderDuplicateTrade(ctx, deps);
    expect(document.querySelector('[data-rolens="duplicate-notice"]')).toBeNull();
  });
});
