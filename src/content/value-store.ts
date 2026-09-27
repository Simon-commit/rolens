import type { CacheStatus, ItemsResponse } from '../core/messages';
import type { ItemValue } from '../core/types';

type Transport = (ids: number[]) => Promise<ItemsResponse | undefined>;

/**
 * Per-tab lookup cache. Batches ids requested in the same tick into one message,
 * and remembers which ids are not limiteds so they're never asked for again.
 */
export class ValueStore {
  private readonly known = new Map<number, ItemValue | null>();
  private pending = new Set<number>();
  private batch: Promise<void> | null = null;
  status: CacheStatus | null = null;

  constructor(private readonly transport: Transport) {}

  peek(id: number): ItemValue | null | undefined {
    return this.known.get(id);
  }

  /** Resolves once every id has been looked up (or the lookup failed). */
  async load(ids: Iterable<number>): Promise<void> {
    for (const id of ids) if (!this.known.has(id)) this.pending.add(id);
    if (this.pending.size === 0) return;
    this.batch ??= Promise.resolve().then(() => this.flush());
    return this.batch;
  }

  /** Forget everything, e.g. after the value source changes. */
  clear(): void {
    this.known.clear();
    this.status = null;
  }

  private async flush(): Promise<void> {
    const ids = [...this.pending];
    this.pending = new Set();
    this.batch = null;
    for (let i = 0; i < ids.length; i += 1000) {
      const chunk = ids.slice(i, i + 1000);
      const response = await this.transport(chunk).catch(() => undefined);
      if (!response) continue;
      this.status = response.status;
      // With an empty table we can't tell "not a limited" from "no data yet".
      const tableLoaded = response.status.itemCount > 0;
      for (const id of chunk) {
        const item = response.items[id];
        if (item) this.known.set(id, item);
        else if (tableLoaded) this.known.set(id, null);
      }
    }
  }
}
