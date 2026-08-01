import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromFrontendRoot } from './_paths.mjs';

const manifest = JSON.parse(readFileSync(fromFrontendRoot('admin-ui-manifest.json'), 'utf8'));
const receiptSchema = JSON.parse(readFileSync(fromFrontendRoot('admin-visual-receipt.schema.json'), 'utf8'));
const standard = readFileSync(fromFrontendRoot('../docs/cloud-admin-ui-standard-v1.md'), 'utf8');
const engineeringStandard = readFileSync(
  fromFrontendRoot('../docs/cloud-admin-frontend-engineering-standard-v1.md'),
  'utf8'
);
const operatingModel = readFileSync(
  fromFrontendRoot('../docs/development-validation-operating-model-v1.md'),
  'utf8'
);
const helper = readFileSync(fromFrontendRoot('tests/e2e/helpers/admin-visual-receipt.ts'), 'utf8');
const packageSource = readFileSync(fromFrontendRoot('../package.json'), 'utf8');

const expectedStatuses = ['pass', 'fail', 'review_required', 'not_applicable', 'unmeasured'];
const expectedRuleIds = [
  'declared-page-model',
  'pc-viewport',
  'horizontal-overflow',
  'single-page-title',
  'working-surface-first-viewport',
  'single-primary-action',
  'textual-status',
  'action-object-proximity',
  'distinct-interaction-states',
  'dialog-focus-recovery',
  'context-stability',
  'browser-runtime-errors',
];
const pilotRoutes = {
  '/admin/ai-resources': {
    pageModel: 'queue',
    states: ['ready', 'selected', 'filtered', 'operation_error', 'dialog'],
    spec: 'tests/e2e/admin-provider-directory-v2.spec.ts',
  },
  '/admin/service-settings': {
    pageModel: 'configuration',
    states: ['ready', 'invalid', 'dirty', 'save_error', 'saved', 'dialog'],
    spec: 'tests/e2e/admin-service-settings-v2.spec.ts',
  },
  '/admin/troubleshooting': {
    pageModel: 'diagnostic',
    states: ['ready', 'selected', 'partial_error', 'disclosure'],
    spec: 'tests/e2e/admin-runtime-diagnostics-v2.spec.ts',
  },
  '/admin/support-requests': {
    pageModel: 'queue',
    states: ['ready', 'filtered', 'selected', 'returned'],
    spec: 'tests/e2e/admin-support-request-operator-closure.spec.ts',
    artifact: 'support-request-queue',
  },
  '/admin/support-requests/[requestId]': {
    pageModel: 'detail',
    states: ['ready', 'action_error', 'action_success', 'return_context'],
    spec: 'tests/e2e/admin-support-request-operator-closure.spec.ts',
    artifact: 'support-request-detail',
  },
};

assert.equal(manifest.version, 7, 'visual governance must use the reviewed v7 manifest');
assert.equal(manifest.visualGovernance.version, 1);
assert.equal(manifest.visualGovernance.receiptSchema, 'admin-visual-receipt.schema.json');
assert.deepEqual(manifest.visualGovernance.resultStates, expectedStatuses);
assert.deepEqual(manifest.visualGovernance.rules.map((rule) => rule.id), expectedRuleIds);
assert.ok(manifest.visualGovernance.rules.every((rule) => rule.authority === 'hard_gate'));

for (const [route, expected] of Object.entries(pilotRoutes)) {
  const pilot = manifest.visualGovernance.pilotRoutes[route];
  assert.equal(manifest.routes[route], expected.pageModel, `${route} manifest model must remain authoritative`);
  assert.equal(pilot.pageModel, expected.pageModel, `${route} visual model must match the route manifest`);
  assert.equal(pilot.riskTier, 'material');
  assert.deepEqual(pilot.requiredStates, expected.states);
  assert.match(pilot.workingSurface, /^\[data-ui=/);

  const spec = readFileSync(fromFrontendRoot(expected.spec), 'utf8');
  assert.match(spec, /observeAdminBrowserEvidence/, `${route} must observe console and network failures`);
  assert.match(spec, /writeAdminVisualReceipt/, `${route} must emit a structured browser receipt`);
  for (const state of expected.states) {
    assert.ok(spec.includes(`'${state}'`), `${route} must record the ${state} browser state`);
  }
  if (expected.artifact) {
    assert.ok(
      spec.includes(`artifactId: '${expected.artifact}'`),
      `${route} must write a route-specific receipt artifact`
    );
  }
}

assert.equal(receiptSchema.properties.schema_version.const, 1);
assert.deepEqual(receiptSchema.properties.page_model.enum, manifest.pageModels);
assert.deepEqual(receiptSchema.$defs.result.properties.status.enum, expectedStatuses);
assert.equal(receiptSchema.properties.rule_results.minItems, expectedRuleIds.length);
assert.equal(receiptSchema.properties.rule_results.maxItems, expectedRuleIds.length);
for (const field of [
  'source_revision',
  'source_dirty',
  'environment',
  'viewport',
  'tested_states',
  'rule_results',
  'screenshot_paths',
  'interaction_results',
  'console_errors',
  'network_failures',
  'review_required_items',
  'human_acceptance',
]) {
  assert.ok(receiptSchema.required.includes(field), `receipt schema must require ${field}`);
}

for (const phrase of [
  'Risk-tiered visual enforcement',
  '1440 x 1050',
  'human visual acceptance',
]) {
  assert.ok(standard.includes(phrase), `Admin UI standard must document ${phrase}`);
}
assert.match(standard, /No receipt means\s+`unmeasured`/);
assert.match(standard, /Preview-first and closeout gates/);
assert.match(standard, /Do not wait for the complete Admin visual matrix/);
assert.match(standard, /Reclassify upward immediately/);
assert.match(engineeringStandard, /Separate the first\s+human-visible preview from engineering closeout/);
assert.match(engineeringStandard, /The preview is deliberately a candidate, not a merge or acceptance claim/);
assert.match(operatingModel, /Appearance-only preview-first lane/);
assert.match(operatingModel, /within 15 minutes/);
assert.match(operatingModel, /The 15-minute target is a feedback objective/);
for (const status of expectedStatuses) {
  assert.ok(standard.includes(`\`${status}\``), `Admin UI standard must document ${status}`);
}
assert.match(helper, /git[\s\S]*rev-parse[\s\S]*status --porcelain/);
assert.match(helper, /status[\s\S]*trimEnd\(\)/, 'porcelain parsing must preserve the first status column');
assert.match(helper, /artifactId[\s\S]*artifactSuffix/, 'one workflow must support multiple receipt artifacts');
assert.match(helper, /testInfo\.outputPath[\s\S]*testInfo\.attach/);
assert.match(packageSource, /admin-visual-governance-contract\.mjs/);
assert.match(packageSource, /admin-runtime-diagnostics-v2\.spec\.ts/);

console.log('admin_visual_governance_contract: ok (12 rules, 5 pilot routes, structured receipts)');
