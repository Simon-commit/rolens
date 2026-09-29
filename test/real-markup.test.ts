import { beforeEach, describe, expect, it } from 'vitest';
import { findItemCards } from '../src/content/badges';
import { SELECTORS } from '../src/content/selectors';
import { detectSeparators } from '../src/core/format';
import fixture from './fixtures/roblox-send-trade.html?raw';

/* Markup from a real, saved trade page (sanitised; see the fixture's header). */

describe('real Roblox trade page markup', () => {
  beforeEach(() => {
    document.body.innerHTML = fixture; // eslint-disable-line no-restricted-properties
  });

  it('finds every inventory tile and offer row as its own card', () => {
    const cards = [...findItemCards(document).keys()];
    const tiles = cards.filter((card) => card.classList.contains('item-card-container'));
    const rows = cards.filter((card) => card.classList.contains('trade-request-item'));
    expect(tiles.length).toBeGreaterThan(0);
    expect(rows.length).toBeGreaterThan(0);
    expect(tiles.length + rows.length).toBe(cards.length);
  });

  it('finds a thumbnail and a caption in every card', () => {
    for (const card of findItemCards(document).keys()) {
      expect(card.querySelector('.thumbnail-2d-container')).not.toBeNull();
      expect(card.querySelector(SELECTORS.cardCaption)).not.toBeNull();
    }
  });

  it("reads Roblox's digit grouping from its prices", () => {
    const prices = [...document.querySelectorAll(SELECTORS.robuxAmount)].map((node) => node.textContent ?? '');
    expect(detectSeparators(prices)).toEqual({ group: '.', decimal: ',' });
  });
});
