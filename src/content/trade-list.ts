import type { TradeCache } from '../core/trade-cache';
import { makeAnchor } from './chip-fit';
import { fetchTradeList, fetchTradeOffers, type TradeList, type TradeOffers, type TradeSummaryRow } from './roblox-api';
import { SELECTORS } from './selectors';
import { loadTradeValues, valueTrade, type TradeValuer } from './trade-values';
import type { RenderContext } from './ui/context';
import { renderTradePreview } from './ui/trade-preview';

/*
 * Value previews on the Trades list. Roblox's list shows only the partner and a date, so
 * RoLens reads the same list from Roblox's trades API (with the user's own session, read
 * only) to learn each row's trade id, then fetches the items of the trades in view, one
 * request at a time. Nothing is ever sent, accepted or declined.
 */

const RETRY_MS = 60_000;

export interface TradeListDeps extends TradeValuer {
  redraw: () => void;
  fetchList?: typeof fetchTradeList;
  fetchOffers?: typeof fetchTradeOffers;
  /** Trades read before, saved on this device, so they are not requested from Roblox again. */
  tradeCache?: TradeCache;
}

interface Listing {
  rows: TradeSummaryRow[];
  next: string | null;
  complete: boolean;
  loading: boolean;
  fetchedAt: number;
}

const listings = new Map<TradeList, Listing>();
const offers = new Map<number, TradeOffers | null | 'pending'>();
const inView = new WeakSet<Element>();
/** The account whose saved trades have been read into `offers`. */
let seededFor: number | null = null;
let observer: IntersectionObserver | null = null;

/** Which list the page is showing, from the address or the selected tab. */
export function activeTradeList(doc: Document = document): TradeList {
  const text =
    `${doc.location?.hash ?? ''} ${doc.querySelector(SELECTORS.tradeListTab)?.textContent ?? ''}`.toLowerCase();
  if (/outbound|sent/.test(text)) return 'outbound';
  if (/completed/.test(text)) return 'completed';
  if (/inactive|closed/.test(text)) return 'inactive';
  return 'inbound';
}

export function signedInUserId(doc: Document = document): number | null {
  const id = Number(doc.querySelector(SELECTORS.userData)?.getAttribute('data-userid'));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** True when a row's text names the trade's partner, so a row is never given another trade's value. */
export function rowMatches(row: Element, trade: TradeSummaryRow): boolean {
  const text = (row.textContent ?? '').toLowerCase();
  const { name, displayName } = trade.partner;
  return Boolean(
    (name && text.includes(name.toLowerCase())) || (displayName && text.includes(displayName.toLowerCase())),
  );
}

function watch(row: Element, redraw: () => void): void {
  observer ??= new IntersectionObserver(
    (entries) => {
      let changed = false;
      for (const entry of entries) {
        if (entry.isIntersecting && !inView.has(entry.target)) {
          inView.add(entry.target);
          changed = true;
        }
      }
      if (changed) redraw();
    },
    { rootMargin: '120px 0px' },
  );
  observer.observe(row);
}

/** Loads more of the list until it covers the rows on the page. */
function extendListing(list: TradeList, wanted: number, deps: TradeListDeps): void {
  let listing = listings.get(list);
  if (!listing) {
    listing = { rows: [], next: null, complete: false, loading: false, fetchedAt: Date.now() };
    listings.set(list, listing);
  }
  if (listing.loading || listing.complete || listing.rows.length >= wanted) return;
  listing.loading = true;
  const current = listing;
  void (deps.fetchList ?? fetchTradeList)(list, current.next).then((page) => {
    current.loading = false;
    if (!page) return;
    current.rows.push(...page.rows);
    current.next = page.next;
    current.complete = page.next === null;
    deps.redraw();
  });
}

/** Draws a preview on every trade row in view whose trade RoLens has read. */
export async function renderTradeList(ctx: RenderContext, deps: TradeListDeps): Promise<void> {
  const rows = [...document.querySelectorAll(SELECTORS.tradeRow)];
  const me = signedInUserId();
  if (rows.length === 0 || me === null) return;
  const list = activeTradeList();
  if (deps.tradeCache && seededFor !== me) {
    seededFor = me;
    for (const [id, trade] of await deps.tradeCache.all(me)) if (!offers.has(id)) offers.set(id, trade);
  }

  const listing = listings.get(list);
  // A new trade at the top shifts every row: start the list again when the first row no longer matches.
  if (listing?.rows[0] && !rowMatches(rows[0]!, listing.rows[0]) && Date.now() - listing.fetchedAt > 5_000) {
    listings.delete(list);
  }
  extendListing(list, rows.length, deps);
  const known = listings.get(list)?.rows ?? [];

  const ready: { row: Element; trade: TradeOffers }[] = [];
  for (const [index, row] of rows.entries()) {
    watch(row, deps.redraw);
    const trade = known[index];
    const existing = row.querySelector<HTMLElement>(':scope > [data-rolens="trade-preview"]');
    if (!trade || !rowMatches(row, trade)) {
      existing?.remove();
      continue;
    }
    const cached = offers.get(trade.id);
    if (cached === undefined && inView.has(row)) {
      offers.set(trade.id, 'pending');
      void (deps.fetchOffers ?? fetchTradeOffers)(trade.id, me).then((result) => {
        offers.set(trade.id, result);
        if (result) void deps.tradeCache?.save(me, trade.id, result);
        // Failed or paused by rate limiting: try again later rather than on every scan.
        if (result === null) window.setTimeout(() => offers.delete(trade.id), RETRY_MS);
        deps.redraw();
      });
    }
    const state = offers.get(trade.id);
    if (state === 'pending') place(row, renderTradePreview(existing, { kind: 'loading' }, ctx));
    else if (state) ready.push({ row, trade: state });
    else existing?.remove();
  }

  if (ready.length === 0) return;
  await loadTradeValues(
    ready.map(({ trade }) => trade),
    deps,
  );
  for (const { row, trade } of ready) {
    const { balance, unlisted } = valueTrade(trade, deps);
    const existing = row.querySelector<HTMLElement>(':scope > [data-rolens="trade-preview"]');
    place(row, renderTradePreview(existing, { kind: 'ready', balance, unlisted }, ctx));
  }
}

function place(row: Element, host: HTMLElement): void {
  if (!(row instanceof HTMLElement)) return;
  makeAnchor(row);
  if (host.parentElement !== row) row.append(host);
}

/** Forgets fetched trades, e.g. when the setting is turned off. */
export function resetTradeList(): void {
  listings.clear();
  offers.clear();
  seededFor = null;
}
