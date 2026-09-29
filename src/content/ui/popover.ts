import { el } from '../dom';
import { createWidget, themeOf } from './shadow';

/*
 * A floating panel shown beside an element on hover or focus: the tooltip and the item
 * hover card. It lives in its own fixed widget on <body>, so it is never clipped by the
 * card or row it belongs to, and it closes by itself if that element leaves the page.
 */

const MARGIN = 8;

export interface Popover {
  /** Fills the panel with `content` and shows it beside `anchor`. */
  show(anchor: Element, content: (Node | string)[]): void;
  hide(): void;
}

export function createPopover(
  kind: string,
  css: string,
  options: { width: number; placement: 'above' | 'below'; hideDelay: number },
): Popover {
  let widget: { host: HTMLElement; panel: HTMLElement } | null = null;
  let current: Element | null = null;
  let hideTimer: number | undefined;

  const ensure = () => {
    if (widget?.host.isConnected) return widget;
    const { host, root } = createWidget(
      kind,
      `:host { position: fixed; top: 0; left: 0; pointer-events: none; }
       .panel { width: max-content; max-width: ${options.width}px; }
       ${css}`,
      'div',
    );
    const panel = el('div', 'panel');
    panel.setAttribute('role', 'tooltip');
    root.append(panel);
    document.body.append(host);
    widget = { host, panel };
    return widget;
  };

  const close = () => {
    current = null;
    widget?.panel.classList.remove('is-open');
  };

  // Roblox and RoLens both replace cards while the pointer rests on them; a panel whose
  // element has gone would otherwise never receive the mouseleave that closes it.
  const watch = () => {
    if (!current) return;
    if (current.isConnected) requestAnimationFrame(watch);
    else close();
  };

  const place = (host: HTMLElement, panel: HTMLElement, rect: DOMRect) => {
    const width = Math.min(panel.offsetWidth || options.width, options.width);
    const height = panel.offsetHeight;
    const left = Math.max(MARGIN, Math.min(rect.left + rect.width / 2 - width / 2, innerWidth - width - MARGIN));
    const above = rect.top - height - MARGIN;
    const below = rect.bottom + MARGIN;
    const top =
      options.placement === 'above'
        ? above >= MARGIN
          ? above
          : below
        : below + height <= innerHeight - MARGIN
          ? below
          : above;
    host.style.transform = `translate(${Math.round(left)}px, ${Math.round(Math.max(MARGIN, top))}px)`;
  };

  return {
    show(anchor, content) {
      window.clearTimeout(hideTimer);
      const { host, panel } = ensure();
      host.dataset.theme = themeOf(anchor);
      panel.replaceChildren(...content);
      place(host, panel, anchor.getBoundingClientRect());
      const wasWatching = current !== null;
      current = anchor;
      if (!wasWatching) requestAnimationFrame(watch);
      requestAnimationFrame(() => panel.classList.add('is-open'));
    },
    hide() {
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(close, options.hideDelay);
    },
  };
}

/** Shows `popover` while `anchor` is hovered or focused. */
export function attachPopover(anchor: HTMLElement, popover: Popover, content: () => (Node | string)[]): void {
  const show = () => popover.show(anchor, content());
  anchor.addEventListener('mouseenter', show);
  anchor.addEventListener('focus', show);
  anchor.addEventListener('mouseleave', popover.hide);
  anchor.addEventListener('blur', popover.hide);
}
