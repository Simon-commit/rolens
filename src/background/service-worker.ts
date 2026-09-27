import { ValueCache, type SnapshotStore } from '../core/cache';
import {
  isRequest,
  type CacheStatus,
  type ItemsResponse,
  type NamesResponse,
  type PlayerResponse,
  type Request,
  type RoutilityResponse,
} from '../core/messages';
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
): Promise<ItemsResponse | NamesResponse | RoutilityResponse | PlayerResponse | CacheStatus> {
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
  handle(message).then(sendResponse, (error: unknown) => {
    console.error('[RoLens]', error);
    sendResponse(undefined);
  });
  return true;
});
