import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromFrontendRoot } from './_paths.mjs';

const source = readFileSync(fromFrontendRoot('src/app/admin/accounts/[accountId]/page.tsx'), 'utf8');
const siteRuntimeSource = readFileSync(
  fromFrontendRoot('src/features/admin/accounts/account-site-runtime.ts'),
  'utf8'
);
const creditEvidenceSource = readFileSync(
  fromFrontendRoot(
    'src/features/admin/accounts/account-credit-evidence.ts'
  ),
  'utf8'
);
const creditPresentationSource = readFileSync(
  fromFrontendRoot(
    'src/features/admin/accounts/account-credit-presentation.ts'
  ),
  'utf8'
);
const operatorProfileSource = [
  readFileSync(
    fromFrontendRoot(
      'src/features/admin/accounts/AccountOperatorProfileEditor.tsx'
    ),
    'utf8'
  ),
  readFileSync(
    fromFrontendRoot(
      'src/features/admin/accounts/account-operator-profile.ts'
    ),
    'utf8'
  ),
].join('\n');
const architectureSource = readFileSync(
  fromFrontendRoot('../docs/cloud-admin-information-architecture-v2.md'),
  'utf8'
);

assert.match(
  source,
  /type AccountDetailTab = 'overview' \| 'commercial' \| 'credits' \| 'sites' \| 'access' \| 'audit'/,
  'customer detail must use the six task-oriented v2 sections'
);
assert.match(
  source,
  /useState<AccountDetailTab>\('overview'\)/,
  'customer detail must open on the read-only overview section'
);

for (const tab of ['overview', 'commercial', 'credits', 'sites', 'access', 'audit']) {
  assert.match(source, new RegExp(`id: '${tab}'`), `customer detail must keep the ${tab} section`);
}
assert.match(
  source,
  /data-ui="account-detail-workspace"[\s\S]*data-ui="account-detail-section-nav"[\s\S]*xl:sticky[\s\S]*xl:border-r[\s\S]*xl:border-l-\[3px\][\s\S]*data-ui="account-detail-section-content"/,
  'customer detail must use a flat sticky PC section rail while preserving the responsive tab contract'
);
assert.match(
  source,
  /activeDetailTab === 'access'[\s\S]*<CustomerAccessPanel[\s\S]*relationshipState=\{account\.identity_relationship_state\}/,
  'customer-specific identity and access work must stay in the customer Access section'
);

assert.match(
  source,
  /activeDetailTab === 'commercial'[\s\S]*change_customer_package_label[\s\S]*agency_commerce_label/,
  'package changes and Agency decisions must stay in the commercial section'
);
assert.match(
  source,
  /activeDetailTab === 'credits'[\s\S]*topup_packs_label[\s\S]*credit_adjustment_label/,
  'top-up packs and credit adjustments must stay in the credits section'
);
assert.doesNotMatch(
  source,
  /xl:grid-cols-\[0\.9fr_1\.1fr\]/,
  'commercial and credit work must not share the sparse legacy split layout'
);
assert.match(
  source,
  /current_coverage_title[\s\S]*<dl[\s\S]*coverage_type_label[\s\S]*next_step_label/,
  'commercial context must stay in one compact scannable definition table'
);
assert.match(
  source,
  /change_customer_package_label[\s\S]*<table[\s\S]*QUICK_PACKAGE_OPTIONS\.map/,
  'package choices must remain a dense comparison table'
);
assert.match(
  source,
  /const topUpPackSelector = \([\s\S]*data-ui="account-topup-options"[\s\S]*type="radio"/,
  'top-up choices must use a compact single-selection list without a wide table'
);
assert.match(
  source,
  /<AdminWorkbenchDialog[\s\S]*credit_adjustment_label[\s\S]*audit_required/,
  'low-frequency audited credit adjustment must use the shared focused mutation dialog'
);
assert.match(
  source,
  /activeDrawer === 'credit-ledger'[\s\S]*credit_ledger_title/,
  'current-period ledger detail must move behind the shared inspector drawer'
);
assert.match(
  source,
  /activeDrawer === 'agency'[\s\S]*agency_commerce_label/,
  'Agency quote and trial work must move behind the shared inspector drawer'
);
assert.match(
  source,
  /activeDrawer === 'subscription-repair'[\s\S]*package_actions_reveal/,
  'subscription repair must move behind the shared inspector drawer'
);
assert.match(
  source,
  /const openTopUpOptions = \(\) => \{[\s\S]*setTopUpDialogOpen\(true\)/,
  'top-up choices must stay behind a focused dialog'
);
assert.match(
  source,
  /data-ui="account-credit-operations"[\s\S]*quotaNeedsAttention[\s\S]*onClick=\{openTopUpOptions\}/,
  'the compact credit operation row must reflect quota risk and expose the top-up dialog'
);
assert.match(
  source,
  /data-ui="account-identifiers"[\s\S]*<BackofficeIdentifier value=\{account\.account_id\}/,
  'low-frequency account identifiers must stay behind an overview disclosure'
);
assert.doesNotMatch(
  source,
  /view_sites_action/,
  'the detail workspace must not duplicate the Sites section with an extra navigation button'
);
assert.match(
  source,
  /data-ui="account-quota-detail-tabs"[\s\S]*quotaDetailTab === 'resources'[\s\S]*quotaDetailTab === 'components'[\s\S]*quotaDetailTab === 'advanced'/,
  'resource, credit-component, and advanced quota evidence must use direct tabs in one shared dialog'
);
assert.match(
  source,
  /open=\{quotaDetailsOpen\}[\s\S]*quotaDetailTab === 'resources'[\s\S]*<table[\s\S]*resourceRows\.map/,
  'resource limits must remain a used-limit-remaining status table inside the shared quota dialog'
);
assert.doesNotMatch(
  source,
  /data-ui="account-credit-components"[^>]*<details|data-ui="account-advanced-quota"[^>]*<details/,
  'quota detail tabs must not contain another disclosure layer'
);
assert.match(
  source,
  /data-ui="account-credit-usage-summary"[\s\S]*runBudgetSummary\.used[\s\S]*runBudgetSummary\.remaining[\s\S]*formatUsageRatio/,
  'default credit view must keep one compact used, remaining, and ratio summary'
);
assert.doesNotMatch(
  source,
  /function (?:summarizeBudget|formatUsageRatio|quotaToneClass|quotaMetricLabel|creditBreakdownLabel|formatSignedCreditDelta)/,
  'the route must not own credit and quota presentation policy'
);
assert.match(
  creditPresentationSource,
  /export function summarizeBudget[\s\S]*export function formatUsageRatio[\s\S]*export function quotaToneClass[\s\S]*export function quotaMetricLabel[\s\S]*export function creditBreakdownLabel[\s\S]*export function formatSignedCreditDelta/,
  'the account credit presentation model must own quota aggregation, labels, severity, and ledger formatting'
);
assert.match(
  source,
  /<BackofficePageHeader[\s\S]*title=\{accountTitle\}[\s\S]*summaryItems=\{headerMetrics\}/,
  'customer detail must project its compact factual metrics through the shared page header'
);
assert.match(
  source,
  /normalizeAdminReturnTo\([\s\S]*searchParams\.get\(ADMIN_RETURN_TO_PARAM\)[\s\S]*ACCOUNTS_RETURN_CONTEXT_POLICY[\s\S]*secondaryAction=\{\([\s\S]*href=\{returnTo\}/,
  'customer detail must normalize one Accounts queue return target for its header and fallback links'
);
assert.equal(
  source.match(/href=\{returnTo\}/g)?.length || 0,
  3,
  'customer detail header, not-found, and empty-site returns must share one normalized target'
);
assert.match(
  source,
  /buildAdminAccountSiteReturnTo\([\s\S]*parentPathname: accountDetailPathname[\s\S]*buildAdminNestedDetailHref\([\s\S]*returnTo: accountSiteReturnTo/,
  'customer Site entries must build one bounded parent Account context with at most one queue inner context'
);
assert.equal(
  source.match(/href=\{siteDetailHref\(/g)?.length || 0,
  2,
  'every customer Site detail entry must share the nested return builder'
);
assert.match(
  source,
  /data-ui="account-credit-operations"[\s\S]*data-ui="account-credit-summary"[\s\S]*data-ui="account-credit-support-rows"/,
  'credit state, actions, ledger summary, and resource summary must form one compact operating surface'
);
assert.match(
  source,
  /account-package-collapsed[\s\S]*activeDrawer === 'package'[\s\S]*account-package-comparison/,
  'package comparison must stay behind a compact on-demand drawer entry'
);
assert.equal(
  source.match(/<AdminDataTableFrame/g)?.length || 0,
  2,
  'package and resource comparisons must reuse the shared Admin table frame; top-up stays a compact radio dialog'
);
assert.match(
  source,
  /aria-label=\{`\$\{label\} · \$\{t\('admin\.account_detail\.apply_package_action'/,
  'each package mutation must include its target package in the accessible action name'
);
assert.match(
  source,
  /metric\.status === 'limited' && metric\.key === 'active_api_key_sites'[\s\S]*key_coverage_gap_status/,
  'API-key coverage gaps must not be mislabeled as exhausted numeric quota'
);
assert.match(
  source,
  /useAccountCreditEvidence\([\s\S]*activeDetailTab === 'credits'/,
  'low-frequency commercial, quota, and ledger data must load from their owning tabs'
);
assert.match(
  source,
  /useAccountSiteRuntime\([\s\S]*activeDetailTab === 'audit'/,
  'site-runtime diagnostics must load through the account feature query only for the audit tab'
);
for (const requestGuard of [
  'accountRequestedRef',
  'packagePlansRequestedRef',
]) {
  assert.match(
    source,
    new RegExp(`const ${requestGuard} = useRef`),
    `${requestGuard} must prevent duplicate tab or Strict Mode requests`
  );
}
assert.doesNotMatch(
  source,
  /quotaSummaryRequestedRef|creditLedgerRequestedRef|loadQuotaSummary|loadCreditLedger/,
  'the route must not retain a second quota or credit-ledger request lifecycle'
);
assert.match(
  creditEvidenceSource,
  /useQuery\(\{[\s\S]*accountCreditEvidenceKeys\.quota[\s\S]*\{ signal \}[\s\S]*useQuery\(\{[\s\S]*accountCreditEvidenceKeys\.ledger[\s\S]*\{ signal \}/,
  'the account credit feature must own exact quota and ledger query identity and cancellation'
);
assert.match(
  creditEvidenceSource,
  /invalidateQueries\(\{[\s\S]*accountCreditEvidenceKeys\.account\(accountId\)/,
  'commercial mutations must invalidate only the affected account credit evidence'
);
assert.match(
  source,
  /creditEvidencePending[\s\S]*<LoadingFallback \/>[\s\S]*creditEvidenceError[\s\S]*<BackofficeDiagnosticNotice[\s\S]*quotaQuery\.refetch\(\)[\s\S]*ledgerQuery\.refetch\(\)/,
  'unavailable credit evidence must render loading or retry state instead of zero-value conclusions'
);
assert.doesNotMatch(
  source,
  /siteRuntimeRequestKeyRef|loadSiteRuntimeData/,
  'account detail must not retain a second route-local site-runtime request lifecycle'
);
assert.match(
  siteRuntimeSource,
  /useQuery\([\s\S]*queryKey: accountSiteRuntimeKeys\.detail[\s\S]*queryFn: \(\{ signal \}\)[\s\S]*enabled: enabled/,
  'the account feature query must own site-runtime identity, cancellation, and activation'
);
assert.match(
  siteRuntimeSource,
  /Promise\.allSettled[\s\S]*failedSiteIds[\s\S]*failedSiteIds\.length === normalizedSiteIds\.length[\s\S]*throw/,
  'site-runtime aggregation must preserve partial failures and reject a completely unavailable scope'
);
assert.match(
  source,
  /siteRuntimeEvidenceComplete[\s\S]*trustedSiteRuntimeData[\s\S]*hasApiKeyGap/,
  'incomplete site-runtime evidence must not drive account health or quota conclusions'
);

assert.doesNotMatch(
  source,
  /admin\.account_detail\.more_account_actions/,
  'a single contextual account-status action must not be hidden behind a redundant more-actions disclosure'
);
assert.match(
  source,
  /activeDetailTab === 'overview'[\s\S]*admin\.account_detail\.access_status_title[\s\S]*admin\.accounts\.suspend_account_action/,
  'account status and its direct contextual action must stay in Overview'
);
assert.match(
  source,
  /useAccountOperatorProfile\([\s\S]*activeDetailTab === 'overview'[\s\S]*<AccountOperatorProfileEditor/,
  'the route must compose the operator-profile boundary inside Overview'
);
assert.doesNotMatch(
  source,
  /accountMetaForm|handleSaveAccountMeta|isSavingAccountMeta/,
  'the route must not retain operator-profile draft or submit lifecycle state'
);
assert.match(
  operatorProfileSource,
  /data-ui="operator-profile-editor"[\s\S]*controller\.values\.operator_display_name[\s\S]*controller\.values\.operator_note/,
  'the feature component must preserve the collapsed operator-profile editor'
);
assert.match(
  operatorProfileSource,
  /buildAccountOperatorProfilePayload[\s\S]*bind_default_free: false[\s\S]*accountDetailClient\.request[\s\S]*'\/api\/admin\/accounts'/,
  'the feature API must preserve the bounded account metadata payload'
);
assert.match(source, /useToast\(\)/, 'customer and commercial success feedback must use global Toast');
assert.doesNotMatch(
  source,
  /data-ui="account-package-action-notice"/,
  'commercial success must not insert a permanent notice card into the working surface'
);

const auditSectionIndex = source.indexOf("activeDetailTab === 'audit'");
const firstReceiptIndex = source.indexOf('<AdminMutationReceipt receipt={accountStatusReceipt}');
const secondReceiptIndex = source.indexOf('<AdminMutationReceipt receipt={packageActionReceipt}');
assert.ok(auditSectionIndex >= 0, 'customer detail must include the audit section');
assert.ok(firstReceiptIndex > auditSectionIndex, 'account status receipt must render inside audit');
assert.ok(secondReceiptIndex > auditSectionIndex, 'commercial receipt must render inside audit');
assert.equal(
  source.match(/<AdminMutationReceipt receipt=/g)?.length || 0,
  2,
  'customer detail must not duplicate receipts across the default and audit surfaces'
);
assert.match(
  source,
  /<AdminAuditSummaryPanel[\s\S]*accountId=\{account\.account_id\}/,
  'customer audit section must expose the bounded account audit summary'
);
assert.match(
  source,
  /activeDetailTab === 'audit'[\s\S]*hasAdvancedChecks[\s\S]*id="advanced-checks"/,
  'low-frequency runtime checks must stay inside the audit/evidence section'
);
assert.match(
  source,
  /<ConfirmModal[\s\S]*pendingConfirmation/,
  'governed and destructive customer actions must keep object-specific confirmation'
);
assert.match(
  architectureSource,
  /`\/admin\/accounts\/\[accountId\]`[\s\S]*`detail`[\s\S]*Overview, commercial, credits, sites, access, and audit tabs/,
  'the implemented customer detail pilot must remain tied to the IA v2 route decision'
);

console.log('admin_account_detail_v2_contract: ok');
