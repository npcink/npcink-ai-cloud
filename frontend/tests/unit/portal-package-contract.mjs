import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const packageDisplayPath = resolve(root, 'src/lib/customer-package-display.ts');
const billingPagePath = resolve(root, 'src/app/portal/billing/page.tsx');
const siteRecordPath = resolve(root, 'src/app/portal/sites/[siteId]/page.tsx');

const packageDisplaySource = readFileSync(packageDisplayPath, 'utf8');
assert.match(
  packageDisplaySource,
  /planVersionId\?: string;/,
  'customer package display must accept planVersionId as a fallback input'
);
assert.match(
  packageDisplaySource,
  /inferPlanIdFromPlanVersionId/,
  'customer package display must expose a plan-version fallback resolver'
);

const billingPageSource = readFileSync(billingPagePath, 'utf8');
const billingMetricStart = billingPageSource.indexOf('<BackofficeMetricStrip');
const billingMetricStrip = billingPageSource.slice(
  billingMetricStart,
  billingPageSource.indexOf('<BackofficeStackCard', billingMetricStart)
);
assert.match(
  billingPageSource,
  /function coerceFiniteNumber/,
  'Portal package page must guard invalid numeric snapshot totals'
);
assert.match(
  billingPageSource,
  /planVersionId: snapshotPlanVersionId/,
  'Portal package page must use planVersionId fallback when resolving the current package label'
);
assert.match(
  billingPageSource,
  /href=\{`\/portal\/sites\/\$\{selectedSiteId\}`\}/,
  'Portal package page must link users to the site record to inspect package and allowed actions'
);
assert.match(
  billingPageSource,
  /upgrade_action[\s\S]*credit_packs_title[\s\S]*payment_orders_title/,
  'Portal package page must own package upgrades, credit packs, and payment orders'
);
assert.doesNotMatch(
  billingMetricStrip,
  /package_credit_allowance_label|site_allowance_label/,
  'Portal package header must not repeat package rights that are already shown in the rights card'
);
assert.match(
  billingPageSource,
  /package_rights_label[\s\S]*package_credit_allowance_label[\s\S]*site_allowance_label/,
  'Portal package rights must keep credits and site allowance together in one card'
);
assert.match(
  billingPageSource,
  /<details className="overflow-hidden rounded-\[1\.4rem\] border/,
  'Portal package page must keep package records behind an explicit details reveal'
);
assert.doesNotMatch(
  billingPageSource,
  /formatCurrency\(latestSnapshot\.totals\.cost\)/,
  'Portal package page must not format raw snapshot totals without validating the number'
);

const siteRecordSource = readFileSync(siteRecordPath, 'utf8');
assert.match(
  siteRecordSource,
  /label: t\('common\.package'[\s\S]*value: packageLabel/,
  'Site record header must keep the package summary visible for ordinary customers'
);
assert.doesNotMatch(
  siteRecordSource,
  /This is the clearest place to confirm the current package, service status, and connected site address\./,
  'Site record body must not repeat package and service status cards after the header summary'
);
