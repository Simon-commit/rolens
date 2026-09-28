import { el } from '../dom';
import { icon } from './icons';
import { createWidget } from './shadow';
import { attachTip } from './tooltip';

/*
 * "On hold" tag over an item's thumbnail in the trade window. Roblox holds items for a
 * period after they are acquired; until then they cannot be part of a trade.
 */

export type HoldState = 'none' | 'hold' | 'some';

const css = `
:host { position: absolute; right: 6px; bottom: 6px; z-index: 2; }
.tag {
  display: inline-flex; align-items: center; gap: 3px; height: 18px; padding: 0 6px 0 4px;
  border-radius: 999px; background: color-mix(in srgb, var(--rl-bg-raised) 92%, transparent);
  box-shadow: var(--rl-shadow-sm), inset 0 0 0 1px var(--rl-border);
  color: var(--rl-warn); font-size: 10.5px; font-weight: 700; white-space: nowrap; cursor: help; outline: none;
}
.tag .rl-icon { width: 11px; height: 11px; }
.tag:focus-visible { box-shadow: 0 0 0 2px var(--rl-accent); }
`;

const TIPS: Record<Exclude<HoldState, 'none'>, [string, string, string]> = {
  hold: [
    'On hold',
    'On hold',
    'Roblox holds items for a period after they are acquired. This copy cannot be part of a trade until the hold ends.',
  ],
  some: [
    'Hold',
    'Some copies on hold',
    'Some copies of this item are on hold and cannot be traded yet. Roblox does not show which copy this is.',
  ],
};

export function renderHoldTag(
  existing: HTMLElement | null,
  state: Exclude<HoldState, 'none'>,
  own: boolean,
): HTMLElement {
  if (existing?.dataset.state === state) return existing;
  existing?.remove();
  const { host, root } = createWidget('hold-tag', css);
  host.dataset.state = state;
  const [label, title, body] = TIPS[state];
  root.append(
    attachTip(
      el('span', 'tag', icon('clock'), label),
      title,
      own ? body : body.replace('This copy', "The other player's copy"),
    ),
  );
  return host;
}
