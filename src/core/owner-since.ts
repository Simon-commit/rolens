/*
 * When each copy in a player's inventory changed hands, from the "Owner Since" data on
 * the player's Rolimon's page. Rolimon's has no feed for it, so the page's embedded
 * `scanned_player_assets` table is read: item id to copies, each
 * [copy id, serial or null, when the copy was created, when Rolimon's first saw the
 * current owner with it], times in epoch milliseconds.
 *
 * Roblox holds a traded item for 48 hours. A copy on hold therefore comes off hold at
 * most 48 hours after its owner received it. Rolimon's sees a new owner at its next scan,
 * which can be hours after the trade, so the estimate is an upper bound: "off hold by".
 */

export const rolimonsPlayerPageUrl = (userId: number) => `https://www.rolimons.com/player/${userId}`;
export const ROLIMONS_PAGES_ORIGIN = 'https://www.rolimons.com/player/*';

export const HOLD_MS = 48 * 60 * 60_000;

export interface OwnedCopy {
  serial: number | null;
  /** When Rolimon's first saw the current owner with this copy. */
  since: number;
}

/** Copies by item id. */
export type OwnerSince = Record<string, OwnedCopy[]>;

const positive = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

/** Reads the table from the page's HTML; null when the page does not have it. */
export function parseOwnerSince(html: string): OwnerSince | null {
  const match = /var\s+scanned_player_assets\s*=\s*(\{[\s\S]*?\})\s*;/.exec(html);
  if (!match) return null;
  let table: unknown;
  try {
    table = JSON.parse(match[1]!);
  } catch {
    return null;
  }
  if (typeof table !== 'object' || table === null || Array.isArray(table)) return null;
  const result: OwnerSince = {};
  for (const [key, copies] of Object.entries(table)) {
    if (!/^\d+$/.test(key) || !Array.isArray(copies)) continue;
    const parsed: OwnedCopy[] = [];
    for (const copy of copies) {
      if (!Array.isArray(copy)) continue;
      const since = positive(copy[3]);
      if (since !== null) parsed.push({ serial: positive(copy[1]), since });
    }
    if (parsed.length) result[key] = parsed;
  }
  return result;
}

/**
 * When a copy Roblox shows as on hold will be tradable again, at the latest; null when
 * Rolimon's has no copy of this item that changed hands within the holding period.
 * A copy with a serial is matched exactly. Otherwise the most recent change of hands is
 * used, so the time shown is never earlier than the real one.
 */
export function holdEndsBy(data: OwnerSince, assetId: number, serial: number | null, now: number): number | null {
  const copies = data[String(assetId)] ?? [];
  const candidates = serial === null ? copies : copies.filter((copy) => copy.serial === serial);
  const recent = candidates.filter((copy) => copy.since > now - HOLD_MS);
  if (!recent.length) return null;
  return Math.max(...recent.map((copy) => copy.since)) + HOLD_MS;
}

/** Rolimon's player pages run to about 1.5 MB; anything far larger is not one. */
const MAX_PAGE_BYTES = 8_000_000;
export const OWNER_SINCE_TTL_MS = 10 * 60_000;
const MAX_PLAYERS = 20;

/** Reads a player's Rolimon's page without cookies. */
export async function fetchOwnerSince(userId: number, fetchFn: typeof fetch): Promise<OwnerSince | null> {
  const response = await fetchFn(rolimonsPlayerPageUrl(userId), { credentials: 'omit' });
  if (!response.ok) throw new Error(`Rolimon's returned HTTP ${response.status}`);
  const html = await response.text();
  return html.length > MAX_PAGE_BYTES ? null : parseOwnerSince(html);
}

/** Recent pages by player, so reopening a trade doesn't ask Rolimon's again. */
export class OwnerSinceCache {
  private readonly entries = new Map<number, { data: OwnerSince | null; fetchedAt: number }>();
  private readonly inFlight = new Map<number, Promise<OwnerSince | null>>();

  constructor(
    private readonly fetchFn: typeof fetch,
    private readonly now: () => number = Date.now,
  ) {}

  clear(): void {
    this.entries.clear();
  }

  get(userId: number): Promise<OwnerSince | null> {
    const cached = this.entries.get(userId);
    if (cached && this.now() - cached.fetchedAt < OWNER_SINCE_TTL_MS) return Promise.resolve(cached.data);
    const running = this.inFlight.get(userId);
    if (running) return running;
    const task = fetchOwnerSince(userId, this.fetchFn)
      .catch(() => null)
      .then((data) => {
        this.entries.delete(userId);
        this.entries.set(userId, { data, fetchedAt: this.now() });
        if (this.entries.size > MAX_PLAYERS) this.entries.delete(this.entries.keys().next().value!);
        return data;
      })
      .finally(() => this.inFlight.delete(userId));
    this.inFlight.set(userId, task);
    return task;
  }
}
