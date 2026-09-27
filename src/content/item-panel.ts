import type { ItemValue } from '../core/types';
import { renderKey, type RenderContext } from './ui/context';
import { createItemHero } from './ui/item-hero';
import { SELECTORS } from './selectors';

/** Inserts the stats card under the item title, replacing a card for a different item. */
export function renderItemPanel(root: ParentNode, item: ItemValue, ctx: RenderContext): void {
  const existing = root.querySelector<HTMLElement>('[data-rolens="panel"]');
  if (existing?.dataset.rolensKey === renderKey(item)) return;
  existing?.remove();
  const title = root.querySelector(SELECTORS.itemPageTitle);
  if (!title) return;
  const hero = createItemHero(item, ctx);
  hero.dataset.rolensKey = renderKey(item);
  (title.closest(SELECTORS.itemPageTitleRow) ?? title).after(hero);
}
