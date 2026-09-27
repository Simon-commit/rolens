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
- Only the service worker talks to the network.
- No new runtime dependencies without discussion; the extension currently has none.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, `docs:`, `chore:`).
