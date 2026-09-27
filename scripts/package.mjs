// Zips dist/ into rolens-<version>.zip for the Chrome Web Store or a GitHub release.
import { execFileSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const name = `rolens-${pkg.version}.zip`;
await rm(name, { force: true });
// -X drops extra file attributes so the archive is reproducible across machines.
execFileSync('zip', ['-r', '-X', `../${name}`, '.'], { cwd: 'dist', stdio: 'inherit' });
console.log(`Packaged ${name}`);
