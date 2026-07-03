import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const billingSource = readFileSync(resolve(root, 'src/app/portal/billing/page.tsx'), 'utf8');
const usageSource = readFileSync(resolve(root, 'src/app/portal/usage/page.tsx'), 'utf8');
const aiInsightsSource = readFileSync(resolve(root, 'src/app/portal/ai-insights/page.tsx'), 'utf8');
const monitoringSource = readFileSync(resolve(root, 'src/app/portal/monitoring/page.tsx'), 'utf8');
const siteRecordSource = readFileSync(resolve(root, 'src/app/portal/sites/[siteId]/page.tsx'), 'utf8');
const sitesSource = readFileSync(resolve(root, 'src/app/portal/sites/page.tsx'), 'utf8');
const portalHomeSource = readFileSync(resolve(root, 'src/app/portal/page.tsx'), 'utf8');
const auditSource = readFileSync(resolve(root, 'src/app/portal/audit/PortalAuditClient.tsx'), 'utf8');
const pluginMonitoringSource = readFileSync(resolve(root, 'src/components/portal/PortalPluginMonitoringPanel.tsx'), 'utf8');
const siteInspectorSource = readFileSync(resolve(root, 'src/components/portal/PortalSiteInspectorDrawer.tsx'), 'utf8');
const i18nSource = readFileSync(resolve(root, 'src/lib/i18n.ts'), 'utf8');

const billingBeforeSupportDetails = billingSource.slice(0, billingSource.indexOf('<details'));
assert.doesNotMatch(
  billingBeforeSupportDetails,
  /common\.tokens|common\.cost|common\.requests|snapshot_id|ledger|Ledger/,
  'Portal package records must not show tokens, cost, requests, snapshots, or ledger in the default customer view'
);
assert.match(
  billingSource,
  /<details[\s\S]*snapshot\.snapshot_id[\s\S]*<\/details>/,
  'Portal package record IDs may only stay inside an explicit support detail disclosure'
);

const usageDetailIndex = usageSource.indexOf('data-portal-usage="usage-detail"');
const usageBeforeDetail = usageSource.slice(0, usageDetailIndex);
assert.doesNotMatch(
  usageBeforeDetail,
  /usage\.tokens_month|common\.cost|remaining_tokens_test_label|remaining_cost_test_label/,
  'Portal usage summary must not expose token or cost counters before the detail disclosure'
);
assert.match(
  usageBeforeDetail,
  /package_credit_allowance_label[\s\S]*site_allowance_label[\s\S]*headroomTone/,
  'Portal usage summary should explain package credits, site allowance, and status first'
);
assert.doesNotMatch(
  usageSource,
  /Model tokens|Other provider calls|Vector articles|Vector chunks|Provider cost breakdown|Input tokens|Output tokens|usage\.tokens_month|ai-credit-ledger-v2|Rate version/,
  'Portal usage detail must use customer-facing point, budget, and knowledge labels instead of technical metering labels'
);
assert.match(
  usageSource,
  /package_service_uses_label[\s\S]*breakdown_tokens[\s\S]*package_budget_label/,
  'Portal usage detail should keep service uses, points, and budget as the visible usage vocabulary'
);

assert.doesNotMatch(
  aiInsightsSource,
  /provider|tokens|model|cache key/i,
  'Portal service suggestions must not expose provider, token, model, or cache-key details in the customer page'
);
assert.ok(
  aiInsightsSource.includes('portal.ai_insights.how_it_works_title'),
  'Portal service suggestions should explain behavior plainly'
);
assert.doesNotMatch(
  aiInsightsSource,
  /SuggestionSupportDetailsPanel|support_details_label|execution_pattern|storage_mode|fail_closed/i,
  'Portal service suggestions must not render support-only execution metadata in the customer page'
);

assert.doesNotMatch(
  monitoringSource,
  /Plugin monitoring|Installed plugin health|Vector observability|P95|top1|MonitoringTabs|PortalPluginMonitoringPanel|PortalMediaProcessingPanel|PortalSiteKnowledgePanel|workflow_status|evidence_summary|likely_cause|next_step/,
  'Portal service status must avoid plugin/vector observability labels in the customer page'
);
assert.match(
  pluginMonitoringSource,
  /<details[\s\S]*support_event_types[\s\S]*eventKind\.event_kind[\s\S]*<\/details>/,
  'Raw connection event kinds must stay behind a support detail disclosure'
);
assert.doesNotMatch(
  siteInspectorSource,
  /translateAllowedAction|translateExternalCommercialRole|identity_type|allowed_actions|tokens_month|requests_month/,
  'Portal site inspector must not show internal identity, action-scope, token, or request data in the customer drawer'
);

assert.doesNotMatch(
  siteRecordSource,
  /usage\.tokens_month|usage\.requests_month|site_record_runtime_label|site_record_runtime_title/,
  'Portal site record must not default to runtime, token, or request terminology'
);
assert.match(
  siteRecordSource,
  /site_address_label[\s\S]*site_record_service_label[\s\S]*site_record_service_title/,
  'Portal site record should focus on site address and service pages'
);

assert.doesNotMatch(
  sitesSource,
  /site\.site_id\.toLowerCase\(\)\.includes\(query\)|account_id[^;]+includes\(query\)/,
  'Portal site search must not encourage internal site or account ID lookup'
);
assert.doesNotMatch(
  sitesSource,
  /sites_management_actions_title|handleExportFilteredSites|export_filtered_sites|select_visible_sites|remove_selected_sites|pendingBatchAction|activateSite|deactivateSite|removeSite/,
  'Portal site export, activation, and bulk management controls must not be part of the customer site list'
);
assert.doesNotMatch(
  sitesSource,
  /secondaryActions|setSiteFilter|siteFilter|setSiteSort|siteSort|all_sites_filter|sites_sort_current|sites_sort_recent|sites_sort_name/,
  'Portal site list must not expose add-site, filter-chip, or sort controls in the default customer view'
);
assert.match(
  sitesSource,
  /addonConnectMode && showConnectModal[\s\S]*PortalSiteConnectPanel/,
  'Portal site connection panel should only open from the WordPress addon return flow'
);
assert.doesNotMatch(
  portalHomeSource,
  /PortalSiteConnectPanel|\/portal\/sites\?filter=/,
  'Portal home must not embed the site creation form or link to hidden site-list filters'
);

assert.doesNotMatch(
  auditSource,
  /t\('audit\.title'|audit\.event_types|audit\.success_rate/,
  'Portal security records must not use audit-log, event-type, or success-rate copy in the default header'
);
assert.match(
  auditSource,
  /title=\{t\('portal\.audit\.nav_label'[\s\S]*<details[\s\S]*portal\.audit\.filter_label/,
  'Portal security filters should sit behind a customer-facing record filter disclosure'
);

for (const expectedCopy of [
  "'portal.billing.customer_title': 'Package records'",
  "'portal.billing.customer_title': '套餐记录'",
  "'portal.site_record_service_label': 'Service pages'",
  "'portal.site_record_service_label': '服务页面'",
  "'portal.audit.filter_label': 'Filter records'",
  "'portal.audit.filter_label': '筛选记录'",
  "'portal.usage.remaining_service_uses_label': 'Service uses left'",
  "'portal.usage.remaining_service_uses_label': '剩余服务次数'",
  "'portal.site_record': 'Open site'",
  "'portal.site_record': '查看站点'",
]) {
  assert.ok(i18nSource.includes(expectedCopy), `${expectedCopy} must be present`);
}

console.log('portal_professional_info_simplification_contract: ok');
