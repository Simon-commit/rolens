import type { ThemePreference } from '../../core/settings';
import { ROLENS_ATTR } from '../attrs';
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

let preference: ThemePreference = 'auto';

/** The theme widgets should use: the user's choice, or Roblox's own when set to auto. */
export function resolveTheme(): Theme {
  return preference === 'auto' ? detectTheme() : preference;
}

/**
 * Switches every RoLens widget on the page to the preferred theme in place, so the
 * colour transition animates instead of the widgets being rebuilt.
 */
export function applyThemePreference(next: ThemePreference, root: ParentNode = document): void {
  preference = next;
  const theme = resolveTheme();
  for (const host of root.querySelectorAll<HTMLElement>(`[${ROLENS_ATTR}]`)) host.dataset.theme = theme;
}

/** The theme of the widget `node` is drawn in, so a floating panel can match it. */
export function themeOf(node: Element): Theme {
  const root = node.getRootNode();
  return root instanceof ShadowRoot && (root.host as HTMLElement).dataset.theme === 'dark' ? 'dark' : 'light';
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
  host.dataset.theme = resolveTheme();
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = tokens + css;
  root.append(style);
  return { host, root };
}
