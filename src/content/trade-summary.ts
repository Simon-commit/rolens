import { balanceTrade, totalSide, type TradeBalance } from '../core/trade';
import type { ItemValue } from '../core/types';
import { totalUsd } from '../core/usd';
import { findItemCards } from './badges';
import { SELECTORS } from './selectors';
import type { RenderContext } from './ui/context';
import { createSideTotal, createTradeCard, type TradeView } from './ui/trade-card';

export interface TradeOffers {
  give: { element: Element; ids: number[] };
  receive: { element: Element; ids: number[] };
}

/**
 * Finds the two sides of the trade being viewed. The side is read from the header
 * text ("give" / "receive"), falling back to Roblox's order: give first, receive second.
 */
export function findTradeOffers(root: ParentNode): TradeOffers | null {
  const offers = [...root.querySelectorAll(SELECTORS.tradeOffer)];
  if (offers.length !== 2) return null;
  const sides = offers.map((element) => ({
    element,
    ids: [...findItemCards(element).values()],
    header: element.querySelector(SELECTORS.tradeOfferHeader)?.textContent?.toLowerCase() ?? '',
  }));
  const [first, second] = sides as [(typeof sides)[0], (typeof sides)[0]];
  const firstReceives = first.header.includes('receive') && !second.header.includes('receive');
  const [give, receive] = firstReceives ? [second, first] : [first, second];
  return { give, receive };
}

/** Renders the trade card above the trade's first offer. Returns the balance for testing. */
export function renderTradeSummary(
  root: ParentNode,
  lookup: (id: number) => ItemValue | null | undefined,
  ctx: RenderContext,
): TradeBalance | null {
  const offers = findTradeOffers(root);
  const existing = root.querySelector<HTMLElement>('[data-rolens="trade"]');
  if (!offers) {
    existing?.remove();
    for (const node of root.querySelectorAll('[data-rolens="side-total"]')) node.remove();
    return null;
  }
  const find = (id: number) => lookup(id) ?? undefined;
  const known = (ids: number[]) => ids.map(find).filter((item): item is ItemValue => item !== undefined);
  const giveItems = known(offers.give.ids);
  const receiveItems = known(offers.receive.ids);
  const view: TradeView = {
    balance: balanceTrade(totalSide(offers.give.ids, find), totalSide(offers.receive.ids, find)),
    give: { items: giveItems, usd: totalUsd(giveItems, ctx.settings) },
    receive: { items: receiveItems, usd: totalUsd(receiveItems, ctx.settings) },
  };
  const signature = JSON.stringify([offers.give.ids, offers.receive.ids, view.balance.valueDelta, view.give.usd]);
  if (existing?.dataset.signature === signature) return view.balance;
  existing?.remove();
  for (const [side, totals] of [
    [offers.give, view.balance.give],
    [offers.receive, view.balance.receive],
  ] as const) {
    side.element.querySelector('[data-rolens="side-total"]')?.remove();
    const header = side.element.querySelector(SELECTORS.tradeOfferHeader);
    header?.append(createSideTotal(totals.value, totals.rap, ctx));
  }
  const card = createTradeCard(view, ctx);
  card.dataset.signature = signature;
  const firstOffer = [offers.give.element, offers.receive.element].sort((a, b) =>
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  )[0];
  firstOffer?.before(card);
  return view.balance;
}
