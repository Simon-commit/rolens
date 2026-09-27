import { el } from '../dom';
import { createWidget } from './shadow';

/*
 * A small explanation that appears when hovering or focusing an icon or tag. It lives
 * in its own fixed widget on <body>, so it is never clipped by the widget it explains.
 */
const css = `
:host { position: fixed; z-index: 2147483001; top: 0; left: 0; pointer-events: none; }
.tip {
  max-width: 240px; padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid var(--rl-border);
  background: var(--rl-bg-raised);
  box-shadow: var(--rl-shadow);
  font-size: 11.5px; line-height: 1.45; color: var(--rl-text-2);
  opacity: 0; transform: translateY(3px);
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.tip.is-open { opacity: 1; transform: none; }
.title { display: block; margin-bottom: 2px; font-size: 12px; font-weight: 650; color: var(--rl-text); }
`;

let widget: { host: HTMLElement; tip: HTMLElement } | null = null;
let hideTimer: number | undefined;

function ensureWidget() {
  if (widget?.host.isConnected) return widget;
  const { host, root } = createWidget('tooltip', css, 'div');
  const tip = el('div', 'tip');
  tip.setAttribute('role', 'tooltip');
  root.append(tip);
  document.body.append(host);
  widget = { host, tip };
  return widget;
}

function themeOf(anchor: Element): string {
  const root = anchor.getRootNode();
  return root instanceof ShadowRoot ? ((root.host as HTMLElement).dataset.theme ?? 'light') : 'light';
}

export function showTip(anchor: Element, title: string, body: string): void {
  window.clearTimeout(hideTimer);
  const { host, tip } = ensureWidget();
  host.dataset.theme = themeOf(anchor);
  tip.replaceChildren(el('span', 'title', title), body);
  const margin = 8;
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(tip.offsetWidth || 240, 240);
  const height = tip.offsetHeight || 48;
  const left = Math.max(margin, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - margin));
  const above = rect.top - height - margin;
  const top = above >= margin ? above : rect.bottom + margin;
  host.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  requestAnimationFrame(() => tip.classList.add('is-open'));
}

export function hideTip(): void {
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => widget?.tip.classList.remove('is-open'), 60);
}

/** Explains `anchor` on hover and keyboard focus. The text also becomes its accessible description. */
export function attachTip<T extends HTMLElement>(anchor: T, title: string, body: string): T {
  anchor.tabIndex = 0;
  anchor.setAttribute('aria-label', `${title}. ${body}`);
  anchor.dataset.tip = title;
  const show = () => showTip(anchor, title, body);
  anchor.addEventListener('mouseenter', show);
  anchor.addEventListener('focus', show);
  anchor.addEventListener('mouseleave', hideTip);
  anchor.addEventListener('blur', hideTip);
  return anchor;
}
