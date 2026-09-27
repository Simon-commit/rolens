/**
 * Registers the bundled Inter font for RoLens widgets. The font is loaded through a
 * per-session URL (`use_dynamic_url` in the manifest), so web pages can't probe a fixed
 * URL to detect that RoLens is installed. If it fails to load, widgets fall back to
 * Roblox's own font.
 */
export function registerFont(): void {
  try {
    const face = new FontFace('RoLens Inter', `url(${chrome.runtime.getURL('fonts/inter-latin.woff2')})`, {
      weight: '100 900',
      display: 'swap',
    });
    document.fonts.add(face);
    void face.load().catch(() => undefined);
  } catch {
    // Fallback fonts are fine.
  }
}
