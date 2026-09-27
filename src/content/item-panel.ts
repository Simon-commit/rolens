import { formatAge, formatDemand, formatRobux, formatTrend } from '../core/format';
import type { CacheStatus } from '../core/messages';
import type { Settings } from '../core/settings';
import type { ItemValue } from '../core/types';
import type { ValueProvider } from '../providers/types';
import { el, ROLENS_ATTR } from './dom';
import { SELECTORS } from './selectors';

function stat(label: string, value: string, tone?: string): HTMLElement {
  const node = el('div', 'rolens-stat', el('div', 'rolens-stat__label', label), el('div', 'rolens-stat__value', value));
  if (tone) node.dataset.tone = tone;
  return node;
}

const DEMAND_TONE = { terrible: 'bad', low: 'bad', normal: 'neutral', high: 'good', amazing: 'good' } as const;
const TREND_TONE = {
  lowering: 'bad',
  unstable: 'warn',
  stable: 'neutral',
  raising: 'good',
  fluctuating: 'warn',
} as const;

export function createItemPanel(
  item: ItemValue,
  settings: Settings,
  provider: ValueProvider,
  status: CacheStatus | null,
): HTMLElement {
  const compact = settings.compactNumbers;
  const tags = [
    item.projected && el('span', 'rolens-tag rolens-tag--warn', 'Projected'),
    item.hyped && el('span', 'rolens-tag', 'Hyped'),
    item.rare && el('span', 'rolens-tag', 'Rare'),
  ];
  const sourceLink = provider.itemUrl ? el('a', 'rolens-panel__link', `View on ${provider.label}`) : null;
  if (sourceLink && provider.itemUrl) {
    sourceLink.href = provider.itemUrl(item.id);
    sourceLink.target = '_blank';
    sourceLink.rel = 'noopener noreferrer';
  }
  const panel = el(
    'section',
    'rolens-panel',
    el('header', 'rolens-panel__header', el('span', 'rolens-panel__brand', 'RoLens'), ...tags),
    el(
      'div',
      'rolens-panel__stats',
      stat('Value', item.value === null ? 'Unvalued' : `${formatRobux(item.value, compact)} R$`),
      stat('RAP', `${formatRobux(item.rap, compact)} R$`, item.projected ? 'warn' : undefined),
      stat('Demand', formatDemand(item.demand), item.demand ? DEMAND_TONE[item.demand] : undefined),
      stat('Trend', formatTrend(item.trend), item.trend ? TREND_TONE[item.trend] : undefined),
    ),
    el(
      'footer',
      'rolens-panel__footer',
      `Data from ${provider.label}${status?.fetchedAt ? `, updated ${formatAge(status.fetchedAt)}` : ''}`,
      sourceLink,
    ),
  );
  panel.setAttribute(ROLENS_ATTR, 'panel');
  panel.dataset.rolensId = String(item.id);
  return panel;
}

/** Inserts the stats panel under the item title, replacing a panel for a different item. */
export function renderItemPanel(
  root: ParentNode,
  item: ItemValue,
  settings: Settings,
  provider: ValueProvider,
  status: CacheStatus | null,
): void {
  const existing = root.querySelector<HTMLElement>('[data-rolens="panel"]');
  if (existing?.dataset.rolensId === String(item.id)) return;
  existing?.remove();
  const title = root.querySelector(SELECTORS.itemPageTitle);
  if (!title) return;
  title.after(createItemPanel(item, settings, provider, status));
}
