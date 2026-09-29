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
- Send data about you anywhere, with one exception you set up yourself: inbound trade alerts, sent only to the Discord webhook or ntfy topic you entered, containing only the trade partner's username and display name, the items with their values, the Robux and the totals, and for Discord the partner's avatar image from Roblox's image servers.
- Load or run code from the network.
- Collect analytics.

All requests to Roblox are made from [`src/content/roblox-api.ts`](src/content/roblox-api.ts).
`declineTrade()` is the only request in RoLens that changes anything, and it is only called by
[`src/content/cancel-trades.ts`](src/content/cancel-trades.ts) after confirmation. These are the only
Roblox endpoints RoLens calls:

| Endpoint                                                                | Used for                                                                       | Sends your session |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------ |
| `GET trades.roblox.com/v1/trades/{inbound,outbound,completed,inactive}` | Trades list previews, the duplicate warning, outbound tools and inbound alerts | Yes                |
| `GET trades.roblox.com/v2/trades/{id}` (or `/v1/trades/{id}`)           | The items and Robux in a trade being previewed                                 | Yes                |
| `GET thumbnails.roblox.com/v1/assets`                                   | Item images in the profile inventory and trade proofs                          | No                 |
| `GET thumbnails.roblox.com/v1/users/avatar-headshot`                    | Player avatars in trade proofs and Discord alerts                              | No                 |
| `GET inventory.roblox.com/v1/users/{you}/assets/collectibles`           | Checking which items you still own before cancelling trades                    | No                 |
| `POST trades.roblox.com/v1/trades/{id}/decline`                         | Cancelling your own outbound trades that you selected and confirmed            | Yes                |

The trades endpoints are called only while trade list previews, the duplicate trade warning, the outbound trade tools or inbound trade alerts are turned on, and the decline endpoint only for trades you confirmed. Whether you still own an item is checked against Roblox's own inventory at that moment, never against Rolimon's scans, which can be hours old. Any change to that file should be reviewed with this list in mind.

Inbound trade alerts run in the service worker ([`src/background/inbound-alerts.ts`](src/background/inbound-alerts.ts))
and read the first page of your inbound trades about once a minute, read-only. When a Roblox tab is open, the service
worker asks that tab's RoLens content script to make the same two read-only requests
([`src/content/alerts-relay.ts`](src/content/alerts-relay.ts)); the content script answers only RoLens's own service
worker. Without a Roblox tab, the service worker makes them itself. They use optional permissions that are
requested only when you turn on each part and removed when you turn it off:

| Permission                              | Requested when you                     | Used for                                            |
| --------------------------------------- | -------------------------------------- | --------------------------------------------------- |
| `alarms`, `https://trades.roblox.com/*` | Turn on inbound trade alerts           | Checking your inbound trades about once a minute    |
| `notifications`                         | Turn on notifications on this computer | Showing the alert as a Chrome notification          |
| `https://discord.com/*`                 | Save a Discord webhook                 | Posting the alert to that webhook, and nowhere else |
| `https://ntfy.sh/*`                     | Save an ntfy topic                     | Posting the alert to that topic, and nowhere else   |
| `https://www.rolimons.com/player/*`     | Turn on hold end times                 | Reading when a player received their items          |

Besides Roblox, RoLens contacts only these sites, always without cookies:

| Site                                                 | Used for                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `api.rolimons.com`                                   | The public item value table, and the inventory of a player whose profile you open                 |
| `routility.io`                                       | Details for the items on screen                                                                   |
| `www.rolimons.com/player/{id}` (optional permission) | When a player received their items, for hold end times in the window for sending a trade, when on |
| `discord.com`, `ntfy.sh` (optional permissions)      | Inbound trade alerts, only to the webhook or topic you entered                                    |

Any change to `permissions`, `optional_permissions`, `host_permissions` or `optional_host_permissions` in
`src/manifest.json` is listed in the changelog and requires a stated justification in its pull request.

## Supported versions

Security fixes are provided for the latest release only.
