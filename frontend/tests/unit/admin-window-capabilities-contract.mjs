import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fromFrontendRoot } from './_paths.mjs';

const read = path => readFileSync(fromFrontendRoot(path), 'utf8');
const result = spawnSync('python3', [fromFrontendRoot('../scripts/check-admin-window-capabilities.py')], { encoding: 'utf8' });
assert.equal(result.status, 0, result.stderr || result.error?.message);
assert.match(read('src/components/admin/AdminObservationWindow.tsx'), /observationWindows\(capability\)/);
for (const [page, capability] of [['media-observability', 'media'], ['vector-observability', 'vector'], ['plugin-observability', 'plugin'], ['agent-feedback', 'feedback']]) {
  assert.match(read(`src/app/admin/${page}/page.tsx`), new RegExp(`normalizeObservationWindow\\([^;]+['"]${capability}['"]\\)`));
}
assert.match(read('src/app/admin/usage-statistics/page.tsx'), /observationCapability\(`/);
assert.match(read('src/features/admin/navigation.ts'), /observationCapability\(href\)/);
assert.match(read('src/app/admin/troubleshooting/page.tsx'), /adminScopedNavigationHref\(href, navigationScope\)/);
console.log(result.stdout.trim());
