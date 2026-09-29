import { afterEach, describe, expect, it } from 'vitest';
import { findItemCards, pendingNames, useNameMatcher } from '../src/content/badges';
import { itemPageIsLimited, panelAnchor, renderItemPanel } from '../src/content/item-panel';
import { bundleIdFromPath, itemRefFromHref } from '../src/content/selectors';
import type { RenderContext } from '../src/content/ui/context';
import { openInventoryPanel } from '../src/content/ui/inventory-panel';
import { summariseInventory } from '../src/core/inventory';
import { isRequest } from '../src/core/messages';
import { buildNameIndex, normaliseName } from '../src/core/names';
import { DEFAULT_SETTINGS } from '../src/core/settings';
import { item } from './fixtures/items';

const ctx: RenderContext = { settings: { ...DEFAULT_SETTINGS, usdRate: null }, status: null };
const setBody = (html: string) => {
  document.body.innerHTML = html; // eslint-disable-line no-restricted-properties
};

afterEach(() => {
  useNameMatcher(null);
  setBody('');
  document.title = '';
});

describe('Matching by name', () => {
  it('ignores case, spacing and quote style, and refuses shared names', () => {
    expect(normaliseName('  Clockwork’s   Shades ')).toBe("clockwork's shades");
    const index = buildNameIndex({
      '1': item({ id: 1, name: 'Red Fang' }),
      '2': item({ id: 2, name: 'Twin' }),
      '3': item({ id: 3, name: 'twin' }),
    });
    expect(index.get('red fang')).toBe(1);
    expect(index.get('twin')).toBeNull();
  });

  it('accepts only sensible name lookups', () => {
    expect(isRequest({ type: 'rolens:findByName', names: ['Red Fang'] })).toBe(true);
    expect(isRequest({ type: 'rolens:findByName', names: [''] })).toBe(false);
    expect(isRequest({ type: 'rolens:findByName', names: ['x'.repeat(201)] })).toBe(false);
    expect(isRequest({ type: 'rolens:findByName', names: Array(201).fill('a') })).toBe(false);
  });

  it('reads bundle links and pages', () => {
    expect(itemRefFromHref('/bundles/123/Red-Fang')).toEqual({ kind: 'bundle', id: 123 });
    expect(itemRefFromHref('/catalog/5')).toEqual({ kind: 'catalog', id: 5 });
    expect(itemRefFromHref('https://evil.example/bundles/1')).toBeNull();
    expect(bundleIdFromPath('/bundles/77/Green-Glowing-Eyes')).toBe(77);
  });

  it('matches limited cards Roblox shows under a new id, and only those', () => {
    setBody(`
      <div class="trade-request-window">
        <div class="item-card-container"><a href="/bundles/900/Red-Fang"></a><div class="item-card-name">Red Fang</div></div>
        <div class="item-card-container"><a href="/catalog/901/Green-Glowing-Eyes"></a><div class="item-card-name">Green Glowing Eyes</div></div>
        <div class="item-card-container"><a href="/catalog/5/Known"></a><div class="item-card-name">Known</div></div>
      </div>
      <div class="item-card-container"><a href="/catalog/902/Red-Fang"></a><div class="item-card-name">Red Fang</div></div>`);
    const names = new Map<string, number | null>();
    useNameMatcher({
      lookup: (id) => (id === 5 ? item({ id: 5 }) : id > 900 || id === 900 ? null : undefined),
      idForName: (name) => names.get(name),
    });
    // The card outside the trade has no limited mark, so it is never matched by name.
    expect(pendingNames(document).sort()).toEqual(['Green Glowing Eyes', 'Red Fang']);
    names.set('Red Fang', 10);
    names.set('Green Glowing Eyes', null);
    const ids = [...findItemCards(document).values()];
    expect(ids).toEqual([10, 901, 5, 902]);
    expect(pendingNames(document)).toEqual([]);
  });
});

describe('Item page card', () => {
  const hero = (id = 1) => item({ id, name: 'Red Domino Crown', rap: 1000, value: 1200 });

  it('goes under the creator line when the title and creator are separate rows', () => {
    document.title = 'Red Domino Crown - Roblox';
    setBody(`
      <div class="details">
        <div class="title-row"><h1>Red Domino Crown</h1><span class="cart"></span></div>
        <div class="creator"><span>By</span> <a>Roblox</a></div>
        <div class="price-row"><span>Best Price</span><span class="icon-robux-16x16"></span><span>6.800.000</span></div>
      </div>
      <h2>Recommendations</h2>`);
    renderItemPanel(document, hero(), ctx);
    const card = document.querySelector('[data-rolens="panel"]')!;
    expect(card.previousElementSibling?.className).toBe('creator');
    expect(card.nextElementSibling?.className).toBe('price-row');
  });

  it('goes after the header block when title and creator share one', () => {
    document.title = 'Chronoinitium: The Harbinger Helm - Roblox';
    setBody(`
      <h2>Something before</h2>
      <div class="details">
        <div class="header"><div><h1>Chronoinitium: The Harbinger Helm</h1></div><div>By Roblox</div></div>
        <div class="price"><div>Best Price</div><div>2.500.000</div></div>
      </div>
      <div class="recs"><h2>Recommendations</h2></div>`);
    expect(panelAnchor(document)?.className).toBe('header');
  });

  it('moves back into place when Roblox re-renders around it', () => {
    document.title = 'Red Domino Crown - Roblox';
    setBody(
      `<div class="details"><h1>Red Domino Crown</h1><div class="creator">By Roblox</div><div class="price">Best Price</div></div>`,
    );
    renderItemPanel(document, hero(), ctx);
    const card = document.querySelector('[data-rolens="panel"]')!;
    document.body.append(card);
    renderItemPanel(document, hero(), ctx);
    expect(document.querySelector('.creator')!.nextElementSibling).toBe(card);
  });

  it('tells a limited item page from a page that only recommends limiteds', () => {
    document.title = 'Green Glowing Eyes - Roblox';
    setBody(
      `<div class="item"><div class="thumb"><span class="limited-icon-container"></span></div><div><h1>Green Glowing Eyes</h1></div></div>`,
    );
    expect(itemPageIsLimited(document)).toBe(true);
    setBody(
      `<main><div class="a"><div class="b"><div class="c"><div class="d"><div class="e"><div class="f"><div class="g"><h1>Green Glowing Eyes</h1></div></div></div></div></div></div></div></main>` +
        `<section><span class="limited-icon-container"></span></section>`,
    );
    expect(itemPageIsLimited(document)).toBe(false);
  });
});

describe('Inventory dialog', () => {
  it('offers "Show more" only while items remain, under every filter', async () => {
    const counts: Record<string, number> = {};
    const table = new Map<number, ReturnType<typeof item>>();
    for (let id = 1; id <= 130; id += 1) {
      counts[id] = 1;
      table.set(id, item({ id, name: `Item ${id}`, rap: id * 10, value: id * 12, rare: id <= 2 }));
    }
    const summary = summariseInventory(counts, (id) => table.get(id) ?? null, ctx.settings);
    openInventoryPanel({
      playerName: 'Player',
      userId: 1,
      summary,
      scannedAt: null,
      ctx,
      loadThumbnails: () => Promise.resolve(new Map()),
    });
    const root = document.querySelector('[data-rolens="inventory"]')!.shadowRoot!;
    const more = root.querySelector<HTMLButtonElement>('.more')!;
    const tiles = () => root.querySelectorAll('.tile').length;
    expect(tiles()).toBe(60);
    expect(more.hidden).toBe(false);
    expect(more.textContent).toBe('Show 60 more');
    more.click();
    expect(tiles()).toBe(120);
    expect(more.textContent).toBe('Show 10 more');
    more.click();
    expect(tiles()).toBe(130);
    expect(more.hidden).toBe(true);

    root.querySelector<HTMLButtonElement>('.filter')!.click();
    expect(tiles()).toBe(2);
    expect(more.hidden).toBe(true);

    const search = root.querySelector('input')!;
    search.value = 'Item 1';
    search.dispatchEvent(new Event('input'));
    expect(tiles()).toBe(1);
    expect(more.hidden).toBe(true);
    await Promise.resolve();
  });
});
