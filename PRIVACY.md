# Privacy

RoLens collects nothing.

- **Network:** RoLens makes two kinds of request, neither carrying cookies:
  - `https://api.rolimons.com`: the public item value table. It contains nothing about you.
  - `https://routility.io`: details for individual items shown on the page you're viewing
    (only the item id is sent). This means RoUtility can see which limited items you look at,
    though not who you are. Turn RoUtility off in the popup to stop these requests.
- **Storage:** the value table and your settings are stored locally in your browser with
  `chrome.storage`. Settings may sync between your own Chrome profiles via Chrome Sync.
- **Roblox pages:** RoLens reads item links on roblox.com pages to know which values to show.
  That information never leaves your browser.
- **Fonts:** RoLens ships its own copy of the Inter typeface and loads it from the extension
  through a per-session URL, so websites can't use it to detect that RoLens is installed.
- **No analytics, ads or tracking** of any kind.
