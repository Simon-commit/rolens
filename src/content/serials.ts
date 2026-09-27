/*
 * Optional serial hiding. Limited U items carry a serial number ("#123", "#100/1,000",
 * "Serial #12 of 500") wherever Roblox shows the copy. With the option on, RoLens marks
 * every element that shows one and content.css blurs it, and serials in hover titles are
 * swapped for a neutral label. Turning the option off restores the page exactly. Nothing
 * is sent anywhere and Roblox's layout never changes size: blur is a paint-only effect.
 */

/** On <html> while serials are hidden. content.css keys the blur on it. */
export const SERIALS_HIDDEN_ATTR = 'data-rolens-serials-hidden';
/** On a Roblox element whose text is a serial number. */
export const SERIAL_ATTR = 'data-rolens-serial';
/** Holds a title RoLens replaced, so it can be put back. */
const TITLE_ATTR = 'data-rolens-serial-title';
const HIDDEN_TITLE = 'Serial hidden by RoLens';

/** Longest text that can still be a serial label; anything longer is a sentence. */
const MAX_LENGTH = 40;
/** How far above a text node a serial label may extend ("#" and the digits are often separate spans). */
const MAX_DEPTH = 3;

const SERIAL_TEXT = /^(?:serial(?:\s*(?:number|no\.?))?\s*:?\s*)?#\s?\d[\d.,\s]*?(?:\s*(?:\/|of)\s*\d[\d.,\s]*)?$/i;

/** True for text that is a serial label on its own, such as "#12", "#100/1.000" or "Serial #7 of 500". */
export function isSerialText(text: string | null | undefined): boolean {
  if (!text) return false;
  const trimmed = text.replace(/\s+/g, ' ').trim();
  return trimmed.length > 1 && trimmed.length <= MAX_LENGTH && SERIAL_TEXT.test(trimmed);
}

export function serialsHidden(doc: Document = document): boolean {
  return doc.documentElement.hasAttribute(SERIALS_HIDDEN_ATTR);
}

/** The outermost element, a few levels up at most, whose whole text is the serial. */
function serialElement(text: Text): Element | null {
  let found: Element | null = null;
  let node = text.parentElement;
  for (let depth = 0; node && depth < MAX_DEPTH; depth += 1, node = node.parentElement) {
    if (node === node.ownerDocument.body || node === node.ownerDocument.documentElement) break;
    const content = node.textContent ?? '';
    if (content.length > MAX_LENGTH * 2) break;
    if (isSerialText(content)) found = node;
  }
  return found;
}

const DIGITS = /^\d[\d.,\s]*$/;

/**
 * Roblox's inventory cards put "#" and the number in sibling spans beside other labels
 * ("LTD U", "#", "412"), so neither span is a serial on its own. Marks the pair.
 */
function splitSerial(text: Text): Element[] | null {
  const digits = text.parentElement;
  const hash = digits?.previousElementSibling;
  if (!digits || !hash || !DIGITS.test((digits.textContent ?? '').trim())) return null;
  return (hash.textContent ?? '').trim() === '#' ? [hash, digits] : null;
}

function hideTitle(element: Element): void {
  const title = element.getAttribute('title');
  if (!isSerialText(title)) return;
  element.setAttribute(TITLE_ATTR, title ?? '');
  element.setAttribute('title', HIDDEN_TITLE);
}

/** Marks serials inside `root` and hides serial titles. Safe to call repeatedly. */
export function markSerials(root: ParentNode): void {
  const doc = root instanceof Document ? root : (root as Node).ownerDocument;
  if (!doc) return;
  const start = root instanceof Document ? root.body : root;
  if (!start) return;

  const walker = doc.createTreeWalker(start as Node, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (/\d/.test(node.nodeValue ?? '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    const element = serialElement(text) ?? splitSerial(text);
    if (Array.isArray(element)) for (const part of element) part.setAttribute(SERIAL_ATTR, '');
    else element?.setAttribute(SERIAL_ATTR, '');
  }

  if (start instanceof Element && start.hasAttribute('title')) hideTitle(start);
  for (const element of start.querySelectorAll('[title]')) hideTitle(element);
}

/** Puts back every title RoLens replaced. The serial markers stay; without the page attribute they do nothing. */
export function restoreTitles(doc: Document = document): void {
  for (const element of doc.querySelectorAll(`[${TITLE_ATTR}]`)) {
    element.setAttribute('title', element.getAttribute(TITLE_ATTR) ?? '');
    element.removeAttribute(TITLE_ATTR);
  }
}

let observer: MutationObserver | null = null;

function handle(records: MutationRecord[]): void {
  for (const record of records) {
    if (record.type === 'childList') {
      for (const node of record.addedNodes) {
        if (node instanceof Element) markSerials(node);
        else if (node instanceof Text && node.parentElement)
          markSerials(node.parentElement.parentElement ?? node.parentElement);
      }
    } else if (record.type === 'characterData') {
      const parent = record.target.parentElement;
      if (parent) markSerials(parent.parentElement ?? parent);
    } else if (record.type === 'attributes' && record.target instanceof Element) {
      hideTitle(record.target);
    }
  }
}

/**
 * Turns serial hiding on or off for the page. Runs from document_start, so serials are
 * marked as Roblox renders them, before they are painted.
 */
export function setSerialsHidden(hidden: boolean, doc: Document = document): void {
  doc.documentElement.toggleAttribute(SERIALS_HIDDEN_ATTR, hidden);
  if (!hidden) {
    observer?.disconnect();
    observer = null;
    restoreTitles(doc);
    return;
  }
  markSerials(doc);
  if (observer) return;
  observer = new MutationObserver(handle);
  observer.observe(doc.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['title'],
  });
}
