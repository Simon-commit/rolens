import { detectSeparators, numberSeparators, setNumberLocale, setNumberSeparators } from '../core/format';
import { send } from '../core/messages';
import { normaliseSettings, type Settings } from '../core/settings';
import { findItemCards, pendingNames, renderBadges, useNameMatcher } from './badges';
import { isOwnNode, removeOwnNodes } from './dom';
import { registerFont } from './fonts';
import { itemPageIsLimited, itemPageName, renderItemPanel } from './item-panel';
import { renderProfile, resetProfiles } from './profile';
import { bundleIdFromPath, catalogIdFromPath, profileIdFromPath, SELECTORS } from './selectors';
import { TRADE_CACHE_KEY, TradeCache } from '../core/trade-cache';
import { renderDuplicateTrade, resetDuplicateTrade } from './duplicate-trade';
import { activeTradeList, renderTradeList, resetTradeList, signedInUserId } from './trade-list';
import { createProof } from './proof';
import { renderCancelTools } from './cancel-trades';
import { serveAlertReads } from './alerts-relay';
import { renderTradeSummary } from './trade-summary';
import type { RenderContext } from './ui/context';
import { applyThemePreference, detectTheme } from './ui/shadow';
import { ValueStore } from './value-store';

const store = new ValueStore((ids) => send({ type: 'rolens:getItems', ids }));
useNameMatcher({ lookup: (id) => store.peek(id), idForName: (name) => store.idForName(name) });
const findByName = (names: string[]) => send({ type: 'rolens:findByName', names });
const tradeCache = new TradeCache({
  get: (key) => chrome.storage.local.get(key),
  set: (items) => chrome.storage.local.set(items),
});

/**
 * The item a catalog or bundle page is about. Limiteds Roblox now shows under a new id
 * (classic faces became heads and bundles) are found by their exact name instead.
 */
async function pageItemId(): Promise<number | null> {
  const catalogId = catalogIdFromPath(location.pathname);
  const bundleId = bundleIdFromPath(location.pathname);
  if (catalogId === null && bundleId === null) return null;
  if (catalogId !== null) {
    await store.load([catalogId]);
    if (store.peek(catalogId) !== null) return catalogId;
  }
  const name = itemPageName();
  if (!name || !itemPageIsLimited(document)) return null;
  await store.resolveNames([name], findByName);
  return store.idForName(name) ?? null;
}
let settings: Settings = normaliseSettings(undefined);
let scheduled = false;

let separatorsFromPage = false;

/**
 * Roblox formats numbers by account setting, not page language, so RoLens reads the
 * grouping from Robux amounts on the page. Returns true when it changed.
 */
function matchRobloxNumbers(): boolean {
  if (separatorsFromPage) return false;
  const samples = [...document.querySelectorAll(SELECTORS.robuxAmount)]
    .slice(0, 60)
    .map((node) => node.textContent ?? '');
  const found = detectSeparators(samples);
  if (!found) return false;
  separatorsFromPage = true;
  // Inbound alerts format numbers the way Roblox shows them to this user.
  void chrome.storage.local.set({ numberFormat: found });
  const current = numberSeparators();
  if (current.group === found.group && current.decimal === found.decimal) return false;
  setNumberSeparators(found.group, found.decimal);
  return true;
}

async function update(): Promise<void> {
  scheduled = false;
  // Chips drawn before Roblox's prices appeared used the fallback format: redraw them.
  if (matchRobloxNumbers()) removeOwnNodes(document);
  store.useRolimons = settings.useRolimons;
  let cards = findItemCards(document);
  await store.load(cards.values());
  const names = pendingNames(document);
  if (names.length) {
    await store.resolveNames(names, findByName);
    cards = findItemCards(document);
  }
  const pageItem = settings.showItemPanel ? await pageItemId() : null;
  const ids = new Set(cards.values());
  if (pageItem !== null) ids.add(pageItem);
  await store.load(ids);

  const ctx: RenderContext = {
    settings,
    status: store.status,
    saveTradeDetails,
    saveItemCard,
  };
  const lookup = (id: number) => store.peek(id);
  if (settings.showBadges) renderBadges(cards, lookup, ctx);
  if (pageItem !== null) {
    const item = store.peek(pageItem);
    if (item) renderItemPanel(document, item, ctx);
  }
  const valuer = {
    loadValues: (ids: number[]) => store.load(ids),
    lookup,
    resolveNames: (names: string[]) => store.resolveNames(names, findByName),
    idForName: (name: string) => store.idForName(name),
  };
  if (settings.showTradeTotals) {
    // Completed trades get a proof button; the proof is drawn on this device.
    const proof =
      activeTradeList() === 'completed'
        ? (give: number[], receive: number[], button: HTMLElement) =>
            void createProof(give, receive, ctx, valuer, button)
        : undefined;
    renderTradeSummary(document, lookup, ctx, proof);
  }
  if (settings.showTradePreviews) {
    await renderTradeList(ctx, {
      loadValues: (ids) => store.load(ids),
      lookup,
      redraw: schedule,
      resolveNames: (names) => store.resolveNames(names, findByName),
      tradeCache,
      idForName: (name) => store.idForName(name),
    });
  }
  if (settings.showCancelTools) {
    renderCancelTools(ctx, {
      ...valuer,
      tradeCache,
      afterCancel: () => {
        resetTradeList();
        resetDuplicateTrade();
      },
    });
  }
  if (settings.warnDuplicateTrades) {
    await renderDuplicateTrade(ctx, {
      loadValues: (ids) => store.load(ids),
      lookup,
      redraw: schedule,
      resolveNames: (names) => store.resolveNames(names, findByName),
      tradeCache,
      idForName: (name) => store.idForName(name),
    });
  }
  const profileId = settings.showProfileValue ? profileIdFromPath(location.pathname) : null;
  if (profileId !== null) {
    await renderProfile(profileId, ctx, {
      getPlayer: (userId) => send({ type: 'rolens:getPlayer', userId }),
      loadValues: (ids) => store.load(ids),
      loadRoutility: (ids) => store.loadRoutility(ids, (batch) => send({ type: 'rolens:getRoutility', ids: batch })),
      lookup,
      redraw: schedule,
    });
  }

  if (settings.useRoutility) {
    const changed = await store.loadRoutility(ids, (batch) => send({ type: 'rolens:getRoutility', ids: batch }));
    if (changed) schedule();
  }
}

function saveItemCard(collapsed: boolean): void {
  settings = { ...settings, itemCardCollapsed: collapsed };
  void chrome.storage.sync.set({ settings });
}

function saveTradeDetails(expanded: boolean): void {
  settings = { ...settings, tradeDetails: expanded };
  void chrome.storage.sync.set({ settings });
}

/**
 * Settings that need no redraw: the theme is applied to widgets in place, dark Roblox is
 * handled by early.js, and the trade bar's open state is read when it is next drawn.
 */
const LIVE_KEYS = new Set<keyof Settings>(['theme', 'tradeDetails', 'itemCardCollapsed', 'darkRoblox', 'hideSerials']);

function onlyLiveKeysChanged(prev: Settings, next: Settings): boolean {
  return (Object.keys(next) as (keyof Settings)[]).every((key) => LIVE_KEYS.has(key) || prev[key] === next[key]);
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => void update());
}

/** Tells inbound alerts which Roblox account is signed in, so another account's trades are never treated as new. */
function recordSignedInUser(): void {
  const me = signedInUserId();
  if (me === null) return;
  void chrome.storage.local.get('robloxUserId').then(({ robloxUserId }) => {
    if (robloxUserId !== me) void chrome.storage.local.set({ robloxUserId: me });
  });
}

function start(): void {
  registerFont();
  recordSignedInUser();
  serveAlertReads();
  // Until Roblox's own prices are on the page, follow the browser's language.
  setNumberLocale(navigator.language || document.documentElement.lang);
  // Roblox is a single-page app: re-scan whenever the page changes, ignoring our own nodes.
  new MutationObserver((mutations) => {
    const relevant = mutations.some((m) =>
      [...m.addedNodes, ...m.removedNodes].some((node) => !isOwnNode(node) && node.nodeType === Node.ELEMENT_NODE),
    );
    if (relevant) schedule();
  }).observe(document.body, { childList: true, subtree: true });

  // Follow Roblox's own light/dark switch when the theme is set to auto.
  let theme = detectTheme();
  new MutationObserver(() => {
    if (detectTheme() === theme) return;
    theme = detectTheme();
    applyThemePreference(settings.theme);
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.settings) {
      const next = normaliseSettings(changes.settings.newValue);
      const prev = settings;
      settings = next;
      if (next.theme !== prev.theme) applyThemePreference(next.theme);
      if (onlyLiveKeysChanged(prev, next)) return;
      if (next.useRolimons !== prev.useRolimons || next.useRoutility !== prev.useRoutility) {
        store.clear();
        resetProfiles();
      }
      if (!next.showTradePreviews) resetTradeList();
      if (!next.warnDuplicateTrades) resetDuplicateTrade();
      removeOwnNodes(document);
      schedule();
    } else if (area === 'local' && changes[TRADE_CACHE_KEY] && changes[TRADE_CACHE_KEY].newValue === undefined) {
      // Saved trades were cleared from the popup: forget them here too.
      tradeCache.reset();
      resetTradeList();
      schedule();
    } else if (area === 'local' && Object.keys(changes).some((key) => key.startsWith('snapshot:'))) {
      // New values: widgets whose figures changed are redrawn by the next scan, the rest stay as they are.
      store.clearValues();
      schedule();
    }
  });

  schedule();
}

void chrome.storage.sync.get('settings').then(({ settings: stored }) => {
  settings = normaliseSettings(stored);
  applyThemePreference(settings.theme);
  start();
});
