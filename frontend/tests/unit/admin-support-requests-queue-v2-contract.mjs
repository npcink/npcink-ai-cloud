import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromFrontendRoot } from './_paths.mjs';

const source = [
  'src/app/admin/support-requests/page.tsx',
  'src/features/admin/support-requests/SupportRequestsWorkspace.tsx',
  'src/features/admin/support-requests/api.ts',
  'src/features/admin/support-requests/directory-model.ts',
  'src/features/admin/support-requests/queries.ts',
  'src/lib/admin-return-context.ts',
].map((path) => readFileSync(fromFrontendRoot(path), 'utf8')).join('\n');
const detailSource = readFileSync(
  fromFrontendRoot('src/app/admin/support-requests/[requestId]/page.tsx'),
  'utf8'
);
const drawerSource = readFileSync(
  fromFrontendRoot('src/components/admin/AdminContextDrawer.tsx'),
  'utf8'
);

assert.match(source, /BackofficePageHeader[\s\S]*secondaryAction=\{\([\s\S]*summaryItems=\{\[/, 'ticket queue must use the shared compact page header and operating summary');
assert.doesNotMatch(source, /BackofficePrimaryPanel|BackofficeStackCard|support-request-queue-item/, 'ticket queue must not restore the old card stack or task cards');
assert.match(source, /AdminDataTableFrame[\s\S]*dataUi="support-request-table"[\s\S]*<table[\s\S]*<thead[\s\S]*<tbody/, 'ticket queue must use the shared full-width semantic table');
assert.match(source, /data-ui="support-request-view-pills"[\s\S]*support-request-attention-pills[\s\S]*support-request-status-pills[\s\S]*data-ui="support-request-toolbar"/, 'attention and workflow status pills must be grouped above the compact secondary toolbar');
assert.match(source, /AdminHelpTip[\s\S]*AdminQueueKeyboardHint|support-request-keyboard-help[\s\S]*admin-queue-keyboard-hint/, 'keyboard hints must live in a quieter help tip, not compete with pills');
assert.match(source, /data-ui="support-request-toolbar"[\s\S]*support_requests_search_label[\s\S]*support_requests_topic_filter_label[\s\S]*support_requests_sort_label[\s\S]*clear_filters/, 'search, topic, sort, and clear-filters must share one Quiet secondary toolbar');
assert.doesNotMatch(source, /common\.apply/, 'Quiet toolbar must not keep a primary Apply button');
assert.match(source, /group-hover:opacity-100[\s\S]*support_requests_inspect_action[\s\S]*support_requests_open_conversation_action/, 'Inspect must demote to hover/focus reveal; Open conversation stays the row primary');
assert.match(source, /admin\.support_status_\$\{item\.status\}[\s\S]*portal\.support_topic_\$\{item\.topic\}/, 'row status must stay quieter text beside topic');
assert.ok(!/data-ui="support-request-row"[\s\S]{0,1200}BackofficeStatusBadge/.test(source), 'table rows must not keep a second strong status badge column');
assert.match(source, /SUPPORT_REQUEST_PAGE_SIZE = 10/, 'Quiet queue default page size must be 10');
assert.match(source, /data-ui="support-request-quiet-pagination"[\s\S]*common\.pagination_summary/, 'Quiet queue must always show range / total pagination (including single-page)');
assert.match(source, /summaryItems=\{\[[\s\S]*waiting_for_operator[\s\S]*overdue[\s\S]*\]\}/, 'header summary must keep actionable waiting/overdue signals');
assert.doesNotMatch(source, /support_requests_waiting_for_customer[\s\S]*support_requests_total[\s\S]*common\.updated_at/, 'header summary must not keep decorative metric wall entries');

for (const parameter of ['status', 'topic', 'attention', 'q', 'sort', 'limit', 'offset', 'focus']) {
  assert.match(source, new RegExp(`queueParams\\.get\\('${parameter}'\\)`), `${parameter} must be URL-backed`);
}
assert.match(source, /window\.history\.replaceState/, 'queue filter updates must synchronously preserve the current PC URL state');

assert.match(source, /useSupportRequestsDirectory[\s\S]*placeholderData: keepPreviousData/, 'ticket reads must use the shared Query state layer and retain the previous page while filters load');
assert.match(source, /getLatestSupportRequestsDirectoryData[\s\S]*support_requests_retained_notice/, 'failed filter loads must retain and honestly label the last successful page');
assert.match(source, /disabled=\{displayScope\.isRetainedScope\}[\s\S]*openEditor/, 'retained or placeholder results must stay read-only');
assert.match(source, /params\.set\('sort', sort\)/, 'the selected sort must be sent to the server before pagination');
assert.match(source, /params\.set\('attention', filters\.attention\)/, 'waiting-for-support and overdue views must be sent to the server before pagination');
assert.doesNotMatch(source, /sortSupportRequests/, 'the client must not reorder a page after server pagination');
assert.match(source, /global risk ordering before pagination/, 'the queue must state its server-owned global ordering');
assert.match(source, /waiting_on[\s\S]*waiting_since/, 'the queue must present the server-owned waiting object and waiting age');

assert.match(source, /data-ui="support-request-row"/, 'tickets must render as compact semantic table rows');
assert.match(source, /AdminContextDrawer[\s\S]*open=\{Boolean\(selectedRequest\) && !editRequest && !keyboardFocus\}/, 'ticket inspection must open on demand without reserving queue width or stealing keyboard Enter');
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
assert.match(source, /buildAdminQueueReturnTo[\s\S]*buildAdminDetailHref[\s\S]*ADMIN_RETURN_TO_PARAM = 'return_to'/, 'ticket detail links must preserve the queue return context through the shared transport');
assert.match(detailSource, /normalizeAdminReturnTo[\s\S]*ADMIN_QUEUE_PATHNAMES\.supportRequests/, 'ticket detail must use the shared contract to reject untrusted return paths');
assert.match(source + detailSource, /\/admin\/accounts\/\$\{encodeURIComponent/, 'ticket context must link directly to the customer');
assert.match(source + detailSource, /\/admin\/sites\/\$\{encodeURIComponent/, 'ticket context must link directly to the related site');
assert.match(source, /no WordPress write is created/, 'the queue must state its Cloud service-plane boundary');

console.log('admin_support_requests_queue_v2_contract: ok');
