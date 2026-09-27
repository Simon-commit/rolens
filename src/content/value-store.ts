import type { CacheStatus, ItemsResponse, RoutilityResponse } from '../core/messages';
import { itemFromRoutility, withRoutility } from '../core/routility';
import type { ItemValue, RoutilityData } from '../core/types';

type Transport = (ids: number[]) => Promise<ItemsResponse | undefined>;
type RoutilityTransport = (ids: number[]) => Promise<RoutilityResponse | undefined>;

/**
 * Per-tab lookup cache. Batches ids requested in the same tick into one message,
 * and remembers which ids are not limiteds so they're never asked for again.
 */
export class ValueStore {
  private readonly known = new Map<number, ItemValue | null>();
  private readonly routility = new Map<number, RoutilityData | null>();
  private readonly routilityRequested = new Set<number>();
  private pending = new Set<number>();
  private batch: Promise<void> | null = null;
  status: CacheStatus | null = null;
  /** False when Rolimon's is off: items then come from RoUtility alone. */
  useRolimons = true;

  constructor(private readonly transport: Transport) {}

  /** The item with any RoUtility data layered on; null if it's not a limited. */
  peek(id: number): ItemValue | null | undefined {
    if (!this.useRolimons) {
      const data = this.routility.get(id);
      return data ? itemFromRoutility(id, data) : data;
    }
    const item = this.known.get(id);
    return item ? withRoutility(item, this.routility.get(id)) : item;
  }

  /**
   * Fetches RoUtility data for ids that haven't been asked about yet in this tab: known
   * limiteds when Rolimon's is on, otherwise every id. Resolves true when new data arrived.
   */
  async loadRoutility(ids: Iterable<number>, transport: RoutilityTransport): Promise<boolean> {
    const wanted = [...ids].filter(
      (id) => (!this.useRolimons || this.known.get(id)) && !this.routilityRequested.has(id),
    );
    if (wanted.length === 0) return false;
    for (const id of wanted) this.routilityRequested.add(id);
    const response = await transport(wanted).catch(() => undefined);
    if (!response) return false;
    let changed = false;
    for (const id of wanted) {
      if (id in response.items) {
        this.routility.set(id, response.items[id] ?? null);
        changed = true;
      } else {
        // Not fetched (rate limited or capped): allow a retry on a later scan.
        this.routilityRequested.delete(id);
      }
    }
    return changed;
  }

  /** Resolves once every id has been looked up (or the lookup failed). */
  async load(ids: Iterable<number>): Promise<void> {
    if (!this.useRolimons) return;
    for (const id of ids) if (!this.known.has(id)) this.pending.add(id);
    if (this.pending.size === 0) return;
    this.batch ??= Promise.resolve().then(() => this.flush());
    return this.batch;
  }

  /** Forget everything, e.g. after the value source changes. */
  clear(): void {
    this.known.clear();
    this.routility.clear();
    this.routilityRequested.clear();
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
