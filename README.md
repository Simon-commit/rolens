<p align="center">
  <img src="src/icons/icon-128.png" width="96" height="96" alt="RoLens logo">
</p>

<h1 align="center">RoLens</h1>

<p align="center">
  Item values and trade analysis for Roblox, directly on the Roblox website.<br>
  Open source and private by design.
</p>

<p align="center">
  <a href="https://github.com/Simon-commit/rolens/actions/workflows/ci.yml"><img src="https://github.com/Simon-commit/rolens/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-10b981" alt="MIT license"></a>
</p>

---

RoLens is a Chrome extension for Roblox limited item traders. It brings market data from
[Rolimon's](https://www.rolimons.com) and [RoUtility](https://routility.io) onto the Roblox
website, so every trade can be evaluated without leaving the page.

RoLens is designed to be safe to install. It never accesses your Roblox account, requests only
the permissions it needs, and every line of shipped code is published in this repository.

## Features

- **Value chips** on every limited item across Roblox, showing value, USD and markers for rare and projected items. Hovering or focusing a chip opens a detailed card with RAP, demand, trend and a comparison of RAP with value.
- **Trade analysis** in a single compact bar on the trades page: verdict and percentage, net value, RAP and USD difference (shown in red when negative), warnings, a balance indicator and a one-click shareable summary. The bar expands to show per-side detail, and each side's heading shows its own total.
- **Item page card** on catalog pages with value, USD and confidence, RAP, demand, trend and tags, with links to the item on each enabled source.
- **Two data sources.** Rolimon's and RoUtility can be used together or individually. With both enabled, RoLens shows RoUtility's value beside Rolimon's and flags items where the two differ by 15% or more.
- **USD estimates** from RoUtility, with confidence where RoUtility provides it. A personal rate can be set as a fallback for items without an estimate.
- **Rare item highlighting** with an iridescent outline on the item card and a marker on its chip.
- **Explanations on hover** for every warning, tag and price trend.
- **Light and dark themes** that follow Roblox automatically or can be set manually, with smooth transitions.
- **Dark mode for Roblox**, an optional setting that applies Roblox's own dark appearance to roblox.com in your browser, without changing your Roblox account settings.
- **Built to fit Roblox.** RoLens uses a bundled Inter typeface, respects reduced-motion preferences and is fully keyboard accessible. Every widget is isolated in Shadow DOM, so it cannot affect Roblox's layout.

## Security and privacy

| Commitment               | How it is enforced                                                                                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No account access        | RoLens never reads cookies, never calls Roblox APIs and does not request the `cookies` permission.                                                                                |
| Minimal permissions      | `storage`, plus network access to `api.rolimons.com` and `routility.io` only. See [`src/manifest.json`](src/manifest.json).                                                       |
| No other network access  | A strict Content Security Policy limits extension pages to `api.rolimons.com` and `routility.io`. Only the background service worker makes requests, and it never sends cookies.  |
| No remote code           | Manifest V3 prohibits remotely hosted code, and the build ships unminified bundles that can be reviewed directly.                                                                 |
| No markup injection      | Remote data is only ever written with `textContent`. Lint rules prohibit `innerHTML`, `eval` and similar APIs ([`eslint.config.js`](eslint.config.js)), and a test verifies this. |
| No analytics or tracking | RoLens contains no telemetry. See [PRIVACY.md](PRIVACY.md).                                                                                                                       |
| Verifiable builds        | Releases are built by GitHub Actions from a tagged commit ([`release.yml`](.github/workflows/release.yml)).                                                                       |

To report a vulnerability, please see [SECURITY.md](SECURITY.md).

## Installation

RoLens is not yet available on the Chrome Web Store. To install it manually:

1. Download the latest `rolens-<version>.zip` from [Releases](https://github.com/Simon-commit/rolens/releases) and unzip it, or build it from source as described below.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Select **Load unpacked** and choose the unzipped folder (or `dist/`).

Chrome marks extensions installed this way with a small badge on their icon. The badge disappears once RoLens is installed from the Chrome Web Store.

## Development

Requires Node.js 22 or later.

```sh
npm install
npm run build        # bundle into dist/
npm run dev          # rebuild on change
npm run check        # typecheck, lint, format check and unit tests
npm run test:e2e     # load dist/ into Chromium against simulated Roblox pages
npm run package      # build and create a release zip
```

### Architecture

```
src/
  background/   service worker: fetches and caches data (the only code with network access)
  content/      runs on roblox.com: finds item cards and trades, and renders RoLens widgets
  popup/        toolbar popup: data status, sources and display settings
  providers/    one module per value source
  core/         shared logic, fully unit tested
```

Content scripts never access the network. They request data for the items on the page from the
service worker, which responds from a local cache.

- **Rolimon's:** the full value table is refreshed at most every 10 minutes, and never more than once per minute, in line with Rolimon's rate limit.
- **RoUtility:** data is requested per item, only for items on screen, with at most three requests at a time. Results are cached for 30 minutes. Requests pause for five minutes if RoUtility limits or declines them.

All assumptions about Roblox's page structure are kept in
[`src/content/selectors.ts`](src/content/selectors.ts), so a change to the Roblox website
requires changes to a single file.

## Data sources

| Source                                | Provides                                                                       | Notes                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| [Rolimon's](https://www.rolimons.com) | Values, RAP, demand, trend, and projected, hyped and rare flags                | Public item details API.                                                                      |
| [RoUtility](https://routility.io)     | USD estimates, confidence, an independent value, copies, RAP, demand and trend | Per-item endpoint used by RoUtility's own website. It is not a documented API and may change. |

Either source can be disabled in the popup, and at least one always remains enabled. Values are
community estimates, not guaranteed prices. The market can move quickly, so please use your own
judgement when trading.

## Roadmap

- Live totals on the trade creation page as items are added
- Robux in trades, counted after Roblox's 30% fee
- Total inventory value on profiles
- Firefox support

Suggestions and bug reports are welcome in [Issues](https://github.com/Simon-commit/rolens/issues).

## License

Released under the [MIT License](LICENSE). RoLens is not affiliated with Roblox Corporation,
Rolimon's or RoUtility.
