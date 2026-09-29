import type { ItemValue } from '../core/types';
import { findItemCards } from './badges';
import { isOwnNode } from './dom';
import { tradePartnerFromPath } from './duplicate-trade';
import { SELECTORS } from './selectors';
import { signedInUserId } from './trade-list';
import { renderInventoryFilter, type InventoryFilter } from './ui/inventory-filter';

/*
 * Tools in the window for sending a trade. A filter bar above each inventory narrows its
 * items by name, acronym, minimum value or rarity, and can hide items on hold. Roblox
 * marks items on hold itself ("Holding"), so RoLens reads that marker instead of asking
 * Roblox again. Items are only hidden from view; nothing is added to or removed from the
 * trade.
 */

export const FILTERED_ATTR = 'data-rolens-filtered';

export interface TradeWindowDeps {
  lookup: (id: number) => ItemValue | null | undefined;
}

const filters = new WeakMap<Element, InventoryFilter>();
/** Applies a filter to the tiles as last drawn, per inventory. */
const appliers = new WeakMap<Element, (filter: InventoryFilter) => number>();

const tileOf = (card: Element) => card.closest(SELECTORS.inventoryTile) ?? card;

/** Class names such as "on-hold", "is-holding" or "item-hold-overlay". */
const HOLD_CLASS = /(?:^|[-_])(?:on-?)?hold(?:ing)?(?:[-_]|$)/i;

/** Whether Roblox marks this tile as on hold, by its "Holding" label or a hold class. */
export function tileOnHold(tile: Element): boolean {
  for (const node of [tile, ...tile.querySelectorAll('*')]) {
    if (isOwnNode(node)) continue;
    for (const name of node.classList) if (HOLD_CLASS.test(name) && !/placeholder/i.test(name)) return true;
    if (node.childElementCount === 0 && node.textContent?.trim().toLowerCase() === 'holding') return true;
  }
  return false;
}

/** Parses "50K", "1.2m" or "250000" as a minimum value; null for anything else. */
export function minimumValue(query: string): number | null {
  const match = /^(\d+(?:[.,]\d+)?)\s*([km])?\+?$/i.exec(query.trim());
  if (!match) return null;
  const base = Number(match[1]!.replace(',', '.'));
  const scale = match[2]?.toLowerCase() === 'm' ? 1e6 : match[2]?.toLowerCase() === 'k' ? 1e3 : 1;
  return Number.isFinite(base) ? base * scale : null;
}

/** Whether a tile passes the filter. Items RoLens has no value for pass a text search by name only. */
export function passesFilter(
  filter: InventoryFilter,
  name: string,
  item: ItemValue | null | undefined,
  onHold: boolean,
): boolean {
  if (filter.rareOnly && !item?.rare) return false;
  if (filter.hideHold && onHold) return false;
  const query = filter.query.trim().toLowerCase();
  if (!query) return true;
  const min = minimumValue(query);
  if (min !== null) return (item?.value ?? item?.rap ?? 0) >= min;
  return name.toLowerCase().includes(query) || Boolean(item?.acronym && item.acronym.toLowerCase() === query);
}

/** Draws the filter bars in the trade window, or removes them elsewhere. */
export function renderTradeWindow(deps: TradeWindowDeps): void {
  const partner = tradePartnerFromPath(location.pathname);
  const me = signedInUserId();
  const panels = partner === null || me === null ? [] : [...document.querySelectorAll(SELECTORS.inventoryPanel)];
  if (!panels.length) {
    resetTradeWindow();
    return;
  }
  for (const panel of panels) {
    const tiles: { tile: Element; name: string; item: ItemValue | null | undefined; onHold: boolean }[] = [];
    for (const [card, id] of findItemCards(panel)) {
      const tile = tileOf(card);
      const name = tile.querySelector(SELECTORS.cardName)?.textContent?.trim() ?? '';
      tiles.push({ tile, name, item: deps.lookup(id), onHold: tileOnHold(tile) });
    }

    const apply = (filter: InventoryFilter): number => {
      let shown = 0;
      for (const { tile, name, item, onHold } of tiles) {
        const pass = passesFilter(filter, name, item, onHold);
        if (pass) shown += 1;
        if (pass) tile.removeAttribute(FILTERED_ATTR);
        else tile.setAttribute(FILTERED_ATTR, '');
      }
      return shown;
    };
    appliers.set(panel, apply);
    let filter = filters.get(panel);
    if (!filter) {
      filter = { query: '', rareOnly: false, hideHold: false };
      filters.set(panel, filter);
    }
    const bar = renderInventoryFilter(
      panel.querySelector<HTMLElement>(':scope [data-rolens="inventory-filter"]'),
      filter,
      { total: tiles.length, holds: tiles.filter((entry) => entry.onHold).length },
      (next) => {
        filters.set(panel, next);
        return appliers.get(panel)?.(next) ?? 0;
      },
    );
    bar.update(apply(filter));
    const after = panel.querySelector(SELECTORS.inventoryFilterRow) ?? panel.querySelector(SELECTORS.inventoryHeading);
    if (after && after.nextElementSibling !== bar.host) after.after(bar.host);
    else if (!after && bar.host.parentElement !== panel) panel.prepend(bar.host);
  }
}

/** Shows every tile again and removes the filter bars. */
export function resetTradeWindow(): void {
  for (const tile of document.querySelectorAll(`[${FILTERED_ATTR}]`)) tile.removeAttribute(FILTERED_ATTR);
  for (const node of document.querySelectorAll('[data-rolens="inventory-filter"], [data-rolens="hold-tag"]')) {
    node.remove();
  }
}
