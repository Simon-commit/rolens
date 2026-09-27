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
- Send, accept or counter a trade, or change anything else on your Roblox account, with one exception: cancelling your own outbound trades when you ask it to (see below).
- Cancel a trade by itself. Trades are cancelled only from the outbound trade tools, after you review the exact list of trades and confirm it, one request per trade. Nothing runs on a timer or in the background.
- Call Roblox APIs with your session for anything other than reading your own trades and cancelling the outbound trades you confirm.
- Load or run code from the network.
- Collect analytics or send any data about you anywhere.

All requests to Roblox are made from [`src/content/roblox-api.ts`](src/content/roblox-api.ts).
`declineTrade()` is the only request in RoLens that changes anything, and it is only called by
[`src/content/cancel-trades.ts`](src/content/cancel-trades.ts) after confirmation. These are the only
Roblox endpoints RoLens calls:

| Endpoint                                                                | Used for                                                            | Sends your session |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------ |
| `GET trades.roblox.com/v1/trades/{inbound,outbound,completed,inactive}` | Trades list previews; pending trades for the duplicate warning      | Yes                |
| `GET trades.roblox.com/v2/trades/{id}` (or `/v1/trades/{id}`)           | The items and Robux in a trade being previewed                      | Yes                |
| `GET thumbnails.roblox.com/v1/assets`                                   | Item images in the profile inventory and trade proofs               | No                 |
| `GET thumbnails.roblox.com/v1/users/avatar-headshot`                    | Player avatars in trade proofs                                      | No                 |
| `GET inventory.roblox.com/v1/users/{you}/assets/collectibles`           | Checking which items you still own before cancelling trades         | No                 |
| `POST trades.roblox.com/v1/trades/{id}/decline`                         | Cancelling your own outbound trades that you selected and confirmed | Yes                |

The trades endpoints are called only while trade list previews, the duplicate trade warning or the outbound trade tools are turned on, and the decline endpoint only for trades you confirmed. Whether you still own an item is checked against Roblox's own inventory at that moment, never against Rolimon's scans, which can be hours old. Any change to that file should be reviewed with this list in mind.

Any change to `permissions` or `host_permissions` in `src/manifest.json` is listed in the
changelog and requires a stated justification in its pull request.

## Supported versions

Security fixes are provided for the latest release only.
