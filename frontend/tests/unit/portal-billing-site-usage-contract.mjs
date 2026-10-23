import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

// Billing-page site usage surfaces (site list + site usage dialog + credit-sources dialog).
// Replaces portal-usage-simplification-contract after the retired PortalUsagePanel was removed.
const creditTrendPath = resolve(process.cwd(), 'src/components/portal/PortalCreditTrendPanel.tsx');
const i18nPath = resolve(process.cwd(), 'src/lib/i18n.ts');
const creditTrendSource = readFileSync(creditTrendPath, 'utf8');
const i18nSource = readFileSync(i18nPath, 'utf8');

assert.equal(
  existsSync(resolve(process.cwd(), 'src/components/portal/PortalUsagePanel.tsx')),
  false,
  'the retired full usage panel must stay removed'
);
assert.match(creditTrendSource, /data-portal-usage="primary-trend"/);

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
assert.match(
  siteUsageDialog,
  /PORTAL_USAGE_CREDIT_EVENT_FILTER_FEATURES/,
  'site usage dialog must use the shared active-service feature list'
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
for (const key of [
  'portal.usage.summary_label',
  'portal.usage.summary_title',
  'portal.usage.updated_at_inline',
  'portal.usage.primary_trend_title',
  'portal.usage.primary_trend_desc',
  'portal.usage.view_tabs_label',
  'portal.usage.view_tab_trend',
  'portal.usage.view_tab_records',
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

for (const key of [
  'portal.billing.site_usage_list_title',
  'portal.billing.site_usage_list_desc',
  'portal.billing.site_usage_list_desc_single',
  'portal.billing.site_usage_dialog_title',
  'portal.billing.site_usage_pick_hint',
]) {
  assert.match(i18nSource, new RegExp(`'${key}'`), `${key} must be translated`);
}

console.log('portal_billing_site_usage_contract: ok');
