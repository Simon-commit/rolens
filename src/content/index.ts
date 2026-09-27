import { detectSeparators, numberSeparators, setNumberLocale, setNumberSeparators } from '../core/format';
import { send } from '../core/messages';
import { normaliseSettings, type Settings } from '../core/settings';
import { resolveProvider } from '../providers';
import { findItemCards, renderBadges } from './badges';
import { isOwnNode, removeOwnNodes } from './dom';
import { registerFont } from './fonts';
import { renderItemPanel } from './item-panel';
import { catalogIdFromPath, SELECTORS } from './selectors';
import { renderTradeSummary } from './trade-summary';
import type { RenderContext } from './ui/context';
import { applyThemePreference, detectTheme } from './ui/shadow';
import { ValueStore } from './value-store';

const store = new ValueStore((ids) => send({ type: 'rolens:getItems', ids }));
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
  const current = numberSeparators();
  if (current.group === found.group && current.decimal === found.decimal) return false;
  setNumberSeparators(found.group, found.decimal);
  return true;
}

async function update(): Promise<void> {
  scheduled = false;
  // Chips drawn before Roblox's prices appeared used the fallback format: redraw them.
  if (matchRobloxNumbers()) removeOwnNodes(document);
  const cards = findItemCards(document);
  const pageItemId = settings.showItemPanel ? catalogIdFromPath(location.pathname) : null;
  const ids = new Set(cards.values());
  if (pageItemId !== null) ids.add(pageItemId);
  store.useRolimons = settings.useRolimons;
  await store.load(ids);

  const ctx: RenderContext = {
    settings,
    provider: resolveProvider(settings.source),
    status: store.status,
    saveTradeDetails,
  };
  const lookup = (id: number) => store.peek(id);
  if (settings.showBadges) renderBadges(cards, lookup, ctx);
  if (pageItemId !== null) {
    const item = store.peek(pageItemId);
    if (item) renderItemPanel(document, item, ctx);
  }
  if (settings.showTradeTotals) renderTradeSummary(document, lookup, ctx);

  if (settings.useRoutility) {
    const changed = await store.loadRoutility(ids, (batch) => send({ type: 'rolens:getRoutility', ids: batch }));
    if (changed) schedule();
  }
}

function saveTradeDetails(expanded: boolean): void {
  settings = { ...settings, tradeDetails: expanded };
  void chrome.storage.sync.set({ settings });
}

/** Settings that widgets update in place, without being rebuilt. */
const LIVE_KEYS = new Set<keyof Settings>(['theme', 'tradeDetails', 'darkRoblox']);

function onlyLiveKeysChanged(prev: Settings, next: Settings): boolean {
  return (Object.keys(next) as (keyof Settings)[]).every((key) => LIVE_KEYS.has(key) || prev[key] === next[key]);
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => void update());
}

function start(): void {
  registerFont();
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
      if (
        next.source !== prev.source ||
        next.useRolimons !== prev.useRolimons ||
        next.useRoutility !== prev.useRoutility
      ) {
        store.clear();
      }
    } else if (area === 'local' && Object.keys(changes).some((key) => key.startsWith('snapshot:'))) {
      store.clear();
    } else {
      return;
    }
    removeOwnNodes(document);
    schedule();
  });

  schedule();
}

void chrome.storage.sync.get('settings').then(({ settings: stored }) => {
  settings = normaliseSettings(stored);
  applyThemePreference(settings.theme);
  start();
});
