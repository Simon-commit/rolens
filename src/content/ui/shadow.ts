import { ROLENS_ATTR } from '../dom';
import tokens from './tokens.css?raw';

export type Theme = 'light' | 'dark';

function luminance(color: string): number | null {
  const match = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/.exec(color);
  if (!match) return null;
  if (match[4] !== undefined && Number(match[4]) === 0) return null;
  const [r, g, b] = [match[1], match[2], match[3]].map(Number) as [number, number, number];
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Follows Roblox's theme by reading the page background, falling back to Roblox's theme class. */
export function detectTheme(doc: Document = document): Theme {
  if (doc.body?.classList.contains('dark-theme')) return 'dark';
  if (doc.body?.classList.contains('light-theme')) return 'light';
  for (const node of [doc.body, doc.documentElement]) {
    if (!node) continue;
    const lum = luminance(getComputedStyle(node).backgroundColor);
    if (lum !== null) return lum < 0.5 ? 'dark' : 'light';
  }
  return 'light';
}

/**
 * Creates an isolated widget: a host element carrying RoLens's marker attribute,
 * with an open Shadow DOM holding the design tokens and the widget's own styles.
 */
export function createWidget(
  kind: string,
  css: string,
  tag: 'span' | 'div' | 'section' = 'span',
): { host: HTMLElement; root: ShadowRoot } {
  const host = document.createElement(tag);
  host.setAttribute(ROLENS_ATTR, kind);
  host.dataset.theme = detectTheme();
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = tokens + css;
  root.append(style);
  return { host, root };
}
