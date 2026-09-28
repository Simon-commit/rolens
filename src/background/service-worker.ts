import { ValueCache, type SnapshotStore } from '../core/cache';
import {
  isRequest,
  type CacheStatus,
  type ItemsResponse,
  type NamesResponse,
  type PlayerResponse,
  type Request,
  type RoutilityResponse,
  type CheckAlertsResponse,
  type TestAlertResponse,
} from '../core/messages';
import { ALERT_ALARM, ALERTS_KEY, testAlert } from '../core/alerts';
import { migrateStorage } from '../core/migrations';
import { itemFromRoutility, withRoutility } from '../core/routility';
import { sourceNames, enabledSources } from '../core/sources';
import {
  checkInbound,
  deliver,
  openTradesOnClick,
  directReader,
  readAlerts,
  syncAlertSchedule,
  type AlertValues,
  type InboundReader,
} from './inbound-alerts';
import { rememberTab, viaRobloxTab } from './roblox-relay';
import { applyPendingChange } from './alert-grants';
import type { TradeOffers, TradeSummaryRow } from '../content/roblox-api';
import { buildNameIndex, normaliseName } from '../core/names';
import { PlayerCache } from '../core/player-cache';
import { TRADE_CACHE_KEY } from '../core/trade-cache';
import { RoutilityCache, type RoutilityEntry } from '../core/routility-cache';
import { normaliseSettings, type Settings } from '../core/settings';
import { fetchRolimonsItems } from '../core/rolimons';
import type { ItemValue, ValueSnapshot } from '../core/types';

const store: SnapshotStore = {
  async load(source) {
    const key = `snapshot:${source}`;
    const stored = await chrome.storage.local.get(key);
    return (stored[key] as ValueSnapshot | undefined) ?? null;
  },
  async save(snapshot) {
    await chrome.storage.local.set({ [`snapshot:${snapshot.source}`]: snapshot });
  },
};

/** Rolimon's full value table, refreshed in the background when stale. */
const values = new ValueCache(
  { source: 'rolimons', fetchItems: () => fetchRolimonsItems(fetch.bind(globalThis)) },
  store,
);

const routility = new RoutilityCache(fetch.bind(globalThis), {
  async load() {
    const { routility: stored } = await chrome.storage.local.get('routility');
    return (stored as Record<string, RoutilityEntry> | undefined) ?? {};
  },
  async save(entries) {
    await chrome.storage.local.set({ routility: entries });
  },
});

const players = new PlayerCache(fetch.bind(globalThis));

async function currentSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.sync.get('settings');
  return normaliseSettings(settings);
}

/** The name index for the current snapshot, rebuilt only when the snapshot changes. */
const nameIndexes = new WeakMap<ValueSnapshot, Map<string, number | null>>();

function nameIndex(snapshot: ValueSnapshot): Map<string, number | null> {
  let index = nameIndexes.get(snapshot);
  if (!index) {
    index = buildNameIndex(snapshot.items);
    nameIndexes.set(snapshot, index);
  }
  return index;
}

async function handle(
  request: Request,
  sender: chrome.runtime.MessageSender,
): Promise<
  | ItemsResponse
  | NamesResponse
  | RoutilityResponse
  | PlayerResponse
  | TestAlertResponse
  | CheckAlertsResponse
  | CacheStatus
  | null
> {
  if (request.type === 'rolens:hello') {
    if (sender.tab?.id !== undefined && sender.url?.startsWith('https://www.roblox.com/'))
      await rememberTab(sender.tab.id);
    return null;
  }
  if (request.type === 'rolens:checkAlerts') return { result: await checkInbound(alertValues, alertReader) };
  if (request.type === 'rolens:testAlert') {
    const alerts = await readAlerts();
    const sent = alerts.desktop || Boolean(alerts.discordWebhook || alerts.ntfyTopic);
    return { sent, failures: sent ? await deliver(testAlert(await alertValues.sources()), alerts) : [] };
  }
  if (request.type === 'rolens:getRoutility') {
    return { items: await routility.get(request.ids), status: routility.status() };
  }
  if (request.type === 'rolens:getPlayer') {
    return players.get(request.userId).then(
      (inventory) => ({ inventory }),
      (error: unknown) => ({ error: error instanceof Error ? error.message : String(error) }),
    );
  }
  switch (request.type) {
    case 'rolens:getItems': {
      const snapshot = await values.get();
      const items: Record<string, ItemValue> = {};
      for (const id of request.ids) {
        const item = snapshot?.items[id];
        if (item) items[id] = item;
      }
      return { items, status: values.status() };
    }
    case 'rolens:findByName': {
      const snapshot = await values.get();
      const items: Record<string, ItemValue> = {};
      if (snapshot) {
        const index = nameIndex(snapshot);
        for (const name of request.names) {
          const id = index.get(normaliseName(name));
          const item = id ? snapshot.items[id] : undefined;
          if (item) items[name] = item;
        }
      }
      return { items, status: values.status() };
    }
    case 'rolens:clearCache':
      // Saved trades, inventories and RoUtility estimates. The public value table is kept.
      await routility.clear();
      players.clear();
      await chrome.storage.local.remove(TRADE_CACHE_KEY);
      return { ...values.status(), routility: routility.status() };
    case 'rolens:refresh':
      await values.refresh(true);
      return { ...values.status(), routility: routility.status() };
    case 'rolens:getStatus':
      // With Rolimon's turned off, report status without downloading its table.
      if ((await currentSettings()).useRolimons) await values.get();
      return { ...values.status(), routility: routility.status() };
  }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  // Only accept messages from this extension's own pages and content scripts.
  if (sender.id !== chrome.runtime.id || !isRequest(message)) return false;
  handle(message, sender).then(sendResponse, (error: unknown) => {
    console.error('[RoLens]', error);
    sendResponse(undefined);
  });
  return true;
});

/* Keyboard shortcut (Alt+Shift+S by default, changeable in chrome://extensions/shortcuts). */
chrome.commands.onCommand.addListener((command) => {
  if (command !== 'toggle-serials') return;
  void (async () => {
    const settings = await currentSettings();
    await chrome.storage.sync.set({ settings: { ...settings, hideSerials: !settings.hideSerials } });
  })();
});

/* Inbound trade alerts (see inbound-alerts.ts). Off until the user turns them on. */
const alertValues: AlertValues = {
  async lookup(ids, names) {
    const settings = await currentSettings();
    const found = new Map<number, ItemValue>();
    const extra = settings.useRoutility ? await routility.get(ids) : {};
    if (!settings.useRolimons) {
      for (const id of ids) {
        const data = extra[id];
        const item = data ? itemFromRoutility(id, data) : null;
        if (item) found.set(id, item);
      }
      return found;
    }
    const snapshot = await values.get();
    if (!snapshot) return found;
    ids.forEach((id, i) => {
      let item = snapshot.items[id];
      const name = names[i];
      if (!item && name) {
        const match = nameIndex(snapshot).get(normaliseName(name));
        if (match) item = snapshot.items[match];
      }
      if (item) found.set(id, withRoutility(item, extra[item.id] ?? extra[id]));
    });
    return found;
  },
  async sources() {
    return sourceNames(enabledSources(await currentSettings()));
  },
};

/**
 * Reads inbound trades through an open Roblox tab when there is one, as roblox.com does
 * itself, and directly from the service worker otherwise.
 */
let lastRelayFailure: string | null = null;
const alertReader: InboundReader = {
  async list() {
    const relayed = await viaRobloxTab<{ rows: TradeSummaryRow[] }>({ type: 'rolens:relayTrades', op: 'list' });
    if (relayed?.data) return ((lastRelayFailure = null), relayed.data);
    const direct = await directReader.list();
    lastRelayFailure = direct ? null : (directReader.failure() ?? relayed?.failure ?? null);
    return direct;
  },
  async offers(tradeId, partnerId) {
    const relayed = await viaRobloxTab<TradeOffers>({ type: 'rolens:relayTrades', op: 'offers', tradeId, partnerId });
    if (relayed?.data) return ((lastRelayFailure = null), relayed.data);
    const direct = await directReader.offers(tradeId, partnerId);
    lastRelayFailure = direct ? null : (directReader.failure() ?? relayed?.failure ?? null);
    return direct;
  },
  failure: () => lastRelayFailure,
};

let alarmsBound = false;
let notificationsBound = false;

/** Optional APIs only exist once their permission is granted, so listeners are added when they appear. */
function bindAlertListeners(): void {
  if (chrome.alarms && !alarmsBound) {
    alarmsBound = true;
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === ALERT_ALARM) void checkInbound(alertValues, alertReader);
    });
  }
  if (chrome.notifications && !notificationsBound) {
    notificationsBound = true;
    openTradesOnClick();
  }
}

// Carries settings over from earlier releases before anything reads them.
const migrated = migrateStorage({ sync: chrome.storage.sync, local: chrome.storage.local }).catch(() => undefined);
chrome.runtime.onInstalled.addListener(() => {
  void migrated.then(() => syncAlertSchedule());
});

bindAlertListeners();
void migrated.then(() => syncAlertSchedule());
chrome.permissions.onAdded.addListener(() => {
  bindAlertListeners();
  void applyPendingChange();
  void syncAlertSchedule();
});
// Chrome may drop alarms when it restarts; make sure the check is scheduled again.
chrome.runtime.onStartup.addListener(() => void syncAlertSchedule());
chrome.permissions.onRemoved.addListener(() => void syncAlertSchedule());
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[ALERTS_KEY]) void syncAlertSchedule();
});
