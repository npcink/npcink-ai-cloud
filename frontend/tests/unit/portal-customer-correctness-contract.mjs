import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const sitesSource = readFileSync(resolve(root, 'src/components/portal/PortalSitesWorkspace.tsx'), 'utf8');
const sitesRedirectPath = resolve(root, 'src/app/portal/sites/page.tsx');
const accountSource = readFileSync(resolve(root, 'src/app/portal/account/page.tsx'), 'utf8');
const homeSource = readFileSync(resolve(root, 'src/app/portal/page.tsx'), 'utf8');
const usageSource = readFileSync(resolve(root, 'src/app/portal/usage/page.tsx'), 'utf8');
const siteUsageListSource = readFileSync(resolve(root, 'src/components/portal/PortalBillingSiteUsageList.tsx'), 'utf8');
const siteUsageDialogSource = readFileSync(resolve(root, 'src/components/portal/PortalSiteUsageDialog.tsx'), 'utf8');
const billingSource = readFileSync(resolve(root, 'src/app/portal/billing/page.tsx'), 'utf8');
const accountCommerceSource = readFileSync(resolve(root, 'src/components/portal/PortalAccountCommercePanels.tsx'), 'utf8');
const auditSource = readFileSync(resolve(root, 'src/app/portal/audit/PortalAuditClient.tsx'), 'utf8');
const monitoringPath = resolve(root, 'src/app/portal/monitoring/page.tsx');
const headerSource = readFileSync(resolve(root, 'src/components/portal/PortalWorkspaceHeader.tsx'), 'utf8');
const paginationSource = readFileSync(resolve(root, 'src/components/ui/ListPagination.tsx'), 'utf8');
const loadingSource = readFileSync(resolve(root, 'src/components/portal/PortalPageState.tsx'), 'utf8');
const portalClientSource = readFileSync(resolve(root, 'src/lib/portal-client.ts'), 'utf8');

assert.match(sitesSource, /const visibleSites = getVisiblePortalSites\(sites\)/);
assert.match(sitesSource, /visibleSites\.length/);
assert.match(sitesSource, /htmlFor="portal-service-site-search"[\s\S]*id="portal-service-site-search"/);
assert.equal(existsSync(sitesRedirectPath), false);
assert.equal(existsSync(monitoringPath), false);
assert.match(homeSource, /<PortalSitesWorkspace(?:\s+capacityAlerts=\{capacityAttentionItems\})?\s*\/>/);
assert.doesNotMatch(homeSource, /getSiteSummary|getSiteDiagnostics|siteSummaryCache/);
assert.doesNotMatch(sitesSource, /siteSummaries|PortalSiteSummaryRecord/);
assert.match(
  sitesSource,
  /error instanceof ApiError && error\.statusCode === 409[\s\S]*await refresh\(\)[\s\S]*setReplacementSiteIds\(\[\]\)/,
  'site lifecycle quota conflicts must refresh capacity before another swap attempt'
);
assert.match(
  sitesSource,
  /setPendingLifecycleSite\(\(pendingSite\)[\s\S]*sites\.find\(\(site\) => site\.site_id === pendingSite\.site_id\)/,
  'an open lifecycle dialog must reconcile its site against refreshed session capacity'
);
assert.match(portalClientSource, /customer_status:[\s\S]*nestedCustomerStatus\.needs_attention/);
assert.doesNotMatch(
  accountSource,
  /PortalMetricStrip|getVisiblePortalSites\(session\.sites\)\.length/,
  'account header must not repeat login, QQ, and site details already shown below'
);
assert.doesNotMatch(homeSource, /role="button"[\s\S]{0,900}href=\{`\/portal\/sites\/\$\{site\.site_id\}`\}/);

// Spec: usage = package page site list -> per-site Modal (trend / AI credit records).
assert.match(
  usageSource,
  /searchParams\.toString\(\)[\s\S]*router\.replace\(`\/portal\/billing\$\{query \? `\?\$\{query\}` : ''\}#usage`\)/,
  'legacy /portal/usage must keep its query and land on the package page usage anchor'
);
assert.match(
  siteUsageListSource,
  /getVisiblePortalSites\(sites\)[\s\S]*onClick=\{\(\) => onSelectSite\(site\)\}/,
  'package page must list visible sites and open usage for the chosen site'
);
assert.match(
  billingSource,
  /<PortalSiteUsageDialog[\s\S]*isOpen=\{Boolean\(siteUsageSite\)\}[\s\S]*site=\{siteUsageSite\}/,
  'site usage Modal must be scoped to the site picked from the list'
);
assert.match(siteUsageDialogSource, /creditEventWindow[\s\S]*creditEventFeature/);
assert.match(
  siteUsageDialogSource,
  /getAccountCreditEvents\(\{[\s\S]*siteId: requestSiteId/,
  'site usage records must query only the selected site'
);
assert.match(
  siteUsageDialogSource,
  /useEffect\(\(\) => \{\s*siteIdRef\.current = siteId;[\s\S]*setCreditTrend\(null\)[\s\S]*setCreditEvents\(null\)[\s\S]*setSelectedCreditEvent\(null\)/,
  'site usage Modal must clear stale trend, records, and detail when the site changes'
);
assert.match(accountCommerceSource, /id="package-options"[\s\S]*setActiveCommercialDialog\('package'\)/);
assert.doesNotMatch(billingSource, /id="package-options"/);
assert.match(billingSource, /href=\{\s*manageHref\s*\}|href="\/portal\/account#package-options"/);
assert.match(auditSource, /SUCCESSFUL_AUDIT_OUTCOMES[\s\S]*succeeded[\s\S]*completed/);
assert.match(headerSource, /onSiteChange[\s\S]*<select[\s\S]*onSiteChange\(event\.target\.value\)/);

assert.match(paginationSource, /common\.next_page/);
assert.match(loadingSource, /role="status"[\s\S]*motion-safe:animate-pulse/);
assert.doesNotMatch(loadingSource, /⏳/);


assert.match(
  homeSource,
  /if \(isLoading\)[\s\S]*PortalLoadingState/,
  'portal home isLoading must render PortalLoadingState'
);
assert.doesNotMatch(homeSource, /⏳/, 'portal home must not use hourglass loading');
assert.doesNotMatch(
  sitesSource + accountSource + usageSource + siteUsageDialogSource + billingSource + accountCommerceSource + auditSource,
  /⏳/,
  'portal surfaces under contract must not use hourglass loading'
);

console.log('portal_customer_correctness_contract: ok');
