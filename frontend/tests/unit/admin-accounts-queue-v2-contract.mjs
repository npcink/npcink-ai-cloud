import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { frontendRoot } from './_paths.mjs';

const root = frontendRoot;
const directorySource = readFileSync(resolve(root, 'src/app/admin/accounts/page.tsx'), 'utf8');
const detailSource = readFileSync(resolve(root, 'src/app/admin/accounts/[accountId]/page.tsx'), 'utf8');
const accessSource = readFileSync(resolve(root, 'src/features/admin/accounts/CustomerAccessPanel.tsx'), 'utf8');
const createSource = [
  'src/features/admin/accounts/CreateAccountForm.tsx',
  'src/features/admin/accounts/create-account-form-model.ts',
].map((path) => readFileSync(resolve(root, path), 'utf8')).join('\n');
const dialogSource = readFileSync(
  resolve(root, 'src/components/admin/AdminWorkbenchDialog.tsx'),
  'utf8'
);
const accountDomainSource = readFileSync(
  resolve(root, '../app/domain/commercial/mixins/_account_mixin.py'),
  'utf8'
);
const serviceSource = readFileSync(
  resolve(root, '../app/domain/commercial/mixins/_admin_mixin.py'),
  'utf8'
);

assert.match(
  directorySource,
  /BackofficeLayer[\s\S]*BackofficeSummaryStrip[\s\S]*AdminDataTableFrame[\s\S]*<table/,
  'customer directory must use one compact header, summary strip, and semantic directory table'
);
assert.doesNotMatch(
  directorySource,
  /AccountRisk|accountRisk|riskToneClassName|risk_reason|account-inspector|focus:|aria-controls="account-inspector"/,
  'customer directory must not behave like a risk queue or selection inspector'
);

assert.match(
  directorySource,
  /usePathname[\s\S]*useRouter[\s\S]*useSearchParams/,
  'customer directory state must remain addressable'
);
for (const parameter of ['q', 'status', 'internal', 'sort', 'offset']) {
  assert.match(
    directorySource,
    new RegExp(`searchParams\\.get\\('${parameter}'\\)|${parameter}:`),
    `${parameter} must participate in route-backed directory state`
  );
}
for (const retiredParameter of ['expires_before', 'coverage_state', 'package_kind', 'top_plan_id', 'focus']) {
  assert.doesNotMatch(
    directorySource,
    new RegExp(`searchParams\\.get\\('${retiredParameter}'\\)`),
    `${retiredParameter} must not remain a customer-directory filter`
  );
}

assert.match(
  directorySource,
  /type AccountSort = 'display_name' \| 'created_at'[\s\S]*: 'display_name'[\s\S]*params\.set\('sort', sort\)/,
  'customer directory must default to customer-name ordering before pagination'
);
assert.doesNotMatch(
  directorySource,
  /sort_risk|Highest risk|risk ordering/,
  'customer directory must not expose service-risk ordering'
);
assert.match(
  directorySource,
  /data-ui="customer-directory-row"[\s\S]*href=\{`\/admin\/accounts\/\$\{encodeURIComponent\(account\.account_id\)\}`\}[\s\S]*common\.details/,
  'every customer row must lead directly to the specified customer detail'
);
assert.doesNotMatch(
  directorySource,
  /\/audit\?limit=50|disable_access_action|AdminMutationReceipt|<Modal/,
  'identity audit and destructive access actions must not remain on the all-customers page'
);
assert.match(
  directorySource,
  /This page is the customer directory[\s\S]*Service status[\s\S]*customer record/,
  'directory copy must state the customer-information and problem-queue boundary'
);

assert.match(
  accessSource,
  /id="customer-access"/,
  'customer detail must expose the direct customer-access anchor'
);
assert.match(
  accessSource,
  /\/audit\?limit=50/,
  'customer detail access tab must own bounded identity audit'
);
assert.match(
  accessSource,
  /AdminWorkbenchDialog/,
  'customer access audit and disable flows must use the shared workbench dialog'
);
assert.match(
  accessSource,
  /relationshipState === 'healthy' && identity\.status === 'active'[\s\S]*access_actions_title[\s\S]*disable_access_action/,
  'destructive login disable must stay behind disclosure and require an unambiguous healthy owner relationship'
);
assert.match(
  accessSource,
  /\/disable[\s\S]*AdminMutationReceipt/,
  'customer access disable must use the Principal endpoint and expose a mutation receipt'
);
assert.match(
  detailSource,
  /type AccountDetailTab = [^;]*'access'[\s\S]*#customer-access[\s\S]*CustomerAccessPanel/,
  'customer detail must expose and route to the customer access tab'
);

assert.match(
  serviceSource,
  /customer_identity_missing[\s\S]*customer_identity_conflict[\s\S]*customer_access_disabled[\s\S]*customer_account_suspended/,
  'service queue must own customer identity, access, and account-status problems'
);
assert.match(
  serviceSource,
  /repair_customer_access[\s\S]*#customer-access/,
  'identity problems must route to the specified customer access tab'
);
assert.match(
  serviceSource,
  /get_admin_account[\s\S]*identity_projection[\s\S]*"primary_identity"/,
  'customer detail response must add the identity projection used by the access tab'
);

assert.match(
  directorySource,
  /activeRequestKeyRef[\s\S]*requestSequenceRef/,
  'customer reads must deduplicate Strict Mode requests and reject stale responses'
);
assert.match(
  directorySource,
  /loadedRequestKey[\s\S]*isShowingRetainedResults[\s\S]*last successfully loaded page/,
  'failed directory reads must identify retained results honestly'
);
assert.doesNotMatch(
  directorySource,
  /window\.location\.reload/,
  'customer refresh recovery must preserve current working state'
);

assert.match(
  directorySource,
  /AdminWorkbenchDialog[\s\S]*handleCreateAccount[\s\S]*toast\.success[\s\S]*router\.push/,
  'customer creation must use the shared dialog, retain success feedback, and open the generated customer'
);
assert.match(
  directorySource + createSource,
  /buildCreateAccountPayload[\s\S]*primary_email[\s\S]*bind_default_free/,
  'customer creation must create one login identity and keep formal Free binding explicit'
);
assert.match(
  dialogSource + createSource,
  /new FormData\(event\.currentTarget\)[\s\S]*validateCreateAccountForm/,
  'customer creation must use one bounded dependency-free form state layer'
);
assert.match(
  createSource,
  /if \(!data\.name\)[\s\S]*if \(!data\.primary_email\)/,
  'customer creation must reject missing names and login email before transport'
);
assert.doesNotMatch(
  createSource,
  /name="account_id"|values\.account_id/,
  'interactive customer creation must not ask operators to invent an account ID'
);
assert.match(
  accountDomainSource,
  /resolved_account_id = str\(account_id or ""\)\.strip\(\) or f"acct_\{uuid4\(\)\.hex\}"/,
  'the commercial domain must generate an opaque account ID when interactive creation omits it'
);

console.log('admin_accounts_queue_v2_contract: ok');
