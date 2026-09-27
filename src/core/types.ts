/** Market demand as rated by the value source. */
export type Demand = 'terrible' | 'low' | 'normal' | 'high' | 'amazing';

/** Short-term price direction as rated by the value source. */
export type Trend = 'lowering' | 'unstable' | 'stable' | 'raising' | 'fluctuating';

export type SourceId = 'rolimons' | 'routility';

/** One limited item's market data, normalised across sources. */
export interface ItemValue {
  id: number;
  name: string;
  /** Community abbreviation, e.g. "DV" for Dominus Venari. Empty when none. */
  acronym: string;
  /** Recent average price in Robux. */
  rap: number;
  /** Community-assigned value in Robux, or null when the item is unvalued. */
  value: number | null;
  demand: Demand | null;
  trend: Trend | null;
  /** RAP has been inflated by manipulation and is not trustworthy. */
  projected: boolean;
  hyped: boolean;
  rare: boolean;
}

/** A full table of item values from one source, as cached by the extension. */
export interface ValueSnapshot {
  source: SourceId;
  /** Epoch milliseconds when the snapshot was fetched. */
  fetchedAt: number;
  items: Record<string, ItemValue>;
}

/** The figure traders actually use: the value if the item has one, otherwise its RAP. */
export function effectiveValue(item: ItemValue): number {
  return item.value ?? item.rap;
}
