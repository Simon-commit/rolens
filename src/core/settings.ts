import type { SourceId } from './types';

export type ThemePreference = 'auto' | 'light' | 'dark';

export interface Settings {
  /** Widget and popup theme. "auto" follows Roblox's theme on roblox.com and the system in the popup. */
  theme: ThemePreference;
  /** Whether the trade analysis bar is expanded to show per-side details. */
  tradeDetails: boolean;
  source: SourceId;
  /** Value badges on item cards across Roblox. */
  showBadges: boolean;
  /** Totals and win/loss on the trades page. */
  showTradeTotals: boolean;
  /** Stats panel on catalog item pages. */
  showItemPanel: boolean;
  /** 1.2M instead of 1,234,567. */
  compactNumbers: boolean;
  /** Show USD estimates where available. */
  showUsd: boolean;
  /** Fetch USD, confidence and a second value from RoUtility for items on screen. */
  useRoutility: boolean;
  /**
   * The user's own trading rate in USD per 1,000 value, used for USD estimates when no
   * source provides one. Null means "don't estimate".
   */
  usdRate: number | null;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'auto',
  tradeDetails: false,
  source: 'rolimons',
  showBadges: true,
  showTradeTotals: true,
  showItemPanel: true,
  compactNumbers: true,
  showUsd: true,
  useRoutility: true,
  usdRate: null,
};

/** Merges stored settings over defaults, dropping unknown or mistyped keys. */
export function normaliseSettings(stored: unknown): Settings {
  const result: Settings = { ...DEFAULT_SETTINGS };
  if (typeof stored !== 'object' || stored === null) return result;
  const raw = stored as Record<string, unknown>;
  if (raw.source === 'rolimons' || raw.source === 'routility') result.source = raw.source;
  if (raw.theme === 'auto' || raw.theme === 'light' || raw.theme === 'dark') result.theme = raw.theme;
  if (typeof raw.tradeDetails === 'boolean') result.tradeDetails = raw.tradeDetails;
  for (const key of [
    'showBadges',
    'showTradeTotals',
    'showItemPanel',
    'compactNumbers',
    'showUsd',
    'useRoutility',
  ] as const) {
    if (typeof raw[key] === 'boolean') result[key] = raw[key];
  }
  if (typeof raw.usdRate === 'number' && Number.isFinite(raw.usdRate) && raw.usdRate > 0 && raw.usdRate < 1000) {
    result.usdRate = raw.usdRate;
  }
  return result;
}
