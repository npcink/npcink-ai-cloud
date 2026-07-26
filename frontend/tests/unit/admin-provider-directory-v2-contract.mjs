import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { frontendRoot } from './_paths.mjs';

const root = frontendRoot;
const pageSource = readFileSync(resolve(root, 'src/app/admin/ai-resources/page.tsx'), 'utf8');
const directorySource = readFileSync(resolve(root, 'src/components/admin/SupplierConnectionTables.tsx'), 'utf8');
const summarySource = readFileSync(resolve(root, 'src/components/admin/SupplierSummaryCards.tsx'), 'utf8');
const toolbarSource = readFileSync(resolve(root, 'src/components/admin/SupplierToolbar.tsx'), 'utf8');
const adminLayoutSource = readFileSync(resolve(root, 'src/app/admin/layout.tsx'), 'utf8');
const globalStyleSource = readFileSync(resolve(root, 'src/app/globals.css'), 'utf8');
const dialogSource = readFileSync(resolve(root, 'src/components/admin/AdminWorkbenchDialog.tsx'), 'utf8');
const credentialSource = readFileSync(resolve(root, 'src/components/admin/AdminCredentialField.tsx'), 'utf8');
const disclosureSource = readFileSync(resolve(root, 'src/components/admin/AdminSettingsDisclosure.tsx'), 'utf8');

assert.match(
  summarySource,
  /data-ui="supplier-summary-strip"[\s\S]*grid-cols-2[\s\S]*divide-x/,
  'Provider readiness must use one compact summary strip at every viewport'
);

assert.match(
  directorySource,
  /data-ui="model-supplier-table"[\s\S]*min-w-\[64rem\][\s\S]*<thead[\s\S]*<tbody/,
  'The PC provider workspace must use one dense semantic table'
);

assert.match(
  directorySource,
  /data-connection-id=\{connection\.connection_id\}[\s\S]*data-selected=\{isSelected[\s\S]*action_configure[\s\S]*action_test[\s\S]*supplier-more-actions/,
  'Each provider row must keep URL-backed focus and put frequent actions before the overflow control'
);

assert.doesNotMatch(
  directorySource,
  /data-ui="supplier-inspector"|xl:grid-cols-\[minmax\(0,1fr\)_20rem\]/,
  'The PC table must not reserve a persistent inspector column'
);

assert.doesNotMatch(
  directorySource,
  /capability-supplier-directory|CapabilitySupplierTable|capability_category_filter/,
  'The model supplier directory must not retain the retired capability supplier queue'
);

assert.match(
  pageSource,
  /usePathname[\s\S]*useRouter[\s\S]*selectedConnectionId = searchParams\.get\('focus'\)[\s\S]*updateWorkspaceParams/,
  'Provider workspace focus must be URL-backed'
);

for (const key of ['q', 'status', 'focus']) {
  assert.match(pageSource, new RegExp(`${key}:`), `Provider workspace must persist ${key} state in the URL`);
}

assert.match(
  pageSource,
  /resourcesRequestActiveRef[\s\S]*resourcesRequestSequenceRef[\s\S]*resourcesLoadedRef[\s\S]*if \(resourcesRequestActiveRef\.current\) return/,
  'Provider catalog reads must deduplicate development Strict Mode requests and reject stale replacement'
);

assert.match(
  toolbarSource,
  /field_search_connections[\s\S]*status_filter_label[\s\S]*action_add_model_supplier/,
  'The toolbar must expose search, status filtering, and the bounded add action'
);

assert.doesNotMatch(
  toolbarSource,
  /supplierTypeFilter|action_add_capability_supplier/,
  'The model supplier toolbar must not duplicate capability-service controls'
);

assert.match(
  directorySource,
  /supplier-boundary[\s\S]*inspector_boundary[\s\S]*Cloud runtime provider detail[\s\S]*Hosted runtime profiles[\s\S]*WordPress control/,
  'The table must retain a compact disclosure for Cloud runtime ownership'
);

assert.match(
  adminLayoutSource,
  /admin-sidebar[\s\S]*admin-shell-content/,
  'The PC shell must use shared sidebar and content geometry classes'
);

assert.match(
  globalStyleSource,
  /--admin-sidebar-expanded:\s*13rem[\s\S]*--admin-sidebar-collapsed:\s*4rem[\s\S]*--admin-workbench-max-width:\s*72rem/,
  'Shared admin tokens must reserve 208px, 64px, and 1152px for accepted PC geometry'
);

assert.match(
  dialogSource,
  /data-ui="admin-workbench-dialog"[\s\S]*admin-workbench-dialog/,
  'The provider editor must use a wide PC workbench dialog'
);

assert.match(
  pageSource,
  /headerAccessory=\{providerFormMode === 'edit'[\s\S]*credential_keep_hint[\s\S]*data-ui="provider-connection-settings"[\s\S]*AdminCredentialField[\s\S]*credentialEditOpen/,
  'Editing an existing provider must use a neutral credential hint, collapsed connection settings, and explicit credential replacement'
);

assert.match(
  credentialSource,
  /onCancelReplacement[\s\S]*type="password"[\s\S]*autoComplete="new-password"/,
  'The shared credential field must keep replacement explicit and the input secret'
);

assert.match(
  pageSource,
  /AdminSettingsDisclosure[\s\S]*dataUi="image-delivery-settings"[\s\S]*image_delivery_unconfirmed_compact/,
  'Image delivery must be a compact disclosure instead of a dominant always-open panel'
);

assert.match(
  disclosureSource,
  /<details[\s\S]*<summary[\s\S]*statusTone/,
  'Low-frequency configuration must use the shared settings disclosure'
);

assert.match(
  pageSource,
  /data-ui="model-sync-primary"[\s\S]*model_visibility_more_operations/,
  'The primary model sync action must stay beside model search rather than inside the overflow panel'
);

console.log('admin_provider_directory_v2_contract: ok');
