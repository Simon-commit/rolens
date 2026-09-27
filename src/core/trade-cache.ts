/*
 * Trade contents saved on this device, so the Trades list does not ask Roblox again for
 * trades it has already read. A trade's items never change: a counter offer is a new
 * trade with a new id. Values are not saved here; previews are recalculated from the
 * current values every time, so they never go out of date.
 */

export const TRADE_CACHE_KEY = 'trades';
/** Trades older than this are forgotten. Roblox trades expire long before. */
export const TRADE_CACHE_TTL_MS = 60 * 24 * 60 * 60_000;
export const TRADE_CACHE_MAX = 1000;
const SAVE_DELAY_MS = 1000;

export interface CachedSide {
  itemIds: number[];
  names: string[];
  robux: number;
}

export interface CachedTrade {
  give: CachedSide;
  receive: CachedSide;
}

interface Stored {
  /** The Roblox account the trades belong to; another account's trades are never shown. */
  userId: number;
  entries: Record<string, { trade: CachedTrade; savedAt: number }>;
}

export interface TradeCacheStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

function isSide(value: unknown): value is CachedSide {
  if (typeof value !== 'object' || value === null) return false;
  const side = value as Record<string, unknown>;
  return (
    Array.isArray(side.itemIds) &&
    side.itemIds.every((id) => Number.isSafeInteger(id) && (id as number) > 0) &&
    Array.isArray(side.names) &&
    side.names.every((name) => typeof name === 'string') &&
    typeof side.robux === 'number'
  );
}

function isTrade(value: unknown): value is CachedTrade {
  if (typeof value !== 'object' || value === null) return false;
  const trade = value as Record<string, unknown>;
  return isSide(trade.give) && isSide(trade.receive);
}

export class TradeCache {
  private stored: Stored | null = null;
  private loading: Promise<Stored> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly storage: TradeCacheStorage,
    private readonly now: () => number = Date.now,
  ) {}

  /** Reads the saved trades once. Trades saved for another account are dropped. */
  private load(userId: number): Promise<Stored> {
    if (this.stored && this.stored.userId !== userId) {
      this.stored = { userId, entries: {} };
      this.loading = Promise.resolve(this.stored);
    }
    this.loading ??= this.storage
      .get(TRADE_CACHE_KEY)
      .catch((): Record<string, unknown> => ({}))
      .then((result) => {
        const raw = result[TRADE_CACHE_KEY] as Partial<Stored> | undefined;
        const entries: Stored['entries'] = {};
        if (raw?.userId === userId && typeof raw.entries === 'object' && raw.entries) {
          const cutoff = this.now() - TRADE_CACHE_TTL_MS;
          for (const [id, entry] of Object.entries(raw.entries)) {
            if (entry && typeof entry.savedAt === 'number' && entry.savedAt > cutoff && isTrade(entry.trade)) {
              entries[id] = entry;
            }
          }
        }
        this.stored = { userId, entries };
        return this.stored;
      });
    return this.loading;
  }

  /** Every saved trade for this account, by trade id. */
  async all(userId: number): Promise<Map<number, CachedTrade>> {
    const stored = await this.load(userId);
    return new Map(Object.entries(stored.entries).map(([id, entry]) => [Number(id), entry.trade]));
  }

  async save(userId: number, tradeId: number, trade: CachedTrade): Promise<void> {
    const stored = await this.load(userId);
    stored.entries[tradeId] = { trade, savedAt: this.now() };
    this.scheduleSave();
  }

  /** Forgets everything in memory, e.g. after the saved copy was cleared from the popup. */
  reset(): void {
    clearTimeout(this.saveTimer);
    this.stored = null;
    this.loading = null;
  }

  private scheduleSave(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      const stored = this.stored;
      if (!stored) return;
      const ids = Object.keys(stored.entries);
      if (ids.length > TRADE_CACHE_MAX) {
        ids.sort((a, b) => stored.entries[b]!.savedAt - stored.entries[a]!.savedAt);
        for (const id of ids.slice(TRADE_CACHE_MAX)) Reflect.deleteProperty(stored.entries, id);
      }
      void this.storage.set({ [TRADE_CACHE_KEY]: stored }).catch(() => undefined);
    }, SAVE_DELAY_MS);
  }
}
