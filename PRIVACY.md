# Privacy policy

RoLens does not collect, store or share any personal data.

- **Network requests to data sources.** Requests to Rolimon's and RoUtility never include cookies or any information about you.
  - `https://api.rolimons.com` provides the public item value table, and the inventory of a player whose profile you open. Only that player's user ID is sent, so Rolimon's can see which profiles are viewed, but not who is viewing them.
  - `https://routility.io` provides details for individual items shown on the page you are viewing. Only the item ID is sent. RoUtility can therefore see which limited items are viewed, but not who is viewing them.

  Either source can be disabled in the popup, which stops all requests to it.

- **Requests to Roblox.** RoLens requests item images from `thumbnails.roblox.com`, without cookies. When trade list previews are on, it reads your trade list (`trades.roblox.com/v1/trades/…`) and the trades shown on screen (`trades.roblox.com/v2/trades/{id}`, or `/v1/` where needed) as the Roblox website itself does, using your existing session. This data goes only to Roblox, stays in the open tab and is never stored or sent anywhere else. Trade list previews can be turned off in the popup.
- **Local storage.** Cached item data and your settings are stored in your browser with `chrome.storage`. Settings may synchronise between your own Chrome profiles through Chrome Sync.
- **Roblox pages.** RoLens reads item links on roblox.com to determine which values to display. This information never leaves your browser. The optional dark mode for Roblox changes the page's appearance locally and makes no requests to Roblox.
- **Fonts.** RoLens includes its own copy of the Inter typeface and loads it through a per-session URL, which prevents websites from using it to detect that RoLens is installed.
- **No analytics, advertising or tracking** of any kind.
