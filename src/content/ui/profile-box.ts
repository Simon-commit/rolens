import { formatAge, formatRobux } from '../../core/format';
import type { InventorySummary } from '../../core/inventory';
import { el } from '../dom';
import type { RenderContext } from './context';
import { glyph, icon } from './icons';
import { composition, compositionBar, compositionCss, inventoryUsd, inventoryUsdTip } from './inventory-common';
import { createWidget } from './shadow';
import { attachTip } from './tooltip';

/** What the profile box shows: the inventory's totals, or why there are none. */
export type ProfileBoxState =
  | { kind: 'loading' }
  | { kind: 'ready'; summary: InventorySummary; scannedAt: number | null }
  | { kind: 'empty' | 'private' | 'terminated' | 'unknown' | 'needs-rolimons' }
  | { kind: 'error'; message: string };

const MESSAGES: Record<Exclude<ProfileBoxState['kind'], 'loading' | 'ready'>, [string, string]> = {
  empty: ['No limited items', "Rolimon's lists no limited items in this inventory."],
  private: ['Inventory is private', 'This player has chosen to keep their inventory private.'],
  terminated: ['Account unavailable', 'Roblox has closed this account.'],
  unknown: ['Not yet scanned', "Rolimon's has not scanned this player's inventory yet."],
  'needs-rolimons': ["Rolimon's is turned off", "Inventory data comes from Rolimon's. Turn it on in RoLens to see it."],
  error: ['Inventory unavailable', ''],
};

const css = `
:host { display: block; margin: 16px 0; }
.box {
  position: relative; isolation: isolate; overflow: hidden;
  display: grid; gap: 12px;
  padding: 14px 16px 14px 18px;
  border-radius: var(--rl-radius-lg);
  border: 1px solid var(--rl-border);
  background: var(--rl-bg-raised);
  box-shadow: var(--rl-shadow);
  outline: none;
  animation: rl-rise 0.3s ease both;
}
/* A brand hairline on top, and a faint glow and dot texture behind the figures. */
.box::before {
  content: ''; position: absolute; inset: 0 0 auto 0; height: 2px;
  background: linear-gradient(90deg, var(--rl-brand-a), var(--rl-brand-b));
}
.box::after {
  content: ''; position: absolute; inset: 0; z-index: -1; pointer-events: none;
  background:
    radial-gradient(120% 140% at 100% 0%, color-mix(in srgb, var(--rl-brand-b) 9%, transparent), transparent 55%),
    radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--rl-text) 7%, transparent) 1px, transparent 0) 0 0 / 14px 14px;
  mask-image: linear-gradient(90deg, transparent 30%, #000);
}
.box.is-interactive { cursor: pointer; transition: box-shadow 0.2s ease, border-color 0.2s ease, transform 0.2s cubic-bezier(0.2, 0, 0, 1); }
.box.is-interactive:hover { border-color: var(--rl-border-strong); box-shadow: var(--rl-shadow-lg); transform: translateY(-1px); }
.box.is-interactive:focus-visible { box-shadow: 0 0 0 2px var(--rl-bg), 0 0 0 4px var(--rl-accent); }

.row { display: flex; align-items: center; gap: 22px; flex-wrap: wrap; min-width: 0; }
.brand { display: flex; align-items: center; gap: 10px; flex: none; }
.brand-text { display: grid; gap: 1px; }
.brand-name { font-size: 13px; font-weight: 700; letter-spacing: -0.01em; }
.brand-sub { font-size: 11px; color: var(--rl-text-3); }
.divider { width: 1px; align-self: stretch; background: var(--rl-border); }

.stats { display: flex; gap: 26px; flex: 1; min-width: 0; flex-wrap: wrap; }
.stat { display: grid; gap: 3px; min-width: 0; }
.stat .rl-eyebrow { font-size: 10px; }
.figure { font-size: 16px; font-weight: 700; letter-spacing: -0.02em; white-space: nowrap; line-height: 1.1; }
.figure.is-lead { font-size: 22px; letter-spacing: -0.03em; }
.figure .usd.is-estimate { cursor: help; outline: none; }
.muted { color: var(--rl-text-2); font-weight: 600; }

.open {
  display: inline-flex; align-items: center; gap: 6px; flex: none;
  height: 34px; padding: 0 12px 0 14px;
  border-radius: 999px;
  background: var(--rl-surface); color: var(--rl-text);
  font-size: 12.5px; font-weight: 650;
  transition: background-color 0.2s ease, color 0.2s ease;
}
.open .rl-icon { width: 14px; height: 14px; transition: transform 0.25s cubic-bezier(0.2, 0, 0, 1); }
.box.is-interactive:hover .open { background: var(--rl-accent-soft); color: var(--rl-accent); }
.box.is-interactive:hover .open .rl-icon { transform: translateX(2px); }

.foot { display: flex; align-items: center; gap: 12px; }
.foot .mix { flex: 1; height: 4px; }
.scan { font-size: 11px; color: var(--rl-text-3); white-space: nowrap; }

.note { display: grid; gap: 2px; flex: 1; min-width: 0; }
.note b { font-size: 13px; font-weight: 650; }
.note span { font-size: 12px; color: var(--rl-text-2); }
.retry {
  height: 30px; padding: 0 12px; border: 0; border-radius: 999px; flex: none;
  background: var(--rl-surface); color: var(--rl-text); font: inherit; font-size: 12px; font-weight: 650; cursor: pointer;
}
.retry:hover { background: var(--rl-surface-2); }

/* Loading: placeholders shaped like the figures, with a slow sheen. */
.skeleton { display: block; height: 12px; border-radius: 6px; background: var(--rl-surface); position: relative; overflow: hidden; }
.skeleton.is-lead { height: 20px; width: 92px; }
.skeleton::after {
  content: ''; position: absolute; inset: 0; transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--rl-text) 6%, transparent), transparent);
  animation: sheen 1.4s ease-in-out infinite;
}
@keyframes sheen { to { transform: translateX(100%); } }
@media (max-width: 640px) { .divider { display: none; } .stats { gap: 18px; } }
${compositionCss}
`;

function brand(sub: string): HTMLElement {
  return el(
    'div',
    'brand',
    glyph(26),
    el('div', 'brand-text', el('span', 'brand-name', 'RoLens'), el('span', 'brand-sub', sub)),
  );
}

function statBlock(label: string, value: Node | string, lead = false): HTMLElement {
  return el('div', 'stat', el('div', 'rl-eyebrow', label), el('div', lead ? 'figure is-lead' : 'figure', value));
}

function readyContent(state: Extract<ProfileBoxState, { kind: 'ready' }>, ctx: RenderContext): HTMLElement[] {
  const { summary } = state;
  const compact = ctx.settings.compactNumbers;
  const usdText = inventoryUsd(summary, compact);
  let usd: Node | string = el('span', 'rl-faint', '—');
  if (usdText) {
    const estimate = usdText.startsWith('≈');
    usd = el('span', estimate ? 'usd is-estimate' : 'usd', usdText);
    if (estimate) attachTip(usd as HTMLElement, ...inventoryUsdTip(summary));
  }
  const segments = composition(summary);
  return [
    el(
      'div',
      'row',
      brand('Inventory'),
      el('span', 'divider'),
      el(
        'div',
        'stats',
        statBlock('Value', formatRobux(summary.value, compact), true),
        statBlock('RAP', formatRobux(summary.rap, compact)),
        statBlock('USD', usd),
        statBlock('Items', String(summary.copies)),
        summary.rare ? statBlock('Rare', String(summary.rare)) : null,
      ),
      el('span', 'open', 'View inventory', icon('arrow')),
    ),
    el(
      'div',
      'foot',
      compositionBar(segments),
      el(
        'span',
        'scan',
        state.scannedAt ? `Scanned by Rolimon's ${formatAge(state.scannedAt)}` : "Data from Rolimon's",
      ),
    ),
  ];
}

function loadingContent(): HTMLElement[] {
  const placeholder = (label: string, lead = false) =>
    el('div', 'stat', el('div', 'rl-eyebrow', label), el('span', lead ? 'skeleton is-lead' : 'skeleton'));
  return [
    el(
      'div',
      'row',
      brand('Inventory'),
      el('span', 'divider'),
      el('div', 'stats', placeholder('Value', true), placeholder('RAP'), placeholder('USD'), placeholder('Items')),
    ),
  ];
}

function stateKey(state: ProfileBoxState, ctx: RenderContext): string {
  if (state.kind === 'error') return `error:${state.message}`;
  if (state.kind !== 'ready') return state.kind;
  const { summary } = state;
  return JSON.stringify([
    summary.value,
    summary.rap,
    summary.copies,
    summary.rare,
    summary.usd,
    state.scannedAt,
    ctx.settings.compactNumbers,
  ]);
}

/**
 * Creates or updates the RoLens box on a profile. Updating in place keeps the entrance
 * animation from replaying as figures arrive.
 */
export function renderProfileBox(
  existing: HTMLElement | null,
  state: ProfileBoxState,
  ctx: RenderContext,
  actions: { open: () => void; retry: () => void },
): HTMLElement {
  let host = existing;
  let box = host?.shadowRoot?.querySelector<HTMLElement>('.box') ?? null;
  if (!host || !box) {
    const widget = createWidget('profile', css, 'section');
    host = widget.host;
    host.setAttribute('aria-label', 'RoLens inventory value');
    box = el('div', 'box');
    box.addEventListener('click', (event) => {
      if (box!.classList.contains('is-interactive') && !(event.target as Element).closest('.retry')) actions.open();
    });
    box.addEventListener('keydown', (event) => {
      if (box!.classList.contains('is-interactive') && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        actions.open();
      }
    });
    widget.root.append(box);
  }

  // Scans run on every page change: rebuild only when what the box shows has changed.
  const key = stateKey(state, ctx);
  if (host.dataset.state === key) return host;
  host.dataset.state = key;

  const interactive = state.kind === 'ready';
  box.classList.toggle('is-interactive', interactive);
  if (interactive) {
    box.tabIndex = 0;
    box.setAttribute('role', 'button');
    box.setAttribute('aria-haspopup', 'dialog');
  } else {
    box.removeAttribute('tabindex');
    box.removeAttribute('role');
    box.removeAttribute('aria-haspopup');
  }

  if (state.kind === 'ready') box.replaceChildren(...readyContent(state, ctx));
  else if (state.kind === 'loading') box.replaceChildren(...loadingContent());
  else {
    const [title, body] = MESSAGES[state.kind];
    const retry = state.kind === 'error' ? el('button', 'retry', 'Try again') : null;
    if (retry) {
      retry.type = 'button';
      retry.addEventListener('click', actions.retry);
    }
    box.replaceChildren(
      el(
        'div',
        'row',
        brand('Inventory'),
        el('span', 'divider'),
        el('div', 'note', el('b', '', title), el('span', '', state.kind === 'error' ? state.message : body)),
        retry,
      ),
    );
  }
  return host;
}
