/*
 * Optional dark mode for roblox.com. Roblox ships both light and dark styles and picks
 * one with a class on the page (`light-theme` / `dark-theme`). This swaps that class in
 * the open tab only. Nothing is sent to Roblox, so the account's theme setting is unchanged.
 */

/** Set on <html> while RoLens keeps Roblox dark. content.css uses it to avoid a white flash. */
export const DARK_ATTR = 'data-rolens-dark';
/** Marks elements whose class RoLens switched, so turning the option off restores them exactly. */
const SWAPPED_ATTR = 'data-rolens-swapped';

export function isRobloxDark(doc: Document = document): boolean {
  return doc.documentElement.hasAttribute(DARK_ATTR);
}

/** Brings Roblox's theme classes in line with the option. Safe to call repeatedly. */
export function syncThemeClasses(doc: Document = document): void {
  if (isRobloxDark(doc)) {
    for (const node of doc.querySelectorAll('.light-theme')) {
      node.classList.replace('light-theme', 'dark-theme');
      node.setAttribute(SWAPPED_ATTR, '');
    }
  } else {
    for (const node of doc.querySelectorAll(`[${SWAPPED_ATTR}]`)) {
      node.classList.replace('dark-theme', 'light-theme');
      node.removeAttribute(SWAPPED_ATTR);
    }
  }
}

export function setRobloxDark(enabled: boolean, doc: Document = document): void {
  doc.documentElement.toggleAttribute(DARK_ATTR, enabled);
  syncThemeClasses(doc);
}

/** Keeps the page dark as Roblox renders new parts of it or resets its classes. */
export function watchRobloxTheme(doc: Document = document): MutationObserver {
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued || !isRobloxDark(doc) || !doc.querySelector('.light-theme')) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      syncThemeClasses(doc);
    });
  });
  observer.observe(doc.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });
  return observer;
}
