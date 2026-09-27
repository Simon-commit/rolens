import type { TradeCache } from '../core/trade-cache';
import { fetchTradeList, fetchTradeOffers, type TradeOffers, type TradeSummaryRow } from './roblox-api';
import { SELECTORS } from './selectors';
import { signedInUserId } from './trade-list';
import { loadTradeValues, valueTrade, type TradeValuer } from './trade-values';
import type { RenderContext } from './ui/context';
import { renderDuplicateNotice, type PendingTrade } from './ui/duplicate-notice';

/*
 * Duplicate trade notice. On the page for sending a trade, RoLens reads the signed-in
 * user's outbound (pending) trades from Roblox, read only, and warns when one is already
 * waiting with the same player. The earlier trades' items are read only for the notice's
 * details, at most three of them, and reuse the trades saved on the device.
 */

/** Outbound pages to read at most (25 trades each). */
const MAX_PAGES = 4;
/** Earlier trades whose items are shown. */
const MAX_DETAILS = 3;
const SEND_PATH = /^\/users\/(\d+)\/trade\/?$/i;

export interface DuplicateDeps extends TradeValuer {
  redraw: () => void;
  fetchList?: typeof fetchTradeList;
  fetchOffers?: typeof fetchTradeOffers;
  tradeCache?: TradeCache;
  now?: () => number;
}

/** The player a send-trade page is for, or null on any other page. */
export function tradePartnerFromPath(pathname: string): number | null {
  const match = SEND_PATH.exec(pathname);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** The pending trades with `partnerId`, newest first. */
export function pendingTradesWith(rows: TradeSummaryRow[], partnerId: number): TradeSummaryRow[] {
  return rows
    .filter((row) => row.partner.id === partnerId && (!row.status || /open|pending/i.test(row.status)))
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
}

let loadedFor: number | null = null;
let matches: TradeSummaryRow[] | null = null;
const offers = new Map<number, TradeOffers | null | 'pending'>();

async function loadMatches(partnerId: number, deps: DuplicateDeps): Promise<void> {
  const rows: TradeSummaryRow[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await (deps.fetchList ?? fetchTradeList)('outbound', cursor);
    if (!result) break;
    rows.push(...result.rows);
    cursor = result.next;
    if (!cursor) break;
  }
  if (loadedFor !== partnerId) return;
  matches = pendingTradesWith(rows, partnerId);
  deps.redraw();
}

async function loadOffers(trade: TradeSummaryRow, me: number, deps: DuplicateDeps): Promise<void> {
  offers.set(trade.id, 'pending');
  const saved = deps.tradeCache ? (await deps.tradeCache.all(me)).get(trade.id) : undefined;
  const result = saved ?? (await (deps.fetchOffers ?? fetchTradeOffers)(trade.id, me));
  offers.set(trade.id, result);
  if (result && !saved) void deps.tradeCache?.save(me, trade.id, result);
  deps.redraw();
}

/** The notice goes directly above the offers on the send-trade page, outside Roblox's own panels. */
function target(doc: Document): Element | null {
  return doc.querySelector(SELECTORS.sendTradeOffers);
}

export async function renderDuplicateTrade(ctx: RenderContext, deps: DuplicateDeps): Promise<void> {
  const existing = document.querySelector<HTMLElement>('[data-rolens="duplicate-notice"]');
  const partnerId = tradePartnerFromPath(location.pathname);
  const me = signedInUserId();
  const place = partnerId === null || me === null || partnerId === me ? null : target(document);
  if (!place || partnerId === null || me === null) {
    existing?.remove();
    return;
  }
  if (loadedFor !== partnerId) {
    loadedFor = partnerId;
    matches = null;
    void loadMatches(partnerId, deps);
  }
  if (!matches?.length) {
    existing?.remove();
    return;
  }

  const shown = matches.slice(0, MAX_DETAILS);
  for (const trade of shown) if (!offers.has(trade.id)) void loadOffers(trade, me, deps);
  const ready = shown
    .map((trade) => offers.get(trade.id))
    .filter((o): o is TradeOffers => Boolean(o && o !== 'pending'));
  if (ready.length) await loadTradeValues(ready, deps);

  const trades: PendingTrade[] = matches.map((trade) => {
    const state = offers.get(trade.id);
    return {
      id: trade.id,
      created: trade.created,
      expires: trade.expires,
      valued: state && state !== 'pending' ? valueTrade(state, deps) : null,
    };
  });
  const { displayName, name } = matches[0]!.partner;
  const host = renderDuplicateNotice(
    existing,
    {
      partner: displayName || name || 'this player',
      trades: trades.slice(0, MAX_DETAILS),
      count: trades.length,
      now: (deps.now ?? Date.now)(),
    },
    ctx,
  );
  if (place.previousElementSibling !== host) place.before(host);
}

/** Forgets what was read, e.g. when the setting is turned off. */
export function resetDuplicateTrade(): void {
  loadedFor = null;
  matches = null;
  offers.clear();
}
