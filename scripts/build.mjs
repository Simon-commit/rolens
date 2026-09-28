// Bundles the extension into dist/. No minification, so the shipped code stays readable
// and anyone can compare a store build against this repository.
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import * as esbuild from 'esbuild';

const root = new URL('..', import.meta.url);
const dist = new URL('dist/', root);
const watch = process.argv.includes('--watch');
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));

const STATIC_FILES = {
  'src/popup/popup.html': 'popup.html',
  'src/popup/popup.css': 'popup.css',
  'src/content/styles.css': 'content.css',
  'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2': 'fonts/inter-latin.woff2',
  'node_modules/@fontsource-variable/inter/LICENSE': 'fonts/LICENSE-Inter.txt',
  'src/icons/icon-16.png': 'icons/icon-16.png',
  'src/icons/icon-32.png': 'icons/icon-32.png',
  'src/icons/icon-48.png': 'icons/icon-48.png',
  'src/icons/icon-128.png': 'icons/icon-128.png',
};

async function copyStatic() {
  const manifest = JSON.parse(await readFile(new URL('src/manifest.json', root), 'utf8'));
  manifest.version = pkg.version;
  await writeFile(new URL('manifest.json', dist), `${JSON.stringify(manifest, null, 2)}\n`);
  for (const [from, to] of Object.entries(STATIC_FILES)) {
    const target = new URL(to, dist);
    await mkdir(new URL('.', target), { recursive: true });
    await cp(new URL(from, root), target);
  }
}

/** Lets `import css from './x.css?raw'` inline a stylesheet as a string (Vite does the same in tests). */
const rawPlugin = {
  name: 'raw',
  setup(build) {
    build.onResolve({ filter: /\?raw$/ }, (args) => ({
      path: new URL(args.path.replace(/\?raw$/, ''), `file://${args.resolveDir}/`).pathname,
      namespace: 'raw',
    }));
    build.onLoad({ filter: /.*/, namespace: 'raw' }, async (args) => ({
      contents: await readFile(args.path, 'utf8'),
      loader: 'text',
    }));
  },
};

const common = {
  bundle: true,
  target: 'chrome116',
  minify: false,
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'info',
  plugins: [rawPlugin],
};

const builds = [
  { ...common, entryPoints: ['src/background/service-worker.ts'], outfile: 'dist/background.js', format: 'esm' },
  { ...common, entryPoints: ['src/content/early.ts'], outfile: 'dist/early.js', format: 'iife' },
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
