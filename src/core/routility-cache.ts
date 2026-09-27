import { parseRoutilityItem, routilityItemUrl } from './routility';
import type { RoutilityData } from './types';

/** How long RoUtility data is reused before fetching again. */
export const ROUTILITY_TTL_MS = 30 * 60_000;
/** How long "RoUtility doesn't know this item" is remembered. */
export const ROUTILITY_MISS_TTL_MS = 6 * 60 * 60_000;
/** After being rate limited or blocked, wait this long before trying again. */
export const ROUTILITY_BACKOFF_MS = 5 * 60_000;
export const ROUTILITY_CONCURRENCY = 3;
/** Most items fetched for one request, so a big inventory page can't flood RoUtility. */
export const ROUTILITY_MAX_PER_REQUEST = 40;
const MAX_ENTRIES = 3000;

export interface RoutilityEntry {
  data: RoutilityData | null;
  fetchedAt: number;
}

export interface RoutilityStore {
  load(): Promise<Record<string, RoutilityEntry>>;
  save(entries: Record<string, RoutilityEntry>): Promise<void>;
}

export interface RoutilityStatus {
  lastSuccess: number | null;
  error: string | null;
  blockedUntil: number | null;
}

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`RoUtility responded with HTTP ${status}`);
  }
}

/**
 * Fetches RoUtility item details on demand, a few at a time, with a local cache.
 * Only items the user is looking at are requested.
 */
export class RoutilityCache {
  private entries: Record<string, RoutilityEntry> | null = null;
  private readonly inFlight = new Map<number, Promise<void>>();
  private lastSuccess: number | null = null;
  private error: string | null = null;
  private blockedUntil = 0;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly fetchFn: typeof fetch,
    private readonly store: RoutilityStore,
    private readonly now: () => number = Date.now,
  ) {}

  status(): RoutilityStatus {
    return {
      lastSuccess: this.lastSuccess,
      error: this.error,
      blockedUntil: this.blockedUntil > this.now() ? this.blockedUntil : null,
    };
  }

  /** Returns what's known for `ids`, fetching stale or missing ones first. */
  async get(ids: number[]): Promise<Record<string, RoutilityData | null>> {
    const entries = await this.load();
    const wanted = [...new Set(ids)].slice(0, ROUTILITY_MAX_PER_REQUEST);
    const stale = wanted.filter((id) => !this.isFresh(entries[id]));
    await this.fetchAll(stale);
    const result: Record<string, RoutilityData | null> = {};
    for (const id of wanted) {
      const entry = entries[id];
      if (entry) result[id] = entry.data;
    }
    return result;
  }

  private isFresh(entry: RoutilityEntry | undefined): boolean {
    if (!entry) return false;
    const ttl = entry.data ? ROUTILITY_TTL_MS : ROUTILITY_MISS_TTL_MS;
    return this.now() - entry.fetchedAt < ttl;
  }

  private async fetchAll(ids: number[]): Promise<void> {
    const queue = [...ids];
    const worker = async () => {
      for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
        if (this.blockedUntil > this.now()) return;
        await this.fetchOne(id);
      }
    };
    await Promise.all(Array.from({ length: Math.min(ROUTILITY_CONCURRENCY, queue.length) }, worker));
    if (ids.length) this.scheduleSave();
  }

  private fetchOne(id: number): Promise<void> {
    const existing = this.inFlight.get(id);
    if (existing) return existing;
    const task = (async () => {
      try {
        const response = await this.fetchFn(routilityItemUrl(id), {
          credentials: 'omit',
          headers: { Accept: 'application/json' },
        });
        if (response.status === 404) {
          this.entries![id] = { data: null, fetchedAt: this.now() };
          return;
        }
        if (!response.ok) throw new HttpError(response.status);
        this.entries![id] = { data: parseRoutilityItem(await response.json(), id), fetchedAt: this.now() };
        this.lastSuccess = this.now();
        this.error = null;
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
        if (error instanceof HttpError && [403, 429, 503].includes(error.status)) {
          this.blockedUntil = this.now() + ROUTILITY_BACKOFF_MS;
        }
      } finally {
        this.inFlight.delete(id);
      }
    })();
    this.inFlight.set(id, task);
    return task;
  }

  private async load(): Promise<Record<string, RoutilityEntry>> {
    if (!this.entries) {
      try {
        this.entries = await this.store.load();
      } catch {
        this.entries = {};
      }
    }
    return this.entries;
  }

  private scheduleSave(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      let entries = this.entries ?? {};
      const keys = Object.keys(entries);
      if (keys.length > MAX_ENTRIES) {
        const newest = keys.sort((a, b) => entries[b]!.fetchedAt - entries[a]!.fetchedAt).slice(0, MAX_ENTRIES);
        entries = Object.fromEntries(newest.map((key) => [key, entries[key]!]));
        this.entries = entries;
      }
      void this.store.save(entries).catch(() => undefined);
    }, 1000);
  }
}
