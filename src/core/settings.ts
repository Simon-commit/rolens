export type ThemePreference = 'auto' | 'light' | 'dark';

export interface Settings {
  /** Widget and popup theme. "auto" follows Roblox's theme on roblox.com and the system in the popup. */
  theme: ThemePreference;
  /**
   * Makes roblox.com dark in this browser by switching the page to Roblox's own dark
   * styles. It never touches the Roblox account's theme setting.
   */
  darkRoblox: boolean;
  /** Whether the trade analysis bar is expanded to show per-side details. */
  tradeDetails: boolean;
  /** The item page card is folded to a one-line bar. */
  itemCardCollapsed: boolean;
  /** Blurs serial numbers of Limited U items across roblox.com. */
  hideSerials: boolean;
  /** Blue and orange instead of green and red for gains and losses. */
  colorBlind: boolean;
  /** Value badges on item cards across Roblox. */
  showBadges: boolean;
  /** Totals and win/loss on the trades page. */
  showTradeTotals: boolean;
  /** Stats panel on catalog item pages. */
  showItemPanel: boolean;
  /** Inventory value on player profiles, with the full inventory on demand. */
  showProfileValue: boolean;
  /**
   * Value previews on every row of the trades list. Reads trade details from Roblox with
   * the user's own session, read-only.
   */
  showTradePreviews: boolean;
  /**
   * On the page for sending a trade, warns when a trade with the same player is still
   * pending. Reads outbound trades with the user's own session, read-only.
   */
  warnDuplicateTrades: boolean;
  /**
   * Tools above the outbound Trades list to cancel trades that offer items the user no
   * longer owns, or all outbound trades. Nothing is cancelled without confirmation.
   */
  showCancelTools: boolean;
  /** 1.2M instead of 1,234,567. */
  compactNumbers: boolean;
  /** Show USD estimates where available. */
  showUsd: boolean;
  /** Use Rolimon's values. At least one of the two sources is always on. */
  useRolimons: boolean;
  /** Fetch USD, confidence and a second value from RoUtility for items on screen. */
  useRoutility: boolean;
  /**
   * The fallback rate in USD per 1,000 value, used for USD estimates when no source
   * provides one. Defaults to $3, the prevailing market reference. Null means "don't estimate".
   */
  usdRate: number | null;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'auto',
  darkRoblox: false,
  tradeDetails: false,
  itemCardCollapsed: false,
  hideSerials: false,
  colorBlind: false,
  showBadges: true,
  showTradeTotals: true,
  showItemPanel: true,
  showProfileValue: true,
  showTradePreviews: true,
  warnDuplicateTrades: true,
  showCancelTools: true,
  compactNumbers: true,
  showUsd: true,
  useRolimons: true,
  useRoutility: true,
  usdRate: 3,
};

/** Merges stored settings over defaults, dropping unknown or mistyped keys. */
export function normaliseSettings(stored: unknown): Settings {
  const result: Settings = { ...DEFAULT_SETTINGS };
  if (typeof stored !== 'object' || stored === null) return result;
  const raw = stored as Record<string, unknown>;
  if (raw.theme === 'auto' || raw.theme === 'light' || raw.theme === 'dark') result.theme = raw.theme;
  if (typeof raw.tradeDetails === 'boolean') result.tradeDetails = raw.tradeDetails;
  if (typeof raw.itemCardCollapsed === 'boolean') result.itemCardCollapsed = raw.itemCardCollapsed;
  for (const key of [
    'showBadges',
    'showTradeTotals',
    'showItemPanel',
    'showProfileValue',
    'showTradePreviews',
    'warnDuplicateTrades',
    'showCancelTools',
    'compactNumbers',
    'showUsd',
    'useRolimons',
    'useRoutility',
    'darkRoblox',
    'hideSerials',
    'colorBlind',
  ] as const) {
    if (typeof raw[key] === 'boolean') result[key] = raw[key];
  }
  if (!result.useRolimons && !result.useRoutility) result.useRolimons = true;
  if (raw.usdRate === null) result.usdRate = null;
  else if (typeof raw.usdRate === 'number' && Number.isFinite(raw.usdRate) && raw.usdRate > 0 && raw.usdRate < 1000) {
    result.usdRate = raw.usdRate;
  }
  return result;
}
