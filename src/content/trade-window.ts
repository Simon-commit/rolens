import { holdEndsBy, type OwnerSince } from '../core/owner-since';
import type { ItemValue } from '../core/types';
import { makeAnchor, releaseAnchor } from './chip-fit';
import { findItemCards } from './badges';
import { isOwnNode } from './dom';
import { tradePartnerFromPath } from './duplicate-trade';
import { SELECTORS } from './selectors';
import { signedInUserId } from './trade-list';
import { renderHoldTime } from './ui/hold-time';
import { renderInventoryFilter, type InventoryFilter } from './ui/inventory-filter';

/*
 * Tools in the window for sending a trade. A filter bar above each inventory narrows its
 * items by name, acronym, minimum value or rarity, and can hide items on hold. Roblox
 * marks items on hold itself ("Holding"), so RoLens reads that marker instead of asking
 * Roblox again. Items are only hidden from view; nothing is added to or removed from the
 * trade. Optionally, each item on hold shows when it comes off hold, estimated from the
 * owner's Rolimon's page.
 */

export const FILTERED_ATTR = 'data-rolens-filtered';

export interface TradeWindowDeps {
  lookup: (id: number) => ItemValue | null | undefined;
  /** The filter bars. */
  filters: boolean;
  /** Hold end times; null when turned off. */
  holdTimes: {
    /** When a player received each copy; undefined while it loads, null when unavailable. */
    ownerSince: (userId: number) => OwnerSince | null | undefined;
    now: () => number;
  } | null;
}

const HOLD_TIME_SELECTOR = ':scope > [data-rolens="hold-time"]';

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

/** The serial Roblox shows on a Limited U tile, such as "#1,234"; null without one. */
export function tileSerial(tile: Element): number | null {
  const text = tile.querySelector(SELECTORS.serialNumber)?.textContent ?? '';
  const digits = /#?\s*([\d,.\s]+)/.exec(text)?.[1]?.replace(/\D/g, '');
  const serial = digits ? Number(digits) : NaN;
  return Number.isSafeInteger(serial) && serial > 0 ? serial : null;
}

/** Whether a panel is the signed-in user's inventory ("Your Inventory"). */
const isOwnPanel = (panel: Element, index: number) => {
  const heading = panel.querySelector(SELECTORS.inventoryHeading)?.textContent ?? '';
  return heading.trim() ? /\byour\b/i.test(heading) : index === 0;
};

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
  for (const [index, panel] of panels.entries()) {
    const owner = isOwnPanel(panel, index) ? me! : partner!;
    const tiles: { tile: Element; name: string; item: ItemValue | null | undefined; onHold: boolean }[] = [];
    for (const [card, id] of findItemCards(panel)) {
      const tile = tileOf(card);
      const name = tile.querySelector(SELECTORS.cardName)?.textContent?.trim() ?? '';
      const onHold = tileOnHold(tile);
      tiles.push({ tile, name, item: deps.lookup(id), onHold });
      renderTileHoldTime(tile, onHold ? id : null, owner, deps);
    }
    if (!deps.filters) {
      panel.querySelector(':scope [data-rolens="inventory-filter"]')?.remove();
      continue;
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

/** Adds, updates or removes the hold end time on one tile. */
function renderTileHoldTime(tile: Element, heldId: number | null, owner: number, deps: TradeWindowDeps): void {
  const thumb = tile.querySelector<HTMLElement>(SELECTORS.cardThumb);
  if (!thumb) return;
  const existing = thumb.querySelector<HTMLElement>(HOLD_TIME_SELECTOR);
  const data = heldId !== null && deps.holdTimes ? deps.holdTimes.ownerSince(owner) : null;
  const now = deps.holdTimes?.now() ?? 0;
  const endsBy = data && heldId !== null ? holdEndsBy(data, heldId, tileSerial(tile), now) : null;
  if (endsBy === null) {
    // Kept while the owner's page loads again, so the tag doesn't flicker.
    if (data !== undefined && existing) {
      existing.remove();
      releaseIfUnused(thumb);
    }
    return;
  }
  const tag = renderHoldTime(existing, endsBy, now);
  if (tag.parentElement !== thumb) {
    makeAnchor(thumb);
    thumb.append(tag);
  }
}

/** Shows every tile again and removes the filter bars and hold times. */
export function resetTradeWindow(): void {
  for (const tile of document.querySelectorAll(`[${FILTERED_ATTR}]`)) tile.removeAttribute(FILTERED_ATTR);
  for (const node of document.querySelectorAll('[data-rolens="inventory-filter"], [data-rolens="hold-time"]')) {
    const thumb = node.parentElement;
    node.remove();
    if (thumb) releaseIfUnused(thumb);
  }
}

/** Undoes makeAnchor once no other RoLens element is positioned in the thumbnail. */
function releaseIfUnused(thumb: HTMLElement): void {
  if (!thumb.querySelector(':scope > [data-rolens]')) releaseAnchor(thumb);
}
