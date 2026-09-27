import type { CacheStatus, ItemsResponse, NamesResponse, RoutilityResponse } from '../core/messages';
import { normaliseName } from '../core/names';
import { itemFromRoutility, withRoutility } from '../core/routility';
import type { ItemValue, RoutilityData } from '../core/types';

type Transport = (ids: number[]) => Promise<ItemsResponse | undefined>;
type NameTransport = (names: string[]) => Promise<NamesResponse | undefined>;
type RoutilityTransport = (ids: number[]) => Promise<RoutilityResponse | undefined>;

/**
 * Per-tab lookup cache. Batches ids requested in the same tick into one message,
 * and remembers which ids are not limiteds so they're never asked for again.
 */
export class ValueStore {
  private readonly known = new Map<number, ItemValue | null>();
  private readonly routility = new Map<number, RoutilityData | null>();
  private readonly routilityRequested = new Set<number>();
  /** Item id for each name asked about; null when no single limited has that name. */
  private readonly byName = new Map<string, number | null>();
  private pending = new Set<number>();
  private batch: Promise<void> | null = null;
  /** Bumped when cached data is dropped, so answers to requests made before then are ignored. */
  private generation = 0;
  private routilityGeneration = 0;
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
    const generation = this.routilityGeneration;
    const response = await transport(wanted).catch(() => undefined);
    if (!response || generation !== this.routilityGeneration) return false;
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

  /** The limited with this exact name, once resolveNames has looked it up. */
  idForName(name: string): number | null | undefined {
    return this.byName.get(normaliseName(name));
  }

  /**
   * Looks items up by name, for limiteds Roblox shows under an id Rolimon's does not track.
   * Each name is asked about once per tab.
   */
  async resolveNames(names: Iterable<string>, transport: NameTransport): Promise<void> {
    if (!this.useRolimons) return;
    const wanted = [...new Set(names)].filter((name) => !this.byName.has(normaliseName(name))).slice(0, 200);
    if (wanted.length === 0) return;
    const generation = this.generation;
    const response = await transport(wanted).catch(() => undefined);
    if (!response || generation !== this.generation || response.status.itemCount === 0) return;
    for (const name of wanted) {
      const item = response.items[name];
      this.byName.set(normaliseName(name), item ? item.id : null);
      if (item) this.known.set(item.id, item);
    }
  }

  /** Resolves once every id has been looked up (or the lookup failed). */
  async load(ids: Iterable<number>): Promise<void> {
    if (!this.useRolimons) return;
    for (const id of ids) if (!this.known.has(id)) this.pending.add(id);
    if (this.pending.size === 0) return;
    this.batch ??= Promise.resolve().then(() => this.flush());
    return this.batch;
  }

  /** Forgets the main source's values, e.g. after it published new ones. RoUtility data is kept. */
  clearValues(): void {
    this.known.clear();
    this.pending.clear();
    this.batch = null;
    this.status = null;
    this.byName.clear();
    this.generation += 1;
  }

  /** Forgets everything, e.g. after a source is turned on or off. */
  clear(): void {
    this.clearValues();
    this.routility.clear();
    this.routilityRequested.clear();
    this.routilityGeneration += 1;
  }

  private async flush(): Promise<void> {
    const ids = [...this.pending];
    const generation = this.generation;
    this.pending = new Set();
    this.batch = null;
    for (let i = 0; i < ids.length; i += 1000) {
      const chunk = ids.slice(i, i + 1000);
      const response = await this.transport(chunk).catch(() => undefined);
      if (generation !== this.generation) return;
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
