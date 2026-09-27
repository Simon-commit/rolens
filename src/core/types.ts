/** Market demand as rated by the value source. */
export type Demand = 'terrible' | 'low' | 'normal' | 'high' | 'amazing';

/** Short-term price direction as rated by the value source. */
export type Trend = 'lowering' | 'unstable' | 'stable' | 'raising' | 'fluctuating';

export type SourceId = 'rolimons' | 'routility';

export type Confidence = 'low' | 'medium' | 'high';

/** A US dollar estimate for one item. */
export interface UsdEstimate {
  value: number;
  /** Optional range around `value` when the source provides one. */
  low?: number;
  high?: number;
  /** How sure the source is. Null when it doesn't say (e.g. a user-set rate). */
  confidence: Confidence | null;
  /** Where the estimate came from: a data source, or the user's own Robux rate. */
  origin: SourceId | 'rate';
  /** Why the source is (un)sure, in its own words, when it says. */
  reason?: string;
  /** The source's USD per 1,000 value rate for this item, when it gives one. */
  rate?: number;
}

/** What RoUtility adds on top of the main value source. */
export interface RoutilityData {
  /** RoUtility's own value in Robux, for comparing with the main source. */
  value: number | null;
  usd: number | null;
  rate: number | null;
  confidence: Confidence | null;
  confidenceReason: string | null;
  rare: boolean;
  projected: boolean;
  hyped: boolean;
  copies: number | null;
}

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
  /** Market USD estimate from a source that provides one. Absent when none does. */
  usd?: UsdEstimate;
  /** RoUtility's data for this item, when it has been fetched. */
  routility?: RoutilityData;
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

/** Demand as a 1-5 level, for meters. 0 when unrated. */
export function demandLevel(demand: Demand | null): number {
  return demand ? (['terrible', 'low', 'normal', 'high', 'amazing'] as const).indexOf(demand) + 1 : 0;
}
