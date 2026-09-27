import { send } from '../core/messages';
import { normaliseSettings, type Settings } from '../core/settings';
import { resolveProvider } from '../providers';
import { findItemCards, renderBadges } from './badges';
import { isOwnNode, removeOwnNodes } from './dom';
import { registerFont } from './fonts';
import { renderItemPanel } from './item-panel';
import { catalogIdFromPath } from './selectors';
import { renderTradeSummary } from './trade-summary';
import type { RenderContext } from './ui/context';
import { detectTheme } from './ui/shadow';
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

  const ctx: RenderContext = { settings, provider: resolveProvider(settings.source), status: store.status };
  const lookup = (id: number) => store.peek(id);
  if (settings.showBadges) renderBadges(cards, lookup, ctx);
  if (pageItemId !== null) {
    const item = store.peek(pageItemId);
    if (item) renderItemPanel(document, item, ctx);
  }
  if (settings.showTradeTotals) renderTradeSummary(document, lookup, ctx);
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => void update());
}

function start(): void {
  registerFont();
  // Roblox is a single-page app: re-scan whenever the page changes, ignoring our own nodes.
  new MutationObserver((mutations) => {
    const relevant = mutations.some((m) =>
      [...m.addedNodes, ...m.removedNodes].some((node) => !isOwnNode(node) && node.nodeType === Node.ELEMENT_NODE),
    );
    if (relevant) schedule();
  }).observe(document.body, { childList: true, subtree: true });

  // Re-render when Roblox switches between light and dark theme.
  let theme = detectTheme();
  new MutationObserver(() => {
    if (detectTheme() === theme) return;
    theme = detectTheme();
    removeOwnNodes(document);
    schedule();
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

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
