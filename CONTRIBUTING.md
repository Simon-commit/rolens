# Contributing

Thanks for helping make RoLens better.

## Setup

```sh
npm install
npm run dev
```

Load `dist/` as an unpacked extension at `chrome://extensions` (Developer mode on).
After changing code, click the reload icon on the RoLens card and refresh the Roblox tab.

## Before opening a pull request

```sh
npm run check      # must pass; CI runs the same thing
npm run build && npm run test:e2e
```

- Keep changes focused; one feature or fix per pull request.
- Add or update tests in `test/` for logic changes.
- Roblox broke a feature? The fix almost always belongs in `src/content/selectors.ts`.
- Never add a permission without explaining why in the pull request.

## Ground rules for code

- Remote data is untrusted: render it with `textContent` or the `el()` helper, never HTML strings.
- Only the service worker talks to Rolimon's and RoUtility, and only `src/content/roblox-api.ts` talks to Roblox. Requests to Roblox must be read-only GET requests.
- No new runtime dependencies without discussion; the extension currently has none.

## Keeping user settings through updates

Chrome keeps an extension's storage when it updates from the Chrome Web Store, so settings are lost only if a release changes how they are stored. Settings live in `chrome.storage.sync` under `settings`, and alert destinations and filters live in `chrome.storage.local` under `alerts`. See `src/core/migrations.ts` for the full list.

- Never rename, move or restructure a stored key without adding a step to `MIGRATIONS` in `src/core/migrations.ts` that carries the old value over. Add a test in `test/migrations.test.ts` that starts from the old shape.
- Never edit a released step. Add a new one with the next version number.
- New settings need a default in `DEFAULT_SETTINGS`, so that existing installs pick it up without a migration.
- Never clear `chrome.storage.sync` or the `alerts` key. Caches such as saved trades and value snapshots may be dropped, because RoLens rebuilds them.
- Keep new permissions optional. A new required permission makes Chrome disable the extension after the update until the user accepts it.

The service worker runs the migrations each time it starts, including right after an update.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, `docs:`, `chore:`).
