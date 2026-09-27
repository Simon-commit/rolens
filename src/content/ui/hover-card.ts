import { formatRobux } from '../../core/format';
import type { ItemValue } from '../../core/types';
import { effectiveValue } from '../../core/types';
import { el } from '../dom';
import type { RenderContext } from './context';
import { glyph } from './icons';
import {
  demandStat,
  detailsCss,
  flagPills,
  rapInsight,
  rapStat,
  routilityStat,
  sourceLine,
  stat,
  trendStat,
  usdStat,
} from './item-details';
import { createWidget } from './shadow';

const css = `
:host { position: fixed; z-index: 2147483000; top: 0; left: 0; pointer-events: none; }
.card {
  width: 272px; padding: 14px;
  border-radius: var(--rl-radius-lg);
  border: 1px solid var(--rl-border);
  background: var(--rl-bg-raised);
  box-shadow: var(--rl-shadow-lg);
  opacity: 0; transform: translateY(4px) scale(0.98);
  transition: opacity 0.14s ease, transform 0.14s ease;
}
.card.is-open { opacity: 1; transform: none; }
.head { display: flex; align-items: center; gap: 8px; min-width: 0; }
.name { flex: 1; min-width: 0; font-size: 13px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.acronym { font-size: 11px; font-weight: 600; color: var(--rl-text-3); }
.hero { display: flex; align-items: flex-end; justify-content: space-between; margin: 12px 0; }
.big { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; line-height: 1; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; padding: 12px 0; border-top: 1px solid var(--rl-border); }
.insight { font-size: 11.5px; color: var(--rl-text-2); padding-top: 10px; border-top: 1px solid var(--rl-border); }
.flags { margin-top: 10px; }
.foot { display: flex; justify-content: space-between; margin-top: 10px; font-size: 11px; color: var(--rl-text-3); }
${detailsCss}
`;

let widget: { host: HTMLElement; root: ShadowRoot; card: HTMLElement } | null = null;
let hideTimer: number | undefined;

function ensureWidget() {
  if (widget?.host.isConnected) return widget;
  const { host, root } = createWidget('hovercard', css, 'div');
  const card = el('div', 'card');
  card.setAttribute('role', 'tooltip');
  root.append(card);
  document.body.append(host);
  widget = { host, root, card };
  return widget;
}

export function buildHoverCard(item: ItemValue, ctx: RenderContext): HTMLElement[] {
  const compact = ctx.settings.compactNumbers;
  const insight = rapInsight(item);
  const flags = flagPills(item);
  const nodes: (HTMLElement | null)[] = [
    el(
      'div',
      'head',
      glyph(18),
      el('span', 'name', item.name),
      item.acronym ? el('span', 'acronym', item.acronym) : null,
    ),
    el(
      'div',
      'hero',
      el(
        'div',
        '',
        el('div', 'rl-eyebrow', item.value === null ? 'RAP (no value)' : 'Value'),
        el('div', 'big', formatRobux(effectiveValue(item), compact)),
      ),
    ),
    el(
      'div',
      'grid',
      rapStat(item, ctx),
      usdStat(item, ctx) ?? stat('USD', el('span', 'rl-faint', '—')),
      demandStat(item),
      trendStat(item),
      routilityStat(item, ctx),
      item.routility?.copies ? stat('Copies', item.routility.copies.toLocaleString('en-US')) : null,
    ),
    insight ? el('div', 'insight', insight) : null,
    flags.length ? el('div', 'flags', ...flags) : null,
    el('div', 'foot', el('span', '', sourceLine(ctx, Boolean(item.routility))), el('span', '', 'RoLens')),
  ];
  const result = nodes.filter((node): node is HTMLElement => node !== null);
  // The hover card is itself a tooltip that can't be pointed at, so its tags stay out of the tab order.
  for (const node of result) for (const tip of node.querySelectorAll('[data-tip]')) tip.removeAttribute('tabindex');
  return result;
}

function position(card: HTMLElement, host: HTMLElement, anchor: DOMRect): void {
  const margin = 8;
  const width = 272;
  const height = card.offsetHeight || 260;
  let left = anchor.left + anchor.width / 2 - width / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
  const below = anchor.bottom + margin;
  const top = below + height > window.innerHeight - margin ? anchor.top - height - margin : below;
  host.style.transform = `translate(${Math.round(left)}px, ${Math.round(Math.max(margin, top))}px)`;
}

export function showHoverCard(anchor: Element, item: ItemValue, ctx: RenderContext): void {
  window.clearTimeout(hideTimer);
  const { host, card } = ensureWidget();
  host.dataset.theme =
    anchor.getRootNode() instanceof ShadowRoot
      ? (((anchor.getRootNode() as ShadowRoot).host as HTMLElement).dataset.theme ?? 'light')
      : 'light';
  card.replaceChildren(...buildHoverCard(item, ctx));
  position(card, host, anchor.getBoundingClientRect());
  requestAnimationFrame(() => card.classList.add('is-open'));
}

export function hideHoverCard(): void {
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => widget?.card.classList.remove('is-open'), 80);
}

export function attachHoverCard(anchor: HTMLElement, item: ItemValue, ctx: RenderContext): void {
  const show = () => showHoverCard(anchor, item, ctx);
  anchor.addEventListener('mouseenter', show);
  anchor.addEventListener('focus', show);
  anchor.addEventListener('mouseleave', hideHoverCard);
  anchor.addEventListener('blur', hideHoverCard);
}
