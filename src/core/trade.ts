import { effectiveValue, type ItemValue } from './types';

export interface SideTotals {
  /** Sum of effective values (value, or RAP when unvalued). */
  value: number;
  rap: number;
  /** Item ids on this side the source has no data for. */
  unknownIds: number[];
  /** Any item whose RAP is flagged as projected (manipulated). */
  hasProjected: boolean;
}

export function totalSide(ids: readonly number[], lookup: (id: number) => ItemValue | undefined): SideTotals {
  const totals: SideTotals = { value: 0, rap: 0, unknownIds: [], hasProjected: false };
  for (const id of ids) {
    const item = lookup(id);
    if (!item) {
      totals.unknownIds.push(id);
      continue;
    }
    totals.value += effectiveValue(item);
    totals.rap += item.rap;
    if (item.projected) totals.hasProjected = true;
  }
  return totals;
}

export interface TradeBalance {
  give: SideTotals;
  receive: SideTotals;
  /** receive.value - give.value; positive means you gain value. */
  valueDelta: number;
  rapDelta: number;
}

export function balanceTrade(give: SideTotals, receive: SideTotals): TradeBalance {
  return {
    give,
    receive,
    valueDelta: receive.value - give.value,
    rapDelta: receive.rap - give.rap,
  };
}
