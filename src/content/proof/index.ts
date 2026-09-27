import { sourceNames, enabledSources } from '../../core/sources';
import { totalUsd } from '../../core/usd';
import type { ItemValue } from '../../core/types';
import { fetchTradeOffers, itemThumbnails, loadBitmap, userHeadshots, type TradeOffers } from '../roblox-api';
import { SELECTORS } from '../selectors';
import { openListedTrade, signedInUserId } from '../trade-list';
import { loadTradeValues, valueTrade, type TradeValuer } from '../trade-values';
import type { RenderContext } from '../ui/context';
import { openProofDialog } from '../ui/proof-dialog';
import { resolveTheme } from '../ui/shadow';
import { drawProof, type ProofPlayer } from './draw';

/*
 * Trade proofs for completed trades. RoLens gathers the trade it already read for the
 * Trades list (or reads it once, read-only), values it, and draws the image on this
 * device. Item images and avatars come from Roblox's public thumbnails API without
 * cookies. Nothing about the trade is sent anywhere.
 */

export interface ProofDeps extends TradeValuer {
  fetchOffers?: typeof fetchTradeOffers;
}

/** The signed-in user's names, as Roblox records them on every page. */
export function signedInNames(doc: Document = document): { name: string; displayName: string } {
  const meta = doc.querySelector(SELECTORS.userData);
  return {
    name: meta?.getAttribute('data-name') ?? '',
    displayName: meta?.getAttribute('data-displayname') ?? '',
  };
}

/** The trade to draw: as read from Roblox, or only the item ids on the page when it cannot be read. */
export async function proofTrade(
  giveIds: number[],
  receiveIds: number[],
  deps: ProofDeps,
): Promise<{
  offers: TradeOffers;
  partner: { id: number | null; name: string; displayName: string } | null;
  date: number | null;
}> {
  const listed = openListedTrade(giveIds, receiveIds);
  const me = signedInUserId();
  let offers = listed?.offers ?? null;
  if (listed && !offers && me !== null) offers = await (deps.fetchOffers ?? fetchTradeOffers)(listed.row.id, me);
  return {
    offers: offers ?? {
      give: { itemIds: giveIds, names: giveIds.map(() => ''), robux: 0 },
      receive: { itemIds: receiveIds, names: receiveIds.map(() => ''), robux: 0 },
    },
    partner: listed?.row.partner ?? null,
    date: listed?.row.created ?? null,
  };
}

async function bitmaps(urls: Map<number, string>): Promise<Map<number, ImageBitmap>> {
  const result = new Map<number, ImageBitmap>();
  await Promise.all(
    [...urls].map(async ([id, url]) => {
      const bitmap = await loadBitmap(url);
      if (bitmap) result.set(id, bitmap);
    }),
  );
  return result;
}

async function fontsReady(): Promise<void> {
  try {
    await Promise.all([500, 600, 700].map((weight) => document.fonts.load(`${weight} 16px 'RoLens Inter'`)));
  } catch {
    // The fallback font is fine.
  }
}

const fileDate = (time: number) => new Date(time).toISOString().slice(0, 10);

/** Opens the proof dialog for the trade on screen and draws the proof into it. */
export async function createProof(
  giveIds: number[],
  receiveIds: number[],
  ctx: RenderContext,
  deps: ProofDeps,
  opener: HTMLElement | null,
): Promise<void> {
  const dialog = openProofDialog(opener);
  try {
    const { offers, partner, date } = await proofTrade(giveIds, receiveIds, deps);
    await loadTradeValues([offers], deps);
    const valued = valueTrade(offers, deps);
    const values = (side: typeof valued.give) =>
      side.items.map((entry) => entry.item).filter((item): item is ItemValue => item !== undefined);

    const meId = signedInUserId();
    const ids = [...valued.give.items, ...valued.receive.items].map((entry) => entry.id);
    const [thumbUrls, avatarUrls] = await Promise.all([
      itemThumbnails(ids),
      userHeadshots([meId, partner?.id ?? null].filter((id): id is number => id !== null)),
    ]);
    const [thumbnails, avatars] = await Promise.all([bitmaps(thumbUrls), bitmaps(avatarUrls), fontsReady()]);
    const player = (id: number | null, names: { name: string; displayName: string }): ProofPlayer => ({
      ...names,
      avatar: id === null ? null : (avatars.get(id) ?? null),
    });

    const now = Date.now();
    const canvas = drawProof({
      me: player(meId, signedInNames()),
      partner: player(partner?.id ?? null, partner ?? { name: '', displayName: 'Trade partner' }),
      date,
      give: valued.give,
      receive: valued.receive,
      balance: valued.balance,
      usd: {
        give: totalUsd(values(valued.give), ctx.settings),
        receive: totalUsd(values(valued.receive), ctx.settings),
      },
      thumbnails,
      sources: sourceNames(enabledSources(ctx.settings)),
      valuesAt: now,
      compact: ctx.settings.compactNumbers,
      theme: resolveTheme(),
    });
    dialog.show(canvas, `rolens-trade-proof-${fileDate(date ?? now)}.png`);
  } catch {
    dialog.fail('The proof could not be created. Please try again.');
  }
}
