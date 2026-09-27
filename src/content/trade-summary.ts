import { formatDelta, formatPercent, formatRobux, percentChange } from '../core/format';
import type { Settings } from '../core/settings';
import { balanceTrade, totalSide, type SideTotals, type TradeBalance } from '../core/trade';
import type { ItemValue } from '../core/types';
import { findItemCards } from './badges';
import { el, ROLENS_ATTR } from './dom';
import { SELECTORS } from './selectors';

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

function sideLine(label: string, totals: SideTotals, compact: boolean): HTMLElement {
  return el(
    'div',
    'rolens-trade__side',
    el('span', 'rolens-trade__label', label),
    el('span', 'rolens-trade__value', `${formatRobux(totals.value, compact)} value`),
    el('span', 'rolens-trade__rap', `${formatRobux(totals.rap, compact)} RAP`),
    totals.hasProjected ? el('span', 'rolens-tag rolens-tag--warn', 'Has projected') : null,
  );
}

export function createTradeSummary(balance: TradeBalance, settings: Settings): HTMLElement {
  const compact = settings.compactNumbers;
  const pct = percentChange(balance.valueDelta, balance.give.value);
  const verdict = balance.valueDelta > 0 ? 'win' : balance.valueDelta < 0 ? 'loss' : 'even';
  const unknown = balance.give.unknownIds.length + balance.receive.unknownIds.length;
  const summary = el(
    'section',
    'rolens-trade',
    el(
      'div',
      'rolens-trade__verdict',
      el('span', 'rolens-panel__brand', 'RoLens'),
      el('strong', 'rolens-trade__delta', `${formatDelta(balance.valueDelta, compact)} value`),
      pct === null ? null : el('span', 'rolens-trade__pct', formatPercent(pct)),
      el('span', 'rolens-trade__rapdelta', `${formatDelta(balance.rapDelta, compact)} RAP`),
    ),
    sideLine('You give', balance.give, compact),
    sideLine('You get', balance.receive, compact),
    unknown > 0 ? el('div', 'rolens-trade__note', `${unknown} item(s) have no value data and are not counted.`) : null,
  );
  summary.dataset.verdict = verdict;
  summary.setAttribute(ROLENS_ATTR, 'trade');
  return summary;
}

/** Renders the win/loss summary above the trade's first offer. Returns the balance for testing. */
export function renderTradeSummary(
  root: ParentNode,
  lookup: (id: number) => ItemValue | null | undefined,
  settings: Settings,
): TradeBalance | null {
  const offers = findTradeOffers(root);
  const existing = root.querySelector<HTMLElement>('[data-rolens="trade"]');
  if (!offers) {
    existing?.remove();
    return null;
  }
  const find = (id: number) => lookup(id) ?? undefined;
  const balance = balanceTrade(totalSide(offers.give.ids, find), totalSide(offers.receive.ids, find));
  const signature = JSON.stringify([offers.give.ids, offers.receive.ids, balance.valueDelta, balance.rapDelta]);
  if (existing?.dataset.signature === signature) return balance;
  existing?.remove();
  const summary = createTradeSummary(balance, settings);
  summary.dataset.signature = signature;
  const firstOffer = [offers.give.element, offers.receive.element].sort((a, b) =>
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  )[0];
  firstOffer?.before(summary);
  return balance;
}
