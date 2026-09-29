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
  /** When the last request for this list failed; it is not asked again for a while. */
  failedAt?: number;
}

const ALL_LISTS: TradeList[] = ['inbound', 'outbound', 'completed', 'inactive'];

const listings = new Map<TradeList, Listing>();
const offers = new Map<number, TradeOffers | null | 'pending'>();
const inView = new WeakSet<Element>();
/** The account whose saved trades have been read into `offers`. */
let seededFor: number | null = null;
let observer: IntersectionObserver | null = null;

/** The list whose trades were found to match the rows on the page, and the first row's text then. */
let matched: { list: TradeList; first: string } | null = null;
let lastReread = 0;

const firstRowText = (doc: Document) => doc.querySelector(SELECTORS.tradeRow)?.textContent ?? '';

/**
 * Which list the page is showing. Once RoLens has matched the rows on the page to one of
 * Roblox's lists, that match decides; until then, the address or the selected tab does.
 */
export function activeTradeList(doc: Document = document): TradeList {
  if (matched && matched.first === firstRowText(doc)) return matched.list;
  return detectedTradeList(doc);
}

function detectedTradeList(doc: Document): TradeList {
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
  if (listing.failedAt && Date.now() - listing.failedAt < RETRY_MS) return;
  listing.loading = true;
  const current = listing;
  void (deps.fetchList ?? fetchTradeList)(list, current.next).then((page) => {
    current.loading = false;
    if (!page) {
      current.failedAt = Date.now();
      return;
    }
    current.rows.push(...page.rows);
    current.next = page.next;
    current.complete = page.next === null;
    deps.redraw();
  });
}

/**
 * Finds the list the rows on the page belong to: the one the page names first, then the
 * others, reading the first page of each only while none has matched. Roblox's markup for
 * the list selector varies, so the trades themselves decide. Returns null while waiting.
 */
function matchList(rows: Element[], deps: TradeListDeps): TradeList | null {
  const detected = detectedTradeList(document);
  for (const list of [detected, ...ALL_LISTS.filter((other) => other !== detected)]) {
    const listing = listings.get(list);
    if (!listing?.rows.length) {
      if (listing?.complete) continue; // An empty list.
      if (listing?.failedAt && !listing.loading && Date.now() - listing.failedAt < RETRY_MS) continue;
      extendListing(list, rows.length, deps);
      return null;
    }
    if (rowMatches(rows[0]!, listing.rows[0]!)) return list;
  }
  // No list matches: most likely a new trade arrived at the top, so read the lists again,
  // at most every half minute in case the rows never match.
  if (Date.now() - lastReread < 30_000) return null;
  lastReread = Date.now();
  for (const list of ALL_LISTS) {
    const listing = listings.get(list);
    if (listing && !listing.loading && Date.now() - listing.fetchedAt > 5_000) listings.delete(list);
  }
  return null;
}

/** Draws a preview on every trade row in view whose trade RoLens has read. */
export async function renderTradeList(ctx: RenderContext, deps: TradeListDeps): Promise<void> {
  const rows = [...document.querySelectorAll(SELECTORS.tradeRow)];
  const me = signedInUserId();
  if (rows.length === 0 || me === null) return;
  if (deps.tradeCache && seededFor !== me) {
    seededFor = me;
    for (const [id, trade] of await deps.tradeCache.all(me)) if (!offers.has(id)) offers.set(id, trade);
  }

  const list = matchList(rows, deps);
  if (list === null) return;
  matched = { list, first: firstRowText(document) };
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
  matched = null;
  lastReread = 0;
  offers.clear();
  seededFor = null;
}

const sameItems = (a: number[], b: number[]) =>
  a.length === b.length && [...a].sort((x, y) => x - y).every((id, i) => id === [...b].sort((x, y) => x - y)[i]);

/**
 * The trade open in the Trades page's detail panel, as RoLens read it from the list: the
 * selected row when Roblox marks one, otherwise the listed trade with exactly these items.
 * `offers` is null when its items have not been read yet.
 */
export function openListedTrade(
  giveIds: number[],
  receiveIds: number[],
  doc: Document = document,
): { row: TradeSummaryRow; offers: TradeOffers | null } | null {
  const known = listings.get(activeTradeList(doc))?.rows ?? [];
  const rows = [...doc.querySelectorAll(SELECTORS.tradeRow)];
  const selected = doc.querySelector(SELECTORS.selectedTradeRow);
  const index = selected ? rows.indexOf(selected) : -1;
  const bySelection = index >= 0 ? known[index] : undefined;
  if (bySelection && rowMatches(selected!, bySelection)) {
    const state = offers.get(bySelection.id);
    return { row: bySelection, offers: state && state !== 'pending' ? state : null };
  }
  for (const row of known) {
    const state = offers.get(row.id);
    if (
      state &&
      state !== 'pending' &&
      sameItems(state.give.itemIds, giveIds) &&
      sameItems(state.receive.itemIds, receiveIds)
    ) {
      return { row, offers: state };
    }
  }
  return null;
}
