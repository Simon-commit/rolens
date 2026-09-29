import { describe, expect, it } from 'vitest';
import { findTradeOffers, renderTradeSummary } from '../src/content/trade-summary';
import { renderTradeWindow, tileOnHold } from '../src/content/trade-window';
import type { OwnerSince } from '../src/core/owner-since';
import { SELECTORS } from '../src/content/selectors';
import type { RenderContext } from '../src/content/ui/context';
import { DEFAULT_SETTINGS } from '../src/core/settings';
import { item } from './fixtures/items';
import page from './fixtures/roblox-trade-window.html?raw';

/* The real window for sending a trade, saved from Roblox in September 2026. */

const ctx: RenderContext = { settings: { ...DEFAULT_SETTINGS, usdRate: null }, status: null };

describe("Roblox's window for sending a trade", () => {
  it('shows the trade analysis for the offer and the request', () => {
    document.body.innerHTML = page; // eslint-disable-line no-restricted-properties
    const offers = findTradeOffers(document);
    expect(offers?.give.ids.length).toBeGreaterThan(0);
    // The request holds a face Roblox lists as a bundle, matched by name on the page.
    expect(offers?.receive.element.querySelector('h2')?.textContent).toBe('Your Request');
    const balance = renderTradeSummary(document, (id) => item({ id, name: `Item ${id}`, value: 1000, rap: 900 }), ctx);
    expect(balance).not.toBeNull();
    expect(document.querySelector('[data-rolens="trade"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-rolens="side-total"]')).toHaveLength(2);
  });

  it("finds the items Roblox marks as Holding, only in the partner's inventory", () => {
    document.body.innerHTML = page; // eslint-disable-line no-restricted-properties
    const [own, partner] = [...document.querySelectorAll(SELECTORS.inventoryPanel)];
    const held = (panel: Element | undefined) =>
      [...(panel?.querySelectorAll(SELECTORS.inventoryTile) ?? [])].filter(tileOnHold).length;
    expect(held(own)).toBe(0);
    expect(held(partner)).toBe(2);
  });
});

describe('hold end times in the trade window', () => {
  it("tags the partner's held items with when they come off hold, from their Rolimon's page", () => {
    history.replaceState(null, '', '/users/77/trade');
    const meta = document.createElement('meta');
    meta.name = 'user-data';
    meta.dataset.userid = '1';
    document.head.append(meta);
    document.body.innerHTML = page; // eslint-disable-line no-restricted-properties
    const now = Date.parse('2026-09-29T12:00:00Z');
    const asked: number[] = [];
    const data: OwnerSince = { '87983592197138': [{ serial: null, since: now - 19 * 3_600_000 }] };
    const deps = {
      lookup: () => undefined,
      filters: false,
      holdTimes: {
        ownerSince: (userId: number) => (asked.push(userId), userId === 77 ? data : null),
        now: () => now,
      },
    };
    renderTradeWindow(deps);
    expect(new Set(asked)).toEqual(new Set([77]));
    const tags = [...document.querySelectorAll<HTMLElement>('[data-rolens="hold-time"]')];
    // One of the two held items was received within the last 48 hours, per Rolimon's.
    expect(tags).toHaveLength(1);
    expect(tags[0]!.shadowRoot!.textContent).toContain('29h');
    expect(tags[0]!.closest('a')?.getAttribute('href')).toContain('87983592197138');
    expect(document.querySelector('[data-rolens="inventory-filter"]')).toBeNull();
    // Rolimon's no longer lists a recent change of hands: the tag goes.
    deps.holdTimes.ownerSince = () => ({});
    renderTradeWindow(deps);
    expect(document.querySelector('[data-rolens="hold-time"]')).toBeNull();
  });
});
