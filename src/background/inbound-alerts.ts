import {
  ALERT_ALARM,
  ALERT_MAX_PER_CHECK,
  ALERT_PERIOD_MINUTES,
  ALERT_STATE_KEY,
  ALERTS_KEY,
  DISCORD_ORIGIN,
  NTFY_ORIGIN,
  ROBLOX_TRADES_ORIGIN,
  TRADES_URL,
  alertText,
  discordPayload,
  normaliseAlerts,
  ntfyRequest,
  shouldAlert,
  type AlertItem,
  type AlertSettings,
  type TradeAlert,
} from '../core/alerts';
import { setNumberSeparators } from '../core/format';
import { balanceTrade, totalSide } from '../core/trade';
import { effectiveValue, type ItemValue } from '../core/types';
import {
  fetchTradeList,
  fetchTradeOffersWith,
  lastTradeFailure,
  tradesPaused,
  type TradeOffers,
  type TradeSide,
  type TradeSummaryRow,
} from '../content/roblox-api';
import { ROBUX_AFTER_FEE } from '../content/trade-values';

/*
 * Inbound trade alerts, run by the service worker while Chrome is open and alerts are on.
 * About once a minute it reads the first page of the user's inbound trades from Roblox
 * (read-only, with the user's session, through the optional trades.roblox.com permission),
 * reads any new trade's items, values it and, when it passes the user's filters, sends an
 * alert to the destinations the user set up. Trades that were already there when alerts
 * were turned on never alert. Nothing else is sent anywhere.
 */

export interface AlertState {
  /** The Roblox account the seen trades belong to. */
  userId: number | null;
  /** Inbound trade ids already handled, newest first. */
  seen: number[];
  primed: boolean;
  lastCheck: number | null;
  lastAlert: number | null;
  lastError: string | null;
  lastResult?: CheckResult;
}

const EMPTY_STATE: AlertState = {
  userId: null,
  seen: [],
  primed: false,
  lastCheck: null,
  lastAlert: null,
  lastError: null,
};
const MAX_SEEN = 300;

export interface AlertValues {
  /** Values for the given ids, with names matched for ids no source tracks. */
  lookup(ids: number[], names: string[]): Promise<Map<number, ItemValue>>;
  sources(): Promise<string>;
}

export async function readAlerts(): Promise<AlertSettings> {
  const stored = await chrome.storage.local.get(ALERTS_KEY);
  return normaliseAlerts(stored[ALERTS_KEY]);
}

export async function readAlertState(): Promise<AlertState> {
  const stored = await chrome.storage.local.get(ALERT_STATE_KEY);
  const raw = stored[ALERT_STATE_KEY] as Partial<AlertState> | undefined;
  return {
    ...EMPTY_STATE,
    ...(raw ?? {}),
    seen: Array.isArray(raw?.seen) ? raw.seen.filter(Number.isSafeInteger) : [],
  };
}

async function saveState(state: AlertState): Promise<void> {
  await chrome.storage.local.set({ [ALERT_STATE_KEY]: { ...state, seen: state.seen.slice(0, MAX_SEEN) } });
}

const hasOrigins = (origins: string[]) => chrome.permissions.contains({ origins }).catch(() => false);
const hasPermission = (permission: 'alarms' | 'notifications') =>
  chrome.permissions.contains({ permissions: [permission] }).catch(() => false);

/** Whether Chrome lets RoLens show notifications; macOS settings are not visible to extensions. */
const notificationLevel = () =>
  new Promise<string>((resolve) => {
    try {
      chrome.notifications.getPermissionLevel((level) => resolve(level));
    } catch {
      resolve('granted');
    }
  });

/** Starts or stops the minute check to match the settings and granted permissions. */
export async function syncAlertSchedule(): Promise<void> {
  const settings = await readAlerts();
  const allowed = (await hasPermission('alarms')) && (await hasOrigins([ROBLOX_TRADES_ORIGIN]));
  if (!chrome.alarms) return;
  if (settings.enabled && allowed) {
    const existing = await chrome.alarms.get(ALERT_ALARM);
    if (!existing)
      await chrome.alarms.create(ALERT_ALARM, { periodInMinutes: ALERT_PERIOD_MINUTES, delayInMinutes: 0.1 });
  } else {
    await chrome.alarms.clear(ALERT_ALARM);
  }
}

function alertItems(side: TradeSide, values: Map<number, ItemValue>): AlertItem[] {
  return side.itemIds.map((id, i) => {
    const item = values.get(id);
    return {
      name: item?.name ?? side.names[i] ?? '',
      value: item ? effectiveValue(item) : null,
      rare: item?.rare ?? false,
    };
  });
}

/** Values one inbound trade into the alert that describes it. */
export function buildAlert(
  tradeId: number,
  partner: { name: string; displayName: string },
  offers: { give: TradeSide; receive: TradeSide },
  values: Map<number, ItemValue>,
  sources: string,
): TradeAlert {
  const find = (id: number) => values.get(id);
  const give = totalSide(offers.give.itemIds, find);
  const receive = totalSide(offers.receive.itemIds, find);
  const balance = balanceTrade(
    { ...give, value: give.value + offers.give.robux, rap: give.rap + offers.give.robux },
    {
      ...receive,
      value: receive.value + Math.floor(offers.receive.robux * ROBUX_AFTER_FEE),
      rap: receive.rap + Math.floor(offers.receive.robux * ROBUX_AFTER_FEE),
    },
  );
  return {
    tradeId,
    partner,
    give: { items: alertItems(offers.give, values), robux: offers.give.robux, value: balance.give.value },
    receive: { items: alertItems(offers.receive, values), robux: offers.receive.robux, value: balance.receive.value },
    net: balance.valueDelta,
    rapDelta: balance.rapDelta,
    unvalued: give.unknownIds.length + receive.unknownIds.length,
    sources,
  };
}

/** Sends one alert to every destination that is set up and allowed. Returns the failures. */
export async function deliver(alert: TradeAlert, settings: AlertSettings): Promise<string[]> {
  const failures: string[] = [];
  const { title, body } = alertText(alert);
  if (settings.desktop && !(await hasPermission('notifications'))) {
    failures.push('Chrome notification (permission not granted)');
  } else if (settings.desktop && (await notificationLevel()) === 'denied') {
    failures.push('Chrome notification (blocked in Chrome)');
  } else if (settings.desktop) {
    try {
      await chrome.notifications.create(`rolens-trade-${alert.tradeId}-${Date.now()}`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
        title,
        message: body,
        priority: 1,
      });
    } catch {
      failures.push('Chrome notification');
    }
  }
  if (settings.discordWebhook && !(await hasOrigins([DISCORD_ORIGIN]))) failures.push('Discord (access not allowed)');
  else if (settings.discordWebhook) {
    const response = await fetch(settings.discordWebhook, {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discordPayload(alert, settings)),
    }).catch(() => null);
    if (!response?.ok) failures.push(`Discord${response ? ` (HTTP ${response.status})` : ''}`);
  }
  if (settings.ntfyTopic && !(await hasOrigins([NTFY_ORIGIN]))) failures.push('ntfy (access not allowed)');
  else if (settings.ntfyTopic) {
    const { url, init } = ntfyRequest(alert, settings.ntfyTopic);
    const response = await fetch(url, init).catch(() => null);
    if (!response?.ok) failures.push(`ntfy${response ? ` (HTTP ${response.status})` : ''}`);
  }
  return failures;
}

async function applyNumberFormat(): Promise<void> {
  const { numberFormat } = await chrome.storage.local.get('numberFormat');
  const format = numberFormat as { group?: unknown; decimal?: unknown } | undefined;
  if (typeof format?.group === 'string' && typeof format.decimal === 'string') {
    setNumberSeparators(format.group, format.decimal);
  }
}

/** Reads inbound trades for a check; the service worker passes one that prefers an open Roblox tab. */
export interface InboundReader {
  list(): Promise<{ rows: TradeSummaryRow[] } | null>;
  offers(tradeId: number, partnerId: number): Promise<TradeOffers | null>;
  /** Why the last read failed, such as "HTTP 401". */
  failure(): string | null;
}

/** Reads directly from the service worker, with the session Chrome attaches for trades.roblox.com. */
export const directReader: InboundReader = {
  list: () => fetchTradeList('inbound', null),
  offers: (tradeId, partnerId) => fetchTradeOffersWith(tradeId, partnerId),
  failure: lastTradeFailure,
};

/** What one check found, shown in the popup's Alerts tab. */
export interface CheckResult {
  at: number;
  /** Trades that arrived since the previous check. */
  newTrades: number;
  alerted: number;
  /** New trades that did not pass the filters. */
  filtered: number;
  /** True for the first check, which only records the trades already waiting. */
  primed: boolean;
  error: string | null;
}

let running: Promise<CheckResult | null> | null = null;

function describeFailure(failure: string | null): string {
  if (failure === 'HTTP 401' || failure === 'HTTP 403') {
    return `Roblox did not accept the background request (${failure}). Keep a Roblox tab open while signed in, and RoLens will check through it.`;
  }
  if (failure === 'HTTP 429') return 'Roblox is limiting requests. RoLens will check again shortly.';
  return `Roblox did not return your inbound trades${failure ? ` (${failure})` : ''}. RoLens will try again at the next check.`;
}

/** One check of the inbound trades list. Resolves null when alerts are off. */
export function checkInbound(values: AlertValues, reader: InboundReader = directReader): Promise<CheckResult | null> {
  running ??= runCheck(values, reader).finally(() => {
    running = null;
  });
  return running;
}

async function runCheck(values: AlertValues, reader: InboundReader): Promise<CheckResult | null> {
  const settings = await readAlerts();
  if (!settings.enabled || !(await hasOrigins([ROBLOX_TRADES_ORIGIN]))) return null;
  const state = await readAlertState();
  const result: CheckResult = { at: Date.now(), newTrades: 0, alerted: 0, filtered: 0, primed: false, error: null };
  const finish = async () => {
    state.lastCheck = result.at;
    state.lastError = result.error;
    state.lastResult = result;
    await saveState(state);
    return result;
  };
  if (tradesPaused()) {
    result.error = describeFailure('HTTP 429');
    return finish();
  }
  const { robloxUserId } = await chrome.storage.local.get('robloxUserId');
  const userId = typeof robloxUserId === 'number' ? robloxUserId : null;
  if (userId !== state.userId) {
    // Another Roblox account: its existing trades are not new.
    Object.assign(state, { userId, seen: [], primed: false });
  }

  const page = await reader.list();
  if (!page) {
    result.error = describeFailure(reader.failure());
    return finish();
  }
  const seen = new Set(state.seen);
  const fresh = page.rows.filter((row) => !seen.has(row.id));
  if (!state.primed) {
    state.seen = [...page.rows.map((row) => row.id), ...state.seen];
    state.primed = true;
    result.primed = true;
    return finish();
  }

  await applyNumberFormat();
  const sources = await values.sources();
  const failures = new Set<string>();
  result.newTrades = fresh.length;
  for (const row of fresh.slice(0, ALERT_MAX_PER_CHECK)) {
    if (row.partner.id === null) {
      state.seen.unshift(row.id);
      continue;
    }
    const offers = await reader.offers(row.id, row.partner.id);
    if (!offers) {
      // Left unseen, so the next check tries it again.
      result.error = `RoLens could not read the items of a new trade${reader.failure() ? ` (${reader.failure()})` : ''}. It will try again at the next check.`;
      break;
    }
    state.seen.unshift(row.id);
    const all = [...offers.give.itemIds, ...offers.receive.itemIds];
    const names = [...offers.give.names, ...offers.receive.names];
    const alert = buildAlert(row.id, row.partner, offers, await values.lookup(all, names), sources);
    if (!shouldAlert(alert, settings)) {
      result.filtered += 1;
      continue;
    }
    for (const failure of await deliver(alert, settings)) failures.add(failure);
    result.alerted += 1;
    state.lastAlert = Date.now();
  }
  if (failures.size) result.error = `The alert could not be delivered to ${[...failures].join(' and ')}.`;
  return finish();
}

/** Opens the Trades page when an alert notification is clicked. */
export function openTradesOnClick(): void {
  chrome.notifications?.onClicked.addListener((id) => {
    if (!id.startsWith('rolens-trade-')) return;
    void chrome.tabs.create({ url: TRADES_URL });
    void chrome.notifications.clear(id);
  });
}
