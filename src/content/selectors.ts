/**
 * Every Roblox DOM assumption lives here, so a Roblox redesign is a one-file fix.
 * Selectors are deliberately loose: RoLens only decorates items it has values for,
 * so a broad match can't produce false badges.
 */
export const SELECTORS = {
  /** Links that identify an item. The id is read from the href. */
  itemLink: 'a[href*="/catalog/"]',
  /** The card that owns an item link; one badge per card. */
  card: '.trade-request-item, .item-card-container, .item-card, .list-item, li',
  /** The card's caption (name and price); used to place the chip clear of the name. */
  cardCaption: '.item-card-caption, .item-card-name-link, .item-card-name, .item-name',
  /** The remove button Roblox shows on hover at the right of each row in a trade offer. */
  rowAction: '.trade-request-item-remove, [class*="item-remove"]',
  /** Roblox's own Robux amounts, used to match its digit grouping (e.g. "14.186"). */
  robuxAmount: '.text-robux-tile, .text-robux, .text-robux-lg',
  /** One side of a trade on the trades page. */
  tradeOffer: '.trade-list-detail-offer',
  tradeOfferHeader: '.trade-list-detail-offer-header, h3',
  /** Title on a catalog item page. */
  itemPageTitle: '#item-container h1, .item-details-name-row h1, h1',
  /** The title's row; the stats card goes after it so it sits under any subtitle. */
  itemPageTitleRow: '.item-details-name-row, .item-name-container',
  /** One trade in the list on the Trades page (partner, status and date). */
  tradeRow: '.trade-row',
  /** The selected list on the Trades page: a tab, or the type dropdown's current option. */
  tradeListTab:
    '.trades-list-header .rbx-tab.active, .trade-type-selector .rbx-selection-label, [role="tab"][aria-selected="true"], .rbx-tab.active',
  /** Roblox's own record of the signed-in user. */
  userData: 'meta[name="user-data"]',
  /** The profile's header card; the RoLens box goes directly after it. */
  profileHeader: '.profile-header, #profile-header-container, .profile-header-container, [class*="profile-header"]',
  /** Where the box goes when no header matches: the top of the profile's content. */
  profileContainer: '.profile-container, #profile-container, .profile-platform-container, #content',
  /** The player's name in the header, display name first. */
  profileName: '.profile-display-name, .profile-name, .profile-header-title h1, .header-title h1, h1',
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

const PROFILE_PATH = /^\/users\/(\d+)\/profile\/?$/;

/** The user id of a profile page, or null on any other page. */
export function profileIdFromPath(pathname: string): number | null {
  const match = PROFILE_PATH.exec(pathname);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function catalogIdFromPath(pathname: string): number | null {
  const match = CATALOG_PATH.exec(pathname);
  return match ? Number(match[1]) : null;
}
