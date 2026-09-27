/**
 * Every Roblox DOM assumption lives here, so a Roblox redesign is a one-file fix.
 * Selectors are deliberately loose: RoLens only decorates items it has values for,
 * so a broad match can't produce false badges.
 */
export const SELECTORS = {
  /** Links that identify an item. The id is read from the href. */
  itemLink: 'a[href*="/catalog/"]',
  /** The card that owns an item link; one badge per card. */
  card: '.item-card-container, .item-card, .list-item, li',
  /** Where the badge goes inside a card, when present. */
  cardCaption: '.item-card-caption, .item-card-name-link, .item-card-name',
  /** One side of a trade on the trades page. */
  tradeOffer: '.trade-list-detail-offer',
  tradeOfferHeader: '.trade-list-detail-offer-header, h3',
  /** Title on a catalog item page. */
  itemPageTitle: '#item-container h1, .item-details-name-row h1, h1',
  /** The title's row; the stats card goes after it so it sits under any subtitle. */
  itemPageTitleRow: '.item-details-name-row, .item-name-container',
} as const;

const CATALOG_PATH = /^\/catalog\/(\d+)(?:\/|$)/;

/** Extracts a catalog item id from an absolute or relative Roblox URL. */
export function catalogIdFromHref(href: string, base = 'https://www.roblox.com/'): number | null {
  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    return null;
  }
  if (!/(^|\.)roblox\.com$/.test(url.hostname)) return null;
  const match = CATALOG_PATH.exec(url.pathname);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function catalogIdFromPath(pathname: string): number | null {
  const match = CATALOG_PATH.exec(pathname);
  return match ? Number(match[1]) : null;
}
