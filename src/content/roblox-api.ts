/*
 * The only code in RoLens that talks to Roblox:
 *
 *   thumbnails.roblox.com  item images and avatar headshots for the inventory panel and trade
 *                          proofs; public, sent without cookies
 *   inventory.roblox.com   your limiteds, to find outbound trades offering items you no longer
 *                          own; public, sent without cookies
 *   trades.roblox.com      the trades you can already see on the Trades page (GET, with your
 *                          session, as the page itself does), including new inbound trades for
 *                          alerts from the service worker, and declining your own outbound
 *                          trades (POST), only after you confirm the exact list in RoLens
 *
 * declineTrade() is the only call that changes anything. It is used only by the cancel
 * outbound trades tool, never automatically. RoLens never sends, accepts or counters a
 * trade, and never sends any of this data anywhere else. Requests run one at a time and
 * stop for a while if Roblox asks them to.
 */

const THUMBNAILS = 'https://thumbnails.roblox.com/v1/assets';
const INVENTORY = 'https://inventory.roblox.com/v1/users';
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

function timestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

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

const headshots = new Map<number, string | null>();

/** Avatar headshots for players, for trade proofs. Public, sent without cookies. */
export async function userHeadshots(ids: number[], fetchFn: typeof fetch = fetch): Promise<Map<number, string>> {
  const missing = [...new Set(ids)].filter((id) => !headshots.has(id));
  if (missing.length) {
    const url = `${THUMBNAILS.replace('/assets', '/users/avatar-headshot')}?userIds=${missing.join(',')}&size=150x150&format=Png&isCircular=false`;
    const body: unknown = await fetchFn(url, { credentials: 'omit' })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
    for (const id of missing) headshots.set(id, null);
    if (isRecord(body) && Array.isArray(body.data)) {
      for (const entry of body.data) {
        if (!isRecord(entry)) continue;
        const id = positiveInt(entry.targetId);
        const image = typeof entry.imageUrl === 'string' ? entry.imageUrl : '';
        if (id && entry.state === 'Completed' && /^https:\/\/[a-z0-9-]+\.rbxcdn\.com\//.test(image)) {
          headshots.set(id, image);
        }
      }
    }
  }
  const result = new Map<number, string>();
  for (const id of ids) {
    const image = headshots.get(id);
    if (image) result.set(id, image);
  }
  return result;
}

/**
 * Decodes an image from Roblox's CDN, without cookies, for drawing on a canvas. Returns
 * null when the image cannot be read (a canvas never draws an image it could not verify).
 */
export async function loadBitmap(url: string, fetchFn: typeof fetch = fetch): Promise<ImageBitmap | null> {
  if (!/^https:\/\/[a-z0-9-]+\.rbxcdn\.com\//.test(url)) return null;
  try {
    const response = await fetchFn(url, { credentials: 'omit', mode: 'cors' });
    if (!response.ok) return null;
    return await createImageBitmap(await response.blob());
  } catch {
    return null;
  }
}

/* Trades ---------------------------------------------------------------------------- */

export type TradeList = 'inbound' | 'outbound' | 'completed' | 'inactive';

export interface TradeSummaryRow {
  id: number;
  /** The other party. The names are also used to check a row matches its trade. */
  partner: { id: number | null; name: string; displayName: string };
  /** When the trade was sent and when it expires, in ms since the epoch; null when Roblox gives none. */
  created: number | null;
  expires: number | null;
  /** Roblox's status, such as "Open", "Declined" or "Completed". */
  status: string;
}

export interface TradeSide {
  /** Item ids, one per copy. */
  itemIds: number[];
  /** Each item's name as Roblox gives it, in the same order; empty where Roblox gives none. */
  names: string[];
  robux: number;
  /** Each copy's own id (user asset id) where Roblox gives it, in the same order. */
  instanceIds?: (number | null)[];
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

let lastFailure: string | null = null;

/** Why the last trades request failed, such as "HTTP 401", or null when it succeeded. */
export const lastTradeFailure = () => lastFailure;

async function getJson(url: string, fetchFn: typeof fetch): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchFn(url, { credentials: 'include', headers: { Accept: 'application/json' } });
  } catch (error) {
    lastFailure = 'no connection';
    throw error;
  }
  if (response.status === 429) blockedUntil = Date.now() + TRADE_BACKOFF_MS;
  if (!response.ok) {
    lastFailure = `HTTP ${response.status}`;
    throw new Error(`Roblox responded with HTTP ${response.status}`);
  }
  lastFailure = null;
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
        id: positiveInt(entry.user.id),
        name: typeof entry.user.name === 'string' ? entry.user.name : '',
        displayName: typeof entry.user.displayName === 'string' ? entry.user.displayName : '',
      },
      created: timestamp(entry.created),
      expires: timestamp(entry.expiration),
      status: typeof entry.status === 'string' ? entry.status : '',
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

/** Ids and names of the entries that have an id, with each copy's own id when Roblox gives any. */
function readItems(
  entries: unknown,
  read: (entry: Record<string, unknown>) => { id: number | null; name: string; instance: number | null },
): { itemIds: number[]; names: string[]; instanceIds?: (number | null)[] } {
  const list = (Array.isArray(entries) ? entries : [])
    .filter(isRecord)
    .map(read)
    .filter((entry): entry is { id: number; name: string; instance: number | null } => entry.id !== null);
  const instanceIds = list.map((entry) => entry.instance);
  return {
    itemIds: list.map((entry) => entry.id),
    names: list.map((entry) => entry.name),
    ...(instanceIds.some((id) => id !== null) ? { instanceIds } : {}),
  };
}

/** v1: `offers[].userAssets[].assetId`. */
function sidesV1(body: Record<string, unknown>): Side[] | null {
  if (!Array.isArray(body.offers)) return null;
  return body.offers.filter(isRecord).map((offer) => ({
    userId: isRecord(offer.user) ? positiveInt(offer.user.id) : null,
    ...readItems(offer.userAssets, (asset) => ({
      id: positiveInt(asset.assetId),
      name: nameOf(asset.name),
      instance: positiveInt(asset.id),
    })),
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
      return {
        id: positiveInt(Number(target.targetId)),
        name: nameOf(item.itemName, item.name, target.name),
        instance: positiveInt(item.userAssetId) ?? positiveInt(target.userAssetId),
      };
    }),
    robux: positiveInt(offer.robux) ?? 0,
  }));
}

export function parseTradeOffers(body: unknown, myUserId: number): TradeOffers | null {
  return parseSides(body, (sides) => sides.findIndex((side) => side.userId === myUserId));
}

/** Like parseTradeOffers, for when only the other player is known (inbound alerts). */
export function parseTradeOffersWith(body: unknown, partnerId: number): TradeOffers | null {
  return parseSides(body, (sides) => {
    const theirs = sides.findIndex((side) => side.userId === partnerId);
    return theirs === -1 ? -1 : 1 - theirs;
  });
}

function parseSides(body: unknown, mineOf: (sides: Side[]) => number): TradeOffers | null {
  if (!isRecord(body)) return null;
  const sides = sidesV2(body) ?? sidesV1(body);
  if (!sides || sides.length !== 2) return null;
  const mine = mineOf(sides);
  if (mine !== 0 && mine !== 1) return null;
  const give = sides[mine]!;
  const receive = sides[1 - mine]!;
  const side = ({ itemIds, names, robux, instanceIds }: Side): TradeSide => ({
    itemIds,
    names,
    robux,
    ...(instanceIds ? { instanceIds } : {}),
  });
  return { give: side(give), receive: side(receive) };
}

/** The items in a trade from another player, for inbound alerts (read-only, with the session). */
export function fetchTradeOffersWith(
  tradeId: number,
  partnerId: number,
  fetchFn: typeof fetch = fetch,
): Promise<TradeOffers | null> {
  return throttled(async () => {
    try {
      return parseTradeOffersWith(await getJson(`${TRADES}/${detailsVersion}/trades/${tradeId}`, fetchFn), partnerId);
    } catch (error) {
      if (detailsVersion === 'v2' && Date.now() >= blockedUntil) {
        detailsVersion = 'v1';
        return parseTradeOffersWith(await getJson(`${TRADES}/v1/trades/${tradeId}`, fetchFn), partnerId);
      }
      throw error;
    }
  });
}

/** True while Roblox has asked RoLens to slow down. */
export const tradesPaused = () => Date.now() < blockedUntil;

/* Cancelling outbound trades ---------------------------------------------------------- */

export type DeclineResult = 'declined' | 'failed' | 'limited';

let csrfToken: string | null = null;

/** Roblox's anti-forgery token, from the page or from Roblox's reply when it has changed. */
function pageCsrfToken(): string | null {
  return csrfToken ?? document.querySelector('meta[name="csrf-token"]')?.getAttribute('data-token') ?? null;
}

async function postDecline(tradeId: number, fetchFn: typeof fetch): Promise<Response> {
  const token = pageCsrfToken();
  return fetchFn(`${TRADES}/v1/trades/${tradeId}/decline`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json', ...(token ? { 'X-CSRF-TOKEN': token } : {}) },
  });
}

/**
 * Declines (cancels) one of the signed-in user's own outbound trades. The only request in
 * RoLens that changes anything; called only after the user confirms the list of trades.
 */
export async function declineTrade(tradeId: number, fetchFn: typeof fetch = fetch): Promise<DeclineResult> {
  const result = await throttled(async (): Promise<DeclineResult> => {
    let response = await postDecline(tradeId, fetchFn);
    // Roblox answers 403 with a fresh token when the page's token has expired; retry once with it.
    const fresh = response.headers.get('x-csrf-token');
    if (response.status === 403 && fresh) {
      csrfToken = fresh;
      response = await postDecline(tradeId, fetchFn);
    }
    if (response.status === 429) {
      blockedUntil = Date.now() + TRADE_BACKOFF_MS;
      return 'limited';
    }
    return response.ok ? 'declined' : 'failed';
  });
  if (result === null) return Date.now() < blockedUntil ? 'limited' : 'failed';
  return result;
}

export interface OwnedItem {
  /** The copy's own id (Roblox's user asset id). */
  instanceId: number | null;
  assetId: number;
  /** The copy's serial number, for Limited U items. */
  serial?: number | null;
  /** Roblox holds recently acquired items for a period before they can be traded. */
  onHold?: boolean;
}

/**
 * The user's limiteds, read from Roblox's public inventory API without cookies. Null when
 * the inventory cannot be read, for example because it is private.
 */
export async function fetchCollectibles(userId: number, fetchFn: typeof fetch = fetch): Promise<OwnedItem[] | null> {
  const owned: OwnedItem[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 50; page += 1) {
    const url = `${INVENTORY}/${userId}/assets/collectibles?limit=100&sortOrder=Asc${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    let body: unknown;
    try {
      const response = await fetchFn(url, { credentials: 'omit', headers: { Accept: 'application/json' } });
      if (!response.ok) return null;
      body = await response.json();
    } catch {
      return null;
    }
    if (!isRecord(body) || !Array.isArray(body.data)) return null;
    for (const entry of body.data) {
      if (!isRecord(entry)) continue;
      const assetId = positiveInt(entry.assetId);
      if (assetId) {
        owned.push({
          assetId,
          instanceId: positiveInt(entry.userAssetId),
          serial: positiveInt(entry.serialNumber),
          onHold: entry.isOnHold === true,
        });
      }
    }
    cursor = typeof body.nextPageCursor === 'string' && body.nextPageCursor ? body.nextPageCursor : null;
    if (!cursor) return owned;
    await new Promise((done) => setTimeout(done, 400));
  }
  return owned;
}
