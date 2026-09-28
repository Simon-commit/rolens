import { afterEach, describe, expect, it } from 'vitest';
import {
  FILTERED_ATTR,
  holdState,
  minimumValue,
  passesFilter,
  renderTradeWindow,
  resetTradeWindow,
} from '../src/content/trade-window';
import { item } from './fixtures/items';

const setBody = (html: string) => {
  document.body.innerHTML = html; // eslint-disable-line no-restricted-properties
};

const tile = (id: number, name: string, serial?: number) => `
  <li class="list-item item-card trade-item-card"><div class="trade-inventory-card"><div class="item-card-container">
    <a class="item-card-link" href="https://www.roblox.com/catalog/${id}/x"><div class="item-card-thumb-container">
      <span class="limited-icon-container"><span class="icon-shop-limited"></span>${serial ? `<span class="limited-number">${serial}</span>` : ''}</span>
    </div><div class="item-card-caption"><div class="item-card-name">${name}</div></div></a>
  </div></div></li>`;

const panel = (heading: string, tiles: string) => `
  <div class="trade-inventory-panel"><div class="inventory-panel-header"><h2 class="inventory-label">${heading}</h2></div>
  <div class="inventory-filter-row"></div><ul>${tiles}</ul></div>`;

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

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
    expect(passesFilter({ ...base, query: 'sparkle' }, stf.name, stf, 'none')).toBe(true);
    expect(passesFilter({ ...base, query: 'stf' }, stf.name, stf, 'none')).toBe(true);
    expect(passesFilter({ ...base, query: 'st' }, stf.name, stf, 'none')).toBe(false);
    expect(passesFilter({ ...base, query: '5m' }, stf.name, stf, 'none')).toBe(false);
    expect(passesFilter({ ...base, rareOnly: true }, 'Shaggy', item({ id: 2, name: 'Shaggy' }), 'none')).toBe(false);
    expect(passesFilter({ ...base, hideHold: true }, stf.name, stf, 'hold')).toBe(false);
    expect(passesFilter({ ...base, hideHold: true }, stf.name, stf, 'some')).toBe(true);
  });

  it('tells which copy is on hold', () => {
    const index = {
      serials: new Set(['7#12']),
      counts: new Map<number, [number, number]>([
        [7, [1, 2]],
        [8, [1, 2]],
        [9, [2, 2]],
      ]),
    };
    expect(holdState(index, 7, 12)).toBe('hold');
    expect(holdState(index, 7, 13)).toBe('none');
    expect(holdState(index, 8, null)).toBe('some');
    expect(holdState(index, 9, null)).toBe('hold');
    expect(holdState(index, 10, null)).toBe('none');
  });

  it('filters tiles and tags items on hold in both inventories', async () => {
    history.replaceState(null, '', '/users/77/trade');
    const meta = document.createElement('meta');
    meta.name = 'user-data';
    meta.dataset.userid = '1';
    document.head.append(meta);
    setBody(
      panel('Your Inventory', tile(1, 'Sparkle Time Fedora', 12) + tile(2, 'Shaggy')) +
        panel("Kyrie's Inventory", tile(3, 'Valkyrie Helm')),
    );
    const values = new Map([
      [1, item({ id: 1, name: 'Sparkle Time Fedora', acronym: 'STF', value: 3_000_000, rare: true })],
      [2, item({ id: 2, name: 'Shaggy', value: 70_000 })],
      [3, item({ id: 3, name: 'Valkyrie Helm', value: 270_000 })],
    ]);
    const asked: number[] = [];
    let redraws = 0;
    const deps = {
      lookup: (id: number) => values.get(id),
      redraw: () => (redraws += 1),
      fetchOwned: (userId: number) => {
        asked.push(userId);
        return Promise.resolve(
          userId === 1
            ? [
                { assetId: 1, instanceId: 10, serial: 12, onHold: true },
                { assetId: 2, instanceId: 11, serial: null, onHold: false },
              ]
            : [{ assetId: 3, instanceId: 20, serial: null, onHold: true }],
        );
      },
    };
    renderTradeWindow(deps);
    await flush();
    renderTradeWindow(deps);
    expect(asked).toEqual([1, 77]);
    expect(redraws).toBe(2);
    const tags = document.querySelectorAll('[data-rolens="hold-tag"]');
    expect(tags).toHaveLength(2);
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
