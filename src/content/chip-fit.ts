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
 *   row      list rows (small thumbnail): right-aligned in the row, in the free space
 *            beside the price, below the item name
 *   inline   cards without a thumbnail: in the caption, as before
 *
 * None of these change the size of any Roblox element.
 */

export type Placement = 'inline' | 'overlay' | 'row';

/** Set on the element a chip floats over, so content.css can make it a positioning context. */
export const ANCHOR_ATTR = 'data-rolens-anchor';

const THUMBNAIL = '.item-card-thumb-container, .thumbnail-2d-container, [class*="thumbnail"], img';
/** Thumbnails at least this wide are tiles; smaller ones are list rows. */
const TILE_MIN = 64;
const ROW_INSET = 10;

function largestThumbnail(card: Element): { node: HTMLElement; rect: DOMRect } | null {
  let best: { node: HTMLElement; rect: DOMRect } | null = null;
  for (const match of card.querySelectorAll<HTMLElement>(THUMBNAIL)) {
    if (match.closest('[data-rolens]')) continue;
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

/** Vertically places a row chip below the item name, or centred when there's no room. */
function positionInRow(host: HTMLElement, card: Element, caption: Element | null): void {
  const box = card.getBoundingClientRect();
  const height = host.getBoundingClientRect().height || 22;
  const nameBottom = caption ? caption.getBoundingClientRect().bottom - box.top : 0;
  let top = nameBottom + (box.height - nameBottom - height) / 2;
  if (!caption || top < nameBottom || top + height > box.height - 2) top = (box.height - height) / 2;
  host.style.top = `${Math.max(0, Math.round(top))}px`;
}

/**
 * Places `host` in `card`. Returns false when the card isn't laid out yet (hidden or
 * virtualised), so the caller can try again on a later scan.
 */
export function fitChip(host: HTMLElement, card: Element, caption: Element | null): boolean {
  const box = card.getBoundingClientRect();
  if (box.width === 0 && box.height === 0) return false;

  const thumbnail = largestThumbnail(card);
  if (thumbnail && thumbnail.rect.width >= TILE_MIN) {
    anchor(host, 'overlay', thumbnail.node);
    return true;
  }
  if (thumbnail && card instanceof HTMLElement) {
    anchor(host, 'row', card);
    host.style.right = `${ROW_INSET}px`;
    positionInRow(host, card, caption);
    return true;
  }
  const inline = caption ?? card;
  host.dataset.placement = 'inline';
  if (host.parentElement !== inline) inline.append(host);
  return true;
}
