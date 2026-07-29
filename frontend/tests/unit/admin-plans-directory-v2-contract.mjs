import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromFrontendRoot } from './_paths.mjs';

const source = readFileSync(fromFrontendRoot('src/app/admin/plans/page.tsx'), 'utf8');
const workbench = readFileSync(fromFrontendRoot('src/components/admin/PlanManagementWorkbench.tsx'), 'utf8');

assert.match(source, /BackofficeLayer/, 'package catalog must use the compact operating header');
assert.match(source, /BackofficeSummaryStrip/, 'package catalog must expose a compact status summary');
assert.doesNotMatch(source, /BackofficePrimaryPanel|BackofficeMetricStrip/, 'package catalog must not restore the old hero metric surface');

for (const parameter of ['q', 'state', 'sort', 'focus']) {
  assert.match(source, new RegExp(`searchParams\\.get\\('${parameter}'\\)`), `${parameter} must be URL-backed`);
}

assert.match(source, /activeRequestRef[\s\S]*requestSequenceRef[\s\S]*hasLoadedRef/, 'catalog reads must dedupe and reject stale responses');
assert.match(source, /admin\.plans\.retained_notice/, 'failed refreshes must retain and label the last successful catalog');
assert.match(source, /data-ui="plan-catalog-item"/, 'standard packages must render as a responsive operating list');
assert.match(source, /PlanManagementWorkbench/, 'one package management workbench must own package context and maintenance');
assert.match(workbench, /admin\.plans\.open_subscriptions_action/, 'the workbench must open the existing subscription queue');
assert.match(source, /admin\.plans\.open_advanced_setup/, 'missing packages must open the bounded advanced-maintenance path');
assert.match(workbench, /sales_price_cny[\s\S]*monthly_included_points[\s\S]*max_vector_documents/, 'the workbench must keep pricing, credits, and knowledge limits in one editor');
assert.match(workbench, /AdminWorkbenchDialog[\s\S]*sm:grid-cols-2/, 'the shared workbench must use a two-column parameter list on PC');

assert.match(source, /id="package-maintenance"/, 'package initialization and exceptional creation must remain in advanced maintenance');
assert.match(source, /toast\.success/, 'transient plan mutation success must use global toast feedback');
assert.match(workbench, /\/api\/admin\/plans\/\$\{encodeURIComponent\(planId\)\}/, 'the workbench must keep the existing Cloud plan detail and publish API boundary');

console.log('admin_plans_directory_v2_contract: ok');
