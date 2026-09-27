import { beforeEach, describe, expect, it } from 'vitest';
import { findItemCards, renderBadges } from '../src/content/badges';
import { removeOwnNodes } from '../src/content/dom';
import { renderItemPanel } from '../src/content/item-panel';
import { findTradeOffers, renderTradeSummary } from '../src/content/trade-summary';
import { DEFAULT_SETTINGS } from '../src/core/settings';
import { rolimons } from '../src/providers/rolimons';
import { item } from './fixtures/items';
import { itemPage, tradePage } from './fixtures/trade-page';

const table = new Map([
  [1, item({ id: 1, name: 'Valued Hat', rap: 1000, value: 1500, demand: 'high', trend: 'stable' })],
  [2, item({ id: 2, name: 'Unvalued Hat', rap: 800 })],
  [3, item({ id: 3, name: 'Projected Hat', rap: 5000, value: 4000, projected: true })],
]);
const lookup = (id: number) => table.get(id) ?? null;

describe('badges', () => {
  beforeEach(() => {
    document.body.innerHTML = tradePage; // eslint-disable-line no-restricted-properties
  });

  it('finds one card per item, not one per link', () => {
    expect([...findItemCards(document).values()]).toEqual([1, 2, 3, 999]);
  });

  it('adds a badge to each known item only', () => {
    renderBadges(findItemCards(document), lookup, DEFAULT_SETTINGS);
    const badges = [...document.querySelectorAll<HTMLElement>('.rolens-badge')];
    expect(badges.map((b) => b.dataset.rolensId)).toEqual(['1', '2', '3']);
    expect(badges[0]?.textContent).toBe('1,500RAP 1,000');
    expect(badges[1]?.classList.contains('is-unvalued')).toBe(true);
    expect(badges[2]?.classList.contains('is-projected')).toBe(true);
    expect(badges[2]?.title).toContain('Projected');
  });

  it('is idempotent so the MutationObserver settles', () => {
    renderBadges(findItemCards(document), lookup, DEFAULT_SETTINGS);
    const before = document.body.innerHTML; // eslint-disable-line no-restricted-properties
    renderBadges(findItemCards(document), lookup, DEFAULT_SETTINGS);
    expect(document.body.innerHTML).toBe(before); // eslint-disable-line no-restricted-properties
  });

  it('renders item names as text, never as markup', () => {
    const evil = item({ id: 1, name: '<img src=x onerror=alert(1)>', value: 1 });
    renderBadges(findItemCards(document), () => evil, DEFAULT_SETTINGS);
    expect(document.querySelector('.rolens-badge img')).toBeNull();
  });

  it('can be fully removed', () => {
    renderBadges(findItemCards(document), lookup, DEFAULT_SETTINGS);
    removeOwnNodes(document);
    expect(document.querySelector('[data-rolens]')).toBeNull();
  });
});

describe('trade summary', () => {
  beforeEach(() => {
    document.body.innerHTML = tradePage; // eslint-disable-line no-restricted-properties
  });

  it('identifies give and receive sides from the headers', () => {
    const offers = findTradeOffers(document);
    expect(offers?.give.ids).toEqual([1, 2]);
    expect(offers?.receive.ids).toEqual([3, 999]);
  });

  it('computes and renders the win/loss', () => {
    const balance = renderTradeSummary(document, lookup, DEFAULT_SETTINGS);
    expect(balance?.valueDelta).toBe(4000 - 2300);
    const summary = document.querySelector<HTMLElement>('.rolens-trade');
    expect(summary?.dataset.verdict).toBe('win');
    expect(summary?.textContent).toContain('+1,700 value');
    expect(summary?.textContent).toContain('Has projected');
    expect(summary?.textContent).toContain('1 item(s) have no value data');
    // Summary sits above the first offer.
    expect(summary?.nextElementSibling?.classList.contains('trade-list-detail-offer')).toBe(true);
  });

  it('does nothing outside a trade', () => {
    document.body.innerHTML = '<div></div>'; // eslint-disable-line no-restricted-properties
    expect(renderTradeSummary(document, lookup, DEFAULT_SETTINGS)).toBeNull();
  });
});

describe('item panel', () => {
  it('inserts stats under the title with a source link', () => {
    document.body.innerHTML = itemPage; // eslint-disable-line no-restricted-properties
    renderItemPanel(document, table.get(1)!, DEFAULT_SETTINGS, rolimons, null);
    const panel = document.querySelector('h1 + .rolens-panel');
    expect(panel?.textContent).toContain('1,500 R$');
    expect(panel?.textContent).toContain('High');
    expect(panel?.querySelector('a')?.getAttribute('href')).toBe('https://www.rolimons.com/item/1');
    expect(panel?.querySelector('a')?.rel).toBe('noopener noreferrer');
  });
});
