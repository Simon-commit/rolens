import { balanceTrade, totalSide, type SideTotals, type TradeBalance } from '../core/trade';
import type { ItemValue } from '../core/types';
import { totalUsd } from '../core/usd';
import { findItemCards } from './badges';
import { SELECTORS } from './selectors';
import { ROBUX_AFTER_FEE } from './trade-values';
import type { RenderContext } from './ui/context';
import { createSideTotal, createTradeCard, type TradeView } from './ui/trade-card';

export interface TradeOffers {
  give: { element: Element; ids: number[]; robux: number };
  receive: { element: Element; ids: number[]; robux: number };
}

/**
 * The Robux added to one side of a trade, from its "Robux Offered" line. The offer's
 * "Total Value" line is skipped. Roblox groups digits by the account's format, so only
 * the digits are read.
 */
export function offerRobux(offer: Element): number {
  // When sending a trade, the Robux being added is typed into a field.
  const input = offer.querySelector<HTMLInputElement>(SELECTORS.offerRobuxInput);
  if (input) {
    const amount = Number(input.value.replace(/\D/g, ''));
    return Number.isSafeInteger(amount) ? amount : 0;
  }
  for (const line of offer.querySelectorAll(SELECTORS.offerRobuxLine)) {
    const label = line.textContent?.toLowerCase() ?? '';
    if (!label.includes('robux') || label.includes('total')) continue;
    const digits = line.querySelector(SELECTORS.offerRobuxValue)?.textContent?.replace(/\D/g, '') ?? '';
    const amount = Number(digits);
    if (digits && Number.isSafeInteger(amount)) return amount;
  }
  return 0;
}

/**
 * Finds the two sides of the trade being viewed or sent. The side is read from the header
 * text, falling back to Roblox's order: give first, receive second.
 */
export function findTradeOffers(root: ParentNode): TradeOffers | null {
  const offers = [...root.querySelectorAll(SELECTORS.tradeOffer)];
  if (offers.length !== 2) return null;
  const sides = offers.map((element) => ({
    element,
    ids: [...findItemCards(element).values()],
    robux: offerRobux(element),
    header: element.querySelector(SELECTORS.tradeOfferHeader)?.textContent?.toLowerCase() ?? '',
  }));
  const [first, second] = sides as [(typeof sides)[0], (typeof sides)[0]];
  // "You will receive" on the Trades page, "Your Request" when sending a trade.
  const receives = (header: string) => header.includes('receive') || header.includes('request');
  const firstReceives = receives(first.header) && !receives(second.header);
  const [give, receive] = firstReceives ? [second, first] : [first, second];
  return { give, receive };
}

/** Renders the trade card above the trade's first offer. Returns the balance for testing. */
export function renderTradeSummary(
  root: ParentNode,
  lookup: (id: number) => ItemValue | null | undefined,
  ctx: RenderContext,
  proof?: (giveIds: number[], receiveIds: number[], button: HTMLElement) => void,
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
  // Robux you give counts in full; Robux you receive counts after Roblox's 30% fee.
  const receivedRobux = Math.floor(offers.receive.robux * ROBUX_AFTER_FEE);
  const withRobux = (side: SideTotals, robux: number): SideTotals => ({
    ...side,
    value: side.value + robux,
    rap: side.rap + robux,
  });
  const view: TradeView = {
    balance: balanceTrade(
      withRobux(totalSide(offers.give.ids, find), offers.give.robux),
      withRobux(totalSide(offers.receive.ids, find), receivedRobux),
    ),
    give: { items: giveItems, usd: totalUsd(giveItems, ctx.settings), robux: offers.give.robux },
    receive: {
      items: receiveItems,
      usd: totalUsd(receiveItems, ctx.settings),
      robux: offers.receive.robux,
      robuxAfterFee: receivedRobux,
    },
  };
  const signature = JSON.stringify([
    offers.give.ids,
    offers.receive.ids,
    offers.give.robux,
    offers.receive.robux,
    view.balance.valueDelta,
    view.give.usd?.value ?? null,
    view.receive.usd?.value ?? null,
    [...giveItems, ...receiveItems].map((item) => [item.rare, item.routility?.value ?? null]),
    Boolean(proof),
  ]);
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
  const card = createTradeCard(view, ctx, {
    proof: proof ? (button) => proof(offers.give.ids, offers.receive.ids, button) : undefined,
  });
  card.dataset.signature = signature;
  const firstOffer = [offers.give.element, offers.receive.element].sort((a, b) =>
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  )[0];
  firstOffer?.before(card);
  return view.balance;
}
