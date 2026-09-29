import { el } from '../dom';
import { icon } from './icons';
import { createWidget } from './shadow';
import { attachTip } from './tooltip';

/*
 * When an item Roblox marks as "Holding" comes off hold, as a small tag on its thumbnail.
 * The time is an upper bound (see core/owner-since), so the tag reads as "by about".
 */

const css = `
:host { position: absolute; right: 6px; bottom: 6px; z-index: 2; }
.tag {
  display: inline-flex; align-items: center; gap: 3px; height: 18px; padding: 0 6px 0 4px;
  border-radius: 999px; background: color-mix(in srgb, var(--rl-bg-raised) 92%, transparent);
  box-shadow: var(--rl-shadow-sm), inset 0 0 0 1px var(--rl-border);
  color: var(--rl-warn); font-size: 10.5px; font-weight: 700; font-variant-numeric: tabular-nums;
  white-space: nowrap; cursor: help; outline: none;
}
.tag .rl-icon { width: 11px; height: 11px; }
.tag:focus-visible { box-shadow: 0 0 0 2px var(--rl-accent); }
`;

const HOUR = 3_600_000;

/** "29h", "45m", or "Soon" once the estimate has passed. */
export function holdTimeLabel(endsBy: number, now: number): string {
  const left = endsBy - now;
  if (left <= 0) return 'Soon';
  if (left < HOUR) return `${Math.max(1, Math.ceil(left / 60_000))}m`;
  return `${Math.ceil(left / HOUR)}h`;
}

const when = (time: number) =>
  new Date(time).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

export function renderHoldTime(existing: HTMLElement | null, endsBy: number, now: number): HTMLElement {
  const label = holdTimeLabel(endsBy, now);
  const key = `${endsBy}:${label}`;
  if (existing?.dataset.key === key) return existing;
  existing?.remove();
  const { host, root } = createWidget('hold-time', css);
  host.dataset.key = key;
  root.append(
    attachTip(
      el('span', 'tag', icon('clock'), label),
      label === 'Soon' ? 'Off hold soon' : `Off hold by about ${when(endsBy)}`,
      "Estimated from when Rolimon's first saw the current owner with this item, plus Roblox's 48-hour holding period. Rolimon's scans periodically, so the hold may end earlier.",
    ),
  );
  return host;
}
