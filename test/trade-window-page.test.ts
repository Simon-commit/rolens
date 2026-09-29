import { describe, expect, it } from 'vitest';
import { findTradeOffers, renderTradeSummary } from '../src/content/trade-summary';
import { tileOnHold } from '../src/content/trade-window';
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
