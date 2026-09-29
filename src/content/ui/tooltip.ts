import { el } from '../dom';
import { attachPopover, createPopover } from './popover';

/** A short explanation shown when hovering or focusing an icon, tag or figure. */
const tooltip = createPopover(
  'tooltip',
  `:host { z-index: 2147483001; }
   .panel {
     padding: 8px 10px;
     border-radius: 10px;
     border: 1px solid var(--rl-border);
     background: var(--rl-bg-raised);
     box-shadow: var(--rl-shadow);
     font-size: 11.5px; line-height: 1.45; color: var(--rl-text-2);
     opacity: 0; transform: translateY(3px);
     transition: opacity 0.12s ease, transform 0.12s ease;
   }
   .panel.is-open { opacity: 1; transform: none; }
   .title { display: block; margin-bottom: 2px; font-size: 12px; font-weight: 650; color: var(--rl-text); }`,
  { width: 240, placement: 'above', hideDelay: 60 },
);

/** Explains `anchor` on hover and keyboard focus. The text also becomes its accessible description. */
export function attachTip<T extends HTMLElement>(anchor: T, title: string, body: string): T {
  anchor.tabIndex = 0;
  anchor.setAttribute('aria-label', `${title}. ${body}`);
  anchor.dataset.tip = title;
  attachPopover(anchor, tooltip, () => [el('span', 'title', title), body]);
  return anchor;
}
