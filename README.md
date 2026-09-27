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

- **Value badges** on item cards across Roblox: value, RAP, and a warning when an item's RAP is projected.
- **Trade win/loss** on the trades page: total value and RAP for each side, the difference, and the percentage.
- **Item stats panel** on catalog pages: value, RAP, demand and trend, with a link to the item on Rolimon's.
- **Light and dark themes** that follow Roblox's own theme.
- **Settings** to turn each feature on or off and switch between compact (1.2M) and full numbers.

RoUtility support is planned; see [Data sources](#data-sources).

## Safety

| Promise                   | How it is enforced                                                                                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No account access         | RoLens never reads cookies, never calls Roblox APIs, and has no `cookies` permission.                                                                                 |
| Minimal permissions       | Only `storage`, plus network access to `api.rolimons.com`. See [`src/manifest.json`](src/manifest.json).                                                              |
| Can't phone home          | A strict Content Security Policy lets extension pages connect only to `api.rolimons.com`.                                                                             |
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
