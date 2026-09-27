// Bundles the extension into dist/. No minification, so the shipped code stays readable
// and anyone can compare a store build against this repository.
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import * as esbuild from 'esbuild';

const root = new URL('..', import.meta.url);
const dist = new URL('dist/', root);
const watch = process.argv.includes('--watch');
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));

async function copyStatic() {
  const manifest = JSON.parse(await readFile(new URL('src/manifest.json', root), 'utf8'));
  manifest.version = pkg.version;
  await writeFile(new URL('manifest.json', dist), `${JSON.stringify(manifest, null, 2)}\n`);
  await cp(new URL('src/popup/popup.html', root), new URL('popup.html', dist));
  await cp(new URL('src/popup/popup.css', root), new URL('popup.css', dist));
  await cp(new URL('src/content/styles.css', root), new URL('content.css', dist));
  await mkdir(new URL('icons/', dist), { recursive: true });
  for (const size of [16, 32, 48, 128]) {
    await cp(new URL(`src/icons/icon-${size}.png`, root), new URL(`icons/icon-${size}.png`, dist));
  }
}

const common = {
  bundle: true,
  target: 'chrome116',
  minify: false,
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'info',
};

const builds = [
  { ...common, entryPoints: ['src/background/service-worker.ts'], outfile: 'dist/background.js', format: 'esm' },
  { ...common, entryPoints: ['src/content/index.ts'], outfile: 'dist/content.js', format: 'iife' },
  { ...common, entryPoints: ['src/popup/popup.ts'], outfile: 'dist/popup.js', format: 'iife' },
];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await copyStatic();

if (watch) {
  const contexts = await Promise.all(builds.map((options) => esbuild.context(options)));
  await Promise.all(contexts.map((context) => context.watch()));
  console.log('Watching for changes. Static files are copied on start; restart after editing them.');
} else {
  await Promise.all(builds.map((options) => esbuild.build(options)));
}
