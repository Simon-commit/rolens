import type { ItemValue } from '../core/types';
import { SELECTORS } from './selectors';
import { renderKey, type RenderContext } from './ui/context';
import { createItemHero } from './ui/item-hero';

/*
 * Where the stats card goes on an item page: directly under the creator line ("By Roblox"),
 * above the price. Roblox's item pages differ in markup between items, and parts render
 * late, so the place is found from the page's content rather than from class names, and
 * the card is moved there again whenever the page changes.
 */

/** How far above the title RoLens looks for the item's own details column. */
const MAX_DEPTH = 6;

const text = (node: Element) => (node.textContent ?? '').replace(/\s+/g, ' ').trim();

/** The item's name as the browser tab shows it ("Red Domino Crown - Roblox"). */
export function itemPageName(doc: Document = document): string {
  return doc.title.replace(/\s*[-–|]\s*Roblox\s*$/i, '').trim();
}

/** The item's title: the heading whose text is the item's name, or the first page heading. */
export function findItemTitle(root: ParentNode, name = itemPageName()): Element | null {
  const headings = [...root.querySelectorAll('h1, h2')].filter((node) => !node.closest('[data-rolens]'));
  const wanted = name.toLowerCase();
  return (
    (wanted && headings.find((node) => text(node).toLowerCase() === wanted)) ||
    root.querySelector(SELECTORS.itemPageTitle)
  );
}

function ancestors(node: Element, depth: number): Element[] {
  const list: Element[] = [];
  for (let current = node.parentElement; current && list.length < depth; current = current.parentElement) {
    if (current === document.body) break;
    list.push(current);
  }
  return list;
}

function following(a: Node, b: Node): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

/** The first element after the title within its details column that matches. */
function findAfter(title: Element, test: (node: Element) => boolean): Element | null {
  for (const scope of ancestors(title, MAX_DEPTH)) {
    for (const node of scope.querySelectorAll('*')) {
      if (following(title, node) && !node.closest('[data-rolens]') && test(node)) return node;
    }
  }
  return null;
}

/** "By Roblox": a short line starting with "By", as its own element. */
const isCreatorLine = (node: Element) => {
  const value = text(node);
  return /^by\s/i.test(value) && value.length < 80 && ![...node.children].some((child) => /^by\s/i.test(text(child)));
};

/** "Best Price", "Price", or Roblox's Robux icon beside the price. */
const isPriceMark = (node: Element) =>
  /^(best price|price)$/i.test(text(node)) || node.matches('[class*="icon-robux"]');

/** The child of `ancestor` that contains `node`. */
function childContaining(ancestor: Element, node: Element): Element {
  let current = node;
  while (current.parentElement && current.parentElement !== ancestor) current = current.parentElement;
  return current;
}

function commonAncestor(a: Element, b: Element): Element | null {
  for (let current: Element | null = a; current; current = current.parentElement) {
    if (current.contains(b)) return current;
  }
  return null;
}

/** The element the card goes directly after, or null when the page has no title yet. */
export function panelAnchor(root: ParentNode): Element | null {
  const title = findItemTitle(root);
  if (!title) return null;
  const creator = findAfter(title, isCreatorLine);
  const top = creator ?? title;
  const price = findAfter(top, isPriceMark);
  if (price) {
    const shared = commonAncestor(top, price);
    if (shared && shared !== top) return childContaining(shared, top);
  }
  return top.closest(SELECTORS.itemPageTitleRow) ?? top;
}

/** True when a limited badge or serial sits in the item's own section, not in recommendations further down. */
export function itemPageIsLimited(root: ParentNode): boolean {
  const title = findItemTitle(root);
  if (!title) return false;
  return ancestors(title, MAX_DEPTH).some((scope) => scope.querySelector(SELECTORS.limitedMark));
}

/** Inserts the stats card under the item's creator line, replacing a card for a different item. */
export function renderItemPanel(root: ParentNode, item: ItemValue, ctx: RenderContext): void {
  const anchor = panelAnchor(root);
  let hero = root.querySelector<HTMLElement>('[data-rolens="panel"]');
  if (hero && hero.dataset.rolensKey !== renderKey(item)) {
    hero.remove();
    hero = null;
  }
  if (!anchor) {
    hero?.remove();
    return;
  }
  if (!hero) {
    hero = createItemHero(item, ctx);
    hero.dataset.rolensKey = renderKey(item);
    // Span the whole row if the details column is a grid.
    hero.style.gridColumn = '1 / -1';
  }
  if (anchor.nextElementSibling !== hero) anchor.after(hero);
  alignWithTitle(hero, findItemTitle(root));
}

/**
 * Lines the card up with the item's title. Roblox indents the title from the edge of its
 * column, which is what keeps it clear of the item image; the card keeps the same gap.
 */
function alignWithTitle(hero: HTMLElement, title: Element | null): void {
  if (!title) return;
  hero.style.removeProperty('margin-left');
  const indent = Math.round(title.getBoundingClientRect().left - hero.getBoundingClientRect().left);
  if (indent <= 0 || indent >= 80) return;
  const current = parseFloat(getComputedStyle(hero).marginLeft) || 0;
  hero.style.marginLeft = `${Math.round(current + indent)}px`;
}
