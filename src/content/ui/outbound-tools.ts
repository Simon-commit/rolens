import { el } from '../dom';
import type { CancelMode } from './cancel-dialog';
import { glyph } from './icons';
import { createWidget } from './shadow';
import { attachTip } from './tooltip';

/*
 * A slim row above the outbound Trades list with the two cancel tools. Each opens a
 * dialog that lists the trades first; nothing is cancelled from here directly.
 */

const css = `
:host { display: block; margin: 0 0 8px; }
.row { display: flex; align-items: center; gap: 6px; height: 34px; padding: 0 4px 0 10px; border-radius: 10px; background: var(--rl-surface); }
.label { flex: 1; min-width: 0; display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 650; color: var(--rl-text-2); white-space: nowrap; overflow: hidden; }
.action {
  height: 26px; padding: 0 10px; border: 0; border-radius: 7px; background: transparent;
  color: var(--rl-text-2); font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; white-space: nowrap;
}
.action:hover { background: var(--rl-bg-raised); color: var(--rl-loss); }
.action:focus-visible { outline: 2px solid var(--rl-accent); outline-offset: 1px; }
`;

export function renderOutboundTools(
  existing: HTMLElement | null,
  open: (mode: CancelMode, opener: HTMLElement) => void,
): HTMLElement {
  if (existing) return existing;
  const { host, root } = createWidget('outbound-tools', css, 'div');
  const action = (mode: CancelMode, label: string, title: string, body: string) => {
    const node = el('button', 'action', label);
    node.type = 'button';
    attachTip(node, title, body);
    node.addEventListener('click', () => open(mode, node));
    return node;
  };
  root.append(
    el(
      'div',
      'row',
      el('span', 'label', glyph(14), 'Outbound trades'),
      action(
        'unowned',
        'Cancel invalid',
        'Cancel invalid trades',
        'Finds trades offering items you no longer own, which Roblox can never complete, and lets you cancel them after reviewing the list.',
      ),
      action(
        'all',
        'Review all',
        'Review outbound trades',
        'Lists every outbound trade with its value, with quick selections for old trades and trades that lose value, so you can choose which to cancel.',
      ),
    ),
  );
  return host;
}
