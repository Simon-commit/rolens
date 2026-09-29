import { plural } from '../../core/format';
import { el } from '../dom';
import { glyph, icon } from './icons';
import { createWidget } from './shadow';

/*
 * A slim filter bar above an inventory in the trade window: one field for a name, an
 * acronym or a minimum value such as "50K", and two toggles. It only hides items from
 * view; the trade itself is never changed.
 */

export interface InventoryFilter {
  query: string;
  rareOnly: boolean;
  hideHold: boolean;
}

const css = `
:host { display: block; margin: 8px 0; }
.bar { display: flex; align-items: center; gap: 6px; height: 34px; padding: 0 4px 0 8px; border-radius: 10px; background: var(--rl-surface); }
.bar .rl-glyph { flex: none; width: 14px; height: 14px; }
.field { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; height: 26px; padding: 0 8px; border-radius: 7px; background: var(--rl-bg-raised); box-shadow: inset 0 0 0 1px var(--rl-border); color: var(--rl-text-3); }
.field:focus-within { box-shadow: inset 0 0 0 1px var(--rl-accent); }
.field .rl-icon { flex: none; width: 13px; height: 13px; }
input { flex: 1; min-width: 0; border: 0; background: none; color: var(--rl-text); font: inherit; font-size: 12px; outline: none; }
input::placeholder { color: var(--rl-text-3); }
.toggle {
  flex: none; height: 26px; padding: 0 9px; border: 0; border-radius: 7px; background: transparent; box-shadow: inset 0 0 0 1px var(--rl-border);
  color: var(--rl-text-2); font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; white-space: nowrap;
}
.toggle:hover { background: var(--rl-bg-raised); color: var(--rl-text); }
.toggle[aria-pressed='true'] { background: var(--rl-bg-raised); color: var(--rl-accent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--rl-accent) 45%, transparent); }
.toggle:focus-visible { outline: 2px solid var(--rl-accent); outline-offset: 1px; }
.count { flex: none; min-width: 0; padding: 0 4px; font-size: 11.5px; color: var(--rl-text-3); white-space: nowrap; }
.count:empty { display: none; }
`;

export interface FilterBar {
  host: HTMLElement;
  /** Shows how many items pass. */
  update(shown: number): void;
}

const bars = new WeakMap<HTMLElement, FilterBar & { setMeta: (meta: Meta) => void }>();

interface Meta {
  total: number;
  /** Items Roblox marks as on hold; the hold toggle shows only when there are some. */
  holds: number;
}

export function renderInventoryFilter(
  existing: HTMLElement | null,
  filter: InventoryFilter,
  meta: Meta,
  change: (next: InventoryFilter) => number,
): FilterBar {
  const known = existing ? bars.get(existing) : undefined;
  if (known) {
    known.setMeta(meta);
    return known;
  }
  const { host, root } = createWidget('inventory-filter', css, 'div');
  let current = { ...filter };
  let info = meta;
  const input = el('input');
  input.type = 'search';
  input.placeholder = 'Name, acronym or minimum value';
  input.value = current.query;
  input.setAttribute('aria-label', 'Filter items by name, acronym or minimum value, for example 50K');
  const toggle = (label: string, key: 'rareOnly' | 'hideHold', title: string) => {
    const node = el('button', 'toggle', label);
    node.type = 'button';
    node.title = title;
    node.setAttribute('aria-pressed', String(current[key]));
    node.addEventListener('click', () => {
      current = { ...current, [key]: !current[key] };
      node.setAttribute('aria-pressed', String(current[key]));
      bar.update(change(current));
    });
    return node;
  };
  const rare = toggle('Rare', 'rareOnly', 'Show only rare items');
  const hold = toggle('Hide on hold', 'hideHold', 'Hide items that cannot be traded yet');
  const count = el('span', 'count');
  count.setAttribute('aria-live', 'polite');
  input.addEventListener('input', () => {
    current = { ...current, query: input.value };
    bar.update(change(current));
  });
  root.append(el('div', 'bar', glyph(14), el('label', 'field', icon('search'), input), rare, hold, count));

  const bar = {
    host,
    update(shown: number) {
      const filtering = current.query.trim() !== '' || current.rareOnly || current.hideHold;
      count.textContent = filtering ? `${shown} of ${plural(info.total, 'item')}` : '';
    },
    setMeta(next: Meta) {
      info = next;
      hold.hidden = next.holds === 0 && !current.hideHold;
    },
  };
  bar.setMeta(meta);
  bars.set(host, bar);
  return bar;
}
