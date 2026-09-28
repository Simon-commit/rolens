import type { ItemValue } from '../core/types';
import { findItemCards } from './badges';
import { makeAnchor } from './chip-fit';
import { tradePartnerFromPath } from './duplicate-trade';
import { fetchCollectibles, type OwnedItem } from './roblox-api';
import { SELECTORS } from './selectors';
import { signedInUserId } from './trade-list';
import { renderHoldTag, type HoldState } from './ui/hold-tag';
import { renderInventoryFilter, type InventoryFilter } from './ui/inventory-filter';

/*
 * Tools in the window for sending a trade. A filter bar above each inventory narrows its
 * items by name, acronym, minimum value or rarity, and hides items on hold; an "On hold"
 * tag marks items Roblox will not let into a trade yet. Holds come from Roblox's public
 * inventory API, read without cookies, once per inventory and page visit. Items are only
 * hidden from view; nothing is added to or removed from the trade.
 */

export const FILTERED_ATTR = 'data-rolens-filtered';

export interface TradeWindowDeps {
  lookup: (id: number) => ItemValue | null | undefined;
  fetchOwned?: typeof fetchCollectibles;
  redraw: () => void;
}

interface Holds {
  /** Copies on hold, by asset id and serial ("123#45"). */
  serials: Set<string>;
  /** Per asset id: [copies on hold, copies owned]. */
  counts: Map<number, [number, number]>;
}

const holds = new Map<number, Holds | null | 'loading'>();
const filters = new WeakMap<Element, InventoryFilter>();
/** Applies a filter to the tiles as last drawn, per inventory. */
const appliers = new WeakMap<Element, (filter: InventoryFilter) => number>();

function indexHolds(owned: OwnedItem[]): Holds {
  const serials = new Set<string>();
  const counts = new Map<number, [number, number]>();
  for (const item of owned) {
    const count = counts.get(item.assetId) ?? [0, 0];
    count[1] += 1;
    if (item.onHold) {
      count[0] += 1;
      if (item.serial) serials.add(`${item.assetId}#${item.serial}`);
    }
    counts.set(item.assetId, count);
  }
  return { serials, counts };
}

/** Whether one tile's copy is on hold: exact for serialised copies, otherwise by count. */
export function holdState(index: Holds, assetId: number, serial: number | null): HoldState {
  const [onHold, owned] = index.counts.get(assetId) ?? [0, 0];
  if (onHold === 0) return 'none';
  if (serial !== null) return index.serials.has(`${assetId}#${serial}`) ? 'hold' : 'none';
  return onHold >= owned ? 'hold' : 'some';
}

function loadHolds(userId: number, deps: TradeWindowDeps): Holds | null | undefined {
  const known = holds.get(userId);
  if (known === 'loading') return undefined;
  if (known !== undefined) return known;
  holds.set(userId, 'loading');
  void (deps.fetchOwned ?? fetchCollectibles)(userId).then((owned) => {
    holds.set(userId, owned ? indexHolds(owned) : null);
    deps.redraw();
  });
  return undefined;
}

const tileOf = (card: Element) => card.closest(SELECTORS.inventoryTile) ?? card;

function serialOf(tile: Element): number | null {
  const text = tile.querySelector(SELECTORS.serialNumber)?.textContent?.replace(/\D/g, '') ?? '';
  const serial = Number(text);
  return text && Number.isSafeInteger(serial) && serial > 0 ? serial : null;
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
  hold: HoldState,
): boolean {
  if (filter.rareOnly && !item?.rare) return false;
  if (filter.hideHold && hold === 'hold') return false;
  const query = filter.query.trim().toLowerCase();
  if (!query) return true;
  const min = minimumValue(query);
  if (min !== null) return (item?.value ?? item?.rap ?? 0) >= min;
  return name.toLowerCase().includes(query) || Boolean(item?.acronym && item.acronym.toLowerCase() === query);
}

/** Draws the filter bars and hold tags in the trade window, or removes them elsewhere. */
export function renderTradeWindow(deps: TradeWindowDeps): void {
  const partner = tradePartnerFromPath(location.pathname);
  const me = signedInUserId();
  const panels = partner === null || me === null ? [] : [...document.querySelectorAll(SELECTORS.inventoryPanel)];
  if (!panels.length) {
    resetTradeWindow();
    return;
  }
  for (const [index, panel] of panels.entries()) {
    const heading = panel.querySelector(SELECTORS.inventoryHeading)?.textContent?.toLowerCase() ?? '';
    const own = heading ? heading.includes('your') : index === 0;
    const index_ = loadHolds(own ? me! : partner!, deps);
    const cards = findItemCards(panel);
    const tiles: { tile: Element; name: string; item: ItemValue | null | undefined; hold: HoldState }[] = [];
    for (const [card, id] of cards) {
      const tile = tileOf(card);
      const hold = index_ ? holdState(index_, id, serialOf(tile)) : 'none';
      const thumb = tile.querySelector<HTMLElement>(SELECTORS.cardThumb);
      const existing = thumb?.querySelector<HTMLElement>(':scope > [data-rolens="hold-tag"]') ?? null;
      if (thumb && hold !== 'none') {
        const tag = renderHoldTag(existing, hold, own);
        if (tag.parentElement !== thumb) {
          makeAnchor(thumb);
          thumb.append(tag);
        }
      } else {
        existing?.remove();
      }
      const name = tile.querySelector(SELECTORS.cardName)?.textContent?.trim() ?? '';
      tiles.push({ tile, name, item: deps.lookup(id), hold });
    }

    const apply = (filter: InventoryFilter): number => {
      let shown = 0;
      for (const { tile, name, item, hold } of tiles) {
        const pass = passesFilter(filter, name, item, hold);
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
      { total: tiles.length, holdsKnown: index_ !== undefined && index_ !== null, own },
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

/** Forgets holds (read again on the next visit) and shows every tile again. */
export function resetTradeWindow(): void {
  holds.clear();
  for (const tile of document.querySelectorAll(`[${FILTERED_ATTR}]`)) tile.removeAttribute(FILTERED_ATTR);
  for (const node of document.querySelectorAll('[data-rolens="inventory-filter"], [data-rolens="hold-tag"]')) {
    node.remove();
  }
}
