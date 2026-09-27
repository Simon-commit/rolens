import { el } from '../dom';
import { icon } from './icons';
import { createWidget } from './shadow';

/*
 * A dialog above the page, in its own widget: trade proofs and cancelling trades. It
 * closes with Escape, the close button or a click outside (unless it is busy), and
 * returns focus to the control that opened it.
 */

export const modalCss = `
:host { position: fixed; inset: 0; z-index: 2147483200; }
.backdrop {
  position: absolute; inset: 0; display: grid; place-items: center; padding: 24px;
  background: rgba(8, 10, 14, 0.55); backdrop-filter: blur(2px);
  animation: rl-fade 0.18s ease both;
}
@keyframes rl-fade { from { opacity: 0; } }
.dialog {
  display: flex; flex-direction: column; width: min(var(--width, 820px), 100%); max-height: calc(100vh - 48px);
  border-radius: var(--rl-radius-lg); border: 1px solid var(--rl-border);
  background: var(--rl-bg-raised); box-shadow: var(--rl-shadow-lg); outline: none;
  animation: rl-rise 0.22s cubic-bezier(0.2, 0, 0, 1) both;
}
.head { display: flex; align-items: center; gap: 10px; padding: 14px 14px 12px 18px; }
.title { flex: 1; font-size: 15px; font-weight: 700; }
.close {
  display: grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: 8px;
  background: transparent; color: var(--rl-text-3); cursor: pointer;
}
.close:hover { background: var(--rl-surface); color: var(--rl-text); }
.close[disabled] { opacity: 0.4; cursor: default; }
.close:focus-visible, .btn:focus-visible { outline: 2px solid var(--rl-accent); outline-offset: 2px; }
.body { flex: 1; min-height: 0; overflow: auto; padding: 0 18px; }
.foot { display: flex; align-items: center; gap: 10px; padding: 14px 18px 16px; }
.note { flex: 1; min-width: 0; font-size: 12px; color: var(--rl-text-3); }
.status { font-size: 13px; color: var(--rl-text-2); padding: 36px 12px; text-align: center; line-height: 1.5; }
.btn {
  display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 14px;
  border-radius: 10px; border: 1px solid var(--rl-border-strong); background: var(--rl-bg-raised);
  color: var(--rl-text); font: inherit; font-size: 13px; font-weight: 650; cursor: pointer; white-space: nowrap;
  transition: background 0.15s ease, opacity 0.15s ease, filter 0.15s ease;
}
.btn .rl-icon { width: 15px; height: 15px; }
.btn:hover { background: var(--rl-surface); }
.btn[disabled] { opacity: 0.5; cursor: default; }
.btn--primary { border-color: transparent; color: #fff; background: linear-gradient(135deg, var(--rl-brand-a), var(--rl-brand-b)); }
.btn--danger { border-color: transparent; color: #fff; background: var(--rl-loss); }
.btn--primary:hover, .btn--danger:hover { filter: brightness(1.06); }
.btn--primary:hover { background: linear-gradient(135deg, var(--rl-brand-a), var(--rl-brand-b)); }
.btn--danger:hover { background: var(--rl-loss); }
.btn.is-done { color: var(--rl-win); }
`;

export interface Modal {
  host: HTMLElement;
  body: HTMLElement;
  foot: HTMLElement;
  /** While busy, the dialog cannot be closed. */
  setBusy(busy: boolean): void;
  close(): void;
}

export function button(label: string, variant?: 'primary' | 'danger', iconName?: Parameters<typeof icon>[0]) {
  const node = el('button', variant ? `btn btn--${variant}` : 'btn', iconName ? icon(iconName) : null, label);
  node.type = 'button';
  return node;
}

export function openModal(
  kind: string,
  title: string,
  opener: HTMLElement | null,
  options: { css?: string; width?: number } = {},
): Modal {
  document.querySelector(`[data-rolens="${kind}"]`)?.remove();
  const { host, root } = createWidget(kind, modalCss + (options.css ?? ''), 'div');
  const closeButton = el('button', 'close', icon('close'));
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Close');
  const body = el('div', 'body');
  const foot = el('div', 'foot');
  const dialog = el('div', 'dialog', el('div', 'head', el('span', 'title', title), closeButton), body, foot);
  if (options.width) dialog.style.setProperty('--width', `${options.width}px`);
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', title);
  dialog.tabIndex = -1;
  const backdrop = el('div', 'backdrop', dialog);
  root.append(backdrop);
  document.body.append(host);
  dialog.focus();

  let busy = false;
  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    host.remove();
    opener?.focus({ preventScroll: true });
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !host.isConnected) return;
    event.stopPropagation();
    if (!busy) close();
  };
  document.addEventListener('keydown', onKey, true);
  closeButton.addEventListener('click', () => !busy && close());
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop && !busy) close();
  });

  return {
    host,
    body,
    foot,
    setBusy(next) {
      busy = next;
      closeButton.disabled = next;
    },
    close,
  };
}
