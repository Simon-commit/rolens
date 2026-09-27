import { send } from '../core/messages';
import { normaliseSettings, type Settings } from '../core/settings';
import { resolveProvider } from '../providers';
import { findItemCards, renderBadges } from './badges';
import { isOwnNode, removeOwnNodes } from './dom';
import { renderItemPanel } from './item-panel';
import { catalogIdFromPath } from './selectors';
import { renderTradeSummary } from './trade-summary';
import { ValueStore } from './value-store';

const store = new ValueStore((ids) => send({ type: 'rolens:getItems', ids }));
let settings: Settings = normaliseSettings(undefined);
let scheduled = false;

async function update(): Promise<void> {
  scheduled = false;
  const cards = findItemCards(document);
  const pageItemId = settings.showItemPanel ? catalogIdFromPath(location.pathname) : null;
  const ids = new Set(cards.values());
  if (pageItemId !== null) ids.add(pageItemId);
  await store.load(ids);

  const lookup = (id: number) => store.peek(id);
  if (settings.showBadges) renderBadges(cards, lookup, settings);
  if (pageItemId !== null) {
    const item = store.peek(pageItemId);
    if (item) renderItemPanel(document, item, settings, resolveProvider(settings.source), store.status);
  }
  if (settings.showTradeTotals) renderTradeSummary(document, lookup, settings);
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => void update());
}

function start(): void {
  // Roblox is a single-page app: re-scan whenever the page changes, ignoring our own nodes.
  new MutationObserver((mutations) => {
    const relevant = mutations.some((m) =>
      [...m.addedNodes, ...m.removedNodes].some((node) => !isOwnNode(node) && node.nodeType === Node.ELEMENT_NODE),
    );
    if (relevant) schedule();
  }).observe(document.body, { childList: true, subtree: true });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.settings) {
      const next = normaliseSettings(changes.settings.newValue);
      if (next.source !== settings.source) store.clear();
      settings = next;
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
  start();
});
