/*
 * Roblox lays item cards out differently on each page: roomy catalog cards, fixed-height
 * inventory tiles on the trade page, and single-line offer rows. Rather than guess each
 * layout, RoLens places a chip, measures it, and moves it to the next placement if it is
 * clipped or spills out of its card:
 *
 *   1. inline, in the card's caption (the default), when it lands on a line of its own
 *   2. on its own line under the caption's text column (offer rows)
 *   3. over the item's thumbnail, stacked compactly (fixed-height tiles)
 */

export type Placement = 'inline' | 'below' | 'overlay';

/** Set on a thumbnail RoLens overlays, so content.css can make it a positioning context. */
export const ANCHOR_ATTR = 'data-rolens-anchor';

const THUMBNAIL = '.item-card-thumb-container, .thumbnail-2d-container, [class*="thumbnail"], img';
const TOLERANCE = 1;

function inside(inner: DOMRect, outer: DOMRect): boolean {
  return (
    inner.left >= outer.left - TOLERANCE &&
    inner.right <= outer.right + TOLERANCE &&
    inner.top >= outer.top - TOLERANCE &&
    inner.bottom <= outer.bottom + TOLERANCE
  );
}

function clips(node: Element): boolean {
  const style = getComputedStyle(node);
  return [style.overflow, style.overflowX, style.overflowY].some((value) => value !== '' && value !== 'visible');
}

/** Chips narrower than their card by less than this switch to the compact size. */
const COMPACT_MARGIN = 12;

/** True when the chip is fully visible within its card and every clipping box up to it. */
export function fits(host: HTMLElement, card: Element): boolean {
  const rect = host.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  if (!inside(rect, card.getBoundingClientRect())) return false;
  for (let node = host.parentElement; node && node !== card; node = node.parentElement) {
    if (clips(node) && !inside(rect, node.getBoundingClientRect())) return false;
  }
  return true;
}

function thumbnailOf(card: Element): HTMLElement | null {
  const match = card.querySelector<HTMLElement>(THUMBNAIL);
  if (!match) return null;
  return match instanceof HTMLImageElement ? match.parentElement : match;
}

function place(host: HTMLElement, placement: Placement, target: Element): void {
  host.dataset.placement = placement;
  target.append(host);
}

/** An inline chip should start its own line, not trail the item name. */
function onOwnLine(host: HTMLElement, container: Element): boolean {
  return Math.abs(host.getBoundingClientRect().left - container.getBoundingClientRect().left) <= 4;
}

/** Uses the smaller chip when the regular one would run edge to edge in a narrow card. */
function sizeFor(host: HTMLElement, card: Element): void {
  delete host.dataset.size;
  if (host.getBoundingClientRect().width > card.getBoundingClientRect().width - COMPACT_MARGIN) {
    host.dataset.size = 'compact';
  }
}

/**
 * Moves `host` into the first placement where it fits. Returns false when the card isn't
 * laid out yet (hidden or virtualised), so the caller can try again on a later scan.
 */
export function fitChip(host: HTMLElement, card: Element, caption: Element | null): boolean {
  const box = card.getBoundingClientRect();
  if (box.width === 0 && box.height === 0) return false;

  const inline = caption ?? card;
  if (host.parentElement !== inline) place(host, 'inline', inline);
  else host.dataset.placement = 'inline';
  sizeFor(host, card);
  if (fits(host, card) && onOwnLine(host, inline)) return true;

  const column = caption?.parentElement;
  if (column && column !== card && card.contains(column)) {
    place(host, 'below', column);
    sizeFor(host, card);
    if (fits(host, card)) return true;
  }
  delete host.dataset.size;

  const thumbnail = thumbnailOf(card);
  if (thumbnail) {
    thumbnail.setAttribute(ANCHOR_ATTR, '');
    place(host, 'overlay', thumbnail);
    return true;
  }

  // Nothing better available: keep it under the card's text rather than hide it.
  place(host, 'below', column && card.contains(column) ? column : card);
  return true;
}
