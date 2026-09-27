import { formatAge, formatRobux } from '../../core/format';
import type { InventoryEntry, InventorySummary } from '../../core/inventory';
import { SOURCES } from '../../core/sources';
import { effectiveValue } from '../../core/types';
import { formatUsd, usdFor } from '../../core/usd';
import { el } from '../dom';
import type { RenderContext } from './context';
import { rateTip, TIPS } from './copy';
import { attachHoverCard } from './hover-card';
import { glyph, icon } from './icons';
import {
  composition,
  compositionBar,
  compositionCss,
  countLine,
  inventoryUsd,
  inventoryUsdTip,
  legend,
} from './inventory-common';
import { createWidget } from './shadow';
import { attachTip } from './tooltip';

/*
 * The full inventory, in a dialog over the profile. It opens from the profile box with a
 * short rise-and-fade, and closes the same way on Escape, the close button or a click
 * outside it. Tiles are drawn in pages, so inventories of any size open instantly.
 */

const PAGE = 60;
const OPEN_MS = 280;
const CLOSE_MS = 180;

type Sort = 'value' | 'rap' | 'name';

export interface InventoryPanelOptions {
  /** The player's name as the profile shows it. */
  playerName: string;
  userId: number;
  summary: InventorySummary;
  scannedAt: number | null;
  ctx: RenderContext;
  /** Resolves item images; missing ones keep the placeholder. */
  loadThumbnails: (ids: number[]) => Promise<Map<number, string>>;
  onClose?: () => void;
}

const css = `
:host { position: fixed; inset: 0; z-index: 2147482000; }
.backdrop {
  position: absolute; inset: 0;
  background: rgba(6, 9, 14, 0.52);
  backdrop-filter: blur(6px) saturate(1.1); -webkit-backdrop-filter: blur(6px) saturate(1.1);
  opacity: 0; transition: opacity ${OPEN_MS}ms ease;
}
.frame { position: absolute; inset: 0; display: grid; place-items: center; padding: 24px 16px; pointer-events: none; }
.sheet {
  pointer-events: auto; outline: none; position: relative; isolation: isolate;
  display: grid; grid-template-rows: auto auto 1fr auto;
  width: min(960px, 100%); height: min(780px, 100%);
  border-radius: 22px;
  border: 1px solid var(--rl-border);
  background: var(--rl-bg-raised);
  box-shadow: var(--rl-shadow-lg), 0 0 0 1px color-mix(in srgb, var(--rl-text) 3%, transparent);
  overflow: hidden;
  opacity: 0; transform: translateY(18px) scale(0.97);
  transition: opacity ${OPEN_MS}ms cubic-bezier(0.2, 0, 0, 1), transform ${OPEN_MS}ms cubic-bezier(0.2, 0, 0, 1);
}
/* Texture: a brand glow behind the header and a fine dot grid that fades out downwards. */
.sheet::before {
  content: ''; position: absolute; inset: 0 0 auto 0; height: 260px; z-index: -1; pointer-events: none;
  background:
    radial-gradient(70% 120% at 0% 0%, color-mix(in srgb, var(--rl-brand-a) 13%, transparent), transparent 60%),
    radial-gradient(60% 110% at 100% 0%, color-mix(in srgb, var(--rl-brand-b) 11%, transparent), transparent 60%),
    radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--rl-text) 8%, transparent) 1px, transparent 0) 0 0 / 16px 16px;
  mask-image: linear-gradient(#000, transparent);
}
:host(.is-open) .backdrop { opacity: 1; }
:host(.is-open) .sheet { opacity: 1; transform: none; }
:host(.is-closing) .backdrop { opacity: 0; transition-duration: ${CLOSE_MS}ms; }
:host(.is-closing) .sheet {
  opacity: 0; transform: translateY(10px) scale(0.985);
  transition-duration: ${CLOSE_MS}ms; transition-timing-function: cubic-bezier(0.4, 0, 1, 1);
}

.header { display: grid; gap: 18px; padding: 22px 24px 18px; }
.title-row { display: flex; align-items: center; gap: 14px; min-width: 0; }
.title-text { display: grid; gap: 2px; flex: 1; min-width: 0; }
.title { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.subtitle { font-size: 12px; color: var(--rl-text-3); }
.link {
  display: inline-flex; align-items: center; gap: 4px; flex: none;
  font-size: 12px; font-weight: 600; color: var(--rl-text-2); text-decoration: none;
  transition: color 0.15s ease;
}
.link:hover { color: var(--rl-accent); }
.link .rl-icon { width: 12px; height: 12px; }
.close {
  display: grid; place-items: center; flex: none; width: 34px; height: 34px;
  border: 0; border-radius: 999px; background: var(--rl-surface); color: var(--rl-text-2); cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease, transform 0.2s cubic-bezier(0.2, 0, 0, 1);
}
.close:hover { background: var(--rl-surface-2); color: var(--rl-text); transform: rotate(90deg); }
.close:focus-visible, .sort button:focus-visible, .filter:focus-visible, .more:focus-visible {
  outline: 2px solid var(--rl-accent); outline-offset: 2px;
}

.stats { display: grid; grid-template-columns: 1.3fr repeat(3, 1fr); gap: 10px; }
.stat {
  display: grid; gap: 4px; align-content: start; padding: 12px 14px; min-width: 0;
  border-radius: 14px; border: 1px solid var(--rl-border);
  background: color-mix(in srgb, var(--rl-bg-raised) 70%, transparent);
  backdrop-filter: blur(8px);
}
.stat .rl-eyebrow { font-size: 10px; }
.figure { font-size: 18px; font-weight: 700; letter-spacing: -0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stat.is-lead .figure { font-size: 26px; letter-spacing: -0.03em; }
.figure .usd.is-estimate { cursor: help; outline: none; }
.stat-note { font-size: 11px; color: var(--rl-text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.makeup { display: grid; grid-template-columns: minmax(160px, 260px) 1fr; align-items: center; gap: 10px 18px; }
@media (max-width: 720px) { .makeup { grid-template-columns: 1fr; } }

.toolbar {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 12px 24px; border-top: 1px solid var(--rl-border); border-bottom: 1px solid var(--rl-border);
  background: color-mix(in srgb, var(--rl-surface) 45%, transparent);
}
.search {
  display: flex; align-items: center; gap: 8px; flex: 1; min-width: 180px; height: 34px; padding: 0 12px;
  border-radius: 999px; background: var(--rl-bg-raised); border: 1px solid var(--rl-border);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.search:focus-within { border-color: var(--rl-accent); box-shadow: 0 0 0 3px var(--rl-accent-soft); }
.search .rl-icon { color: var(--rl-text-3); }
.search input {
  flex: 1; min-width: 0; border: 0; outline: none; background: transparent;
  font: inherit; font-size: 13px; color: var(--rl-text);
}
.search input::placeholder { color: var(--rl-text-3); }
.sort { display: inline-flex; padding: 3px; gap: 2px; border-radius: 999px; background: var(--rl-surface); }
.sort button, .filter {
  height: 28px; padding: 0 12px; border: 0; border-radius: 999px; background: transparent;
  font: inherit; font-size: 12px; font-weight: 600; color: var(--rl-text-2); cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
}
.sort button[aria-pressed='true'] { background: var(--rl-bg-raised); color: var(--rl-text); box-shadow: var(--rl-shadow-sm); }
.filter { display: inline-flex; align-items: center; gap: 5px; height: 34px; background: var(--rl-surface); }
.filter .rl-icon { width: 12px; height: 12px; }
.filter[aria-pressed='true'] { background: var(--rl-rare-soft); color: var(--rl-rare-text); box-shadow: inset 0 0 0 1px var(--rl-rare-line); }

.body { overflow: auto; overscroll-behavior: contain; padding: 18px 24px 24px; scrollbar-width: thin; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(142px, 1fr)); gap: 12px; }
.tile {
  position: relative; display: grid; grid-template-rows: auto 1fr; min-width: 0;
  border-radius: 14px; border: 1px solid var(--rl-border); background: var(--rl-bg-raised);
  color: inherit; text-decoration: none; overflow: hidden; outline: none;
  transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.2s ease, border-color 0.2s ease;
  animation: tile-in 0.35s cubic-bezier(0.2, 0, 0, 1) both;
  animation-delay: calc(var(--i, 0) * 14ms);
}
@keyframes tile-in { from { opacity: 0; transform: translateY(6px) scale(0.98); } }
.tile:hover, .tile:focus-visible { transform: translateY(-2px); box-shadow: var(--rl-shadow); border-color: var(--rl-border-strong); }
.tile:focus-visible { box-shadow: 0 0 0 2px var(--rl-bg-raised), 0 0 0 4px var(--rl-accent); }
.tile.is-rare { border-color: var(--rl-rare-line); }
.thumb {
  position: relative; aspect-ratio: 1; display: grid; place-items: center;
  background: radial-gradient(circle at 50% 40%, var(--rl-surface) 0%, var(--rl-surface-2) 100%);
}
.thumb img { width: 86%; height: 86%; object-fit: contain; opacity: 0; transition: opacity 0.3s ease; }
.thumb img.is-loaded { opacity: 1; }
.thumb .placeholder { position: absolute; opacity: 0.35; }
.thumb img.is-loaded + .placeholder { display: none; }
.count {
  position: absolute; top: 8px; right: 8px; padding: 2px 7px; border-radius: 999px;
  font-size: 11px; font-weight: 700; background: color-mix(in srgb, var(--rl-bg-raised) 88%, transparent);
  box-shadow: var(--rl-shadow-sm);
}
.marks { position: absolute; top: 8px; left: 8px; display: flex; gap: 4px; }
.mark {
  display: grid; place-items: center; width: 22px; height: 22px; border-radius: 999px; outline: none;
  background: color-mix(in srgb, var(--rl-bg-raised) 88%, transparent); box-shadow: var(--rl-shadow-sm);
}
.mark .rl-icon { width: 12px; height: 12px; }
.mark--rare { color: var(--rl-rare-text); }
.mark--warn { color: var(--rl-warn); }
.info { display: grid; gap: 3px; padding: 10px 11px 11px; align-content: start; min-width: 0; }
.name { font-size: 12.5px; font-weight: 600; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 2.6em; }
.value { font-size: 14px; font-weight: 700; letter-spacing: -0.01em; }
.value .rap-label { font-size: 9.5px; font-weight: 600; letter-spacing: 0.04em; color: var(--rl-text-3); margin-right: 4px; }
.sub { display: flex; justify-content: space-between; gap: 6px; font-size: 11px; color: var(--rl-text-3); white-space: nowrap; }
.sub .usd { font-weight: 600; }
.sub .usd.is-estimate { cursor: help; outline: none; }
.empty { padding: 60px 0; text-align: center; color: var(--rl-text-3); font-size: 13px; }
.more {
  display: block; margin: 18px auto 0; height: 36px; padding: 0 18px; border: 0; border-radius: 999px;
  background: var(--rl-surface); color: var(--rl-text); font: inherit; font-size: 12.5px; font-weight: 650; cursor: pointer;
}
.more:hover { background: var(--rl-surface-2); }

.foot {
  display: flex; justify-content: space-between; gap: 12px; padding: 12px 24px;
  border-top: 1px solid var(--rl-border); font-size: 11px; color: var(--rl-text-3);
}
@media (max-width: 720px) {
  /* On small screens the whole sheet scrolls, so the grid is not squeezed under the header. */
  .sheet { display: block; overflow: auto; overscroll-behavior: contain; }
  .body { overflow: visible; }
  .toolbar { position: sticky; top: 0; z-index: 1; background: var(--rl-bg-raised); }
  .foot { flex-direction: column; gap: 2px; }
  .link-label { display: none; }
  .stats { grid-template-columns: 1fr 1fr; }
  .header, .body { padding-left: 16px; padding-right: 16px; }
  .toolbar, .foot { padding-left: 16px; padding-right: 16px; }
}
@media (prefers-reduced-motion: reduce) { .sheet, .backdrop { transition: none !important; } }
${compositionCss}
`;

let openPanel: { close: () => void } | null = null;

function button(className: string, ...children: (Node | string)[]): HTMLButtonElement {
  const node = el('button', className, ...children);
  node.type = 'button';
  return node;
}

function tile(entry: InventoryEntry, index: number, ctx: RenderContext): HTMLElement {
  const { item, count } = entry;
  const compact = ctx.settings.compactNumbers;
  const link = el('a', item.rare ? 'tile is-rare' : 'tile');
  link.href = `https://www.roblox.com/catalog/${item.id}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.style.setProperty('--i', String(Math.min(index % PAGE, 30)));
  link.dataset.id = String(item.id);

  const image = el('img');
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  image.addEventListener('load', () => image.classList.add('is-loaded'));
  const marks = el(
    'span',
    'marks',
    item.rare ? attachTip(el('span', 'mark mark--rare', icon('gem')), ...TIPS.rare) : null,
    item.projected ? attachTip(el('span', 'mark mark--warn', icon('warning')), ...TIPS.projected) : null,
  );
  for (const mark of marks.children) mark.removeAttribute('tabindex');

  const usd = usdFor(item, ctx.settings);
  let usdNode: HTMLElement | null = null;
  if (usd) {
    const estimate = usd.origin === 'rate';
    usdNode = el(
      'span',
      estimate ? 'usd is-estimate' : 'usd',
      `${estimate ? '≈' : ''}${formatUsd(usd.value, compact)}`,
    );
    if (estimate && ctx.settings.usdRate !== null) {
      attachTip(usdNode, ...rateTip(ctx.settings.usdRate)).removeAttribute('tabindex');
    }
  }

  link.append(
    el(
      'div',
      'thumb',
      image,
      el('span', 'placeholder', glyph(34)),
      count > 1 ? el('span', 'count', `×${count}`) : null,
      marks,
    ),
    el(
      'div',
      'info',
      el('span', 'name', item.name),
      el(
        'span',
        'value',
        item.value === null ? el('span', 'rap-label', 'RAP') : null,
        formatRobux(effectiveValue(item), compact),
      ),
      el(
        'span',
        'sub',
        item.value === null ? el('span', '', '') : el('span', '', `RAP ${formatRobux(item.rap, compact)}`),
        usdNode,
      ),
    ),
  );
  link.setAttribute('aria-label', `${item.name}${count > 1 ? `, ${count} copies` : ''}`);
  attachHoverCard(link, item, ctx);
  return link;
}

/** Opens the inventory dialog. Only one is open at a time. */
export function openInventoryPanel(options: InventoryPanelOptions): void {
  openPanel?.close();
  const { summary, ctx } = options;
  const compact = ctx.settings.compactNumbers;
  const { host, root } = createWidget('inventory', css, 'div');
  const previousFocus = document.activeElement as HTMLElement | null;
  const previousOverflow = document.documentElement.style.overflow;

  let sort: Sort = 'value';
  let rareOnly = false;
  let query = '';
  let shown = PAGE;

  const grid = el('div', 'grid');
  const more = button('more');
  const body = el('div', 'body', grid, more);

  const visible = () => {
    const needle = query.trim().toLowerCase();
    const list = summary.entries.filter(
      ({ item }) =>
        (!rareOnly || item.rare) &&
        (!needle || item.name.toLowerCase().includes(needle) || item.acronym.toLowerCase() === needle),
    );
    if (sort === 'rap') list.sort((a, b) => b.item.rap - a.item.rap);
    if (sort === 'name') list.sort((a, b) => a.item.name.localeCompare(b.item.name));
    return list;
  };

  const draw = (append = false) => {
    const list = visible();
    const from = append ? grid.children.length : 0;
    const page = list.slice(from, shown);
    const tiles = page.map((entry, index) => tile(entry, from + index, ctx));
    if (append) grid.append(...tiles);
    else {
      grid.replaceChildren(...tiles);
      body.scrollTop = 0;
    }
    if (list.length === 0) grid.replaceChildren(el('div', 'empty', 'No items match your search.'));
    more.hidden = list.length <= shown;
    more.textContent = `Show ${Math.min(PAGE, list.length - shown)} more`;
    void options.loadThumbnails(page.map((entry) => entry.item.id)).then((images) => {
      for (const node of tiles) {
        const src = images.get(Number(node.dataset.id));
        const image = node.querySelector('img');
        if (src && image && !image.src) image.src = src;
      }
    });
  };

  more.addEventListener('click', () => {
    shown += PAGE;
    draw(true);
  });

  const search = el('input');
  search.type = 'search';
  search.placeholder = 'Search by name or acronym';
  search.setAttribute('aria-label', 'Search items');
  search.addEventListener('input', () => {
    query = search.value;
    shown = PAGE;
    draw();
  });

  const sortButtons = (['value', 'rap', 'name'] as const).map((key) => {
    const node = button('', key === 'value' ? 'Value' : key === 'rap' ? 'RAP' : 'Name');
    node.setAttribute('aria-pressed', String(key === sort));
    node.addEventListener('click', () => {
      sort = key;
      for (const other of sortButtons) other.setAttribute('aria-pressed', String(other === node));
      shown = PAGE;
      draw();
    });
    return node;
  });

  const rareFilter = button('filter', icon('gem'), 'Rare');
  rareFilter.setAttribute('aria-pressed', 'false');
  rareFilter.hidden = summary.rare === 0;
  rareFilter.addEventListener('click', () => {
    rareOnly = !rareOnly;
    rareFilter.setAttribute('aria-pressed', String(rareOnly));
    shown = PAGE;
    draw();
  });

  const close = button('close', icon('close'));
  close.setAttribute('aria-label', 'Close inventory');

  const usdText = inventoryUsd(summary, compact);
  let usdFigure: Node | string = el('span', 'rl-faint', '—');
  if (usdText) {
    const estimate = usdText.startsWith('≈');
    usdFigure = el('span', estimate ? 'usd is-estimate' : 'usd', usdText);
    if (estimate) attachTip(usdFigure as HTMLElement, ...inventoryUsdTip(summary));
  }
  const segments = composition(summary);
  const rolimons = el('a', 'link', el('span', 'link-label', `View on ${SOURCES.rolimons.label}`), icon('external'));
  rolimons.setAttribute('aria-label', `View on ${SOURCES.rolimons.label}`);
  rolimons.href = `https://www.rolimons.com/player/${options.userId}`;
  rolimons.target = '_blank';
  rolimons.rel = 'noopener noreferrer';

  const titleId = 'rolens-inventory-title';
  const sheet = el(
    'div',
    'sheet',
    el(
      'header',
      'header',
      el(
        'div',
        'title-row',
        glyph(32),
        el(
          'div',
          'title-text',
          el('h2', 'title', `${options.playerName}'s inventory`),
          el('span', 'subtitle', countLine(summary)),
        ),
        rolimons,
        close,
      ),
      el(
        'div',
        'stats',
        el(
          'div',
          'stat is-lead',
          el('div', 'rl-eyebrow', 'Value'),
          el('div', 'figure', formatRobux(summary.value, compact)),
          el('div', 'stat-note', `${summary.copies} ${summary.copies === 1 ? 'item' : 'items'}`),
        ),
        el(
          'div',
          'stat',
          el('div', 'rl-eyebrow', 'RAP'),
          el('div', 'figure', formatRobux(summary.rap, compact)),
          el('div', 'stat-note', 'Recent average price'),
        ),
        el(
          'div',
          'stat',
          el('div', 'rl-eyebrow', 'USD'),
          el('div', 'figure', usdFigure),
          el('div', 'stat-note', summary.usd?.estimated ? 'RoUtility and fallback rate' : 'RoUtility estimates'),
        ),
        el(
          'div',
          'stat',
          el('div', 'rl-eyebrow', 'Rare'),
          el('div', 'figure', String(summary.rare)),
          el(
            'div',
            'stat-note',
            summary.rare ? `${Math.round((summary.rare / summary.copies) * 100)}% of items` : 'None',
          ),
        ),
      ),
      segments.length ? el('div', 'makeup', compositionBar(segments), legend(segments)) : null,
    ),
    el('div', 'toolbar', el('label', 'search', icon('search'), search), el('div', 'sort', ...sortButtons), rareFilter),
    body,
    el(
      'footer',
      'foot',
      el(
        'span',
        '',
        options.scannedAt
          ? `Inventory scanned by Rolimon's ${formatAge(options.scannedAt)}`
          : "Inventory from Rolimon's",
      ),
      el(
        'span',
        '',
        summary.unlisted
          ? `${summary.unlisted} unlisted ${summary.unlisted === 1 ? 'item is' : 'items are'} excluded`
          : 'RoLens',
      ),
    ),
  );
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.tabIndex = -1;
  sheet.querySelector('.title')!.id = titleId;
  sheet.setAttribute('aria-labelledby', titleId);

  const backdrop = el('div', 'backdrop');
  root.append(backdrop, el('div', 'frame', sheet));
  document.body.append(host);
  document.documentElement.style.overflow = 'hidden';
  draw();

  let closing = false;
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      dismiss();
    }
  };
  function dismiss(): void {
    if (closing) return;
    closing = true;
    openPanel = null;
    document.removeEventListener('keydown', onKey, true);
    host.classList.remove('is-open');
    host.classList.add('is-closing');
    window.setTimeout(() => {
      host.remove();
      document.documentElement.style.overflow = previousOverflow;
      previousFocus?.focus?.();
      options.onClose?.();
    }, CLOSE_MS);
  }
  openPanel = { close: dismiss };

  close.addEventListener('click', dismiss);
  backdrop.addEventListener('click', dismiss);
  sheet.parentElement!.addEventListener('click', (event) => {
    if (event.target === sheet.parentElement) dismiss();
  });
  document.addEventListener('keydown', onKey, true);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      host.classList.add('is-open');
      sheet.focus({ preventScroll: true });
    }),
  );
}
