import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(path), 'utf8');
const account = read('src/app/portal/account/page.tsx');
const audit = read('src/app/portal/audit/PortalAuditClient.tsx');
const billing = read('src/app/portal/billing/page.tsx');
const accountCommerce = read('src/components/portal/PortalAccountCommercePanels.tsx');
const globals = read('src/app/globals.css');
const layout = read('src/app/portal/layout.tsx');
const monitoringRedirectPath = resolve('src/app/portal/monitoring/page.tsx');
const sitesRedirectPath = resolve('src/app/portal/sites/page.tsx');
const siteServiceStatus = read('src/components/portal/PortalSiteServiceStatus.tsx');
const siteKnowledge = read('src/components/portal/PortalSiteKnowledgePanel.tsx');
const packagePanel = read('src/components/portal/PortalPackageChangePanel.tsx');
const creditPackDialog = read('src/components/portal/PortalCreditPackDialog.tsx');
const paymentOrderHistory = read('src/components/portal/PortalPaymentOrderHistory.tsx');
const scaffold = read('src/components/backoffice/BackofficeScaffold.tsx');
const portalScaffold = read('src/components/portal/PortalScaffold.tsx');
const workspaceHeader = read('src/components/portal/PortalWorkspaceHeader.tsx');
const home = read('src/app/portal/page.tsx');
const siteRecord = read('src/app/portal/sites/[siteId]/page.tsx');
const support = read('src/app/portal/support/page.tsx');
const usage = read('src/app/portal/usage/page.tsx');

assert.match(account, /href="\/portal\/audit"/);
assert.doesNotMatch(account, /href="\/portal\/login"/);
assert.match(account, /portal\.account\.settings_eyebrow/);
assert.match(account, /function AccountPageFallback[\s\S]*t\('common\.loading'/);
assert.doesNotMatch(account, /Loading Account Center/);
assert.match(audit, /portal\.audit\.records_title/);

assert.equal(existsSync(monitoringRedirectPath), false);
assert.equal(existsSync(sitesRedirectPath), false);
assert.match(siteServiceStatus, /portal\.monitoring\.recorded_errors/);
assert.match(siteServiceStatus, /portal\.monitoring\.recorded_errors_present/);
assert.match(siteServiceStatus, /errorCount > 0/, 'Explicit errors row gated on count > 0');
assert.match(siteServiceStatus, /data-portal-site="service-status-evidence"/);
assert.doesNotMatch(siteServiceStatus, /min-w-\[720px\]/);
assert.doesNotMatch(siteServiceStatus, /getPortalCustomerIssueTitle/);
assert.doesNotMatch(siteServiceStatus, /headerOwnsAttentionCategory/);
assert.match(siteServiceStatus, /data-portal-site="attention-focus"/, 'Primary attention lives inside #service-status');
assert.match(siteServiceStatus, /attention-cta/, 'Attention CTA must be a visible text control');
assert.match(siteServiceStatus, /btn btn-secondary btn-sm/, 'Attention / support CTAs use text buttons, not icon-only');
assert.match(siteServiceStatus, /portal\.site_attention_contact_support/);
assert.doesNotMatch(siteServiceStatus, /sm:justify-between/, 'Evidence rows must be left-aligned compact clusters');
assert.match(siteServiceStatus, /data-portal-site="view-plan"/);
assert.doesNotMatch(siteServiceStatus, /normal_summary|服务正常/);

assert.match(siteRecord, /max-w-\[56rem\]/, 'Site detail must use the same compact content band as home');
assert.doesNotMatch(siteRecord, /data-portal-site="attention-focus"/, 'Site detail must not float attention between header and cards');
assert.doesNotMatch(siteRecord, /contextPanel=/);
assert.match(siteRecord, /titleAccessory=[\s\S]*metadata=/);
assert.doesNotMatch(siteRecord, /site_record_current_title|lg:grid-cols-2/);
assert.match(siteRecord, /PortalRowActions[\s\S]*portal\.site_other_actions/);
assert.match(siteRecord, /data-portal-site="other-actions"/);
assert.doesNotMatch(siteRecord, /<details>[\s\S]*portal\.site_other_actions/);
assert.doesNotMatch(siteRecord, /contactStatusLabel/);
assert.match(siteRecord, /getPortalSiteUrlDisplay/, 'Site detail metadata must use short URL display');
assert.match(siteRecord, /data-portal-site="rename"/, 'Site detail title row must expose rename');
assert.match(siteRecord, /PortalBreadcrumb/, 'Site detail shows a breadcrumb above the title');
assert.match(siteRecord, /href:\s*'\/portal#sites'/, 'My sites crumb links to /portal#sites');
assert.match(siteRecord, /PortalActionIcon id="rename"/);
assert.match(
  siteRecord,
  /nativeEvent\.isComposing|[\s\S]*keyCode === 229/,
  'site rename Enter must ignore IME composition so CJK input is not interrupted'
);
assert.match(siteRecord, /updateSiteName/);
assert.match(siteRecord, /attention=\{[\s\S]*attentionAction/, 'Page passes attention props into service status');

assert.match(siteRecord, /isPortalPluginMissingAction|getPortalCustomerIssueDetail/, 'Site detail maps plugin_missing to customer detail copy');
assert.match(siteRecord, /secondaryAction:\s*attentionSecondaryAction/, 'plugin_missing keeps Recheck as secondary action');
assert.match(siteServiceStatus, /data-portal-site="attention-detail"/, 'Attention detail is visible, not tooltip-only');
assert.match(siteServiceStatus, /serviceWarningCoveredByAttention|PortalStatusInline/, 'Service row must not duplicate yellow Needs attention when attention already explains it');
assert.match(siteServiceStatus, /portal\.monitoring\.service_explained_above/);
assert.match(siteKnowledge, /hardUpdateFailure|softUpdateIssue/, 'Knowledge uses graded severity, not always Update failed');
assert.match(siteKnowledge, /portal\.vector_obs\.status_usable|portal\.vector_obs\.soft_update_note/);
assert.match(siteKnowledge, /data-portal-site="knowledge-help"/, 'Knowledge intro goes in ⓘ near title');
assert.match(siteKnowledge, /knowledge-last-updated-help|knowledge-soft-note-help/, 'Soft sync note (if any) goes in 最近更新 ⓘ');
assert.match(siteServiceStatus, /hasContent[\s\S]*return null/, 'Empty 服务状态 card must not render');

assert.match(siteKnowledge, /layout="grid"/, 'Knowledge metrics fill width via grid');
assert.match(siteKnowledge, /detailDisplay: 'hint'/);
assert.match(siteKnowledge, /data-portal-site="knowledge-refresh"/);
assert.doesNotMatch(siteKnowledge, /btn btn-secondary btn-sm[\s\S]*common\.refresh/, 'Knowledge refresh is icon-only');

assert.match(globals, /@media \(max-width: 639px\)[\s\S]*\.portal-shell \.input[\s\S]*font-size: 1rem/);
assert.match(globals, /\.portal-shell \.btn-primary[\s\S]*background: #0066cc[\s\S]*box-shadow: none/);
assert.match(globals, /\.portal-shell \.btn:active:not\(:disabled\)[\s\S]*scale\(0\.98\)/);
assert.match(globals, /\.portal-shell \.portal-commercial-dialog[\s\S]*border-radius: 18px/);
assert.match(layout, /bg-\[#f5f5f7\][\s\S]*portal-content[\s\S]*--portal-content-max-width/);
assert.match(globals, /--portal-content-max-width:\s*80rem/);
assert.match(globals, /--portal-header-min-height:\s*5rem/);
assert.match(globals, /--portal-row-min-height:\s*4rem/);
assert.match(globals, /--portal-btn-height:\s*2\.75rem/);
assert.doesNotMatch(layout, /radial-gradient/);
assert.match(scaffold, /variant === 'portal'[\s\S]*rounded-\[18px\][\s\S]*bg-white[\s\S]*shadow-none/);
assert.match(
  workspaceHeader,
  /hasHeaderAside[\s\S]*lg:grid-cols-\[minmax\(0,1fr\)_auto\][\s\S]*variant="header"/,
  'Portal page headers must enable dual-column only when aside content exists (no empty fr reserve)'
);
assert.match(
  workspaceHeader,
  /hasRenderableNode/,
  'Portal headers must treat null/empty aside slots as absent'
);
assert.doesNotMatch(
  workspaceHeader,
  /minmax\(22rem,0\.75fr\)/,
  'Portal headers must not reserve a fixed 22rem+ empty right column'
);
assert.match(
  portalScaffold,
  /variant\?: 'default' \| 'portal' \| 'header'[\s\S]*divide-y[\s\S]*md:divide-x/,
  'Portal header metrics must render as one compact summary rail instead of separate tall cards'
);
assert.match(
  portalScaffold,
  /portalMetricColumnsClassName|columnsClassName \?\? portalMetricColumnsClassName/,
  'Portal metric strips must adapt columns to item count instead of padding empty cells'
);
assert.match(
  portalScaffold,
  /function portalMetricColumnsClassName\(count: number\)/,
  'Portal metric column helper must compute from count'
);
assert.match(
  read('src/components/portal/PortalRowActions.tsx'),
  /export function PortalRowActions/,
  'PortalRowActions primitive must exist for compact row primary/secondary/overflow actions'
);
assert.match(
  read('src/components/portal/PortalStatusBadge.tsx'),
  /isPortalNormalStatus[\s\S]*return null/,
  'Portal status badges must hide normal/connected-ok states'
);
assert.match(
  read('src/components/portal/PortalPageState.tsx'),
  /export function PortalPageState/,
  'PortalPageState must cover loading/empty/error/ready without blank space'
);

for (const [name, source] of [
  ['home', home],
  ['account', account],
  ['billing', billing],
  ['usage', usage],
  ['support', support],
]) {
  assert.match(source, /<PortalWorkspaceHeader/, `${name} must use the shared Portal workspace header`);
}
assert.match(paymentOrderHistory, /role="tab"[\s\S]*min-h-11/);
assert.match(billing, /resolvePackageStatusDetail/);
assert.match(billing, /<PortalEntitlementUsage/);
assert.doesNotMatch(billing, /id="package-options"|const paymentOrdersCard =/);
assert.match(accountCommerce, /id="package-options"[\s\S]*paymentOrdersCard/);
assert.match(accountCommerce, /activeCommercialDialog === 'package'[\s\S]*\{packageOptions\}/);
assert.match(accountCommerce, /<PortalCreditPackDialog[\s\S]*packs=\{availableCreditPacks\}/);
assert.match(accountCommerce, /activeCommercialDialog === 'trial'[\s\S]*\{trialOptions\}/);
assert.match(account, /PortalAccountCommercePanels/);
assert.match(packagePanel, /role="radiogroup"[\s\S]*aria-checked=\{selected\}[\s\S]*onConfirm/);
assert.match(creditPackDialog, /selectedPackId === pack\.pack_id[\s\S]*onConfirm/);
assert.match(packagePanel, /border-2 bg-white[\s\S]*focus-visible:ring-\[#0071e3\]/);
assert.match(accountCommerce, /portal-commercial-dialog max-w-5xl/);
assert.match(paymentOrderHistory, /portal\.usage\.payment_order_credit_snapshot/);
assert.match(paymentOrderHistory, /portal\.usage\.payment_order_purchase_amount/);
assert.match(paymentOrderHistory, /<details[\s\S]*portal\.usage\.payment_orders_title[\s\S]*<\/details>/);
assert.match(paymentOrderHistory, /open=\{Number\(counts\.pending \|\| 0\) > 0\}/);

assert.match(support, /<h2[^>]*>[\s\S]*portal\.support_request_list_title[\s\S]*<\/h2>/);
assert.match(usage, /const creditEventPageSize = 20/);
assert.doesNotMatch(usage, /setCreditLedger\(bundle\.creditLedger\)/);

assert.match(
  workspaceHeader,
  /data-portal-header-layout=\{hasHeaderAside \? 'split' : 'stack'\}/,
  'Portal workspace header must only split columns when a real context panel exists'
);
assert.match(
  workspaceHeader,
  /description \? <p className="mt-2 w-full max-w-none/,
  'Portal workspace header description must span content width (no max-w-2xl empty right)'
);

assert.match(
  portalScaffold,
  /layout\?: 'grid' \| 'rail'[\s\S]*data-portal-metrics="rail"/,
  'PortalMetricStrip must support a compact rail layout for home without changing grid pages'
);
assert.match(
  globals,
  /--portal-content-max-width:\s*80rem/,
  'Global portal content max-width stays 80rem; home narrows via page-local max-w-[65rem]'
);

console.log('portal_usability_closeout_contract: ok');


