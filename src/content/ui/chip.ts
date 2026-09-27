import { formatRobux } from '../../core/format';
import type { ItemValue } from '../../core/types';
import { effectiveValue } from '../../core/types';
import { formatUsd, usdFor } from '../../core/usd';
import { el } from '../dom';
import css from './chip.css?raw';
import type { RenderContext } from './context';
import { attachHoverCard } from './hover-card';
import { glyph, icon } from './icons';
import { createWidget } from './shadow';

/** Accessible one-line description, also used as the chip's label for screen readers. */
export function describeItem(item: ItemValue, ctx: RenderContext): string {
  const compact = ctx.settings.compactNumbers;
  const parts = [
    item.name,
    item.value === null ? 'unvalued' : `value ${formatRobux(item.value, compact)}`,
    `RAP ${formatRobux(item.rap, compact)}`,
  ];
  const usd = usdFor(item, ctx.settings);
  if (usd) parts.push(`about ${formatUsd(usd.value, compact)}`);
  if (item.rare) parts.push('rare');
  if (item.projected) parts.push('projected');
  return parts.join(', ');
}

/** The compact value chip shown under item cards. Hover or focus it for full details. */
export function createChip(item: ItemValue, ctx: RenderContext): HTMLElement {
  const compact = ctx.settings.compactNumbers;
  const { host, root } = createWidget('badge', css);
  host.dataset.rolensId = String(item.id);

  const usd = usdFor(item, ctx.settings);
  const chip = el(
    'span',
    'chip',
    glyph(14),
    item.value === null ? el('span', 'label', 'RAP') : null,
    el('span', 'value', formatRobux(effectiveValue(item), compact)),
    usd ? el('span', 'sep') : null,
    usd ? el('span', 'usd', formatUsd(usd.value, compact)) : null,
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
