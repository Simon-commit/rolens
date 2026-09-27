import type { SourceId } from './types';

export interface Settings {
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
  /**
   * The user's own trading rate in USD per 1,000 value, used for USD estimates when no
   * source provides one. Null means "don't estimate".
   */
  usdRate: number | null;
}

export const DEFAULT_SETTINGS: Settings = {
  source: 'rolimons',
  showBadges: true,
  showTradeTotals: true,
  showItemPanel: true,
  compactNumbers: true,
  showUsd: true,
  usdRate: null,
};

/** Merges stored settings over defaults, dropping unknown or mistyped keys. */
export function normaliseSettings(stored: unknown): Settings {
  const result: Settings = { ...DEFAULT_SETTINGS };
  if (typeof stored !== 'object' || stored === null) return result;
  const raw = stored as Record<string, unknown>;
  if (raw.source === 'rolimons' || raw.source === 'routility') result.source = raw.source;
  for (const key of ['showBadges', 'showTradeTotals', 'showItemPanel', 'compactNumbers', 'showUsd'] as const) {
    if (typeof raw[key] === 'boolean') result[key] = raw[key];
  }
  if (typeof raw.usdRate === 'number' && Number.isFinite(raw.usdRate) && raw.usdRate > 0 && raw.usdRate < 1000) {
    result.usdRate = raw.usdRate;
  }
  return result;
}
