import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromFrontendRoot } from './_paths.mjs';

const source = readFileSync(fromFrontendRoot('src/app/admin/plans/page.tsx'), 'utf8');
const workbench = readFileSync(fromFrontendRoot('src/components/admin/PlanManagementWorkbench.tsx'), 'utf8');
const proxy = readFileSync(fromFrontendRoot('src/app/api/admin/[...path]/route.ts'), 'utf8');

assert.match(source, /BackofficeLayer/, 'package catalog must use the compact operating header');
assert.match(source, /BackofficeSummaryStrip/, 'package catalog must expose a compact status summary');
assert.doesNotMatch(source, /BackofficePrimaryPanel|BackofficeMetricStrip/, 'package catalog must not restore the old hero metric surface');

for (const parameter of ['q', 'state', 'sort', 'focus']) {
  assert.match(source, new RegExp(`searchParams\\.get\\('${parameter}'\\)`), `${parameter} must be URL-backed`);
}

assert.match(source, /activeRequestRef[\s\S]*requestSequenceRef[\s\S]*hasLoadedRef/, 'catalog reads must dedupe and reject stale responses');
assert.match(source, /admin\.plans\.retained_notice/, 'failed refreshes must retain and label the last successful catalog');
assert.match(source, /data-ui="plan-catalog-item"/, 'standard packages must render as a responsive operating list');
assert.match(source, /<p className="font-semibold text-slate-950 dark:text-white">\{packageAlias\}<\/p>/, 'package identity must remain plain text');
assert.doesNotMatch(source, /<button[\s\S]{0,320}>\s*\{packageAlias\}\s*<\/button>/, 'package identity must not duplicate the manage action');
assert.match(source, /text-blue-700[\s\S]{0,420}<span aria-hidden="true">›<\/span>/, 'active subscription counts must keep a persistent link affordance');
assert.match(source, /aria-label=\{planId[\s\S]{0,180}admin\.plans\.manage_title/, 'the compact manage button must keep an object-specific accessible name');
assert.match(source, /PlanManagementWorkbench/, 'one package management workbench must own package context and maintenance');
assert.doesNotMatch(workbench, /admin\.plans\.open_subscriptions_action/, 'the workbench must not duplicate the subscription link already owned by the catalog count');
assert.match(workbench, /t\('common\.save', \{\}, 'Save'\)/, 'the workbench primary action must use the compact Save label');
assert.doesNotMatch(workbench, /admin\.package_advanced_info_history/, 'the workbench must not expose misleading release history');
assert.doesNotMatch(workbench, /admin\.plan_advanced_json_title/, 'the workbench must not expose raw JSON overrides');
assert.doesNotMatch(workbench, /entitlements_json|budgets_override_json|concurrency_override_json|policy_override_json|metadata_override_json/, 'the normal workbench must not retain a hidden raw JSON mutation path');
assert.match(workbench, /method: 'PATCH'/, 'the normal workbench must use the structured Admin plan update contract');
assert.match(
  proxy,
  /methods: \['PATCH'\],[\s\S]*?pattern: \/\^plans\\\/\[\^\/\]\+\$\/[\s\S]*?namespace: 'admin'[\s\S]*?requiredCapability: 'can_manage_catalog'/,
  'the structured plan update must remain explicitly allowlisted behind the catalog capability'
);
assert.match(source, /admin\.plans\.open_advanced_setup/, 'missing packages must open the bounded advanced-maintenance path');
assert.match(workbench, /sales_price_cny[\s\S]*monthly_included_points[\s\S]*max_vector_documents/, 'the workbench must keep pricing, credits, and knowledge limits in one editor');
assert.match(workbench, /AdminWorkbenchDialog[\s\S]*sm:grid-cols-2/, 'the shared workbench must use a two-column parameter list on PC');

assert.match(source, /id="package-maintenance"/, 'package initialization and exceptional creation must remain in advanced maintenance');
assert.match(source, /toast\.success/, 'transient plan mutation success must use global toast feedback');
assert.match(workbench, /\/api\/admin\/plans\/\$\{encodeURIComponent\(planId\)\}/, 'the workbench must keep the structured Cloud plan detail and update API boundary');

console.log('admin_plans_directory_v2_contract: ok');
