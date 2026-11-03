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
  /<PortalWorkspaceHeader[\s\S]*metrics=\{showAccountSummary \? operationSummaryItems : \[\]\}/,
  'Portal home must use the shared compact header for account summary without a dual-column attention aside'
);
assert.doesNotMatch(
  source,
  /contextPanel=\{primaryOperationFocusItem/,
  'Portal home must not put attention alerts in the header contextPanel aside'
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
  /capacity_attention_title[\s\S]*href: '\/portal\/billing\?action=upgrade'/,
  'Portal home must explain an over-limit warning and provide a customer action'
);
assert.match(source, /capacity_attention_desc/, 'Portal home capacity alerts must keep used/limit detail copy');

assert.match(
  source,
  /active_sites[\s\S]*active_site_capacity_label/,
  'Portal home must identify active-site capacity instead of falling back to a generic package warning'
);
assert.match(source, /site_capacity_attention_label/, 'Portal home must retain the site-specific status label');
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
  /attentionFocusItems = operationFocusItems[\s\S]*data-portal-home="follow-up"/,
  'Portal home must keep a single full-width attention stack below the header'
);
assert.match(source, /attentionFocusItems\.length > 0 \? \(/);
assert.match(source, /data-portal-home="attention-focus"/);
assert.doesNotMatch(
  source,
  /xl:max-w-3xl|xl:grid-cols-\[1\.1fr_0\.9fr\]/,
  'Portal home follow-up must not cap width or use a two-column empty-aside layout'
);
assert.match(
  source,
  /flex w-full flex-col items-start gap-2/,
  'Portal home follow-up must stack shrink-to-content attention surfaces left-aligned'
);
assert.doesNotMatch(
  source,
  /data-portal-home="follow-up"[\s\S]*PortalSection[\s\S]*PortalCard|data-portal-home="attention-focus"[\s\S]*PortalCard/,
  'Portal home attention must be a single-surface list (no card-in-card wrappers)'
);
assert.match(source, /data-portal-home="setup-checklist"/);
assert.doesNotMatch(source, /data-portal-home="no-action-summary"/);
assert.doesNotMatch(
  source,
  /<PortalWorkspaceHeader[\s\S]{0,120}\beyebrow=/,
  'Portal home must not repeat the redundant overview eyebrow above its title'
);

assert.match(
  source,
  /<PortalSitesWorkspace(?:\s+capacityAlerts=\{capacityAttentionItems\})?\s*\/>/,
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
  /const showSiteSearch = visibleSites\.length > 20 \|\| searchQuery\.trim\(\)\.length > 0[\s\S]*site\.status === 'active'/,
  'Portal site list must defer search until scale requires it, preserve active queries, and keep each site lifecycle status'
);
assert.doesNotMatch(
  sitesWorkspaceSource,
  /portal\.sites\.active_capacity|portal\.sites\.bound_capacity|<PortalTag/,
  'Portal site list must not repeat account capacity as persistent tags'
);
assert.match(
  sitesWorkspaceSource,
  /data-portal-sites="desktop-table"[\s\S]*PortalRowActions[\s\S]*overflow=\{rowActions\.overflow\}[\s\S]*overflowTestId="desktop-actions"[\s\S]*openLifecycleModal[\s\S]*setPendingRemoveSite/,
  'Portal desktop site rows must use PortalRowActions with danger ops in the overflow menu'
);
assert.match(
  sitesWorkspaceSource,
  /flex-nowrap justify-end/,
  'Portal desktop site row actions must stay on a single nowrap line'
);
assert.match(
  sitesWorkspaceSource,
  /id: 'wp-admin'[\s\S]*open_wordpress_admin/,
  'Portal WP admin icon button must keep a full accessible label'
);
assert.match(
  sitesWorkspaceSource,
  /getPortalWordPressAdminUrl|portal\.sites\.open_wordpress_admin/,
  'Portal site rows must expose WordPress admin as the shared secondary action when a site URL exists'
);
assert.match(
  sitesWorkspaceSource,
  /PortalStatusInline/,
  'Connected sites must use a quiet inline mark instead of a green status capsule'
);
assert.doesNotMatch(
  sitesWorkspaceSource,
  /data-portal-sites="desktop-actions"[\s\S]{0,200}<details/,
  'Portal site row actions must not use ad-hoc details menus'
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
const focusIndex = source.indexOf('data-portal-home="attention-focus"');
const checklistIndex = source.indexOf('data-portal-home="setup-checklist"');
assert.ok(overviewIndex >= 0);
assert.ok(summaryIndex > overviewIndex);
assert.ok(focusIndex > summaryIndex || checklistIndex > summaryIndex);
assert.doesNotMatch(source, /data-portal-home="current-focus"|data-portal-home="additional-focus"/);

assert.doesNotMatch(
  source,
  /metricsColumnsClassName="md:grid-cols-3"/,
  'Portal home must not force a 3-column metric strip that pads empty cells'
);

assert.match(
  sitesWorkspaceSource,
  /PortalSection className="space-y-2 p-3/,
  'Portal My Sites section must use tight padding and spacing between title and table'
);
assert.doesNotMatch(
  sitesWorkspaceSource,
  /lg:max-w-3xl[\s\S]{0,80}showSiteSearch/,
  'Portal My Sites must not reserve an empty max-w-3xl actions column when search is hidden'
);
assert.match(
  sitesWorkspaceSource,
  /data-portal-sites-guide="under-connect"/,
  'Portal connect guide for existing sites must expand under the Connect new site control'
);
assert.match(
  sitesWorkspaceSource,
  /data-portal-sites-guide="empty"/,
  'Portal empty-state connect guide may remain after the site list'
);
assert.match(
  sitesWorkspaceSource.slice(sitesWorkspaceSource.indexOf('data-portal-sites="section"'), sitesWorkspaceSource.indexOf('data-portal-sites="desktop-table"')),
  /data-portal-sites-guide="under-connect"/,
  'Portal under-connect guide must sit between the title row and the desktop table'
);

// Spec §2: one shell-level ~896px band shared by every service-center page (home is the reference).
const portalCssSource = readFileSync(resolve(root, 'src/app/portal/portal.css'), 'utf8');
const portalLayoutSource = readFileSync(resolve(root, 'src/app/portal/layout.tsx'), 'utf8');
assert.match(portalCssSource, /--portal-content-max-width:\s*56rem/, 'Portal shell content band must be 56rem (~896px)');
assert.match(
  portalLayoutSource,
  /portal-content[^"]*max-w-\[var\(--portal-content-max-width\)\]/,
  'Portal layout must apply the shared content band'
);
assert.match(source, /data-portal-home="page"/);
assert.doesNotMatch(source, /max-w-\[(?:56|65|80)rem\]/, 'Portal home must not re-narrow or widen the shared band locally');
assert.match(
  source,
  /metricsLayout="rail"/,
  'Portal home must use the compact left-aligned metric rail'
);
assert.match(
  sitesWorkspaceSource,
  /data-portal-sites="connect-new"[\s\S]*connectGuideOpen \? 'connect-collapse' : 'connect-new'|PortalActionIcon id=\{connectGuideOpen \? 'connect-collapse' : 'connect-new'\}/,
  'Portal Connect new site icon must toggle plus (closed) / minus (open)'
);
assert.match(
  sitesWorkspaceSource,
  /const nextOpen = !connectGuideOpen[\s\S]*setConnectGuideOpen\(nextOpen\)/,
  'Portal Connect new site must toggle both ways: plus opens guide, minus collapses and returns to plus'
);
assert.doesNotMatch(
  sitesWorkspaceSource.slice(
    sitesWorkspaceSource.indexOf('data-portal-sites-guide="under-connect"'),
    sitesWorkspaceSource.indexOf('data-portal-sites-guide="under-connect"') + 900
  ),
  /common\.close|btn btn-secondary btn-sm/,
  'Portal under-connect guide must not keep a separate Close text button'
);
assert.match(
  sitesWorkspaceSource,
  /iconOnly: true[\s\S]*id: 'view-site'|id: 'view-site'[\s\S]*iconOnly: true/,
  'Portal Open site row action must be icon-only'
);
assert.match(
  sitesWorkspaceSource,
  /if \(wpAdmin\) \{[\s\S]*overflow\.push\(wpAdmin\)/,
  'Portal WP admin must live in the overflow menu, not as a visible secondary control'
);
assert.doesNotMatch(
  sitesWorkspaceSource.slice(
    sitesWorkspaceSource.indexOf('let primary'),
    sitesWorkspaceSource.indexOf('return { primary, secondary, inline, overflow }')
  ),
  /secondary = wpAdmin|secondary: PortalRowActionItem \| null = wpAdmin/,
  'Portal site rows must not expose WP admin as a visible secondary action'
);
assert.match(
  sitesWorkspaceSource,
  /data-portal-sites="view-plan"[\s\S]*PortalActionIcon id="view-plan"/,
  'Portal capacity View plan action must be an icon button with aria-label from the action label'
);
assert.match(
  readFileSync(resolve(root, 'src/components/portal/PortalRowActions.tsx'), 'utf8'),
  /iconOnly\?: boolean[\s\S]*PortalActionIcon|function PortalActionIcon/,
  'PortalRowActions must support iconOnly actions with shared glyphs'
);
assert.match(
  source,
  /btn btn-secondary btn-sm shrink-0[\s\S]*item\.action/,
  'Portal home attention rows must place the CTA on the right of each alert'
);
assert.match(
  source,
  /attentionFocusItems\.length > 0 \? \([\s\S]*data-portal-home="attention-focus"/,
  'Portal home must hide the Service Status / attention card when there are zero pending items'
);
assert.match(
  source,
  /attentionFocusItems\.length === 0 && capacityAttentionItems\.length === 0 \? \([\s\S]*PortalStatusBadge/,
  'Portal home must show the header status badge only when attention and My Sites capacity alerts are both absent'
);
assert.match(
  source,
  /capacityAttentionItems\.length === 0[\s\S]*PortalStatusBadge/,
  'Portal home must hide the header status badge when My Sites card-top capacity alerts are present (no same-cause duplicate)'
);
assert.doesNotMatch(
  source.slice(source.indexOf('data-portal-home="attention-focus"'), source.indexOf('data-portal-home="setup-checklist"') > 0 ? source.indexOf('data-portal-home="setup-checklist"') : source.length),
  /PortalTag|current_status_title/,
  'Portal attention card must not repeat capacity/status pills or a Service Status title chrome'
);
assert.match(
  source,
  /group-hover:block group-focus-within:block[\s\S]*item\.detail|title=\{item\.detail\}/,
  'Portal attention long copy must reveal on hover/focus (tooltip), not as a permanent second row'
);
assert.doesNotMatch(
  source.slice(source.indexOf('data-portal-home="attention-list"'), source.indexOf('data-portal-home="setup-checklist"') > 0 ? source.indexOf('data-portal-home="setup-checklist"') : source.length),
  /<details/,
  'Portal attention list must not use always-visible Details disclosure rows'
);


assert.match(
  source,
  /capacity-summary|overLimitResources\.length === 1/,
  'Portal home must merge multiple capacity alerts into one summary row when needed'
);
assert.doesNotMatch(
  source,
  /data-portal-home="attention-list"[\s\S]*justify-between/,
  'Portal home attention rows must keep title and CTA adjacent (no justify-between stretch)'
);
assert.match(
  source,
  /icon:\s*packageMetricIcon|packageMetricIcon/,
  'Portal home metrics must support icon+number rail glyphs'
);
assert.match(
  sitesWorkspaceSource,
  /data-portal-sites="site-url"[\s\S]*getPortalSiteUrlDisplay/,
  'Portal site short URL must render inline next to the site name'
);
assert.match(
  sitesWorkspaceSource,
  /items-baseline gap-2[\s\S]*data-portal-sites="site-name"[\s\S]*data-portal-sites="site-url"/,
  'Portal desktop site rows must show name and short URL on one inline line'
);
assert.match(
  sitesWorkspaceSource,
  /visibleSites\.length > 0 && connectGuideOpen/,
  'Portal connect guide for existing sites must open only from Connect new site (not always-on details)'
);


assert.match(
  sitesWorkspaceSource,
  /data-portal-sites="site-name"[\s\S]*getPortalSiteDisplayName/,
  'Portal desktop site rows must show the site display name as the primary cell'
);
assert.doesNotMatch(
  sitesWorkspaceSource,
  /portal\.site_register[\s\S]{0,120}my_sites_title|my_sites_title[\s\S]{0,80}portal\.site_register/,
  'Portal My Sites must not keep a redundant Sites/站点清单 eyebrow above the title'
);
assert.doesNotMatch(
  source,
  /data-portal-home="context-summary"|account_context_label/,
  'Portal home must not show a redundant Account overview eyebrow/metadata line'
);
assert.match(
  sitesWorkspaceSource,
  /overflow\.push\([\s\S]*deactivate[\s\S]*overflow\.push\([\s\S]*remove|overflow\.push\([\s\S]*id: 'deactivate'[\s\S]*id: 'remove'/,
  'Portal site deactivate/remove must live in the overflow menu with parent-owned confirm'
);
assert.match(
  readFileSync(resolve(root, 'src/components/portal/PortalRowActions.tsx'), 'utf8'),
  /flex-nowrap/,
  'PortalRowActions must default to a single-line nowrap action cluster'
);
assert.match(
  source,
  /metricsPlacement="title-end"/,
  'Portal home metrics rail must sit on the header title row (right), not a full-width empty band'
);
assert.doesNotMatch(
  source,
  /<PortalWorkspaceHeader[\s\S]*description=\{t\('portal\.home\.concise_desc'\)/,
  'Portal home must hide the long header description by default'
);
assert.match(
  source,
  /w-fit max-w-full[\s\S]*data-portal-home="attention-focus"|data-portal-home="attention-focus"[\s\S]*w-fit max-w-full/,
  'Portal attention strip must shrink to content and stay left-aligned'
);
assert.match(
  sitesWorkspaceSource,
  /w-0 whitespace-nowrap[\s\S]*table_actions|whitespace-nowrap px-2 py-1\.5 text-right/,
  'Portal sites actions column must be auto-width nowrap on the right'
);


assert.match(
  source,
  /capacityAttentionItems[\s\S]*PortalSitesWorkspace capacityAlerts=\{capacityAttentionItems\}/,
  'Portal home capacity alerts must be passed into My Sites, not left floating alone between header and sites'
);
assert.match(
  sitesWorkspaceSource,
  /data-portal-sites="capacity-alerts"/,
  'Portal My Sites must render capacity alerts at the top of the sites card'
);
assert.match(
  sitesWorkspaceSource,
  /data-portal-sites="capacity-alert-row"[\s\S]*data-portal-sites="view-plan"[\s\S]*data-portal-sites="capacity-alert-detail"/,
  'Portal capacity alerts must use a 2-row layout: title+CTA on top, detail below'
);
assert.doesNotMatch(
  sitesWorkspaceSource.slice(
    sitesWorkspaceSource.indexOf('data-portal-sites="capacity-alerts"'),
    sitesWorkspaceSource.indexOf('data-portal-sites="capacity-alerts"') + 1200
  ),
  /ⓘ|cursor-help/,
  'Portal capacity alerts must not use an ⓘ tooltip for detail'
);
assert.match(
  readFileSync(resolve(root, 'src/components/portal/PortalRowActions.tsx'), 'utf8'),
  /data-portal-row-actions="overflow-menu"[\s\S]*fixed z-\[80\]|fixed z-\[80\][\s\S]*overflow-menu/,
  'PortalRowActions overflow menu must use fixed positioning so table overflow cannot clip it'
);


assert.doesNotMatch(
  sitesWorkspaceSource.slice(
    sitesWorkspaceSource.indexOf('portal.home.my_sites_title'),
    sitesWorkspaceSource.indexOf('data-portal-sites="connect-new"')
  ),
  /visibleSites\.length[\s\S]{0,80}common\.site/,
  'Portal My Sites title must not show an N-sites count subtitle'
);


assert.match(
  source,
  /if \(isLoading\)[\s\S]*<PortalLoadingState message=\{t\('common\.loading'\)\}/,
  'Portal home session loading must use PortalLoadingState skeleton, not hourglass'
);
assert.doesNotMatch(
  source,
  /⏳/,
  'Portal home must not use hourglass emoji loading'
);
assert.match(
  source,
  /import \{[\s\S]*PortalLoadingState[\s\S]*\} from '@\/components\/portal\/PortalPageState'/,
  'Portal home must import PortalLoadingState'
);

console.log('portal_home_layout_contract: ok');


