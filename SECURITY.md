# Security policy

RoLens is built to be an extension people can trust, and security reports are treated as the highest priority.

## Reporting a vulnerability

Please report vulnerabilities privately through [GitHub security advisories](https://github.com/Simon-commit/rolens/security/advisories/new).
Do not open a public issue for security problems.

Please include a description of the issue, steps to reproduce it and the version number (shown at `chrome://extensions`).
You can expect a response within a few days.

## Commitments

RoLens will never:

- Read Roblox cookies or session tokens.
- Change anything on your Roblox account. RoLens makes read-only requests to Roblox and never sends, accepts, declines or counters a trade.
- Call Roblox APIs with your session for anything other than reading your own trades for the optional trade list previews.
- Load or run code from the network.
- Collect analytics or send any data about you anywhere.

All requests to Roblox are made from [`src/content/roblox-api.ts`](src/content/roblox-api.ts), which
contains only GET requests. These are the only Roblox endpoints it calls:

| Endpoint                                                                | Used for                                          | Sends your session |
| ----------------------------------------------------------------------- | ------------------------------------------------- | ------------------ |
| `GET trades.roblox.com/v1/trades/{inbound,outbound,completed,inactive}` | Matching each row in the Trades list to its trade | Yes                |
| `GET trades.roblox.com/v2/trades/{id}` (or `/v1/trades/{id}`)           | The items and Robux in a trade shown in the list  | Yes                |
| `GET thumbnails.roblox.com/v1/assets`                                   | Item images in the profile inventory              | No                 |

The two trades endpoints are called only while trade list previews are turned on. Any change to that file should be reviewed with this list in mind.

Any change to `permissions` or `host_permissions` in `src/manifest.json` is listed in the
changelog and requires a stated justification in its pull request.

## Supported versions

Security fixes are provided for the latest release only.
