import type { CacheStatus } from './messages';
import type { ItemValue, SourceId, ValueSnapshot } from './types';

/** Values older than this are refreshed on the next request. */
export const STALE_AFTER_MS = 10 * 60_000;
/** Rolimons allows one request per minute; stay safely under it. */
export const MIN_FETCH_INTERVAL_MS = 65_000;

export interface SnapshotStore {
  load(source: SourceId): Promise<ValueSnapshot | null>;
  save(snapshot: ValueSnapshot): Promise<void>;
}

export interface Fetcher {
  source: SourceId;
  fetchItems(): Promise<Record<string, ItemValue>>;
}

/**
 * Serves item values from a cached snapshot, refreshing it when stale.
 * Stale data is always preferred over no data, and at most one fetch runs at a time.
 */
export class ValueCache {
  private snapshot: ValueSnapshot | null = null;
  private loading: Promise<void> | null = null;
  private inFlight: Promise<void> | null = null;
  private lastAttempt = 0;
  private lastError: string | null = null;

  constructor(
    private readonly fetcher: Fetcher,
    private readonly store: SnapshotStore,
    private readonly now: () => number = Date.now,
  ) {}

  get source(): SourceId {
    return this.fetcher.source;
  }

  async get(): Promise<ValueSnapshot | null> {
    await this.ensureLoaded();
    if (this.isStale()) {
      const refresh = this.refresh(false);
      // Only block the caller when there's nothing to serve yet.
      if (this.snapshot) void refresh;
      else await refresh;
    }
    return this.snapshot;
  }

  /** Fetches new values unless one ran within the rate limit window (or `force` bypasses staleness). */
  async refresh(force: boolean): Promise<void> {
    await this.ensureLoaded();
    if (this.inFlight) return this.inFlight;
    if (!force && !this.isStale()) return;
    if (this.now() - this.lastAttempt < MIN_FETCH_INTERVAL_MS) return;
    this.lastAttempt = this.now();
    this.inFlight = (async () => {
      try {
        const items = await this.fetcher.fetchItems();
        this.snapshot = { source: this.fetcher.source, fetchedAt: this.now(), items };
        this.lastError = null;
        await this.store.save(this.snapshot);
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error);
      } finally {
        this.inFlight = null;
      }
    })();
    return this.inFlight;
  }

  status(): CacheStatus {
    return {
      source: this.fetcher.source,
      fetchedAt: this.snapshot?.fetchedAt ?? null,
      itemCount: this.snapshot ? Object.keys(this.snapshot.items).length : 0,
      error: this.lastError,
    };
  }

  private isStale(): boolean {
    return !this.snapshot || this.now() - this.snapshot.fetchedAt > STALE_AFTER_MS;
  }

  /** Reads the stored snapshot once. Requests that arrive meanwhile wait for it, so a cold start never refetches. */
  private ensureLoaded(): Promise<void> {
    this.loading ??= this.store
      .load(this.fetcher.source)
      .then((stored) => {
        if (stored && stored.source === this.fetcher.source) this.snapshot = stored;
      })
      .catch(() => {
        // A corrupt cache is not fatal; the next fetch replaces it.
      });
    return this.loading;
  }
}
