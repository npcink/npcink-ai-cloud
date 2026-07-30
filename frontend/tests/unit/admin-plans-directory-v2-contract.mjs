import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromFrontendRoot } from './_paths.mjs';

const source = readFileSync(fromFrontendRoot('src/app/admin/plans/page.tsx'), 'utf8');
const workbench = readFileSync(fromFrontendRoot('src/components/admin/PlanManagementWorkbench.tsx'), 'utf8');
const proxy = readFileSync(fromFrontendRoot('src/app/api/admin/[...path]/route.ts'), 'utf8');

assert.match(source, /BackofficeLayer/, 'package catalog must use the compact operating header');
assert.match(source, /BackofficeSummaryStrip/, 'package catalog must expose a compact status summary');
assert.doesNotMatch(source, /BackofficePrimaryPanel|BackofficeMetricStrip/, 'package catalog must not restore the old hero metric surface');

assert.match(source, /searchParams\.get\('focus'\)/, 'the open management workbench must remain URL-backed');
for (const retiredParameter of ['q', 'state', 'sort']) {
  assert.doesNotMatch(
    source,
    new RegExp(`searchParams\\.get\\('${retiredParameter}'\\)`),
    `${retiredParameter} must not restore filtering for the fixed four-package catalog`
  );
}

assert.match(source, /activeRequestRef[\s\S]*requestSequenceRef[\s\S]*hasLoadedRef/, 'catalog reads must dedupe and reject stale responses');
assert.match(source, /admin\.plans\.retained_notice/, 'failed refreshes must retain and label the last successful catalog');
assert.match(source, /data-ui="plan-catalog-item"/, 'standard packages must render as a responsive operating list');
assert.match(source, /sortCatalogByTier\(canonicalTierCoverage\)/, 'the fixed catalog must keep the business tier order');
assert.match(source, /headerVisibility="sr-only"/, 'the table must keep its accessible name without repeating a visible catalog header');
assert.doesNotMatch(source, /admin\.plans\.search_label|admin\.plans\.sort_label|admin\.plans\.state_filter_label/, 'the fixed catalog must not expose redundant search, sort, or readiness controls');
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
assert.doesNotMatch(workbench, /data-ui="plan-subscription-impact"/, 'the workbench must not reserve a prominent top banner for subscription impact');
assert.match(
  workbench,
  /footerNotice=\{hasUnsavedChanges && activeSubscriptionCount > 0[\s\S]{0,520}admin\.plans\.subscription_impact[\s\S]{0,260}: ''\}/,
  'the workbench must disclose active-subscription impact beside Save only after values change'
);
assert.doesNotMatch(workbench, /sm:grid-cols-3/, 'the normal parameter view must not restore the redundant package ID/version metric row');
assert.match(workbench, /activeTab === 'diagnostics'[\s\S]*admin\.plans\.package_id_label[\s\S]*admin\.plans\.latest_version_label/, 'technical package identity and version must remain diagnostics-only');
assert.match(workbench, /method: 'PATCH'/, 'the normal workbench must use the structured Admin plan update contract');
assert.match(
  proxy,
  /methods: \['PATCH'\],[\s\S]*?pattern: \/\^plans\\\/\[\^\/\]\+\$\/[\s\S]*?namespace: 'admin'[\s\S]*?requiredCapability: 'can_manage_catalog'/,
  'the structured plan update must remain explicitly allowlisted behind the catalog capability'
);
assert.match(source, /admin\.plans\.open_advanced_setup/, 'missing packages must open the bounded advanced-maintenance path');
assert.match(
  workbench,
  /admin\.plans\.customer_package_section[\s\S]*admin\.sales_price_cny[\s\S]*admin\.included_points[\s\S]*admin\.site_limit[\s\S]*admin\.vector_documents_limit[\s\S]*admin\.plans\.runtime_limits_section[\s\S]*admin\.concurrency[\s\S]*admin\.batch_ceiling[\s\S]*admin\.model_cost_budget_cny[\s\S]*admin\.grace_period_label/,
  'the workbench must order customer-facing package values before runtime limits'
);
assert.match(
  workbench,
  /data-ui="plan-parameter-grid"[\s\S]{0,180}sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4/,
  'the shared workbench must progressively render two, three, and four compact parameter columns'
);
assert.match(
  workbench,
  /inputMode=\{step < 1 \? 'decimal' : 'numeric'\}/,
  'package inputs must expose integer or decimal keyboard hints according to their step'
);
assert.match(workbench, /tabular-nums/, 'numeric package inputs must keep stable digit widths');
assert.match(workbench, /webkit-inner-spin-button/, 'numeric package inputs must hide inconsistent browser steppers');
for (const unitKey of [
  'admin.plans.unit_cny_30_days',
  'admin.plans.unit_credits',
  'admin.plans.unit_sites',
  'admin.plans.unit_articles',
  'admin.plans.unit_runs',
  'admin.plans.unit_items',
  'admin.plans.unit_cny_period',
  'admin.plans.unit_days',
]) {
  assert.match(workbench, new RegExp(unitKey.replaceAll('.', '\\.')), `${unitKey} must remain visible beside its numeric value`);
}

assert.match(source, /id="package-maintenance"/, 'package initialization and exceptional creation must remain in advanced maintenance');
assert.match(source, /toast\.success/, 'transient plan mutation success must use global toast feedback');
assert.match(workbench, /\/api\/admin\/plans\/\$\{encodeURIComponent\(planId\)\}/, 'the workbench must keep the structured Cloud plan detail and update API boundary');

console.log('admin_plans_directory_v2_contract: ok');
