import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const portalHomePath = resolve(process.cwd(), 'src/app/portal/page.tsx');
const source = readFileSync(portalHomePath, 'utf8');

assert.match(
  source,
  /operationSummaryItems\s*=\s*\[/,
  'portal home must build a compact operation summary before rendering'
);

assert.match(
  source,
  /<BackofficeMetricStrip items=\{operationSummaryItems\}/,
  'portal home must render the current site summary as a compact metric strip'
);

assert.match(
  source,
  /data-portal-home="operation-overview"/,
  'portal home must expose a single operation overview surface'
);

assert.match(
  source,
  /data-portal-home="current-focus"/,
  'portal home must keep the current status and follow-up items in the first surface'
);

assert.match(
  source,
  /data-portal-home="setup-checklist"/,
  'portal home may keep onboarding only as a secondary setup checklist'
);

const overviewIndex = source.indexOf('data-portal-home="operation-overview"');
const summaryIndex = source.indexOf('<BackofficeMetricStrip items={operationSummaryItems}');
const focusIndex = source.indexOf('data-portal-home="current-focus"');
const checklistIndex = source.indexOf('data-portal-home="setup-checklist"');

assert.ok(overviewIndex >= 0, 'operation overview marker must exist');
assert.ok(summaryIndex > overviewIndex, 'metric summary must render inside the operation overview');
assert.ok(focusIndex > summaryIndex, 'current focus must follow the metric summary');
assert.ok(checklistIndex > focusIndex, 'setup checklist must stay secondary to the current focus');

assert.doesNotMatch(
  source,
  /shouldShowStatusPanel|currentRiskLevel|getHomeRiskLevel/,
  'portal home must not keep the old separate risk panel path after layout consolidation'
);

console.log('portal_home_layout_contract: ok');
