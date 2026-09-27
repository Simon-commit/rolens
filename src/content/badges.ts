import { formatDemand, formatRobux, formatTrend } from '../core/format';
import type { Settings } from '../core/settings';
import type { ItemValue } from '../core/types';
import { effectiveValue } from '../core/types';
import { el, isOwnNode, ROLENS_ATTR } from './dom';
import { catalogIdFromHref, SELECTORS } from './selectors';

/** Maps each item card on the page to the item id it shows. */
export function findItemCards(root: ParentNode): Map<Element, number> {
  const cards = new Map<Element, number>();
  for (const link of root.querySelectorAll<HTMLAnchorElement>(SELECTORS.itemLink)) {
    if (isOwnNode(link) || link.closest(`[${ROLENS_ATTR}]`)) continue;
    const id = catalogIdFromHref(link.getAttribute('href') ?? '', location.href);
    if (id === null) continue;
    const card = link.closest(SELECTORS.card) ?? link;
    if (!cards.has(card)) cards.set(card, id);
  }
  return cards;
}

export function describeItem(item: ItemValue, compact: boolean): string {
  const lines = [
    item.name,
    `Value: ${item.value === null ? 'Unvalued' : `${formatRobux(item.value, compact)} R$`}`,
    `RAP: ${formatRobux(item.rap, compact)} R$`,
    `Demand: ${formatDemand(item.demand)}`,
    `Trend: ${formatTrend(item.trend)}`,
  ];
  if (item.projected) lines.push('⚠ Projected: RAP is likely manipulated');
  if (item.hyped) lines.push('Hyped');
  if (item.rare) lines.push('Rare');
  return lines.join('\n');
}

export function createBadge(item: ItemValue, settings: Settings): HTMLElement {
  const compact = settings.compactNumbers;
  const badge = el(
    'span',
    'rolens-badge',
    item.projected ? el('span', 'rolens-badge__flag', '⚠') : null,
    el('span', 'rolens-badge__value', formatRobux(effectiveValue(item), compact)),
    item.value !== null && item.value !== item.rap
      ? el('span', 'rolens-badge__rap', `RAP ${formatRobux(item.rap, compact)}`)
      : null,
  );
  badge.setAttribute(ROLENS_ATTR, 'badge');
  badge.dataset.rolensId = String(item.id);
  if (item.value === null) badge.classList.add('is-unvalued');
  if (item.projected) badge.classList.add('is-projected');
  badge.title = describeItem(item, compact);
  return badge;
}

/**
 * Adds or updates one value badge per item card. Only touches the DOM when
 * something changed, so it's safe to call from a MutationObserver.
 */
export function renderBadges(
  cards: Map<Element, number>,
  lookup: (id: number) => ItemValue | null | undefined,
  settings: Settings,
): void {
  for (const [card, id] of cards) {
    const existing = card.querySelector<HTMLElement>(':scope [data-rolens="badge"]');
    if (existing?.dataset.rolensId === String(id)) continue;
    existing?.remove();
    const item = lookup(id);
    if (!item) continue;
    const badge = createBadge(item, settings);
    const caption = card.querySelector(SELECTORS.cardCaption);
    (caption ?? card).append(badge);
  }
}
