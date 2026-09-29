import { plural } from '../core/format';
import type { TradeCache } from '../core/trade-cache';
import {
  declineTrade,
  fetchCollectibles,
  fetchTradeList,
  fetchTradeOffers,
  type OwnedItem,
  type TradeOffers,
  type TradeSummaryRow,
} from './roblox-api';
import { SELECTORS } from './selectors';
import { activeTradeList, signedInUserId } from './trade-list';
import { loadTradeValues, valueTrade, type TradeValuer } from './trade-values';
import { openCancelDialog, type CancelCandidate, type CancelMode } from './ui/cancel-dialog';
import type { RenderContext } from './ui/context';
import { renderOutboundTools } from './ui/outbound-tools';

/*
 * Cancelling outbound trades. Roblox leaves a trade open when the sender no longer owns
 * an item in it, although it can never complete. RoLens finds those trades (or lists all
 * outbound trades), shows exactly which will be cancelled, and cancels only the trades the
 * user confirms, one at a time. It never runs by itself.
 *
 * Ownership is checked against the user's inventory from Roblox's public inventory API,
 * read without cookies at the moment of checking, never against Rolimon's scans, which
 * can be hours old.
 */

/** Outbound pages to read at most (25 trades each). */
const MAX_PAGES = 20;

export interface CancelDeps extends TradeValuer {
  fetchList?: typeof fetchTradeList;
  fetchOffers?: typeof fetchTradeOffers;
  fetchOwned?: typeof fetchCollectibles;
  decline?: typeof declineTrade;
  tradeCache?: TradeCache;
  /** Called after trades were cancelled, so lists and previews are read again. */
  afterCancel?: () => void;
  now?: () => number;
}

/**
 * Positions of the items in `offers.give` the user no longer owns. Copies are matched
 * exactly when Roblox gives each copy's id, otherwise by how many copies of each item
 * the user still has.
 */
export function missingItems(offers: TradeOffers, owned: OwnedItem[]): number[] {
  const instances = new Set(owned.map((item) => item.instanceId).filter((id): id is number => id !== null));
  const counts = new Map<number, number>();
  for (const item of owned) counts.set(item.assetId, (counts.get(item.assetId) ?? 0) + 1);
  const missing: number[] = [];
  offers.give.itemIds.forEach((assetId, i) => {
    const instance = offers.give.instanceIds?.[i] ?? null;
    if (instance !== null && instances.size > 0) {
      if (!instances.has(instance)) missing.push(i);
      return;
    }
    const left = counts.get(assetId) ?? 0;
    if (left > 0) counts.set(assetId, left - 1);
    else missing.push(i);
  });
  return missing;
}

async function readOutbound(deps: CancelDeps): Promise<TradeSummaryRow[] | null> {
  const rows: TradeSummaryRow[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await (deps.fetchList ?? fetchTradeList)('outbound', cursor);
    if (!result) return page === 0 ? null : rows;
    rows.push(...result.rows);
    cursor = result.next;
    if (!cursor) break;
  }
  return rows;
}

const partnerName = (row: TradeSummaryRow) => row.partner.displayName || row.partner.name || 'Unknown player';

/** Runs the whole flow in a dialog: read, check, confirm, cancel. */
export async function startCancel(
  mode: CancelMode,
  ctx: RenderContext,
  deps: CancelDeps,
  opener: HTMLElement | null,
): Promise<void> {
  const dialog = openCancelDialog(mode, opener, ctx.settings.compactNumbers);
  const me = signedInUserId();
  if (me === null) {
    dialog.message('Please sign in to Roblox to manage your trades.');
    return;
  }
  const rows = await readOutbound(deps);
  if (!rows) {
    dialog.message('Roblox did not return your outbound trades. Please try again in a minute.');
    return;
  }
  if (rows.length === 0) {
    dialog.message('You have no outbound trades.');
    return;
  }

  let owned: OwnedItem[] | null = null;
  if (mode === 'unowned') {
    dialog.progress('Reading your inventory…');
    owned = await (deps.fetchOwned ?? fetchCollectibles)(me);
    if (!owned) {
      dialog.message(
        "RoLens could not read your inventory. It is read without your session, so this check needs your inventory to be visible to everyone in Roblox's privacy settings.",
      );
      return;
    }
  }

  // Trade contents: saved ones first, then the rest from Roblox, for the ownership check
  // and the value filters.
  const saved = deps.tradeCache ? await deps.tradeCache.all(me) : new Map<number, TradeOffers>();
  const offers = new Map<number, TradeOffers>();
  let unread = 0;
  for (const [index, row] of rows.entries()) {
    const known = saved.get(row.id);
    if (known) {
      offers.set(row.id, known);
      continue;
    }
    dialog.progress(`Reading trade ${index + 1} of ${rows.length}…`, index / rows.length);
    const read = await (deps.fetchOffers ?? fetchTradeOffers)(row.id, me);
    if (read) {
      offers.set(row.id, read);
      void deps.tradeCache?.save(me, row.id, read);
    } else {
      unread += 1;
    }
  }

  const candidates: CancelCandidate[] = [];
  await loadTradeValues([...offers.values()], deps);
  for (const row of rows) {
    const trade = offers.get(row.id) ?? null;
    const missing = trade && owned ? missingItems(trade, owned) : [];
    if (mode === 'unowned' && missing.length === 0) continue;
    candidates.push({
      id: row.id,
      partner: partnerName(row),
      created: row.created,
      valued: trade ? valueTrade(trade, deps) : null,
      missing,
    });
  }
  if (candidates.length === 0) {
    dialog.message(
      `Every outbound trade only offers items you still own.${unread ? ` ${plural(unread, 'trade')} could not be checked; please try again later.` : ''}`,
    );
    return;
  }

  const now = (deps.now ?? Date.now)();
  dialog.confirm(candidates, now, (ids) => {
    void (async () => {
      let declined = 0;
      let failed = 0;
      let stopped = 0;
      for (const [index, id] of ids.entries()) {
        dialog.progress(`Cancelling trade ${index + 1} of ${ids.length}…`, index / ids.length);
        const result = await (deps.decline ?? declineTrade)(id);
        if (result === 'declined') declined += 1;
        else if (result === 'failed') failed += 1;
        else {
          stopped = ids.length - index;
          break;
        }
      }
      deps.afterCancel?.();
      const parts = [`Cancelled ${plural(declined, 'trade')}.`];
      if (failed)
        parts.push(
          `${plural(failed, 'trade')} could not be cancelled; ${failed === 1 ? 'it may' : 'they may'} already be closed.`,
        );
      if (stopped)
        parts.push(
          `Roblox is limiting requests, so ${plural(stopped, 'trade')} ${stopped === 1 ? 'was' : 'were'} left open. Please try again in a minute.`,
        );
      dialog.done(parts.join(' '), () => location.reload());
    })();
  });
}

/** Shows the cancel tools above the Trades list while it shows outbound trades. */
export function renderCancelTools(ctx: RenderContext, deps: CancelDeps): void {
  const existing = document.querySelector<HTMLElement>('[data-rolens="outbound-tools"]');
  const firstRow = document.querySelector(SELECTORS.tradeRow);
  const list = firstRow?.parentElement;
  if (!list || activeTradeList() !== 'outbound' || signedInUserId() === null) {
    existing?.remove();
    return;
  }
  const host = renderOutboundTools(existing, (mode, opener) => void startCancel(mode, ctx, deps, opener));
  if (list.previousElementSibling !== host) list.before(host);
}
