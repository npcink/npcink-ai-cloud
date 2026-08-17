import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { frontendRoot } from './_paths.mjs';

const root = frontendRoot;
const pageSource = readFileSync(resolve(root, 'src/app/admin/ai-resources/page.tsx'), 'utf8');
const directorySource = readFileSync(resolve(root, 'src/components/admin/SupplierConnectionTables.tsx'), 'utf8');
const actionMenuSource = readFileSync(resolve(root, 'src/components/admin/AdminActionMenu.tsx'), 'utf8');
const toolbarSource = readFileSync(resolve(root, 'src/components/admin/SupplierToolbar.tsx'), 'utf8');
const adminLayoutSource = readFileSync(resolve(root, 'src/app/admin/layout.tsx'), 'utf8');
const globalStyleSource = readFileSync(resolve(root, 'src/app/globals.css'), 'utf8');
const dialogSource = readFileSync(resolve(root, 'src/components/admin/AdminWorkbenchDialog.tsx'), 'utf8');
const credentialSource = readFileSync(resolve(root, 'src/components/admin/AdminCredentialField.tsx'), 'utf8');
const directoryQuerySource = readFileSync(
  resolve(root, 'src/features/admin/ai-resources/directory.ts'),
  'utf8'
);
const modelReferenceSource = readFileSync(
  resolve(root, 'src/features/admin/ai-resources/model-reference-model.ts'),
  'utf8'
);

assert.match(
  pageSource,
  /<BackofficePageHeader[\s\S]*primaryAction=\{\([\s\S]*action_add_model_supplier[\s\S]*summaryItems=\{\[/,
  'Provider readiness must remain in the compact operational header'
);

assert.match(
  directorySource,
  /data-ui="model-supplier-table"[\s\S]*min-w-\[64rem\][\s\S]*<thead[\s\S]*<tbody/,
  'The PC provider workspace must use one dense semantic table'
);

assert.match(
  directorySource,
  /data-connection-id=\{connection\.connection_id\}[\s\S]*data-selected=\{isSelected[\s\S]*action_configure[\s\S]*action_test[\s\S]*SupplierMoreActions/,
  'Each provider row must keep URL-backed focus and put frequent actions before the overflow control'
);

assert.match(
  directorySource,
  /column_configuration_status[\s\S]*column_enabled_models[\s\S]*column_profiles[\s\S]*column_last_verification[\s\S]*data-ui="supplier-name"/,
  'Supplier identity must be non-interactive and configuration, models, profiles, and verification must remain separate facts'
);

assert.match(
  directorySource,
  /action_delete_connection[\s\S]*<AdminActionMenu[\s\S]*dataUi="supplier-more-actions"/,
  'Supplier overflow must use the shared collision-aware action menu and retain the bounded destructive action'
);

assert.match(
  pageSource,
  /requestProviderConnectionDelete[\s\S]*delete-preflight[\s\S]*expected_updated_at[\s\S]*provider_connection\.delete_conflict/,
  'Provider deletion must inspect current impact, submit the preflight version, and handle stale conflicts'
);

assert.match(
  pageSource,
  /hasProviderWorkbenchDraftChanges[\s\S]*error_delete_connection_unsaved_draft[\s\S]*reopen_draft/,
  'Provider deletion must preserve and reopen a dirty same-connection draft before preflight'
);

assert.match(
  directorySource,
  /provider-delete-preflight-loading[\s\S]*delete_preflight_impact[\s\S]*uncovered_runtime_profile_ids[\s\S]*!matchingDeletePreflight/,
  'Inline deletion confirmation must show backend-owned impact and stay disabled without matching preflight evidence'
);

assert.match(
  actionMenuSource,
  /FloatingPortal[\s\S]*placement: 'bottom-end'[\s\S]*strategy: 'fixed'[\s\S]*flip\(\{ padding: 8 \}\)[\s\S]*shift\(\{ padding: 8 \}\)/,
  'Admin action menus must portal outside table overflow and use collision-aware viewport placement'
);

assert.match(
  actionMenuSource,
  /useDismiss[\s\S]*useListNavigation[\s\S]*FloatingFocusManager[\s\S]*returnFocus/,
  'Admin action menus must support dismissal, keyboard navigation, and trigger-focus restoration'
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
  /useAiResourcesDirectory\(\)[\s\S]*directoryQuery\.isPending[\s\S]*directoryQuery\.refetch/,
  'The route must delegate provider directory server state to its feature query'
);

assert.match(
  directoryQuerySource,
  /queryKey:\s*aiResourcesKeys\.directory\(\)[\s\S]*queryFn:\s*\(\{\s*signal\s*\}\)[\s\S]*fetchAiResourcesDirectory\(signal\)/,
  'Provider directory reads must use one stable query identity and forward cancellation'
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
  /primaryAction=\{\([\s\S]*openNewProviderConnection[\s\S]*action_add_model_supplier/,
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
  /contentMode=\{providerWorkbenchSection === 'models' \? 'contained' : 'scroll'\}[\s\S]*model-visibility-directory" className="flex min-h-0 flex-1 flex-col[\s\S]*min-h-0 flex-1 overflow-auto overscroll-contain/,
  'Model management must keep one bounded table scrollbar instead of nesting it inside a scrolling dialog body'
);

assert.match(
  dialogSource,
  /contentMode === 'contained' \? 'overflow-hidden' : 'overflow-y-auto'[\s\S]*contentMode === 'contained'[\s\S]*flex min-h-0 flex-1 flex-col overflow-hidden/,
  'Contained workbenches must disable overlay and body scrolling so a declared child remains the sole vertical scroll owner'
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
  /data-ui="model-metadata-gap-filter"[\s\S]*data-ui="model-sync-primary"[\s\S]*data-ui="model-visibility-toolbar"[\s\S]*field_visibility_filter[\s\S]*filter_all_visibility[\s\S]*field_feature_filter[\s\S]*filter_all_features/,
  'Model synchronization and missing-intelligence triage must use the summary while search and named frequent filters remain stable in the toolbar'
);

assert.match(
  `${modelReferenceSource}\n${pageSource}`,
  /MODEL_VISIBILITY_PAGE_SIZE = 25[\s\S]*modelVisibilityPageRows[\s\S]*data-ui="model-visibility-pagination"[\s\S]*set_reference_page/,
  'Large model directories must render one bounded page and keep pagination inside the model workbench'
);
assert.doesNotMatch(
  pageSource,
  /function (?:normalizeProviderCatalogPreview|modelReferenceSearchText|selectedModelIdFor|formatReferencePrice)/,
  'The route must not own model-reference normalization, identity matching, filtering, or formatting policy'
);
assert.match(
  modelReferenceSource,
  /export function normalizeProviderCatalogPreview[\s\S]*export function buildModelVisibilityRows/,
  'The model-reference feature model must own catalog normalization and visible-row projection'
);

assert.match(
  directorySource,
  /AdminEmptyState[\s\S]*hasActiveFilters[\s\S]*action_clear_filters/,
  'A filtered-empty supplier queue must provide one direct reset action'
);

assert.match(
  pageSource,
  /<details data-ui="model-maintenance-table"[\s\S]*rowId="model-reference-provider"[\s\S]*rowId="historical-model-visibility"[\s\S]*rowId="manual-model-add"[\s\S]*rowId="enabled-model-bulk-maintenance"/,
  'Reference source, historical visibility, manual additions, and bulk maintenance must use default-collapsed in-flow configuration rows'
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
