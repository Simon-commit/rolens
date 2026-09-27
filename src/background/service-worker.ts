import { ValueCache, type SnapshotStore } from '../core/cache';
import {
  isRequest,
  type CacheStatus,
  type ItemsResponse,
  type Request,
  type RoutilityResponse,
} from '../core/messages';
import { RoutilityCache, type RoutilityEntry } from '../core/routility-cache';
import { normaliseSettings, type Settings } from '../core/settings';
import type { ItemValue, SourceId, ValueSnapshot } from '../core/types';
import { resolveProvider } from '../providers';

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

const caches = new Map<SourceId, ValueCache>();

const routility = new RoutilityCache(fetch.bind(globalThis), {
  async load() {
    const { routility: stored } = await chrome.storage.local.get('routility');
    return (stored as Record<string, RoutilityEntry> | undefined) ?? {};
  },
  async save(entries) {
    await chrome.storage.local.set({ routility: entries });
  },
});

async function currentCache(): Promise<ValueCache> {
  const { settings } = await chrome.storage.sync.get('settings');
  const provider = resolveProvider(normaliseSettings(settings as Partial<Settings> | undefined).source);
  let cache = caches.get(provider.id);
  if (!cache) {
    cache = new ValueCache(
      { source: provider.id, fetchItems: () => provider.fetchItems(fetch.bind(globalThis)) },
      store,
    );
    caches.set(provider.id, cache);
  }
  return cache;
}

async function handle(request: Request): Promise<ItemsResponse | RoutilityResponse | CacheStatus> {
  if (request.type === 'rolens:getRoutility') {
    return { items: await routility.get(request.ids), status: routility.status() };
  }
  const cache = await currentCache();
  switch (request.type) {
    case 'rolens:getItems': {
      const snapshot = await cache.get();
      const items: Record<string, ItemValue> = {};
      for (const id of request.ids) {
        const item = snapshot?.items[id];
        if (item) items[id] = item;
      }
      return { items, status: cache.status() };
    }
    case 'rolens:refresh':
      await cache.refresh(true);
      return cache.status();
    case 'rolens:getStatus':
      await cache.get();
      return { ...cache.status(), routility: routility.status() };
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
