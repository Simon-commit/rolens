// Renders src/icons/icon.svg to the PNG sizes Chrome needs.
// Run manually after editing the SVG: `node scripts/render-icons.mjs` (requires Playwright).
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const svg = await readFile(new URL('../src/icons/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const size of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`,
  );
  await page.screenshot({
    path: new URL(`../src/icons/icon-${size}.png`, import.meta.url).pathname,
    omitBackground: true,
  });
}
await browser.close();
