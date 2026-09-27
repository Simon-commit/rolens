/**
 * Tiny element builder. Text is always set via textContent, never parsed as HTML,
 * so values from remote sources can't inject markup into Roblox pages.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export const ROLENS_ATTR = 'data-rolens';

/** True for nodes RoLens injected, so they can be skipped and cleaned up. */
export function isOwnNode(node: Node): boolean {
  return node instanceof Element && node.hasAttribute(ROLENS_ATTR);
}

export function removeOwnNodes(root: ParentNode): void {
  for (const node of root.querySelectorAll(`[${ROLENS_ATTR}]`)) node.remove();
}
