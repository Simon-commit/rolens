import { el } from '../dom';
import { icon } from './icons';
import { button, openModal } from './modal';

/* The dialog that shows a trade proof, with Download and Copy. */

const css = `
.preview { display: grid; place-items: center; min-height: 240px; border-radius: 12px; background: var(--rl-surface); overflow: hidden; }
.preview canvas { display: block; width: 100%; height: auto; }
`;

export interface ProofDialog {
  /** Shows the finished image and enables its actions. */
  show(canvas: HTMLCanvasElement, fileName: string): void;
  fail(message: string): void;
  close(): void;
}

export function openProofDialog(opener: HTMLElement | null): ProofDialog {
  const modal = openModal('proof-dialog', 'Trade proof', opener, { css });
  const preview = el('div', 'preview', el('div', 'status', 'Creating the proof…'));
  const download = button('Download PNG', 'primary', 'download');
  const copy = button('Copy image', undefined, 'copy');
  download.disabled = true;
  copy.disabled = true;
  modal.body.append(preview);
  modal.foot.append(
    el('span', 'note', 'Created on this device with current values. Nothing is uploaded.'),
    copy,
    download,
  );

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
    close: modal.close,
  };
}
