import { formatRobux } from '../../core/format';
import type { ItemValue } from '../../core/types';
import { effectiveValue } from '../../core/types';
import { formatUsd, usdFor } from '../../core/usd';
import { el } from '../dom';
import css from './chip.css?raw';
import type { RenderContext } from './context';
import { attachHoverCard } from './hover-card';
import { glyph, icon } from './icons';
import { rateTip } from './item-details';
import { createWidget } from './shadow';
import { attachTip } from './tooltip';

/** A figure that can fall back to its abbreviated form when the chip runs out of room. */
function figure(className: string, full: string, short: string): HTMLElement {
  const node = el('span', className, full);
  if (short !== full) {
    node.dataset.full = full;
    node.dataset.short = short;
  }
  return node;
}

/** Accessible one-line description, also used as the chip's label for screen readers. */
export function describeItem(item: ItemValue, ctx: RenderContext): string {
  const compact = ctx.settings.compactNumbers;
  const parts = [
    item.name,
    item.value === null ? 'unvalued' : `value ${formatRobux(item.value, compact)}`,
    `RAP ${formatRobux(item.rap, compact)}`,
  ];
  const usd = item.value === null ? null : usdFor(item, ctx.settings);
  if (usd) parts.push(`${usd.origin === 'rate' ? 'estimated at' : 'about'} ${formatUsd(usd.value, compact)}`);
  if (item.rare) parts.push('rare');
  if (item.projected) parts.push('projected');
  return parts.join(', ');
}

/** The compact value chip shown under item cards. Hover or focus it for full details. */
export function createChip(item: ItemValue, ctx: RenderContext): HTMLElement {
  const compact = ctx.settings.compactNumbers;
  const { host, root } = createWidget('badge', css);
  host.dataset.rolensId = String(item.id);

  // RAP-only items keep to a single quiet line; their USD figure is in the hover card.
  const usd = item.value === null ? null : usdFor(item, ctx.settings);
  const amount = effectiveValue(item);
  let usdNode: HTMLElement | null = null;
  if (usd) {
    const estimated = usd.origin === 'rate';
    usdNode = figure(
      estimated ? 'usd is-estimate' : 'usd',
      `${estimated ? '≈' : ''}${formatUsd(usd.value, compact)}`,
      `${estimated ? '≈' : ''}${formatUsd(usd.value, true)}`,
    );
    if (estimated && ctx.settings.usdRate !== null) {
      attachTip(usdNode, ...rateTip(ctx.settings.usdRate));
      usdNode.tabIndex = -1;
    }
  }
  const chip = el(
    'span',
    'chip',
    glyph(14),
    item.value === null ? el('span', 'label', 'RAP') : null,
    figure('value', formatRobux(amount, compact), formatRobux(amount, true)),
    usdNode ? el('span', 'sep') : null,
    usdNode,
    item.rare ? el('span', 'flag flag--rare', icon('gem')) : null,
    item.projected ? el('span', 'flag flag--warn', icon('warning')) : null,
  );
  chip.tabIndex = 0;
  chip.setAttribute('role', 'note');
  chip.setAttribute('aria-label', describeItem(item, ctx));
  if (item.value === null) chip.classList.add('is-unvalued');
  if (item.projected) chip.classList.add('is-projected');
  if (item.rare) chip.classList.add('is-rare');
  if (item.rare) host.dataset.rare = 'true';
  root.append(chip);
  attachHoverCard(chip, item, ctx);
  return host;
}

/**
 * Over a thumbnail or beside a price the chip has a fixed amount of room (see roomFor in
 * chip-fit.ts). When full figures don't fit, they switch to their abbreviated form
 * (1.500.000 becomes 1,5M); when even that is too wide, the USD figure is left to the
 * hover card. Safe to call again whenever the room may have changed.
 */
export function shrinkToFit(host: HTMLElement, room: number): void {
  const chip = host.shadowRoot?.querySelector<HTMLElement>('.chip');
  if (!chip) return;
  const figures = [...chip.querySelectorAll<HTMLElement>('[data-short]')];
  for (const node of figures) node.textContent = node.dataset.full ?? node.textContent;
  chip.classList.remove('is-narrow');
  if (!Number.isFinite(room) || room <= 0) return;
  const fits = () => chip.getBoundingClientRect().width <= room;
  if (fits()) return;
  for (const node of figures) node.textContent = node.dataset.short ?? '';
  if (fits()) return;
  chip.classList.add('is-narrow');
}
