import { el } from '../dom';
import { icon } from './icons';
import { createWidget } from './shadow';

/*
 * The dialog that shows a trade proof with Download and Copy. It sits above the page in
 * its own widget, closes with Escape, the close button or a click outside, and returns
 * focus to the button that opened it.
 */

const css = `
:host { position: fixed; inset: 0; z-index: 2147483200; }
.backdrop {
  position: absolute; inset: 0; display: grid; place-items: center; padding: 24px;
  background: rgba(8, 10, 14, 0.55); backdrop-filter: blur(2px);
  animation: rl-fade 0.18s ease both;
}
@keyframes rl-fade { from { opacity: 0; } }
.dialog {
  display: flex; flex-direction: column; width: min(820px, 100%); max-height: calc(100vh - 48px);
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
.close:focus-visible, .btn:focus-visible { outline: 2px solid var(--rl-accent); outline-offset: 2px; }
.body { flex: 1; min-height: 0; overflow: auto; padding: 0 18px; }
.preview { display: grid; place-items: center; min-height: 240px; border-radius: 12px; background: var(--rl-surface); overflow: hidden; }
.preview canvas { display: block; width: 100%; height: auto; }
.status { font-size: 13px; color: var(--rl-text-3); padding: 40px; text-align: center; }
.foot { display: flex; align-items: center; gap: 10px; padding: 14px 18px 16px; }
.note { flex: 1; min-width: 0; font-size: 12px; color: var(--rl-text-3); }
.btn {
  display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 14px;
  border-radius: 10px; border: 1px solid var(--rl-border-strong); background: var(--rl-bg-raised);
  color: var(--rl-text); font: inherit; font-size: 13px; font-weight: 650; cursor: pointer;
  transition: background 0.15s ease, opacity 0.15s ease;
}
.btn .rl-icon { width: 15px; height: 15px; }
.btn:hover { background: var(--rl-surface); }
.btn[disabled] { opacity: 0.5; cursor: default; }
.btn--primary { border-color: transparent; color: #fff; background: linear-gradient(135deg, var(--rl-brand-a), var(--rl-brand-b)); }
.btn--primary:hover { background: linear-gradient(135deg, var(--rl-brand-a), var(--rl-brand-b)); filter: brightness(1.05); }
.btn.is-done { color: var(--rl-win); }
`;

export interface ProofDialog {
  /** Shows the finished image and enables its actions. */
  show(canvas: HTMLCanvasElement, fileName: string): void;
  fail(message: string): void;
  close(): void;
}

export function openProofDialog(opener: HTMLElement | null): ProofDialog {
  document.querySelector('[data-rolens="proof-dialog"]')?.remove();
  const { host, root } = createWidget('proof-dialog', css, 'div');
  const closeButton = el('button', 'close', icon('close'));
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Close');
  const preview = el('div', 'preview', el('div', 'status', 'Creating the proof…'));
  const download = el('button', 'btn btn--primary', icon('download'), 'Download PNG');
  const copy = el('button', 'btn', icon('copy'), 'Copy image');
  for (const button of [download, copy]) {
    button.type = 'button';
    button.disabled = true;
  }
  const dialog = el(
    'div',
    'dialog',
    el('div', 'head', el('span', 'title', 'Trade proof'), closeButton),
    el('div', 'body', preview),
    el(
      'div',
      'foot',
      el('span', 'note', 'Created on this device with current values. Nothing is uploaded.'),
      copy,
      download,
    ),
  );
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'Trade proof');
  dialog.tabIndex = -1;
  const backdrop = el('div', 'backdrop', dialog);
  root.append(backdrop);
  document.body.append(host);
  dialog.focus();

  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    host.remove();
    opener?.focus({ preventScroll: true });
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  };
  document.addEventListener('keydown', onKey, true);
  closeButton.addEventListener('click', close);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) close();
  });

  return {
    show(canvas, fileName) {
      preview.replaceChildren(canvas);
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', 'Trade proof image');
      const blob = new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/png'));
      download.disabled = false;
      copy.disabled = typeof ClipboardItem === 'undefined';
      download.addEventListener('click', () => {
        void blob.then((file) => {
          if (!file) return;
          const url = URL.createObjectURL(file);
          const link = el('a');
          link.href = url;
          link.download = fileName;
          link.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
        });
      });
      copy.addEventListener('click', () => {
        void blob
          .then((file) => (file ? navigator.clipboard.write([new ClipboardItem({ 'image/png': file })]) : undefined))
          .then(() => {
            copy.classList.add('is-done');
            copy.replaceChildren(icon('check'), 'Copied');
          })
          .catch(() => {
            copy.replaceChildren(icon('copy'), 'Copy not available');
            copy.disabled = true;
          });
      });
    },
    fail(message) {
      preview.replaceChildren(el('div', 'status', message));
    },
    close,
  };
}
