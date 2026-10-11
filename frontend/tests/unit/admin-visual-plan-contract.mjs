import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromFrontendRoot } from './_paths.mjs';
import { adminVisualSpecs, changedAdminVisualSpecs } from '../../../scripts/admin-visual-plan.mjs';
const manifest = JSON.parse(readFileSync(fromFrontendRoot('admin-ui-manifest.json'), 'utf8'));
const specs = adminVisualSpecs(manifest);
for (const pilot of Object.values(manifest.visualGovernance.pilotRoutes)) assert.ok(specs.includes(pilot.browserSpec));
assert.ok(specs.includes('tests/e2e/admin-usage-statistics.spec.ts'));
assert.ok(specs.includes('tests/e2e/admin-plugin-observability-v2.spec.ts'));
const missing = structuredClone(manifest);
missing.visualGovernance.pilotRoutes['/admin/new-pilot'] = { requiredStates: ['ready'] };
assert.throws(() => adminVisualSpecs(missing), /needs a browserSpec/);
const extra = structuredClone(manifest);
extra.visualGovernance.pilotRoutes['/admin/new-pilot'] = { browserSpec: 'tests/e2e/admin-new-pilot.spec.ts' };
assert.ok(adminVisualSpecs(extra).includes('tests/e2e/admin-new-pilot.spec.ts'));
assert.equal(specs.length, new Set(specs).size);

assert.deepEqual(changedAdminVisualSpecs(manifest, ['frontend/src/app/admin/plugin-observability/page.tsx']), ['tests/e2e/admin-plugin-observability-v2.spec.ts']);
assert.deepEqual(changedAdminVisualSpecs(manifest, ['docs/example.md']), []);
for (const route of ['accounts', 'accounts/[accountId]', 'credit-packs', 'plans']) {
  assert.deepEqual(changedAdminVisualSpecs(manifest, [`frontend/src/app/admin/${route}/page.tsx`]), specs);
}
assert.deepEqual(changedAdminVisualSpecs(manifest, ['frontend/src/app/admin/new-route/page.tsx']), specs);
assert.deepEqual(changedAdminVisualSpecs(manifest, [
  'frontend/src/app/admin/plugin-observability/page.tsx',
  'frontend/src/app/admin/accounts/page.tsx',
]), specs);
assert.deepEqual(changedAdminVisualSpecs(manifest, ['frontend/admin-ui-manifest.json']), specs);
assert.deepEqual(changedAdminVisualSpecs(manifest, ['frontend/src/components/admin/AdminHelpTip.tsx']), specs);
assert.deepEqual(changedAdminVisualSpecs(manifest, ['frontend/tests/e2e/helpers/admin-route-fixtures.ts']), specs);
for (const spec of manifest.visualGovernance.supplementalSpecs) {
  assert.ok(changedAdminVisualSpecs(manifest, [`frontend/${spec}`]).includes(spec));
}
console.log(`admin_visual_plan_contract: ok (${Object.keys(manifest.visualGovernance.pilotRoutes).length} pilots; ${specs.length} unique specs; missing registration rejected)`);
