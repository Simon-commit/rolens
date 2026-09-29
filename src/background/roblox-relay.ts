import type { TradeOffers, TradeSummaryRow } from '../content/roblox-api';

/*
 * Reading inbound trades for alerts through an open roblox.com tab. The tab's RoLens
 * content script makes the same read-only request the Trades list previews make, as
 * roblox.com itself, so it works however Chrome treats cookies on requests from the
 * extension's service worker. When no Roblox tab is open, alerts read the trades from the
 * service worker directly.
 */

const TABS_KEY = 'robloxTabs';

export type RelayRequest =
  | { type: 'rolens:relayTrades'; op: 'list' }
  | { type: 'rolens:relayTrades'; op: 'offers'; tradeId: number; partnerId: number }
  | { type: 'rolens:relayTrades'; op: 'headshot'; userId: number };

export interface RelayResponse<T> {
  data: T | null;
  /** Why Roblox did not answer, such as "HTTP 401". */
  failure: string | null;
}

export function isRelayRequest(message: unknown): message is RelayRequest {
  if (typeof message !== 'object' || message === null) return false;
  const value = message as Record<string, unknown>;
  if (value.type !== 'rolens:relayTrades') return false;
  if (value.op === 'list') return true;
  const positive = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n > 0;
  if (value.op === 'headshot') return positive(value.userId);
  return value.op === 'offers' && positive(value.tradeId) && positive(value.partnerId);
}

async function tabs(): Promise<number[]> {
  const stored = await chrome.storage.session.get(TABS_KEY).catch(() => ({}) as Record<string, unknown>);
  const list = (stored as Record<string, unknown>)[TABS_KEY];
  return Array.isArray(list) ? list.filter((id): id is number => Number.isSafeInteger(id)) : [];
}

/** Remembers a roblox.com tab whose content script said hello. */
export async function rememberTab(tabId: number): Promise<void> {
  const current = await tabs();
  if (current.includes(tabId)) return;
  await chrome.storage.session.set({ [TABS_KEY]: [tabId, ...current].slice(0, 10) }).catch(() => undefined);
}

async function forgetTab(tabId: number): Promise<void> {
  const current = await tabs();
  await chrome.storage.session.set({ [TABS_KEY]: current.filter((id) => id !== tabId) }).catch(() => undefined);
}

/**
 * Asks an open Roblox tab to make the request. Resolves undefined when no tab could, so
 * the caller can read the trades directly instead.
 */
export async function viaRobloxTab<T>(request: RelayRequest): Promise<RelayResponse<T> | undefined> {
  for (const tabId of await tabs()) {
    try {
      const response = (await chrome.tabs.sendMessage(tabId, request)) as RelayResponse<T> | undefined;
      if (response && typeof response === 'object' && 'data' in response) return response;
    } catch {
      // The tab was closed or navigated away from Roblox.
    }
    await forgetTab(tabId);
  }
  return undefined;
}

export type { TradeOffers, TradeSummaryRow };
