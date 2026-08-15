import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const source = readFileSync(resolve(root, 'src/app/portal/page.tsx'), 'utf8');
const sitesWorkspaceSource = readFileSync(
  resolve(root, 'src/components/portal/PortalSitesWorkspace.tsx'),
  'utf8'
);

const homeClientCalls = Array.from(
  source.matchAll(/portalClient\s*\.\s*([A-Za-z0-9_]+)\s*\(/g),
  (match) => match[1]
);

assert.deepEqual(
  homeClientCalls,
  ['getAccountEntitlements'],
  'Portal home may make at most one request beyond the shared session request'
);
for (const forbiddenMethod of [
  'getSiteSummary',
  'getSiteDiagnostics',
  'getIdentityProviders',
  'listSupportRequests',
]) {
  assert.ok(
    !source.includes(forbiddenMethod),
    `Portal home must not call ${forbiddenMethod}`
  );
}
assert.doesNotMatch(
  source,
  /Promise\.all(?:Settled)?|siteSummaryCache|PortalSiteInspectorDrawer/,
  'Portal home must not fan out per-site requests or retain a summary drawer cache'
);

assert.match(source, /operationSummaryItems\s*=\s*\[/);
assert.match(
  source,
  /<PortalWorkspaceHeader[\s\S]*contextPanel=\{primaryOperationFocusItem[\s\S]*metrics=\{showAccountSummary \? operationSummaryItems : \[\]\}/,
  'Portal home must use the shared compact header for its primary status and account summary'
);
assert.match(
  source,
  /accountEntitlements\?\.quota_summary\?\.ai_credits\?\.remaining/,
  'Portal home must use the one account entitlement response for remaining credits'
);
assert.match(
  source,
  /accountEntitlementsState !== 'loaded'[\s\S]*portal\.home\.service_status_attention/,
  'Portal home must not report Ready while account entitlements are unknown'
);
assert.match(
  source,
  /accountEntitlementsUnavailable[\s\S]*portal\.home\.entitlements_retry[\s\S]*formatNumber\(remainingCredits\)/,
  'Portal home must distinguish an entitlement failure from a real zero balance'
);
assert.doesNotMatch(
  source,
  /remainingCredits > 0/,
  'Portal home must render a real zero balance instead of treating it as pending'
);
assert.match(
  source,
  /creditUnavailable[\s\S]*overLimitResource[\s\S]*Number\(resource\.used \|\| 0\) > Number\(resource\.limit \|\| 0\)[\s\S]*resourceOverLimit/,
  'Portal service status must not treat an exactly-full site allowance as a runtime incident'
);
assert.match(
  source,
  /capacity_attention_title[\s\S]*capacity_attention_desc[\s\S]*href: '\/portal\/billing#package-options'/,
  'Portal home must explain an over-limit warning and provide a customer action'
);
assert.match(
  source,
  /active_sites[\s\S]*active_site_capacity_label[\s\S]*site_capacity_attention_label/,
  'Portal home must identify active-site capacity instead of falling back to a generic package warning'
);
assert.match(
  source,
  /showAccountSummary = true[\s\S]*metrics=\{showAccountSummary \? operationSummaryItems : \[\]\}/,
  'Portal home must show account metrics without requiring a selected site context'
);
assert.doesNotMatch(
  source,
  /const currentServiceStatusToken = !selectedSite|description=\{!selectedSite && hasVisibleSites/,
  'Portal account service status and description must not depend on selecting a site'
);
assert.match(
  source,
  /portal\.home\.site_connection_status_label[\s\S]*site_connection_ready_value[\s\S]*site_connection_none_value/,
  'Portal home must present site connection as a separate account summary metric'
);
assert.match(source, /data-portal-home="operation-overview"/);
assert.match(source, /shouldShowFollowUpSection/);
assert.match(
  source,
  /primaryOperationFocusItem = operationFocusItems\[0\][\s\S]*remainingOperationFocusItems = operationFocusItems\.slice\(1\)[\s\S]*!showBothFollowUpPanels && 'xl:max-w-3xl'/,
  'Portal home must place the primary issue in the header and keep only additional follow-up panels below'
);
assert.match(source, /remainingOperationFocusItems\.length > 0 \? \(/);
assert.match(source, /data-portal-home="setup-checklist"/);
assert.doesNotMatch(source, /data-portal-home="no-action-summary"/);
assert.doesNotMatch(
  source,
  /<PortalWorkspaceHeader[\s\S]{0,120}\beyebrow=/,
  'Portal home must not repeat the redundant overview eyebrow above its title'
);

assert.match(
  source,
  /<PortalSitesWorkspace \/>/,
  'Portal home must render the session-backed site workspace without summary props'
);
assert.doesNotMatch(
  sitesWorkspaceSource,
  /siteSummaries|PortalSiteSummaryRecord|getSiteSummary|getSiteDiagnostics/,
  'Portal site list must not depend on detail or diagnostic projections'
);
assert.match(
  sitesWorkspaceSource,
  /portalSiteNeedsAttention\(right\)[\s\S]*portalSiteNeedsAttention\(left\)/,
  'Portal site list must continue to prioritize sites that need attention'
);
assert.match(
  sitesWorkspaceSource,
  /portal\.sites\.active_capacity[\s\S]*portal\.sites\.bound_capacity[\s\S]*site\.status === 'active'/,
  'Portal site list must show separate account capacity and each site lifecycle status'
);
assert.match(
  sitesWorkspaceSource,
  /data-portal-sites="desktop-table"[\s\S]*data-portal-sites="desktop-actions"[\s\S]*openLifecycleModal[\s\S]*setPendingRemoveSite/,
  'Portal desktop site rows must retain authorized lifecycle and removal controls behind a low-frequency disclosure'
);

const siteRegisterIndex = sitesWorkspaceSource.indexOf('portal.site_register');
assert.ok(siteRegisterIndex >= 0, 'merged site workspace must render a connected-site register');
assert.doesNotMatch(
  sitesWorkspaceSource.slice(siteRegisterIndex),
  /package_card_label|sitePackageDisplay|resolveSitePackageDisplay|hasCachedSiteCoverage/,
  'Portal site register must not show account package as a per-site field'
);

const overviewIndex = source.indexOf('data-portal-home="operation-overview"');
const summaryIndex = source.indexOf('metrics={showAccountSummary ? operationSummaryItems : []}');
const focusIndex = source.indexOf('data-portal-home="current-focus"');
const checklistIndex = source.indexOf('data-portal-home="setup-checklist"');
assert.ok(overviewIndex >= 0);
assert.ok(focusIndex > overviewIndex);
assert.ok(summaryIndex > focusIndex);
assert.ok(checklistIndex > summaryIndex);

console.log('portal_home_layout_contract: ok');
