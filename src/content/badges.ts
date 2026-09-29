import type { ItemValue } from '../core/types';
import { fitChip, roomFor } from './chip-fit';
import { RARE_ATTR, ROLENS_ATTR } from './attrs';
import { isOwnNode } from './dom';
import { itemRefFromHref, SELECTORS } from './selectors';
import { createChip, shrinkToFit } from './ui/chip';
import { renderKey, type RenderContext } from './ui/context';

/**
 * Finds limiteds whose Roblox id is not the one Rolimon's tracks, such as classic faces
 * that Roblox now sells as heads and bundles, so they can be matched by name instead.
 */
export interface NameMatcher {
  lookup: (id: number) => ItemValue | null | undefined;
  /** A number when one limited has this name, null when none or several do, undefined when not yet asked. */
  idForName: (name: string) => number | null | undefined;
}

let matcher: NameMatcher | null = null;

/** Turns name matching on for every later scan. */
export function useNameMatcher(next: NameMatcher | null): void {
  matcher = next;
}

function looksLimited(card: Element): boolean {
  return Boolean(card.querySelector(SELECTORS.limitedMark) || card.closest(SELECTORS.limitedOnly));
}

function cardName(card: Element, link: Element): string {
  const text = card.querySelector(SELECTORS.cardName)?.textContent ?? link.getAttribute('title') ?? link.textContent;
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

interface Scan {
  cards: Map<Element, number>;
  /** Names of limited cards that have not been looked up yet. */
  pending: Set<string>;
}

function scan(root: ParentNode): Scan {
  const result: Scan = { cards: new Map(), pending: new Set() };
  for (const link of root.querySelectorAll<HTMLAnchorElement>(SELECTORS.itemLink)) {
    if (isOwnNode(link) || link.closest(`[${ROLENS_ATTR}]`)) continue;
    const ref = itemRefFromHref(link.getAttribute('href') ?? '', location.href);
    if (!ref) continue;
    const card = link.closest(SELECTORS.card) ?? link;
    if (result.cards.has(card)) continue;
    let id: number | null = ref.kind === 'catalog' ? ref.id : null;
    const unknown = id === null || matcher?.lookup(id) === null;
    if (matcher && unknown && looksLimited(card)) {
      const name = cardName(card, link);
      const match = name ? matcher.idForName(name) : null;
      if (typeof match === 'number') id = match;
      else if (match === undefined && name) result.pending.add(name);
    }
    if (id !== null) result.cards.set(card, id);
  }
  return result;
}

/** Maps each item card on the page to the item id it shows. */
export function findItemCards(root: ParentNode): Map<Element, number> {
  return scan(root).cards;
}

/** Names of limited cards that could not be matched by id and have not been looked up by name yet. */
export function pendingNames(root: ParentNode): string[] {
  return [...scan(root).pending];
}

/**
 * Adds or updates one value chip per item card, and marks rare items' cards. Only
 * touches the DOM when something changed, so it's safe to call from a MutationObserver.
 */
export function renderBadges(
  cards: Map<Element, number>,
  lookup: (id: number) => ItemValue | null | undefined,
  ctx: RenderContext,
): void {
  for (const [card, id] of cards) {
    const existing = card.querySelector<HTMLElement>(':scope [data-rolens="badge"]');
    const item = lookup(id);
    const caption = card.querySelector(SELECTORS.cardCaption);
    const price = card.querySelector(SELECTORS.robuxAmount);
    if (item && existing?.dataset.rolensKey === renderKey(item)) {
      // Cards that weren't laid out yet (hidden tabs, virtualised lists) get placed once visible.
      if (existing.dataset.fit === 'pending' && fitChip(existing, card, caption, price)) existing.dataset.fit = 'done';
      if (existing.dataset.fit === 'done') refit(existing, card, price);
      continue;
    }
    existing?.remove();
    card.removeAttribute(RARE_ATTR);
    if (!item) continue;
    if (item.rare) card.setAttribute(RARE_ATTR, '');
    const chip = createChip(item, ctx);
    chip.dataset.rolensKey = renderKey(item);
    chip.dataset.fit = fitChip(chip, card, caption, price) ? 'done' : 'pending';
    if (!chip.isConnected) (caption ?? card).append(chip);
    if (chip.dataset.fit === 'done') refit(chip, card, price);
  }
}

/**
 * Keeps a placed chip within its room. The room changes when Roblox adds its selection
 * check to a tile, and the chip's width changes once RoLens's font has loaded, so this
 * re-measures only when either has changed.
 */
function refit(chip: HTMLElement, card: Element, price: Element | null): void {
  const room = roomFor(chip, card, price);
  const key = `${Math.round(room)}:${document.fonts?.status ?? ''}`;
  if (chip.dataset.room === key) return;
  chip.dataset.room = key;
  shrinkToFit(chip, room);
  if (document.fonts && document.fonts.status !== 'loaded') {
    void document.fonts.ready.then(() => {
      if (chip.isConnected) refit(chip, card, price);
    });
  }
}
