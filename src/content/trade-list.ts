import { balanceTrade, totalSide, type SideTotals } from '../core/trade';
import type { ItemValue } from '../core/types';
import { makeAnchor } from './chip-fit';
import {
  fetchTradeList,
  fetchTradeOffers,
  type TradeList,
  type TradeOffers,
  type TradeSide,
  type TradeSummaryRow,
} from './roblox-api';
import { SELECTORS } from './selectors';
import type { RenderContext } from './ui/context';
import { renderTradePreview } from './ui/trade-preview';

/*
 * Value previews on the Trades list. Roblox's list shows only the partner and a date, so
 * RoLens reads the same list from Roblox's trades API (with the user's own session, read
 * only) to learn each row's trade id, then fetches the items of the trades in view, one
 * request at a time. Nothing is ever sent, accepted or declined.
 */

/** Share of Robux the receiver keeps after Roblox's marketplace fee. */
export const ROBUX_AFTER_FEE = 0.7;
const RETRY_MS = 60_000;

export interface TradeListDeps {
  loadValues: (ids: number[]) => Promise<void>;
  lookup: (id: number) => ItemValue | null | undefined;
  /** Looks up limiteds by exact name, for items Roblox lists under an id Rolimon's does not track (such as faces). */
  resolveNames?: (names: string[]) => Promise<void>;
  idForName?: (name: string) => number | null | undefined;
  redraw: () => void;
  fetchList?: typeof fetchTradeList;
  fetchOffers?: typeof fetchTradeOffers;
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

function withRobux(side: SideTotals, robux: number): SideTotals {
  return { ...side, value: side.value + robux, rap: side.rap + robux };
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
  await deps.loadValues(ready.flatMap(({ trade }) => [...trade.give.itemIds, ...trade.receive.itemIds]));
  // Items Rolimon's does not know by id (faces Roblox re-issued as heads) are matched by exact name.
  const sides = ready.flatMap(({ trade }) => [trade.give, trade.receive]);
  const unknownNames = sides.flatMap((side) =>
    side.names.filter((name, i) => name && deps.lookup(side.itemIds[i]!) === null),
  );
  if (unknownNames.length && deps.resolveNames) await deps.resolveNames([...new Set(unknownNames)]);
  const lookup = (id: number) => deps.lookup(id) ?? undefined;
  const valuedIds = (side: TradeSide) =>
    side.itemIds.map((id, i) => {
      if (deps.lookup(id) !== null) return id;
      const match = side.names[i] ? deps.idForName?.(side.names[i]) : null;
      return typeof match === 'number' ? match : id;
    });
  for (const { row, trade } of ready) {
    const give = totalSide(valuedIds(trade.give), lookup);
    const receive = totalSide(valuedIds(trade.receive), lookup);
    const balance = balanceTrade(
      withRobux(give, trade.give.robux),
      withRobux(receive, Math.floor(trade.receive.robux * ROBUX_AFTER_FEE)),
    );
    const unlisted = give.unknownIds.length + receive.unknownIds.length;
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
}
