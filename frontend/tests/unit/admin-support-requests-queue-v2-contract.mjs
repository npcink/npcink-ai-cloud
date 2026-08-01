import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromFrontendRoot } from './_paths.mjs';

const source = [
  'src/app/admin/support-requests/page.tsx',
  'src/features/admin/support-requests/SupportRequestsWorkspace.tsx',
  'src/features/admin/support-requests/api.ts',
  'src/features/admin/support-requests/directory-model.ts',
  'src/features/admin/support-requests/queries.ts',
].map((path) => readFileSync(fromFrontendRoot(path), 'utf8')).join('\n');
const detailSource = readFileSync(
  fromFrontendRoot('src/app/admin/support-requests/[requestId]/page.tsx'),
  'utf8'
);
const drawerSource = readFileSync(
  fromFrontendRoot('src/components/admin/AdminContextDrawer.tsx'),
  'utf8'
);

assert.match(source, /BackofficeLayer/, 'ticket queue must use the compact operating header');
assert.match(source, /BackofficeSummaryStrip/, 'ticket queue must expose a compact operating summary');
assert.doesNotMatch(source, /BackofficePrimaryPanel|BackofficeStackCard|support-request-queue-item/, 'ticket queue must not restore the old card stack or task cards');
assert.match(source, /AdminDataTableFrame[\s\S]*dataUi="support-request-table"[\s\S]*<table[\s\S]*<thead[\s\S]*<tbody/, 'ticket queue must use the shared full-width semantic table');
assert.match(source, /data-ui="support-request-toolbar"[\s\S]*md:grid-cols-2[\s\S]*xl:grid-cols-/, 'ticket filters must stay in one compact responsive toolbar');

for (const parameter of ['status', 'topic', 'q', 'sort', 'offset', 'focus']) {
  assert.match(source, new RegExp(`queueParams\\.get\\('${parameter}'\\)`), `${parameter} must be URL-backed`);
}
assert.match(source, /window\.history\.replaceState/, 'queue filter updates must synchronously preserve the current PC URL state');

assert.match(source, /useSupportRequestsDirectory[\s\S]*placeholderData: keepPreviousData/, 'ticket reads must use the shared Query state layer and retain the previous page while filters load');
assert.match(source, /getLatestSupportRequestsDirectoryData[\s\S]*support_requests_retained_notice/, 'failed filter loads must retain and honestly label the last successful page');
assert.match(source, /disabled=\{displayScope\.isRetainedScope\}[\s\S]*openEditor/, 'retained or placeholder results must stay read-only');
assert.match(source, /params\.set\('sort', sort\)/, 'the selected sort must be sent to the server before pagination');
assert.doesNotMatch(source, /sortSupportRequests/, 'the client must not reorder a page after server pagination');
assert.match(source, /global risk ordering before pagination/, 'the queue must state its server-owned global ordering');

assert.match(source, /data-ui="support-request-row"/, 'tickets must render as compact semantic table rows');
assert.match(source, /AdminContextDrawer[\s\S]*open=\{Boolean\(selectedRequest\) && !editRequest\}/, 'ticket inspection must open on demand without reserving queue width');
assert.match(drawerSource, /data-ui="admin-context-drawer"[\s\S]*role="dialog"[\s\S]*aria-modal="true"/, 'the shared drawer must own accessible modal behavior');
assert.doesNotMatch(source, /xl:grid-cols-\[minmax\(0,1\.65fr\)|id="support-request-inspector"/, 'the queue must not retain a persistent inspector column');
assert.ok(source.indexOf('support_requests_customer_submission_title') < source.indexOf('support_requests_internal_handling_title'), 'customer submission must be separated from internal handling');
assert.equal(source.match(/<textarea/g)?.length || 0, 1, 'internal handling must expose one note editor in the shared dialog, not one editor per row');
assert.match(source, /AdminWorkbenchDialog[\s\S]*titleId="support-request-edit-title"[\s\S]*name="status"[\s\S]*name="admin_note"/, 'status and internal-note writes must use the shared workbench dialog');

assert.match(source, /method: 'PATCH'/, 'the bounded ticket status update must remain available');
assert.match(source, /invalidateQueries[\s\S]*supportRequestKeys\.directories/, 'successful updates must invalidate the authoritative ticket directory');
assert.match(source, /setActionError[\s\S]*error=\{actionError\}/, 'ticket update failures must stay in the edit-dialog context');
assert.match(source, /toast\.success/, 'successful ticket updates must use global toast feedback');
assert.match(source, /admin\.support_requests_open_conversation_action/, 'the inspector must explicitly open the full conversation surface');
assert.match(source, /return_to/, 'ticket detail links must preserve the queue return context');
assert.match(detailSource, /sanitizeSupportRequestReturnPath/, 'ticket detail must reject untrusted return paths');
assert.match(source + detailSource, /\/admin\/accounts\/\$\{encodeURIComponent/, 'ticket context must link directly to the customer');
assert.match(source + detailSource, /\/admin\/sites\/\$\{encodeURIComponent/, 'ticket context must link directly to the related site');
assert.match(source, /no WordPress write is created/, 'the queue must state its Cloud service-plane boundary');

console.log('admin_support_requests_queue_v2_contract: ok');
