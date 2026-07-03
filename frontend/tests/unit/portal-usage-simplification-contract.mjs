import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const usagePagePath = resolve(process.cwd(), 'src/app/portal/usage/page.tsx');
const i18nPath = resolve(process.cwd(), 'src/lib/i18n.ts');
const source = readFileSync(usagePagePath, 'utf8');
const i18nSource = readFileSync(i18nPath, 'utf8');

assert.match(
  source,
  /title=\{t\('portal\.nav_usage'/,
  'portal usage page must use the simplified Plan and usage title'
);

assert.match(
  source,
  /data-portal-usage="plan-summary"/,
  'portal usage page must expose the package summary as the primary surface'
);

assert.match(
  source,
  /data-portal-usage="current-package"/,
  'portal usage page must show the current package before technical details'
);

assert.match(
  source,
  /data-portal-usage="ledger-detail"/,
  'AI credit ledger detail must be available only as an explicit detail disclosure'
);

assert.match(
  source,
  /data-portal-usage="usage-detail"/,
  'usage trends, provider cost, and entitlement detail must be grouped behind an explicit detail disclosure'
);

const summaryIndex = source.indexOf('data-portal-usage="plan-summary"');
const currentPackageIndex = source.indexOf('data-portal-usage="current-package"');
const detailIndex = source.indexOf('data-portal-usage="usage-detail"');
const trendsIndex = source.indexOf("t('portal.usage.trends_title'");
const costIndex = source.indexOf("t('portal.usage.cost_summary_title'");
const entitlementIndex = source.indexOf("t('portal.usage.entitlement_title'");

assert.ok(summaryIndex >= 0, 'plan summary marker must exist');
assert.ok(currentPackageIndex > summaryIndex, 'current package must render inside the plan summary surface');
assert.ok(detailIndex > currentPackageIndex, 'technical usage detail must stay after the package summary');
assert.ok(trendsIndex > detailIndex, 'usage trends must be inside the detail disclosure');
assert.ok(costIndex > detailIndex, 'provider cost summary must be inside the detail disclosure');
assert.ok(entitlementIndex > detailIndex, 'entitlement details must be inside the detail disclosure');

for (const key of [
  'portal.usage.plan_summary_label',
  'portal.usage.plan_summary_title',
  'portal.usage.plan_summary_desc',
  'portal.usage.plan_detail_toggle',
  'portal.usage.detail_toggle',
]) {
  assert.match(i18nSource, new RegExp(`'${key}'`), `${key} must be translated`);
}

console.log('portal_usage_simplification_contract: ok');
