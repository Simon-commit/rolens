# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [Semantic Versioning](https://semver.org).

## [Unreleased]

## [0.6.1] - 2026-09-27

### Fixed

- Faces now show values again, on item pages, in trades and everywhere else. Roblox now sells classic faces as heads and bundles under new ids, which Rolimon's does not track, so RoLens matches these limiteds by their exact name. A name shared by two limiteds is never guessed.
- The item page card now appears on every limited, always directly under the creator line and above the price, including on pages that finish loading late.
- In the inventory, "Show more" appears only while items remain, whatever filter or search is applied. The rare filter is hidden when a player owns no rare items.

## [0.6.0] - 2026-09-27

### Added

- **Profile inventory.** Every Roblox profile shows a RoLens box with the player's inventory value, RAP, USD, item count and rare count, with a bar showing its most valuable holdings. Clicking the box opens the full inventory: item images, copies, value, RAP and USD for every item, with search, sorting by value, RAP or name, and a rare filter. The inventory comes from Rolimon's and shows when Rolimon's last scanned it. Private, closed and unscanned inventories are explained.
- **Trade list previews.** Each trade in the Trades list shows its net value and percentage before it is opened, with details on hover. Robux received is counted after Roblox's 30% fee.
- Settings in the popup to turn each of these off.

### Changed

- The fallback USD rate now defaults to $3 per 1,000 Robux. A rate you cleared stays cleared.

### Security

- RoLens now makes read-only requests to Roblox: item images from the public thumbnails API without cookies, and, for trade list previews, your own trades with your session. All of them are in one file, `src/content/roblox-api.ts`. SECURITY.md and PRIVACY.md describe them in full.

## [0.5.0] - 2026-09-27

A full revision of the code base and its wording, with no change to how chips sit on Roblox's pages.

### Changed

- Every explanation shown on hover now comes from one place, so markers read the same on chips, hover cards, the item page and the trade bar.
- Trends read "Rising" and "Falling" instead of Rolimon's "Raising" and "Lowering". Update times are written out ("3 minutes ago").
- USD totals in the trade bar that include figures at the fallback rate are marked as estimates, as they already were on chips.
- Source lines say "Sources" when two are shown. The copied trade summary uses the same wording as the trade bar ("You offer", "You receive").
- Percentages use a true minus sign everywhere. Rates are shown without trailing zeros.
- The popup's status badges use one vocabulary (Connected, Connecting, Ready, Paused, Unavailable, Off), and refreshing updates them too.

### Fixed

- Stats on the item page card no longer cut off long demand labels.
- A hover card or tooltip no longer stays open when its chip is redrawn under the pointer.
- New values from Rolimon's update chips in place instead of redrawing every widget on the page.
- Opening Roblox right after the browser starts no longer downloads the value table again when a saved copy exists.
- A RoUtility response in an unexpected format is reported as an error instead of hiding the item for six hours.
- Error messages spell Rolimon's correctly. The security policy's list of commitments has its heading back.

### Internal

- Removed the unused provider layer and the obsolete value-source setting. Source names and links live in `core/sources.ts`.
- Tooltips and hover cards share one floating-panel implementation; marker attributes live in `content/attrs.ts`.

## [0.4.4] - 2026-09-27

### Changed

- USD figures calculated from the fallback rate are marked as estimates (≈, neutral colour, dotted underline) and explained on hover, including the $3 per 1,000 market reference.
- Whole USD amounts are shown without decimals ($54 instead of $54.00).
- Chips for items with RAP only are a single line; their USD figure is in the hover card.

### Fixed

- Chips in the trade offer lists no longer cover Roblox's remove button.
- Chips over item tiles size to their content, so the rare marker and large full figures stay inside the chip. When full figures do not fit, the chip switches to abbreviated figures rather than overflowing.

## [0.4.3] - 2026-09-27

### Changed

- Rare items are marked with a quiet gold outline instead of an animated, multi-coloured glow. Value chips keep equal spacing on both sides when the rare marker is shown.

### Fixed

- Chips in the trade offer lists now line up with the Robux price instead of being placed inside the item name.
- Number formatting is read from Roblox's own prices, since Roblox formats numbers by account setting rather than page language.

### Internal

- Tests now run against markup from a real, sanitised Roblox trade page.

## [0.4.2] - 2026-09-27

### Fixed

- Value chips no longer change the size of Roblox's cards or rows. On the trade page they previously spilled into the next row, were cut off at the bottom of the inventory, and pushed prices out of offer rows.
  - Item tiles: the chip now floats over the top-left corner of the thumbnail, clear of serial badges and selection checkboxes.
  - Offer rows: the chip sits right-aligned beside the price, below the item name.
- Numbers follow Roblox's language, for example "4.000" and "$38,60" where Roblox shows "3.507".
- Chips for items without a value now match the others in style.

## [0.4.1] - 2026-09-27

### Changed

- Redesigned RoLens mark: a bolder lens around a rising chevron, used for the extension icon and on Roblox.
- Value chips now measure the space available and choose the cleanest position: under the item's text, or over the thumbnail in fixed-height tiles. They are no longer clipped or overlapped on the trade creation page, in either inventory or in the offer lists.
- A slightly smaller chip is used in narrow cards so it never runs edge to edge.

## [0.4.0] - 2026-09-27

### Added

- Rolimon's can now be turned off, so RoLens can run on RoUtility alone. Either source can be disabled, and at least one always remains enabled.
- GitHub mark beside the GitHub link in the popup.

### Changed

- New extension icon, matching the RoLens mark used on Roblox.
- All user-facing text, hover explanations and documentation revised for a consistent, formal tone.
- More space between the last marker and the edge of value chips.
- The shared trade summary now lists the sources used.

## [0.3.1] - 2026-09-27

### Added

- Hover explanations on every warning and tag (rare, projected RAP, sources disagree, no value data) and on the price trend.
- "Dark Roblox" option: switches roblox.com to Roblox's own dark styles in this browser only. The Roblox account setting is not changed.

### Changed

- A USD loss on the trade bar is shown in red.
- "Sources disagree" has its own icon, so it no longer looks like the fluctuating price trend.
- More space between the last marker and the edge of value chips.

## [0.3.0] - 2026-09-27

### Added

- RoUtility integration: USD estimates with confidence, RoUtility's value and copies, and its rare/projected/hyped flags, fetched per item on screen and cached for 30 minutes. New host permission: `https://routility.io/*`.
- "Sources disagree" warning on items, trades and item pages when Rolimon's and RoUtility values differ by 15% or more.
- RoUtility switch and connection status in the popup; the USD rate becomes a fallback for items RoUtility doesn't price.

## [0.2.0] - 2026-09-27

### Added

- Theme switch (Auto, Light, Dark) in the popup; widgets and the popup cross-fade between themes.
- Per-side totals next to each side's heading on the trades page.

### Changed

- The trade analysis is now a single compact bar that expands for details, and remembers whether it's open.

- Redesigned interface: value chips with hover cards, a trade analysis card with balance bar and copyable summary, a full item page card, and a new popup. Widgets use Shadow DOM, follow Roblox's theme and use the bundled Inter typeface (SIL Open Font License).
- Rare items are highlighted on item cards, chips, the item page and in trades.
- USD values: from a USD source when available (with confidence and range), otherwise from the user's own rate.
- "RAP vs value" insight on hover cards and item pages.
- Web-accessible resource: the font file only, on roblox.com, behind a per-session URL.

- Value badges on Roblox item cards, with projected-RAP warnings.
- Trade win/loss summary on the trades page.
- Stats panel on catalog item pages.
- Popup with data status, manual refresh, source choice and display settings.
- Strict Content Security Policy: extension pages may only connect to `api.rolimons.com`.
- Rolimon's as the value source. Permissions: `storage`, `https://api.rolimons.com/*`.
