/*
 * The only code in RoLens that talks to Roblox. Every call is a read-only GET:
 *
 *   thumbnails.roblox.com  item images for the inventory panel; public, sent without cookies
 *   trades.roblox.com      the trades you can already see on the Trades page, for value
 *                          previews; sent with your Roblox session, as the page itself does
 *
 * RoLens never sends, accepts, declines or counters a trade, never changes anything on
 * your account, and never sends any of this data anywhere else. Requests run one at a
 * time, only for what is on screen, and stop for a while if Roblox asks them to.
 */

const THUMBNAILS = 'https://thumbnails.roblox.com/v1/assets';
const TRADES = 'https://trades.roblox.com';
/** Gap between trade requests. Roblox rate-limits the trades API tightly. */
export const TRADE_REQUEST_GAP_MS = 1_200;
/** After Roblox returns 429 (too many requests), wait this long before asking again. */
export const TRADE_BACKOFF_MS = 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const positiveInt = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;

/* Thumbnails ------------------------------------------------------------------------ */

const thumbnails = new Map<number, string | null>();

/** Image URLs for items, 100 per request, remembered for the rest of the visit. */
export async function itemThumbnails(ids: number[], fetchFn: typeof fetch = fetch): Promise<Map<number, string>> {
  const missing = [...new Set(ids)].filter((id) => !thumbnails.has(id));
  for (let i = 0; i < missing.length; i += 100) {
    const batch = missing.slice(i, i + 100);
    const url = `${THUMBNAILS}?assetIds=${batch.join(',')}&size=150x150&format=Webp&isCircular=false`;
    const body: unknown = await fetchFn(url, { credentials: 'omit' })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
    for (const id of batch) thumbnails.set(id, null);
    if (!isRecord(body) || !Array.isArray(body.data)) continue;
    for (const entry of body.data) {
      if (!isRecord(entry)) continue;
      const id = positiveInt(entry.targetId);
      const image = typeof entry.imageUrl === 'string' ? entry.imageUrl : '';
      // Only Roblox's own image CDN, so a changed response can't point images elsewhere.
      if (id && entry.state === 'Completed' && /^https:\/\/[a-z0-9-]+\.rbxcdn\.com\//.test(image)) {
        thumbnails.set(id, image);
      }
    }
  }
  const result = new Map<number, string>();
  for (const id of ids) {
    const image = thumbnails.get(id);
    if (image) result.set(id, image);
  }
  return result;
}

/* Trades ---------------------------------------------------------------------------- */

export type TradeList = 'inbound' | 'outbound' | 'completed' | 'inactive';

export interface TradeSummaryRow {
  id: number;
  /** The other party's username and display name, to check a row matches its trade. */
  partner: { name: string; displayName: string };
}

export interface TradeSide {
  /** Item ids, one per copy. */
  itemIds: number[];
  /** Each item's name as Roblox gives it, in the same order; empty where Roblox gives none. */
  names: string[];
  robux: number;
}

export interface TradeOffers {
  /** Items and Robux on each side, from the signed-in user's view. */
  give: TradeSide;
  receive: TradeSide;
}

let queue: Promise<unknown> = Promise.resolve();
let lastRequest = 0;
let blockedUntil = 0;

/** Runs trade requests one at a time, spaced out, and pauses after a 429. */
function throttled<T>(task: () => Promise<T>): Promise<T | null> {
  const run = queue.then(async () => {
    if (Date.now() < blockedUntil) return null;
    const gap = lastRequest + TRADE_REQUEST_GAP_MS - Date.now();
    if (gap > 0) await new Promise((done) => setTimeout(done, gap));
    lastRequest = Date.now();
    return task();
  });
  queue = run.catch(() => undefined);
  return run.catch(() => null);
}

async function getJson(url: string, fetchFn: typeof fetch): Promise<unknown> {
  const response = await fetchFn(url, { credentials: 'include', headers: { Accept: 'application/json' } });
  if (response.status === 429) blockedUntil = Date.now() + TRADE_BACKOFF_MS;
  if (!response.ok) throw new Error(`Roblox responded with HTTP ${response.status}`);
  return response.json();
}

/** One page of a trades list, newest first, as the Trades page shows it. */
export function fetchTradeList(
  list: TradeList,
  cursor: string | null,
  fetchFn: typeof fetch = fetch,
): Promise<{ rows: TradeSummaryRow[]; next: string | null } | null> {
  const query = `limit=25&sortOrder=Desc${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
  return throttled(async () => parseTradeList(await getJson(`${TRADES}/v1/trades/${list}?${query}`, fetchFn)));
}

export function parseTradeList(body: unknown): { rows: TradeSummaryRow[]; next: string | null } | null {
  if (!isRecord(body) || !Array.isArray(body.data)) return null;
  const rows: TradeSummaryRow[] = [];
  for (const entry of body.data) {
    if (!isRecord(entry) || !isRecord(entry.user)) continue;
    const id = positiveInt(entry.id);
    if (!id) continue;
    rows.push({
      id,
      partner: {
        name: typeof entry.user.name === 'string' ? entry.user.name : '',
        displayName: typeof entry.user.displayName === 'string' ? entry.user.displayName : '',
      },
    });
  }
  return { rows, next: typeof body.nextPageCursor === 'string' ? body.nextPageCursor : null };
}

let detailsVersion: 'v2' | 'v1' = 'v2';

/** The items and Robux in one trade, seen from `myUserId`'s side. */
export function fetchTradeOffers(
  tradeId: number,
  myUserId: number,
  fetchFn: typeof fetch = fetch,
): Promise<TradeOffers | null> {
  return throttled(async () => {
    try {
      return parseTradeOffers(await getJson(`${TRADES}/${detailsVersion}/trades/${tradeId}`, fetchFn), myUserId);
    } catch (error) {
      // Roblox is moving trades to its v2 API; fall back to v1 where v2 isn't available.
      if (detailsVersion === 'v2' && Date.now() >= blockedUntil) {
        detailsVersion = 'v1';
        return parseTradeOffers(await getJson(`${TRADES}/v1/trades/${tradeId}`, fetchFn), myUserId);
      }
      throw error;
    }
  });
}

interface Side extends TradeSide {
  userId: number | null;
}

const nameOf = (...values: unknown[]): string => {
  const found = values.find((value) => typeof value === 'string' && value.trim());
  return typeof found === 'string' ? found.trim() : '';
};

/** Ids and names of the entries that have an id. */
function readItems(
  entries: unknown,
  read: (entry: Record<string, unknown>) => { id: number | null; name: string },
): { itemIds: number[]; names: string[] } {
  const list = (Array.isArray(entries) ? entries : [])
    .filter(isRecord)
    .map(read)
    .filter((entry): entry is { id: number; name: string } => entry.id !== null);
  return { itemIds: list.map((entry) => entry.id), names: list.map((entry) => entry.name) };
}

/** v1: `offers[].userAssets[].assetId`. */
function sidesV1(body: Record<string, unknown>): Side[] | null {
  if (!Array.isArray(body.offers)) return null;
  return body.offers.filter(isRecord).map((offer) => ({
    userId: isRecord(offer.user) ? positiveInt(offer.user.id) : null,
    ...readItems(offer.userAssets, (asset) => ({ id: positiveInt(asset.assetId), name: nameOf(asset.name) })),
    robux: positiveInt(offer.robux) ?? 0,
  }));
}

/** v2: `participantAOffer` / `participantBOffer`, with `items[].itemTarget.targetId`. */
function sidesV2(body: Record<string, unknown>): Side[] | null {
  const offers = [body.participantAOffer, body.participantBOffer];
  if (!offers.every(isRecord)) return null;
  return (offers as Record<string, unknown>[]).map((offer) => ({
    userId: isRecord(offer.user) ? positiveInt(offer.user.id) : null,
    ...readItems(offer.items, (item) => {
      const target = isRecord(item.itemTarget) ? item.itemTarget : {};
      return { id: positiveInt(Number(target.targetId)), name: nameOf(item.itemName, item.name, target.name) };
    }),
    robux: positiveInt(offer.robux) ?? 0,
  }));
}

export function parseTradeOffers(body: unknown, myUserId: number): TradeOffers | null {
  if (!isRecord(body)) return null;
  const sides = sidesV2(body) ?? sidesV1(body);
  if (!sides || sides.length !== 2) return null;
  const mine = sides.findIndex((side) => side.userId === myUserId);
  if (mine === -1) return null;
  const give = sides[mine]!;
  const receive = sides[1 - mine]!;
  const side = ({ itemIds, names, robux }: Side): TradeSide => ({ itemIds, names, robux });
  return { give: side(give), receive: side(receive) };
}
