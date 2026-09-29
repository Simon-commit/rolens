import { afterEach, describe, expect, it } from 'vitest';
import {
  FILTERED_ATTR,
  tileOnHold,
  minimumValue,
  passesFilter,
  renderTradeWindow,
  resetTradeWindow,
} from '../src/content/trade-window';
import { item } from './fixtures/items';

const setBody = (html: string) => {
  document.body.innerHTML = html; // eslint-disable-line no-restricted-properties
};

const tile = (id: number, name: string, serial?: number, holding = false) => `
  <li class="list-item item-card trade-item-card"><div class="trade-inventory-card"><div class="item-card-container">
    <a class="item-card-link" href="https://www.roblox.com/catalog/${id}/x"><div class="item-card-thumb-container">
      <span class="limited-icon-container"><span class="icon-shop-limited"></span>${serial ? `<span class="limited-number">${serial}</span>` : ''}</span>
      ${holding ? '<div class="item-card-overlay"><span class="icon-clock"></span><span>Holding</span></div>' : ''}
    </div><div class="item-card-caption"><div class="item-card-name">${name}</div></div></a>
  </div></div></li>`;

const panel = (heading: string, tiles: string) => `
  <div class="trade-inventory-panel"><div class="inventory-panel-header"><h2 class="inventory-label">${heading}</h2></div>
  <div class="inventory-filter-row"></div><ul>${tiles}</ul></div>`;

describe('trade window tools', () => {
  afterEach(() => {
    resetTradeWindow();
    document.head.querySelector('meta[name="user-data"]')?.remove();
    history.replaceState(null, '', '/');
  });

  it('reads minimum values', () => {
    expect(minimumValue('50K')).toBe(50_000);
    expect(minimumValue('1.2m')).toBe(1_200_000);
    expect(minimumValue('1,5M+')).toBe(1_500_000);
    expect(minimumValue('250000')).toBe(250_000);
    expect(minimumValue('valk')).toBeNull();
  });

  it('matches names, acronyms, values, rarity and holds', () => {
    const stf = item({ id: 1, name: 'Sparkle Time Fedora', acronym: 'STF', value: 3_000_000, rare: true });
    const base = { query: '', rareOnly: false, hideHold: false };
    expect(passesFilter({ ...base, query: 'sparkle' }, stf.name, stf, false)).toBe(true);
    expect(passesFilter({ ...base, query: 'stf' }, stf.name, stf, false)).toBe(true);
    expect(passesFilter({ ...base, query: 'st' }, stf.name, stf, false)).toBe(false);
    expect(passesFilter({ ...base, query: '5m' }, stf.name, stf, false)).toBe(false);
    expect(passesFilter({ ...base, rareOnly: true }, 'Shaggy', item({ id: 2, name: 'Shaggy' }), false)).toBe(false);
    expect(passesFilter({ ...base, hideHold: true }, stf.name, stf, true)).toBe(false);
    expect(passesFilter({ ...base, hideHold: true }, stf.name, stf, false)).toBe(true);
  });

  it("reads Roblox's own hold marker", () => {
    setBody(
      tile(1, 'A', undefined, true) + tile(2, 'B') + '<li class="trade-item-card"><div class="is-on-hold"></div></li>',
    );
    const tiles = [...document.querySelectorAll('li')];
    expect(tiles.map(tileOnHold)).toEqual([true, false, true]);
    // A search field's placeholder classes are not a hold marker.
    setBody('<li><input class="placeholder:content-muted"></li>');
    expect(tileOnHold(document.querySelector('li')!)).toBe(false);
  });

  it('filters tiles and hides items Roblox marks as on hold', () => {
    history.replaceState(null, '', '/users/77/trade');
    const meta = document.createElement('meta');
    meta.name = 'user-data';
    meta.dataset.userid = '1';
    document.head.append(meta);
    setBody(
      panel('Your Inventory', tile(1, 'Sparkle Time Fedora', 12, true) + tile(2, 'Shaggy')) +
        panel("Kyrie's Inventory", tile(3, 'Valkyrie Helm')),
    );
    const values = new Map([
      [1, item({ id: 1, name: 'Sparkle Time Fedora', acronym: 'STF', value: 3_000_000, rare: true })],
      [2, item({ id: 2, name: 'Shaggy', value: 70_000 })],
      [3, item({ id: 3, name: 'Valkyrie Helm', value: 270_000 })],
    ]);
    const deps = { lookup: (id: number) => values.get(id), filters: true, holdTimes: null };
    renderTradeWindow(deps);
    const bars = [...document.querySelectorAll<HTMLElement>('[data-rolens="inventory-filter"]')];
    expect(bars).toHaveLength(2);
    expect(bars[0]!.previousElementSibling?.classList.contains('inventory-filter-row')).toBe(true);

    const input = bars[0]!.shadowRoot!.querySelector('input')!;
    input.value = '100k';
    input.dispatchEvent(new Event('input'));
    const hidden = () => [...document.querySelectorAll(`[${FILTERED_ATTR}] .item-card-name`)].map((n) => n.textContent);
    expect(hidden()).toEqual(['Shaggy']);
    expect(bars[0]!.shadowRoot!.querySelector('.count')?.textContent).toBe('1 of 2 items');
    input.value = '';
    input.dispatchEvent(new Event('input'));
    const holdToggle = [...bars[0]!.shadowRoot!.querySelectorAll<HTMLButtonElement>('.toggle')].find(
      (node) => node.textContent === 'Hide on hold',
    )!;
    holdToggle.click();
    expect(hidden()).toEqual(['Sparkle Time Fedora']);
    // The filter survives a redraw.
    renderTradeWindow(deps);
    expect(hidden()).toEqual(['Sparkle Time Fedora']);
  });
});
