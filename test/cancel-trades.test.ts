import { afterEach, describe, expect, it } from 'vitest';
import { missingItems, startCancel } from '../src/content/cancel-trades';
import type { TradeOffers, TradeSummaryRow } from '../src/content/roblox-api';
import type { RenderContext } from '../src/content/ui/context';
import { DEFAULT_SETTINGS } from '../src/core/settings';
import { item } from './fixtures/items';

const ctx: RenderContext = { settings: { ...DEFAULT_SETTINGS, usdRate: null }, status: null };
const offer = (give: number[], instanceIds?: (number | null)[]): TradeOffers => ({
  give: { itemIds: give, names: give.map((id) => `Item ${id}`), robux: 0, ...(instanceIds ? { instanceIds } : {}) },
  receive: { itemIds: [9], names: ['Item 9'], robux: 0 },
});
const row = (id: number, name: string): TradeSummaryRow => ({
  id,
  partner: { id: id * 10, name, displayName: name },
  created: null,
  expires: null,
  status: 'Open',
});
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

describe('missingItems', () => {
  it('counts copies when Roblox gives no copy ids', () => {
    const owned = [
      { assetId: 1, instanceId: null },
      { assetId: 2, instanceId: null },
    ];
    expect(missingItems(offer([1, 2]), owned)).toEqual([]);
    expect(missingItems(offer([1, 1, 3]), owned)).toEqual([1, 2]);
  });

  it('matches exact copies when both sides give copy ids', () => {
    const owned = [{ assetId: 1, instanceId: 100 }];
    expect(missingItems(offer([1], [100]), owned)).toEqual([]);
    // Still owns a copy of item 1, but not the one offered.
    expect(missingItems(offer([1], [101]), owned)).toEqual([0]);
  });
});

describe('cancelling outbound trades', () => {
  afterEach(() => {
    document.querySelector('[data-rolens="cancel-dialog"]')?.remove();
    document.head.querySelector('meta[name="user-data"]')?.remove();
  });

  it('lists only invalid trades and cancels only what the user confirms', async () => {
    const meta = document.createElement('meta');
    meta.name = 'user-data';
    meta.dataset.userid = '1';
    document.head.append(meta);
    const declined: number[] = [];
    let refreshed = false;
    const trades = new Map([
      [1, offer([5])],
      [2, offer([6])],
      [3, offer([7])],
    ]);
    await startCancel(
      'unowned',
      ctx,
      {
        loadValues: () => Promise.resolve(),
        lookup: (id) => item({ id, name: `Item ${id}`, value: 100, rap: 90 }),
        fetchList: () => Promise.resolve({ rows: [row(1, 'Ava'), row(2, 'Ben'), row(3, 'Cy')], next: null }),
        fetchOffers: (id) => Promise.resolve(trades.get(id) ?? null),
        fetchOwned: () => Promise.resolve([{ assetId: 5, instanceId: null }]),
        decline: (id) => {
          declined.push(id);
          return Promise.resolve('declined');
        },
        afterCancel: () => (refreshed = true),
      },
      null,
    );
    const root = document.querySelector('[data-rolens="cancel-dialog"]')!.shadowRoot!;
    const labels = [...root.querySelectorAll('.trade .who')].map((node) => node.firstChild?.textContent);
    expect(labels).toEqual(['Ben', 'Cy']);
    expect(declined).toEqual([]);
    expect(root.querySelector('.items .gone')?.textContent).toBe('Item 6 (no longer owned)');

    // Untick Cy, then confirm: only Ben's trade is cancelled.
    const boxes = root.querySelectorAll<HTMLInputElement>('.trade input');
    boxes[1]!.click();
    const confirm = root.querySelector<HTMLButtonElement>('.btn--danger')!;
    expect(confirm.textContent).toBe('Cancel 1 trade');
    confirm.click();
    await flush();
    expect(declined).toEqual([2]);
    expect(refreshed).toBe(true);
    expect(root.querySelector('.status')?.textContent).toBe('Cancelled 1 trade.');
  });

  it('selects old trades and trades that lose value on request', async () => {
    const meta = document.createElement('meta');
    meta.name = 'user-data';
    meta.dataset.userid = '1';
    document.head.append(meta);
    const now = Date.parse('2026-09-28T12:00:00Z');
    const day = 86_400_000;
    const aged = (id: number, name: string, days: number) => ({ ...row(id, name), created: now - days * day });
    // Item 9 is received in every trade (value 100); the item given decides win or loss.
    const values: Record<number, number> = { 5: 50, 6: 300, 7: 80, 9: 100 };
    await startCancel(
      'all',
      ctx,
      {
        loadValues: () => Promise.resolve(),
        lookup: (id) => item({ id, name: `Item ${id}`, value: values[id] ?? 0, rap: 1 }),
        fetchList: () =>
          Promise.resolve({ rows: [aged(1, 'Ava', 1), aged(2, 'Ben', 10), aged(3, 'Cy', 40)], next: null }),
        fetchOffers: (id) => Promise.resolve(offer([id + 4])),
        now: () => now,
      },
      null,
    );
    const root = document.querySelector('[data-rolens="cancel-dialog"]')!.shadowRoot!;
    const checked = () => [...root.querySelectorAll<HTMLInputElement>('.trade input')].map((box) => box.checked);
    expect(checked()).toEqual([true, true, true]);
    const chips = [...root.querySelectorAll<HTMLButtonElement>('.chip')];
    const chip = (text: string) => chips.find((node) => node.textContent?.startsWith(text))!;
    chip('Older than').click();
    expect(checked()).toEqual([false, true, true]);
    const age = root.querySelector('select')!;
    age.value = '30';
    age.dispatchEvent(new Event('change'));
    expect(checked()).toEqual([false, false, true]);
    chip('Losing value').click();
    expect(checked()).toEqual([false, true, false]);
    expect(root.querySelector('.btn--danger')?.textContent).toBe('Cancel 1 trade');
    chip('None').click();
    expect(root.querySelector<HTMLButtonElement>('.btn--danger')?.disabled).toBe(true);
  });

  it('stops when the inventory cannot be read', async () => {
    const meta = document.createElement('meta');
    meta.name = 'user-data';
    meta.dataset.userid = '1';
    document.head.append(meta);
    const declined: number[] = [];
    await startCancel(
      'unowned',
      ctx,
      {
        loadValues: () => Promise.resolve(),
        lookup: () => null,
        fetchList: () => Promise.resolve({ rows: [row(1, 'Ava')], next: null }),
        fetchOwned: () => Promise.resolve(null),
        decline: (id) => {
          declined.push(id);
          return Promise.resolve('declined');
        },
      },
      null,
    );
    const root = document.querySelector('[data-rolens="cancel-dialog"]')!.shadowRoot!;
    expect(root.querySelector('.status')?.textContent).toContain('could not read your inventory');
    expect(root.querySelector('.btn--danger')).toBeNull();
    expect(declined).toEqual([]);
  });
});
