<p align="center">
  <img src="src/icons/icon-128.png" width="96" height="96" alt="RoLens logo">
</p>

<h1 align="center">RoLens</h1>

<p align="center">
  Roblox trade values, right where you trade. Open source, private by design.
</p>

<p align="center">
  <a href="https://github.com/Simon-commit/rolens/actions/workflows/ci.yml"><img src="https://github.com/Simon-commit/rolens/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-0b7a5f" alt="MIT license"></a>
</p>

---

RoLens is a Chrome extension for Roblox limited traders. It shows community values from
[Rolimon's](https://www.rolimons.com) on the Roblox site itself, so you can judge a trade
without switching tabs.

It is built to be the extension you can install without worrying: it never touches your
Roblox account, asks for the smallest set of permissions possible, and every line that
ships is in this repository.

## Features

- **Value chips** on every limited across Roblox: value, USD, and markers for rare and projected items. Hover or focus a chip for a full card with RAP, demand, trend and how RAP compares with value.
- **Trade analysis** on the trades page in one compact line: win/loss verdict with percentage, net value, RAP and USD difference, warnings, a balance strip and a one-click summary for Discord. Expand it for per-side detail; each side's heading also shows its total.
- **Item page card** on catalog pages: value, USD with confidence, RAP, demand meter, trend, rare and hyped tags, and a link to the item on Rolimon's.
- **Rare items stand out**: an iridescent outline on the item's card and a rare marker on its chip.
- **USD values from RoUtility** with a confidence meter, plus RoUtility's own value beside Rolimon's and a **"sources disagree"** warning when they differ by 15% or more. Items RoUtility doesn't price can use your own fallback rate.
- **Light and dark themes** with a smooth cross-fade: follow Roblox automatically, or pick one in the popup.
- **Dark Roblox**: an optional switch that makes roblox.com itself dark in your browser, without changing your Roblox account settings.
- **Hover explanations** on every warning, tag and price trend.
- **Designed to fit Roblox**: uses a bundled Inter typeface, respects reduced motion, and is keyboard accessible. Every widget is isolated in Shadow DOM, so it can't break Roblox's layout.

## Safety

| Promise                   | How it is enforced                                                                                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No account access         | RoLens never reads cookies, never calls Roblox APIs, and has no `cookies` permission.                                                                                 |
| Minimal permissions       | Only `storage`, plus network access to `api.rolimons.com`. See [`src/manifest.json`](src/manifest.json).                                                              |
| Can't phone home          | A strict Content Security Policy lets extension pages connect only to `api.rolimons.com` and `routility.io`.                                                          |
| No remote code            | Manifest V3 forbids it, and the build ships unminified bundles you can read.                                                                                          |
| No markup injection       | Remote data is only ever written with `textContent`. Lint rules ban `innerHTML`, `eval` and friends ([`eslint.config.js`](eslint.config.js)), and a test checks this. |
| No analytics, no tracking | There is no telemetry code. See [PRIVACY.md](PRIVACY.md).                                                                                                             |
| Builds you can verify     | Releases are built by GitHub Actions from a tagged commit ([`release.yml`](.github/workflows/release.yml)).                                                           |

Found a problem? See [SECURITY.md](SECURITY.md).

## Install

RoLens is not on the Chrome Web Store yet. To install from source:

1. Download the latest `rolens-<version>.zip` from [Releases](https://github.com/Simon-commit/rolens/releases) and unzip it, or build it yourself (below).
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and pick the unzipped folder (or `dist/`).

## Development

Requires Node.js 22+.

```sh
npm install
npm run build        # bundle into dist/
npm run dev          # rebuild on change
npm run check        # typecheck, lint, format check, unit tests
npm run test:e2e     # load dist/ into Chromium against fake Roblox pages
npm run package      # build and zip for release
```

### How it works

```
src/
  background/   service worker: fetches and caches values (the only code with network access)
  content/      runs on roblox.com: finds item cards and trades, renders badges and summaries
  popup/        toolbar popup: data status, source and display settings
  providers/    one file per value source (Rolimon's, RoUtility)
  core/         pure logic shared by all of the above, fully unit tested
```

The content script never talks to the network. It asks the service worker for the items it
sees on the page; the worker answers from a cached copy of the value table and refreshes it
at most once every 10 minutes (and never more than once a minute, per Rolimon's rate limit).
RoUtility data is fetched per item, only for items on screen, at most three at a time, cached
for 30 minutes, and paused for five minutes if RoUtility rate-limits or blocks a request.

Every assumption about Roblox's page structure lives in
[`src/content/selectors.ts`](src/content/selectors.ts), so a Roblox redesign is a one-file fix.

## Data sources

| Source                                | Status    | Notes                                                                            |
| ------------------------------------- | --------- | -------------------------------------------------------------------------------- |
| [Rolimon's](https://www.rolimons.com) | Supported | Public item details API. Values, RAP, demand, trend, projected/hyped/rare flags. |
| [RoUtility](https://routility.io)     | Planned   | No public API yet. The provider slot exists in `src/providers/routility.ts`.     |

Values are community estimates, not prices. The market moves fast; always use your own judgement.

## Roadmap

- Live totals on the trade creation page as you add items
- Robux in trades, counted after Roblox's 30% fee
- Total inventory value on profiles
- RoUtility as a second source, and showing both side by side
- Firefox support

Ideas and bug reports are welcome in [Issues](https://github.com/Simon-commit/rolens/issues).

## License

[MIT](LICENSE). RoLens is not affiliated with Roblox Corporation, Rolimon's or RoUtility.
