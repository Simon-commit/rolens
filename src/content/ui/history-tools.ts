import { el } from '../dom';
import { glyph } from './icons';
import { createWidget } from './shadow';
import { attachTip } from './tooltip';

/* A slim row above the completed Trades list that opens trade history. */

const css = `
:host { display: block; margin: 0 0 8px; }
.row { display: flex; align-items: center; gap: 6px; height: 34px; padding: 0 4px 0 10px; border-radius: 10px; background: var(--rl-surface); }
.label { flex: 1; min-width: 0; display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 650; color: var(--rl-text-2); white-space: nowrap; overflow: hidden; }
.action {
  height: 26px; padding: 0 10px; border: 0; border-radius: 7px; background: transparent;
  color: var(--rl-text-2); font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; white-space: nowrap;
}
.action:hover { background: var(--rl-bg-raised); color: var(--rl-accent); }
.action:focus-visible { outline: 2px solid var(--rl-accent); outline-offset: 1px; }
`;

export function renderHistoryTools(existing: HTMLElement | null, open: (opener: HTMLElement) => void): HTMLElement {
  if (existing) return existing;
  const { host, root } = createWidget('history-tools', css, 'div');
  const action = el('button', 'action', 'Trade history');
  action.type = 'button';
  attachTip(
    action,
    'Trade history',
    'Totals for your completed trades at current values: value given and received, net result, and your best and worst trades.',
  );
  action.addEventListener('click', () => open(action));
  root.append(el('div', 'row', el('span', 'label', glyph(14), 'Completed trades'), action));
  return host;
}
