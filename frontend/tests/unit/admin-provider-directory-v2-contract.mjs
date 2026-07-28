import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { frontendRoot } from './_paths.mjs';

const root = frontendRoot;
const pageSource = readFileSync(resolve(root, 'src/app/admin/ai-resources/page.tsx'), 'utf8');
const directorySource = readFileSync(resolve(root, 'src/components/admin/SupplierConnectionTables.tsx'), 'utf8');
const toolbarSource = readFileSync(resolve(root, 'src/components/admin/SupplierToolbar.tsx'), 'utf8');
const adminLayoutSource = readFileSync(resolve(root, 'src/app/admin/layout.tsx'), 'utf8');
const globalStyleSource = readFileSync(resolve(root, 'src/app/globals.css'), 'utf8');
const dialogSource = readFileSync(resolve(root, 'src/components/admin/AdminWorkbenchDialog.tsx'), 'utf8');
const credentialSource = readFileSync(resolve(root, 'src/components/admin/AdminCredentialField.tsx'), 'utf8');

assert.match(
  pageSource,
  /data-ui="supplier-summary-strip"[\s\S]*BackofficeSummaryStrip[\s\S]*density="compact"/,
  'Provider readiness must remain in the compact operational header'
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
  /field_search_connections[\s\S]*status_filter_label/,
  'The directory toolbar must expose search and status filtering'
);

assert.doesNotMatch(
  toolbarSource,
  /supplierTypeFilter|action_add_capability_supplier|action_add_model_supplier|onAddModelSupplier/,
  'The directory toolbar must not duplicate supplier creation or capability-service controls'
);

assert.match(
  pageSource,
  /openNewProviderConnection[\s\S]*action_add_model_supplier[\s\S]*actionPlacement="header"/,
  'Adding a model supplier must remain the sole header primary action'
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
  /AdminConfigurationTable[\s\S]*rowId="credential"[\s\S]*AdminCredentialField[\s\S]*credentialEditOpen/,
  'Editing an existing provider must use a dense configuration table and explicit credential replacement'
);

assert.match(
  credentialSource,
  /onCancelReplacement[\s\S]*type="password"[\s\S]*autoComplete="new-password"/,
  'The shared credential field must keep replacement explicit and the input secret'
);

assert.match(
  pageSource,
  /rowId="image-response-format"[\s\S]*image_delivery_unconfirmed_compact[\s\S]*image_delivery_test_not_proof_compact[\s\S]*rowId="image-output-hosts"/,
  'Image delivery must use concise configuration rows while retaining the separate-delivery-test boundary'
);

assert.match(
  pageSource,
  /data-ui="model-visibility-toolbar"[\s\S]*field_visibility_filter[\s\S]*field_feature_filter[\s\S]*field_show_deprecated_models[\s\S]*data-ui="model-sync-primary"/,
  'Model search, filters, history visibility, and synchronization must stay in one stable toolbar'
);

assert.match(
  pageSource,
  /data-ui="model-maintenance-table"[\s\S]*rowId="model-reference-provider"[\s\S]*rowId="manual-model-add"[\s\S]*rowId="enabled-model-bulk-maintenance"/,
  'Reference source, manual additions, and bulk maintenance must use in-flow configuration rows'
);

assert.match(
  pageSource,
  /clear_all_models_confirmation[\s\S]*data-ui="model-clear-all-confirm"/,
  'Clearing every enabled model must require an impact-specific confirmation'
);
assert.match(pageSource, /data-ui="model-clear-all-request"/);

assert.doesNotMatch(
  pageSource,
  /model_visibility_more_operations[\s\S]*sm:absolute sm:right-0 sm:z-30/,
  'Model maintenance must not open a floating panel over the model table'
);

console.log('admin_provider_directory_v2_contract: ok');
