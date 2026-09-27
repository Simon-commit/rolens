import { afterEach, describe, expect, it } from 'vitest';
import { proofTrade, signedInNames } from '../src/content/proof';

describe('trade proofs', () => {
  afterEach(() => document.head.querySelector('meta[name="user-data"]')?.remove());

  it("reads the signed-in user's names from Roblox's page data", () => {
    const meta = document.createElement('meta');
    meta.name = 'user-data';
    meta.dataset.userid = '1';
    meta.dataset.name = 'trader_one';
    meta.dataset.displayname = 'Trader';
    document.head.append(meta);
    expect(signedInNames()).toEqual({ name: 'trader_one', displayName: 'Trader' });
  });

  it('falls back to the items on the page when the trade has not been read', async () => {
    const result = await proofTrade([1, 2], [3], {
      loadValues: () => Promise.resolve(),
      lookup: () => null,
      fetchOffers: () => Promise.reject(new Error('not expected')),
    });
    expect(result.partner).toBeNull();
    expect(result.date).toBeNull();
    expect(result.offers.give.itemIds).toEqual([1, 2]);
    expect(result.offers.receive).toEqual({ itemIds: [3], names: [''], robux: 0 });
  });
});
