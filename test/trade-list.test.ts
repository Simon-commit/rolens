import { beforeEach, describe, expect, it } from 'vitest';
import { parseTradeList, parseTradeOffers } from '../src/content/roblox-api';
import { profileIdFromPath } from '../src/content/selectors';
import {
  activeTradeList,
  renderTradeList,
  resetTradeList,
  rowMatches,
  signedInUserId,
} from '../src/content/trade-list';
import type { RenderContext } from '../src/content/ui/context';
import { renderProfileBox } from '../src/content/ui/profile-box';
import { formatRobux } from '../src/core/format';
import { summariseInventory } from '../src/core/inventory';
import { DEFAULT_SETTINGS } from '../src/core/settings';
import { item } from './fixtures/items';

const ctx: RenderContext = { settings: { ...DEFAULT_SETTINGS, usdRate: null }, status: null };
const setBody = (html: string) => {
  document.body.innerHTML = html; // eslint-disable-line no-restricted-properties
};

const tradeRow = (id: number, name: string, displayName: string) => ({
  id,
  partner: { id: null, name, displayName },
  created: null,
  expires: null,
  status: '',
});

describe('Roblox trade parsers', () => {
  it('reads a page of the trades list', () => {
    expect(
      parseTradeList({
        nextPageCursor: 'abc',
        data: [
          {
            id: 5,
            user: { id: 2, name: 'kyrie', displayName: 'Kyrie' },
            created: '2026-09-27T10:00:00.000Z',
            expiration: '2026-10-01T10:00:00.000Z',
            status: 'Open',
          },
          { id: 'x' },
        ],
      }),
    ).toEqual({
      rows: [
        {
          id: 5,
          partner: { id: 2, name: 'kyrie', displayName: 'Kyrie' },
          created: Date.parse('2026-09-27T10:00:00.000Z'),
          expires: Date.parse('2026-10-01T10:00:00.000Z'),
          status: 'Open',
        },
      ],
      next: 'abc',
    });
    expect(parseTradeList({ error: 'nope' })).toBeNull();
  });

  it("reads both API versions from the signed-in user's side", () => {
    const v1 = {
      offers: [
        { user: { id: 9 }, userAssets: [{ assetId: 3 }], robux: 100 },
        { user: { id: 1 }, userAssets: [{ assetId: 1 }, { assetId: 2 }], robux: 0 },
      ],
    };
    expect(parseTradeOffers(v1, 1)).toEqual({
      give: { itemIds: [1, 2], names: ['', ''], robux: 0 },
      receive: { itemIds: [3], names: [''], robux: 100 },
    });
    const v2 = {
      participantAOffer: { user: { id: 1 }, items: [{ itemTarget: { targetId: '4' } }], robux: 0 },
      participantBOffer: { user: { id: 9 }, items: [{ itemTarget: { targetId: '5' } }], robux: 50 },
    };
    expect(parseTradeOffers(v2, 1)).toEqual({
      give: { itemIds: [4], names: [''], robux: 0 },
      receive: { itemIds: [5], names: [''], robux: 50 },
    });
    const namedV1 = {
      offers: [
        { user: { id: 1 }, userAssets: [{ assetId: 9, name: 'Red Fang' }], robux: 0 },
        { user: { id: 2 }, userAssets: [], robux: 0 },
      ],
    };
    expect(parseTradeOffers(namedV1, 1)?.give.names).toEqual(['Red Fang']);
    const namedV2 = {
      participantAOffer: { user: { id: 1 }, items: [{ itemName: 'Red Fang', itemTarget: { targetId: '9' } }] },
      participantBOffer: { user: { id: 2 }, items: [] },
    };
    expect(parseTradeOffers(namedV2, 1)?.give.names).toEqual(['Red Fang']);
    expect(parseTradeOffers(v2, 77)).toBeNull();
  });
});

describe('Trades list', () => {
  const rows = (names: string[]) =>
    names.map((name) => `<div class="trade-row"><span class="paired-name">${name}</span></div>`).join('');

  beforeEach(() => {
    resetTradeList();
    setBody('');
    document.head.querySelector('meta[name="user-data"]')?.remove();
  });

  it('knows the list and user from the page', () => {
    setBody('<div class="trades-list-header"><span class="rbx-tab active">Outbound</span></div>');
    expect(activeTradeList()).toBe('outbound');
    expect(signedInUserId()).toBeNull();
    const meta = document.createElement('meta');
    meta.name = 'user-data';
    meta.dataset.userid = '42';
    document.head.append(meta);
    expect(signedInUserId()).toBe(42);
  });

  it('matches rows to trades by partner', () => {
    setBody(rows(['Kyrie @kyrie_trades']));
    const row = document.querySelector('.trade-row')!;
    expect(rowMatches(row, tradeRow(1, 'kyrie_trades', 'Kyrie'))).toBe(true);
    expect(rowMatches(row, tradeRow(1, 'nova', 'Nova'))).toBe(false);
  });

  it('previews trades in view and skips rows that do not match', async () => {
    const meta = document.createElement('meta');
    meta.name = 'user-data';
    meta.dataset.userid = '1';
    document.head.append(meta);
    setBody(rows(['Kyrie', 'Someone else']));
    // jsdom has no layout: treat every row as in view.
    globalThis.IntersectionObserver = class {
      constructor(private readonly callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        this.callback([{ target, isIntersecting: true } as IntersectionObserverEntry], this as never);
      }
    } as unknown as typeof IntersectionObserver;
    const table = new Map([
      [1, item({ id: 1, rap: 900, value: 1000 })],
      [2, item({ id: 2, rap: 1400, value: 1500 })],
      [3, item({ id: 3, name: 'Red Fang', rap: 90, value: 100 })],
    ]);
    const requested: number[] = [];
    let redraws = 0;
    const resolved = new Map<string, number | null>();
    const deps = {
      loadValues: () => Promise.resolve(),
      lookup: (id: number) => table.get(id) ?? null,
      // Roblox lists Red Fang under a new id; Rolimon's knows it by name as item 3.
      resolveNames: (names: string[]) => {
        for (const name of names) resolved.set(name, name === 'Red Fang' ? 3 : null);
        return Promise.resolve();
      },
      idForName: (name: string) => resolved.get(name),
      redraw: () => (redraws += 1),
      fetchList: () =>
        Promise.resolve({
          rows: [tradeRow(10, 'kyrie', 'Kyrie'), tradeRow(11, 'nova', 'Nova')],
          next: null,
        }),
      fetchOffers: (id: number) => {
        requested.push(id);
        return Promise.resolve({
          give: { itemIds: [1], names: ['One'], robux: 0 },
          receive: { itemIds: [2, 77, 88], names: ['Two', 'Red Fang', 'Mystery'], robux: 0 },
        });
      },
    };
    await renderTradeList(ctx, deps);
    await Promise.resolve();
    await renderTradeList(ctx, deps);
    await Promise.resolve();
    await renderTradeList(ctx, deps);
    expect(requested).toEqual([10]);
    expect(redraws).toBeGreaterThan(0);
    const [first, second] = document.querySelectorAll('.trade-row');
    const pill = first!.querySelector('[data-rolens="trade-preview"]')?.shadowRoot?.querySelector('.pill');
    expect(pill?.getAttribute('data-verdict')).toBe('win');
    // 1,500 + 100 (Red Fang, matched by name) - 1,000. Mystery has no value and is flagged.
    expect(pill?.textContent).toContain('+600');
    expect(pill?.querySelector('.unvalued')?.textContent).toBe('1 unvalued');
    expect(resolved.has('Two')).toBe(false);
    expect(second!.querySelector('[data-rolens="trade-preview"]')).toBeNull();
  });
  it('uses saved trades instead of asking Roblox again', async () => {
    const meta = document.createElement('meta');
    meta.name = 'user-data';
    meta.dataset.userid = '1';
    document.head.append(meta);
    setBody(rows(['Kyrie']));
    const saved = new Map([
      [10, { give: { itemIds: [1], names: [''], robux: 0 }, receive: { itemIds: [2], names: [''], robux: 0 } }],
    ]);
    const requested: number[] = [];
    const deps = {
      loadValues: () => Promise.resolve(),
      lookup: (id: number) => item({ id, rap: id * 100, value: id * 100 }),
      redraw: () => {},
      fetchList: () => Promise.resolve({ rows: [tradeRow(10, 'kyrie', 'Kyrie')], next: null }),
      fetchOffers: (id: number) => {
        requested.push(id);
        return Promise.resolve(null);
      },
      tradeCache: { all: () => Promise.resolve(saved), save: () => Promise.resolve() } as never,
    };
    await renderTradeList(ctx, deps);
    await Promise.resolve();
    await renderTradeList(ctx, deps);
    expect(requested).toEqual([]);
    expect(document.querySelector('[data-rolens="trade-preview"]')).not.toBeNull();
  });
});

describe('Profile', () => {
  it('reads the user id of profile pages only', () => {
    expect(profileIdFromPath('/users/156/profile')).toBe(156);
    expect(profileIdFromPath('/users/156/inventory')).toBeNull();
    expect(profileIdFromPath('/users/abc/profile')).toBeNull();
  });

  it('shows totals, opens on Enter and explains every other state', () => {
    const summary = summariseInventory(
      { '1': 2 },
      () => item({ id: 1, rap: 900, value: 1000, rare: true }),
      ctx.settings,
    );
    let opened = 0;
    const actions = { open: () => (opened += 1), retry: () => {} };
    const host = renderProfileBox(null, { kind: 'ready', summary, scannedAt: null }, ctx, actions);
    const box = host.shadowRoot!.querySelector<HTMLElement>('.box')!;
    expect(box.getAttribute('role')).toBe('button');
    expect(host.shadowRoot!.textContent).toContain(formatRobux(2000, true));
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(opened).toBe(1);

    renderProfileBox(host, { kind: 'private' }, ctx, actions);
    expect(box.getAttribute('role')).toBeNull();
    expect(host.shadowRoot!.textContent).toContain('Inventory is private');
    box.click();
    expect(opened).toBe(1);

    renderProfileBox(host, { kind: 'error', message: "Rolimon's could not be reached." }, ctx, actions);
    expect(host.shadowRoot!.querySelector('.retry')).not.toBeNull();
  });
});
