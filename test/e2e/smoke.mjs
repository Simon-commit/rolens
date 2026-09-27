// End-to-end smoke test: loads the built extension into Chromium, serves fake Roblox
// pages and a fake Rolimons API, and checks every feature renders.
// Run with `npm run test:e2e` after `npm run build`. No real network access is used.
import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';
import { itemPage, tradePage } from './fixtures.mjs';

// Lets context.route() see requests made by the extension's service worker.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';

const extension = path.resolve('dist');
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});

try {
  let apiRequests = 0;
  await context.route('https://api.rolimons.com/**', (route) => {
    apiRequests += 1;
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        item_count: 3,
        items: {
          1: ['Valued Hat', 'VH', 1000, 1500, 1500, 3, 2, -1, -1, -1, 1],
          2: ['Unvalued Hat', '', 800, -1, 800, -1, -1, -1, -1, -1, 1],
          3: ['Projected Hat', 'PH', 5000, 4000, 4000, 1, 0, 1, -1, -1, 1],
        },
      }),
    });
  });
  await context.route('https://www.roblox.com/**', (route) => {
    const { pathname } = new URL(route.request().url());
    const body = pathname.startsWith('/catalog/') ? itemPage : tradePage;
    return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body>${body}</body></html>` });
  });

  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const page = await context.newPage();

  await page.goto('https://www.roblox.com/trades');
  await page.waitForSelector('[data-rolens="trade"]');
  const shadowText = (selector) => page.$eval(selector, (host) => host.shadowRoot.textContent);
  assert.match(await shadowText('[data-rolens="trade"]'), /\+1,700/);
  const chipIds = await page.$$eval('[data-rolens="badge"]', (chips) => chips.map((chip) => chip.dataset.rolensId));
  assert.deepEqual(chipIds, ['1', '2', '3']);
  assert.ok(await page.evaluate(() => document.fonts.check('12px "RoLens Inter"')), 'bundled font should load');

  await page.goto('https://www.roblox.com/catalog/1/Valued-Hat');
  await page.waitForSelector('[data-rolens="panel"]');
  assert.match(await shadowText('[data-rolens="panel"]'), /1,500/);

  const extensionId = new URL(worker.url()).host;
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.waitForFunction(() => !document.querySelector('#status')?.textContent?.includes('Loading'));
  assert.match(await popup.textContent('#status'), /3 items tracked/);

  assert.equal(apiRequests, 1, 'values should be fetched once and then served from cache');
  console.log('E2E smoke test passed');
} finally {
  await context.close();
}
