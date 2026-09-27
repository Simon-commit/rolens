import type { ItemValue } from '../core/types';
import { fitChip, roomFor } from './chip-fit';
import { RARE_ATTR, ROLENS_ATTR } from './attrs';
import { isOwnNode } from './dom';
import { catalogIdFromHref, SELECTORS } from './selectors';
import { createChip, shrinkToFit } from './ui/chip';
import { renderKey, type RenderContext } from './ui/context';

/** Maps each item card on the page to the item id it shows. */
export function findItemCards(root: ParentNode): Map<Element, number> {
  const cards = new Map<Element, number>();
  for (const link of root.querySelectorAll<HTMLAnchorElement>(SELECTORS.itemLink)) {
    if (isOwnNode(link) || link.closest(`[${ROLENS_ATTR}]`)) continue;
    const id = catalogIdFromHref(link.getAttribute('href') ?? '', location.href);
    if (id === null) continue;
    const card = link.closest(SELECTORS.card) ?? link;
    if (!cards.has(card)) cards.set(card, id);
  }
  return cards;
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
