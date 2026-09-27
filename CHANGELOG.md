# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [Semantic Versioning](https://semver.org).

## [Unreleased]

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
