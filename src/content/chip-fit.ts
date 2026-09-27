import { ANCHOR_ATTR, ROLENS_ATTR } from './attrs';
import { SELECTORS } from './selectors';

/*
 * Where a value chip goes inside a Roblox item card.
 *
 * Roblox sizes many of its cards and rows exactly (the trade page's inventory grid and
 * offer lists in particular), so adding a line of content pushes prices out of rows and
 * chips into the next row. RoLens therefore never inserts the chip into Roblox's layout
 * when the card has a thumbnail; it floats it over the card instead:
 *
 *   overlay  tiles (large thumbnail): top-left corner of the thumbnail, the one corner
 *            Roblox leaves free (serial badges sit bottom-left, checkboxes top-right)
 *   row      list rows (small thumbnail): right-aligned on the Robux price line, which
 *            is short and leaves the right side free; the item name and Roblox's
 *            remove button are never covered
 *   inline   cards without a thumbnail: in the caption
 *
 * None of these change the size of any Roblox element.
 */

export type Placement = 'inline' | 'overlay' | 'row';

const THUMBNAIL = '.item-card-thumb-container, .thumbnail-2d-container, [class*="thumbnail"], img';
/** Thumbnails at least this wide are tiles; smaller ones are list rows. */
const TILE_MIN = 64;
const ROW_INSET = 10;
/** Room kept for a row action that is hidden until hover, so has no size yet (Roblox's is 32px). */
const ROW_ACTION_FALLBACK = 32;

/**
 * Distance from the row's right edge to the chip. Rows with a remove button keep the
 * chip to its left, even while the button is hidden, so hovering never covers it.
 */
function rowInset(card: Element): number {
  const action = card.querySelector(SELECTORS.rowAction);
  if (!action) return ROW_INSET;
  const box = card.getBoundingClientRect();
  const rect = action.getBoundingClientRect();
  if (rect.width > 0) return Math.max(ROW_INSET, Math.round(box.right - rect.left) + 8);
  return ROW_INSET + ROW_ACTION_FALLBACK + 8;
}

function largestThumbnail(card: Element): { node: HTMLElement; rect: DOMRect } | null {
  let best: { node: HTMLElement; rect: DOMRect } | null = null;
  for (const match of card.querySelectorAll<HTMLElement>(THUMBNAIL)) {
    if (match.closest(`[${ROLENS_ATTR}]`)) continue;
    const node = match instanceof HTMLImageElement ? match.parentElement : match;
    if (!node || !card.contains(node)) continue;
    const rect = node.getBoundingClientRect();
    if (!best || rect.width * rect.height > best.rect.width * best.rect.height) best = { node, rect };
  }
  return best && best.rect.width > 0 ? best : null;
}

/**
 * Makes `target` the box the chip is positioned in. Roblox's own positioning is left
 * alone; only an unpositioned (static) element is made relative, which changes no size.
 */
function makeAnchor(target: HTMLElement): void {
  if (target.hasAttribute(ANCHOR_ATTR)) return;
  if (getComputedStyle(target).position === 'static') {
    target.style.setProperty('position', 'relative');
    target.setAttribute(ANCHOR_ATTR, 'set');
  } else {
    target.setAttribute(ANCHOR_ATTR, '');
  }
}

/** Undoes makeAnchor, for when RoLens removes its chips. */
export function releaseAnchor(target: HTMLElement): void {
  if (target.getAttribute(ANCHOR_ATTR) === 'set') target.style.removeProperty('position');
  target.removeAttribute(ANCHOR_ATTR);
}

function anchor(host: HTMLElement, placement: Placement, target: HTMLElement): void {
  if (placement !== 'inline') makeAnchor(target);
  host.dataset.placement = placement;
  host.style.removeProperty('top');
  if (host.parentElement !== target) target.append(host);
}

/**
 * Vertically places a row chip on the price line, or below the item name when there is no
 * price, or centred as a last resort.
 */
function positionInRow(host: HTMLElement, card: Element, caption: Element | null, price: Element | null): void {
  const box = card.getBoundingClientRect();
  const height = host.getBoundingClientRect().height || 22;
  const line = price?.getBoundingClientRect();
  if (line && line.height > 0) {
    const top = line.top - box.top + line.height / 2 - height / 2;
    host.style.top = `${Math.round(Math.min(Math.max(0, top), box.height - height))}px`;
    return;
  }
  const nameBottom = caption ? caption.getBoundingClientRect().bottom - box.top : 0;
  let top = nameBottom + (box.height - nameBottom - height) / 2;
  if (!caption || top < nameBottom || top + height > box.height - 2) top = (box.height - height) / 2;
  host.style.top = `${Math.max(0, Math.round(top))}px`;
}

/** The selection check Roblox adds to the top-right of a tile once it is in the offer. */
const TILE_CHECK = '.item-card-equipped';
/** Gap between a tile's edge and its chip; matches the overlay's top and left in content.css. */
const TILE_INSET = 6;

/**
 * The widest the chip may be once placed: over a tile, the thumbnail less its insets and
 * any selection check; in a row, the space between the price and the right edge (or the
 * remove button). Inline chips wrap with the caption, so have no limit.
 */
export function roomFor(host: HTMLElement, card: Element, price: Element | null = null): number {
  const target = host.parentElement;
  if (!target) return Infinity;
  if (host.dataset.placement === 'overlay') {
    const check = target.querySelector(TILE_CHECK)?.getBoundingClientRect().width ?? 0;
    return target.getBoundingClientRect().width - TILE_INSET * 2 - (check > 0 ? check + TILE_INSET : 0);
  }
  if (host.dataset.placement === 'row') {
    const box = card.getBoundingClientRect();
    const right = box.right - (parseFloat(host.style.right) || ROW_INSET);
    const priceEnd = price?.getBoundingClientRect().right ?? 0;
    const start = priceEnd > 0 ? priceEnd : (largestThumbnail(card)?.rect.right ?? box.left);
    return right - start - 8;
  }
  return Infinity;
}

/**
 * Places `host` in `card`. Returns false when the card isn't laid out yet (hidden or
 * virtualised), so the caller can try again on a later scan.
 */
export function fitChip(
  host: HTMLElement,
  card: Element,
  caption: Element | null,
  price: Element | null = null,
): boolean {
  const box = card.getBoundingClientRect();
  if (box.width === 0 && box.height === 0) return false;

  const thumbnail = largestThumbnail(card);
  if (thumbnail && thumbnail.rect.width >= TILE_MIN) {
    anchor(host, 'overlay', thumbnail.node);
    return true;
  }
  if (thumbnail && card instanceof HTMLElement) {
    anchor(host, 'row', card);
    host.style.right = `${rowInset(card)}px`;
    positionInRow(host, card, caption, price);
    return true;
  }
  const inline = caption ?? card;
  host.dataset.placement = 'inline';
  if (host.parentElement !== inline) inline.append(host);
  return true;
}
