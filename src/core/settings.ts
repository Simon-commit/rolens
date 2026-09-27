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
}

export const DEFAULT_SETTINGS: Settings = {
  source: 'rolimons',
  showBadges: true,
  showTradeTotals: true,
  showItemPanel: true,
  compactNumbers: true,
};

/** Merges stored settings over defaults, dropping unknown or mistyped keys. */
export function normaliseSettings(stored: unknown): Settings {
  const result: Settings = { ...DEFAULT_SETTINGS };
  if (typeof stored !== 'object' || stored === null) return result;
  const raw = stored as Record<string, unknown>;
  if (raw.source === 'rolimons' || raw.source === 'routility') result.source = raw.source;
  for (const key of ['showBadges', 'showTradeTotals', 'showItemPanel', 'compactNumbers'] as const) {
    if (typeof raw[key] === 'boolean') result[key] = raw[key];
  }
  return result;
}
