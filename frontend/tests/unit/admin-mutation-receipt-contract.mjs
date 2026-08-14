import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { fromFrontendRoot } from './_paths.mjs';

const receiptSource = readFileSync(fromFrontendRoot('src/components/admin/AdminMutationReceipt.tsx'), 'utf8');
const accountDetailSource = readFileSync(fromFrontendRoot('src/app/admin/accounts/[accountId]/page.tsx'), 'utf8');
const customerAccessSource = readFileSync(fromFrontendRoot('src/features/admin/accounts/CustomerAccessPanel.tsx'), 'utf8');
const subscriptionDetailSource = readFileSync(fromFrontendRoot('src/app/admin/subscriptions/[subscriptionId]/page.tsx'), 'utf8');
const aiResourcesSource = readFileSync(fromFrontendRoot('src/app/admin/ai-resources/page.tsx'), 'utf8');
const supplierToolbarSource = readFileSync(fromFrontendRoot('src/components/admin/SupplierToolbar.tsx'), 'utf8');
const toastSource = readFileSync(fromFrontendRoot('src/components/ui/Toast.tsx'), 'utf8');
const feedbackContractSource = readFileSync(fromFrontendRoot('../docs/cloud-admin-feedback-and-layout-contract-v1.md'), 'utf8');
const runtimeProfilesSource = readFileSync(fromFrontendRoot('src/app/admin/runtime-profiles/page.tsx'), 'utf8');
const serviceSettingsSource = readFileSync(fromFrontendRoot('src/app/admin/service-settings/page.tsx'), 'utf8');
const i18nSource = readFileSync(fromFrontendRoot('src/lib/i18n.ts'), 'utf8');
const backendRouteSource = readFileSync(fromFrontendRoot('../app/api/routes/service.py'), 'utf8');
const zhStart = i18nSource.indexOf("'zh-CN': {");

assert.ok(zhStart > 0, 'i18n dictionary must contain a Simplified Chinese section');

const enSource = i18nSource.slice(0, zhStart);
const zhSource = i18nSource.slice(zhStart);

assert.match(
  receiptSource,
  /export function buildAdminMutationReceiptText/,
  'admin mutation receipt must provide a stable copyable text formatter'
);

assert.match(
  backendRouteSource,
  /def _build_operator_receipt\([\s\S]*audit_state: Literal\["persisted", "unavailable", "not_applicable"\][\s\S]*"audit_state": audit_state/,
  'backend mutation receipts must declare their audit persistence state'
);

assert.ok(
  Array.from(
    backendRouteSource.matchAll(/audit_state="persisted" if audit_event else "unavailable"/g)
  ).length >= 10,
  'best-effort Admin audit writers must report unavailable evidence instead of claiming persistence'
);

assert.match(
  receiptSource,
  /navigator\.clipboard\.writeText\(buildAdminMutationReceiptText\(receipt\)\)/,
  'admin mutation receipt must let operators copy the latest operation receipt'
);

assert.match(
  receiptSource,
  /buildAdminAuditTrailHref\(receipt\)/,
  'admin mutation receipt must keep the audit trail follow-up link'
);

assert.match(
  receiptSource,
  /auditUnavailable[\s\S]*auditTrailAvailable[\s\S]*receipt_audit_unavailable[\s\S]*auditTrailAvailable[\s\S]*buildAdminAuditTrailHref\(receipt\)/,
  'an unavailable audit must stay distinct from operation success and must not expose a misleading audit link'
);

assert.match(
  receiptSource,
  /audit_state: \$\{receipt\.audit_state\}/,
  'copyable mutation receipts must preserve the backend audit persistence state'
);

assert.doesNotMatch(
  receiptSource,
  />View audit trail</,
  'admin mutation receipt must not hard-code English audit link copy'
);

assert.match(
  accountDetailSource,
  /AdminMutationReceipt[\s\S]*AdminMutationReceiptPayload/,
  'Account detail commercial writes must render the shared admin mutation receipt'
);

assert.match(
  accountDetailSource,
  /setAccountStatusReceipt\(\(payload\.data\?\.receipt \|\| null\) as AdminMutationReceiptPayload \| null\)/,
  'Account status writes must store the backend receipt instead of only showing a toast'
);

assert.match(
  accountDetailSource,
  /setPackageActionReceipt\(\(payload\.data\?\.receipt \|\| null\) as AdminMutationReceiptPayload \| null\)/,
  'Account package, top-up, and credit writes must store the backend receipt instead of only showing a toast'
);

assert.match(
  customerAccessSource,
  /AdminMutationReceipt[\s\S]*AdminMutationReceiptPayload/,
  'Customer identity disable writes must render the shared admin mutation receipt'
);

assert.match(
  customerAccessSource,
  /setReceipt\(payload\.receipt \|\| null\)/,
  'Customer identity disable writes must store the customer-detail backend receipt instead of only showing a toast'
);

assert.match(
  subscriptionDetailSource,
  /AdminMutationReceipt[\s\S]*AdminMutationReceiptPayload/,
  'Subscription billing snapshot rebuild must render the shared admin mutation receipt'
);

assert.match(
  subscriptionDetailSource,
  /setLastReceipt\(data\.receipt \|\| null\)/,
  'Subscription billing snapshot rebuild must store the backend receipt instead of only showing a toast'
);

assert.match(
  aiResourcesSource,
  /AdminMutationReceipt[\s\S]*AdminMutationReceiptPayload/,
  'AI resources provider writes must render the shared admin mutation receipt'
);

assert.ok(
  Array.from(
    aiResourcesSource.matchAll(
      /setLastReceipt\((?:response\.data\.receipt|result\.receipt) \|\| null\)/g
    )
  ).length >= 3,
  'AI resources provider writes must store backend receipts for save, delete, and test operations'
);

assert.match(
  aiResourcesSource,
  /useToast\(\)/,
  'AI resources transient provider outcomes must use the global Toast surface'
);

assert.doesNotMatch(
  aiResourcesSource,
  /!providerFormOpen && message[\s\S]{0,400}BackofficeStackCard/,
  'AI resources must not expand the summary panel with transient success feedback'
);

assert.match(
  aiResourcesSource,
  /hasLatestOperation=\{Boolean\(lastReceipt\)\}[\s\S]*onOpenLatestOperation=\{\(\) => setReceiptDetailsOpen\(true\)\}/,
  'AI resources must expose the latest auditable receipt from the supplier toolbar'
);

assert.match(
  supplierToolbarSource,
  /hasLatestOperation[\s\S]*action_latest_operation/,
  'Supplier toolbar must keep the latest operation entry compact and contextual'
);

assert.match(
  toastSource,
  /fixed inset-x-4 top-16[\s\S]*sm:left-1\/2[\s\S]*sm:-translate-x-1\/2/,
  'Global Toast feedback must stay out of document flow, stay inset on mobile, and center on wider screens'
);

assert.match(
  feedbackContractSource,
  /## 4\. Feedback Taxonomy[\s\S]*### 4\.5 Auditable mutation receipt/,
  'Cloud admin feedback contract must classify transient feedback separately from durable receipts'
);

assert.match(
  runtimeProfilesSource,
  /AdminMutationReceipt[\s\S]*AdminMutationReceiptPayload/,
  'Hosted runtime profile writes must render the shared admin mutation receipt'
);

assert.match(
  runtimeProfilesSource,
  /receipt[\s\S]{0,200}AdminMutationReceiptPayload \| null/,
  'Hosted runtime profile writes must store the backend receipt'
);

assert.match(
  aiResourcesSource,
  /<BackofficePageHeader/,
  'AI resources must delegate low-frequency top-level descriptions to the shared page header info hint'
);

assert.match(
  serviceSettingsSource,
  /<BackofficeConfigurationHeader/,
  'Service settings must delegate low-frequency top-level descriptions to the shared configuration header info hint'
);

assert.match(
  runtimeProfilesSource,
  /<BackofficeConfigurationHeader[\s\S]*description=\{copy\('description'/,
  'Hosted runtime profiles must keep the Cloud runtime boundary visible in the compact workspace header'
);

const requiredKeys = [
  'admin.receipt_latest',
  'admin.receipt_copy',
  'admin.receipt_copied',
  'admin.receipt_copy_failed',
  'admin.receipt_view_audit',
  'admin.receipt_audit_event',
  'admin.receipt_audit_persisted',
  'admin.receipt_audit_unavailable',
];

for (const key of requiredKeys) {
  const pattern = new RegExp(`'${key.replaceAll('.', '\\.')}':`);
  assert.match(enSource, pattern, `${key} must exist in English translations`);
  assert.match(zhSource, pattern, `${key} must exist in Simplified Chinese translations`);
}

console.log('admin_mutation_receipt_contract: ok');
