import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { adminVisualSpecs, changedAdminVisualSpecs } from './admin-visual-plan.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'frontend/admin-ui-manifest.json'), 'utf8'));
let specs = adminVisualSpecs(manifest);
if (process.argv.includes('--ci-changed')) {
  const base = process.env.NPCINK_CLOUD_CI_BASE_SHA;
  const head = process.env.NPCINK_CLOUD_CI_HEAD_SHA;
  let paths;
  if (!head || !/^[0-9a-f]{40}$/.test(head)) throw new Error('CI visual selection requires a valid head revision');
  if (!base || /^0+$/.test(base)) paths = ['frontend/admin-ui-manifest.json'];
  else {
    if (!/^[0-9a-f]{40}$/.test(base)) throw new Error('Invalid CI visual base revision');
    const diff = spawnSync('git', ['diff', '--name-only', base, head], { cwd: root, encoding: 'utf8' });
    if (diff.status !== 0) throw new Error(`Unable to select changed Admin visuals: ${diff.error?.message || diff.stderr || `git exited ${diff.status}`}`);
    paths = diff.stdout.trim().split('\n');
  }
  specs = changedAdminVisualSpecs(manifest, paths);
}
if (!specs.length) { console.log('No registered Admin visual pilot changed'); process.exit(0); }
for (const spec of specs) if (!existsSync(resolve(root, 'frontend', spec))) throw new Error(`Missing browser spec: ${spec}`);
const args = process.argv.includes('--list') ? ['--list'] : [];
const result = spawnSync(process.execPath, [resolve(root, 'scripts/run-cloud-frontend-playwright.js'), 'test', '-c', 'playwright.config.ts', ...specs, ...args], { cwd: root, env: process.env, stdio: 'inherit' });
process.exit(result.status ?? 1);
