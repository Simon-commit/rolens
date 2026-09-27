# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [Semantic Versioning](https://semver.org).

## [Unreleased]

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
