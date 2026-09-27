import { balanceTrade, totalSide, type SideTotals, type TradeBalance } from '../core/trade';
import type { ItemValue } from '../core/types';
import type { TradeOffers, TradeSide } from './roblox-api';

/*
 * Values a trade read from Roblox's trades API. Shared by the Trades list previews, the
 * duplicate trade notice and trade proofs, so every view of a trade adds up the same way.
 */

/** Share of Robux the receiver keeps after Roblox's marketplace fee. */
export const ROBUX_AFTER_FEE = 0.7;

export interface TradeValuer {
  loadValues: (ids: number[]) => Promise<void>;
  lookup: (id: number) => ItemValue | null | undefined;
  /** Looks up limiteds by exact name, for items Roblox lists under an id Rolimon's does not track (such as faces). */
  resolveNames?: (names: string[]) => Promise<void>;
  idForName?: (name: string) => number | null | undefined;
}

export interface ValuedItem {
  /** The id Roblox gave. */
  id: number;
  name: string;
  /** The item's values, found by id or by exact name; undefined when unvalued. */
  item: ItemValue | undefined;
}

export interface ValuedSide {
  items: ValuedItem[];
  robux: number;
}

export interface ValuedTrade {
  give: ValuedSide;
  receive: ValuedSide;
  /** Totals with Robux included; Robux received counts after Roblox's fee. */
  balance: TradeBalance;
  /** Items on either side with no value. */
  unlisted: number;
}

/** Loads values for every item in `trades`, matching unknown ids by name. */
export async function loadTradeValues(trades: TradeOffers[], deps: TradeValuer): Promise<void> {
  const sides = trades.flatMap((trade) => [trade.give, trade.receive]);
  await deps.loadValues(sides.flatMap((side) => side.itemIds));
  const unknownNames = sides.flatMap((side) =>
    side.names.filter((name, i) => name && deps.lookup(side.itemIds[i]!) === null),
  );
  if (unknownNames.length && deps.resolveNames) await deps.resolveNames([...new Set(unknownNames)]);
}

function valuedId(side: TradeSide, index: number, deps: TradeValuer): number {
  const id = side.itemIds[index]!;
  if (deps.lookup(id) !== null) return id;
  const name = side.names[index];
  const match = name ? deps.idForName?.(name) : null;
  return typeof match === 'number' ? match : id;
}

function withRobux(side: SideTotals, robux: number): SideTotals {
  return { ...side, value: side.value + robux, rap: side.rap + robux };
}

/** Values one trade. Call loadTradeValues first. */
export function valueTrade(trade: TradeOffers, deps: TradeValuer): ValuedTrade {
  const lookup = (id: number) => deps.lookup(id) ?? undefined;
  const side = (offer: TradeSide): { valued: ValuedSide; totals: SideTotals } => {
    const ids = offer.itemIds.map((_, i) => valuedId(offer, i, deps));
    const items = ids.map((id, i) => {
      const item = lookup(id);
      return { id: offer.itemIds[i]!, name: item?.name ?? offer.names[i] ?? '', item };
    });
    return { valued: { items, robux: offer.robux }, totals: totalSide(ids, lookup) };
  };
  const give = side(trade.give);
  const receive = side(trade.receive);
  return {
    give: give.valued,
    receive: receive.valued,
    balance: balanceTrade(
      withRobux(give.totals, trade.give.robux),
      withRobux(receive.totals, Math.floor(trade.receive.robux * ROBUX_AFTER_FEE)),
    ),
    unlisted: give.totals.unknownIds.length + receive.totals.unknownIds.length,
  };
}
