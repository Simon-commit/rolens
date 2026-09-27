import type { ItemValue, SourceId } from '../core/types';

export interface ValueProvider {
  id: SourceId;
  label: string;
  homepage: string;
  /** False when the source can't be queried yet; the UI shows `unavailableReason`. */
  available: boolean;
  unavailableReason?: string;
  /** Link to the item's page on the source site, if it has one. */
  itemUrl?: (id: number) => string;
  fetchItems: (fetchFn: typeof fetch) => Promise<Record<string, ItemValue>>;
}
