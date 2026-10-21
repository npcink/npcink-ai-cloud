import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const usagePagePath = resolve(process.cwd(), 'src/components/portal/PortalUsagePanel.tsx');
const creditTrendPath = resolve(process.cwd(), 'src/components/portal/PortalCreditTrendPanel.tsx');
const i18nPath = resolve(process.cwd(), 'src/lib/i18n.ts');
const source = readFileSync(usagePagePath, 'utf8');
const creditTrendSource = readFileSync(creditTrendPath, 'utf8');
const i18nSource = readFileSync(i18nPath, 'utf8');
const headerBeforeSummary = source.slice(
  source.indexOf('<PortalWorkspaceHeader'),
  source.indexOf('data-portal-usage="usage-records"')
);
const headerStart = source.indexOf("title={t('portal.nav_usage'");
const headerDefinitionStart = source.lastIndexOf('<PortalWorkspaceHeader', headerStart);
const headerDefinitionEnd = source.indexOf('/>', source.indexOf('contextPanel=', headerDefinitionStart));
const headerDefinition = source.slice(headerDefinitionStart, headerDefinitionEnd + 2);

assert.match(
  source,
  /title=\{t\('portal\.nav_usage'/,
  'portal usage page must use the simplified Usage title'
);

assert.match(
  source,
  /data-portal-usage="usage-records"/,
  'portal usage page must expose customer-readable usage records'
);
assert.doesNotMatch(
  source,
  /PortalEntitlementUsage|entitlement_usage_title|entitlement_usage_desc|entitlement_used_line/,
  'portal usage page must not repeat the package rights summary owned by the package page'
);
assert.doesNotMatch(
  headerDefinition,
  /ai_credits_label|resource_bound_sites|remaining_requests_test_label/,
  'portal usage header must not repeat the detailed usage numbers shown in the current usage card'
);
assert.match(
  headerDefinition,
  /period_end_detail/,
  'portal usage header must show the exact period end as secondary context'
);
assert.doesNotMatch(
  headerDefinition,
  /context_generated|header_updated_detail/,
  'portal usage header must not render a standalone generated-time metric'
);
assert.match(source, /updated_at_inline/, 'latest update time must remain as subtle inline context');
assert.match(
  headerDefinition,
  /titleAccessory=\{\s*!bundleLoading[\s\S]*!usageNeedsAttention[\s\S]*metadata=[\s\S]*contextPanel=\{\s*!bundleError[\s\S]*usageNeedsAttention/,
  'portal usage header must keep normal status and period compact while reserving the right panel for attention states'
);
assert.doesNotMatch(
  headerDefinition,
  /eyebrow=|metrics=/,
  'portal usage header must not repeat its title or render a second status rail'
);

assert.match(
  source,
  /view_tab_trend[\s\S]*view_tab_records[\s\S]*view_tab_sources/,
  'trend, point records, and credit sources must be available as task tabs'
);
assert.doesNotMatch(source, /view_tab_details|PortalUsageAdvancedDetails|usage-detail/);
assert.doesNotMatch(source, /<details[\s\S]*data-portal-usage="ledger-detail"/);
assert.match(
  source,
  /searchParams\.get\('view'\)[\s\S]*window\.history\.replaceState[\s\S]*usageBasePath/,
  'usage tabs and retired view links must keep the URL canonical'
);

assert.match(
  source,
  /siteFilterId = searchParams\.get\('site'\)[\s\S]*getAccountEntitlements\(\)/,
  'portal usage must load account entitlements without an unused runtime summary dependency'
);
assert.match(
  source,
  /selectedSiteId=\{siteFilterId\}[\s\S]*siteSelectorMode="context"[\s\S]*siteSelectorPlacement="inline"/,
  'portal usage must expose the shared current-site selector'
);
assert.match(
  source,
  /useLayoutEffect\([\s\S]*setEntitlements\(null\)[\s\S]*setCreditEvents\(null\)[\s\S]*setCreditTrend\(null\)/,
  'usage must clear account projections and subresources when the site filter changes'
);
assert.match(
  source,
  /entitlements\?\.current_subscription[\s\S]*currentSubscription\?\.current_period_start_at[\s\S]*currentSubscription\?\.current_period_end_at/,
  'usage period context must come from the account entitlement contract'
);

const summaryIndex = source.indexOf('data-portal-usage="current-summary"');
const viewTabsIndex = source.indexOf('data-portal-usage="view-tabs"');
const trendIndex = source.indexOf('<PortalCreditTrendPanel');
const ledgerIndex = source.indexOf('data-portal-usage="ledger-detail"');
const recordsIndex = source.indexOf('data-portal-usage="usage-records"');

assert.ok(summaryIndex >= 0, 'current-period summary marker must exist');
assert.ok(viewTabsIndex > summaryIndex, 'usage task tabs must follow the persistent current-period summary');
assert.equal(source.indexOf('data-portal-usage="current-package"'), -1, 'current package card must move to package page');
assert.ok(trendIndex > viewTabsIndex, 'point trend must follow the usage task tabs');
assert.match(creditTrendSource, /data-portal-usage="primary-trend"/);
assert.ok(ledgerIndex > trendIndex, 'point-record tab panel must follow the trend panel');
assert.ok(recordsIndex > ledgerIndex, 'usage records must stay inside their tab panel');
assert.equal(source.indexOf("t('portal.usage.entitlement_title'"), -1, 'package entitlement detail must move to package page');
assert.equal(source.indexOf("t('portal.usage.quota_headroom_title'"), -1, 'package quota headroom must move to package page');
assert.doesNotMatch(
  source,
  /credit_packs_title|payment_orders_title|handleCreateCreditPackOrder|createCreditPackOrder/,
  'package purchase and payment order actions must live on the package page, not usage'
);
assert.match(source, /formatUsagePeriodRange[\s\S]*month:[\s\S]*day:/);
assert.match(source, /formatUsagePeriodEnd[\s\S]*year:[\s\S]*hour:/);
assert.match(source, /PORTAL_USAGE_VIEWS[^=]*= \['trend', 'records', 'sources'\]/);
assert.doesNotMatch(
  source,
  /formatSignedCreditDelta|formatLedgerQuantity/,
  'customer surfaces must not reuse admin signed-delta or quantity helpers'
);
assert.doesNotMatch(
  source,
  /data-portal-usage="usage-records"[\s\S]*entry\.explanation|data-portal-usage="usage-records"[\s\S]*entry\.unit/,
  'AI credit records must not render raw backend explanations or units'
);
assert.match(
  source,
  /getAccountCreditLedger[\s\S]*PortalCreditSourcesContent|PortalCreditSourcesContent[\s\S]*getAccountCreditLedger/,
  'sources tab must load the account credit ledger into shared sources content'
);
const sourcesContent = readFileSync(
  resolve(process.cwd(), 'src/components/portal/PortalCreditSourcesContent.tsx'),
  'utf8',
);
assert.match(
  sourcesContent,
  /data-portal-usage="credit-sources"/,
  'shared sources content must keep the credit-sources marker'
);
assert.match(
  sourcesContent,
  /sources_empty/,
  'sources content must keep a friendly empty state'
);

assert.match(
  source,
  /PortalCreditSourcesContent/,
  'sources tab must render through the shared PortalCreditSourcesContent'
);

const billingPagePath = resolve(process.cwd(), 'src/app/portal/billing/page.tsx');
const entitlementPath = resolve(process.cwd(), 'src/components/portal/PortalEntitlementUsage.tsx');
const sourcesDialogPath = resolve(process.cwd(), 'src/components/portal/PortalCreditSourcesDialog.tsx');
const billingPage = readFileSync(billingPagePath, 'utf8');
const entitlement = readFileSync(entitlementPath, 'utf8');
const sourcesDialog = readFileSync(sourcesDialogPath, 'utf8');
assert.match(
  entitlement,
  /onOpenCreditSources\?\.\(\)[\s\S]{0,400}open-credit-sources/,
  'AI credits primary ratio must open the credit-sources dialog'
);
assert.match(
  entitlement,
  /onClick=\{\(\) => onOpenUsage\?\.\(\)\}[\s\S]{0,80}data-portal-billing="open-usage"/,
  'View period usage must focus the billing-page site list'
);
assert.match(
  billingPage,
  /focusSiteUsageList[\s\S]*PortalBillingSiteUsageList[\s\S]*PortalSiteUsageDialog/,
  'billing page must default to a site list and open site usage in a dialog'
);
assert.doesNotMatch(
  billingPage,
  /PortalUsagePanel/,
  'billing page must not use the full usage drawer as the primary path'
);
assert.match(
  billingPage,
  /<PortalCreditSourcesDialog[\s\S]*isOpen=\{creditSourcesOpen\}/,
  'billing page must mount the credit-sources dialog'
);
const siteUsageDialog = readFileSync(
  resolve(process.cwd(), 'src/components/portal/PortalSiteUsageDialog.tsx'),
  'utf8',
);
assert.match(
  siteUsageDialog,
  /view_tab_trend[\s\S]*view_tab_records/,
  'site usage dialog must keep trend and AI credit record tabs'
);
assert.doesNotMatch(
  siteUsageDialog,
  /view_tab_sources|PortalCreditSourcesContent/,
  'site usage dialog must not embed account-level sources'
);
assert.match(
  siteUsageDialog,
  /getAccountCreditTrend[\s\S]*getAccountCreditEvents[\s\S]*<Modal/,
  'site usage dialog must load site-scoped trend and credit events in a Modal'
);
assert.match(
  sourcesDialog,
  /getAccountCreditLedger[\s\S]*<Modal[\s\S]*PortalCreditSourcesContent/,
  'credit-sources dialog must be a light Modal that loads the acquisition ledger'
);
assert.doesNotMatch(
  sourcesDialog,
  /PortalUsagePanel/,
  'credit-sources dialog must not embed the full usage panel'
);
assert.match(source, /eventFeatureText\(entry, 'title'\)[\s\S]*formatCreditPoints\(entry.consumed_ai_credits\)/);
assert.match(
  source,
  /data-portal-usage="records-table"[\s\S]*<table[\s\S]*<thead[\s\S]*<tbody[\s\S]*common\.view_details/,
  'PC usage records must use a semantic table with an explicit detail action'
);
assert.match(source, /getAccountCreditEvents\([\s\S]*offset: nextOffset[\s\S]*<ListPagination[\s\S]*total=\{creditEventCount\}/);
assert.doesNotMatch(source, /selectedCreditBucket|getAccountCreditEventBuckets/);
assert.match(source, /siteContextReady[\s\S]*selectSite\(siteFilterId\)/);
assert.match(source, /component_count[\s\S]*support_reference/);
assert.match(
  source,
  /getAccountCreditTrend\(\{[\s\S]*window: creditTrendWindow,[\s\S]*siteId: requestSiteFilterId \|\| undefined/,
  'point trend must use the account credit ledger projection with an optional site filter'
);
assert.match(
  creditTrendSource,
  /'1h'[\s\S]*'24h'[\s\S]*'7d'[\s\S]*'30d'[\s\S]*trend_empty_title[\s\S]*trend_empty_desc/,
  'point trend must provide four ranges and an explicit zero-usage state'
);
assert.doesNotMatch(
  creditTrendSource,
  /UsageBarChart[\s\S]*type="tokens"/,
  'customer point trend must not render provider token totals as points'
);
assert.doesNotMatch(
  source,
  /formatLedgerQuantity|credit_ledger_quantity/,
  'customer point ledger must remove the repeated quantity column'
);
assert.doesNotMatch(
  source,
  /currentPeriodLabel[\s\S]*period_label[\s\S]*formatCurrentUsageLine[\s\S]*used_label[\s\S]*included_label[\s\S]*formatOverageLine[\s\S]*overage_line/,
  'usage page must not show package included/remaining quota copy after the package page owns rights'
);

for (const key of [
  'portal.usage.summary_label',
  'portal.usage.summary_title',
  'portal.usage.summary_desc',
  'portal.usage.header_period_detail',
  'portal.usage.period_end_detail',
  'portal.usage.updated_at_inline',
  'portal.usage.overview_title',
  'portal.usage.overview_desc',
  'portal.usage.overview_available_detail',
  'portal.usage.period_used_label',
  'portal.usage.overview_paid_detail',
  'portal.usage.next_expiry_label',
  'portal.usage.overview_no_expiry_detail',
  'portal.usage.primary_trend_title',
  'portal.usage.primary_trend_desc',
  'portal.usage.view_tabs_label',
  'portal.usage.view_tab_trend',
  'portal.usage.view_tab_records',
  'portal.usage.view_tab_sources',
  'portal.usage.sources_title',
  'portal.usage.sources_empty',
  'portal.usage.source_label_package',
  'portal.usage.source_label_credit_pack',
  'portal.usage.source_label_operator',
  'portal.usage.trend_window_label',
  'portal.usage.trend_window_1h',
  'portal.usage.trend_window_24h',
  'portal.usage.trend_window_7d',
  'portal.usage.trend_window_30d',
  'portal.usage.trend_empty_title',
  'portal.usage.trend_empty_desc',
  'portal.usage.trend_total',
  'portal.usage.trend_chart_label',
  'portal.usage.trend_points_detail',
  'portal.usage.period_label',
  'portal.usage.used_label',
  'portal.usage.included_label',
  'portal.usage.overage_line',
  'portal.usage.unit_times',
  'portal.usage.unit_points',
  'portal.usage.credit_ledger_ai_service_title',
  'portal.usage.credit_ledger_feature_content_generation_title',
  'portal.usage.credit_ledger_feature_content_generation_detail',
  'portal.usage.credit_ledger_feature_topic_research_title',
  'portal.usage.credit_ledger_feature_topic_research_detail',
  'portal.usage.credit_ledger_feature_web_search_title',
  'portal.usage.credit_ledger_feature_web_search_detail',
  'portal.usage.credit_ledger_feature_site_knowledge_title',
  'portal.usage.credit_ledger_feature_site_knowledge_detail',
  'portal.usage.credit_ledger_feature_image_assistance_title',
  'portal.usage.credit_ledger_feature_image_assistance_detail',
  'portal.usage.credit_ledger_feature_audio_generation_title',
  'portal.usage.credit_ledger_feature_audio_generation_detail',
  'portal.usage.credit_ledger_service_used_desc',
  'portal.usage.credit_ledger_service_used_suffix',
  'portal.usage.credit_ledger_credit_deducted',
]) {
  assert.match(i18nSource, new RegExp(`'${key}'`), `${key} must be translated`);
}

assert.doesNotMatch(
  i18nSource,
  /credit_ledger_feature_ai_assistance|credit_ledger_ai_service_title': '智能功能/,
  'customer point ledger must not expose vague AI assistance fallback copy'
);
assert.doesNotMatch(
  i18nSource,
  /portal\.usage\.credit_ledger_quantity/,
  'customer point ledger translations must not keep the removed quantity column'
);

assert.match(
  source,
  /PORTAL_USAGE_CREDIT_EVENT_FILTER_FEATURES\.map\(\(feature\)/,
  'credit event service filter must use the shared active-service feature list'
);
assert.doesNotMatch(
  source,
  /PORTAL_USAGE_CREDIT_EVENT_FILTER_FEATURES[^;]*audio_generation/,
  'usage page must not inline paused audio_generation into the shared filter list'
);

assert.doesNotMatch(source, /getUsageBundle|getAccountUsageSummary/);


for (const key of [
  'portal.billing.site_usage_list_title',
  'portal.billing.site_usage_list_desc',
  'portal.billing.site_usage_dialog_title',
  'portal.billing.site_usage_pick_hint',
]) {
  assert.match(i18nSource, new RegExp(`'${key}'`), `${key} must be translated`);
}

console.log('portal_usage_simplification_contract: ok');
