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

assert.match(source, /BackofficeLayer/, 'ticket queue must use the compact operating header');
assert.match(source, /BackofficeSummaryStrip/, 'ticket queue must expose a compact operating summary');
assert.doesNotMatch(source, /BackofficePrimaryPanel|BackofficeStackCard|<table/, 'ticket queue must not restore the old card stack or a wide table');

for (const parameter of ['status', 'topic', 'q', 'sort', 'offset', 'focus']) {
  assert.match(source, new RegExp(`queueParams\\.get\\('${parameter}'\\)`), `${parameter} must be URL-backed`);
}
assert.match(source, /window\.history\.replaceState/, 'queue filter updates must synchronously preserve the current PC URL state');

assert.match(source, /useSupportRequestsDirectory[\s\S]*placeholderData: keepPreviousData/, 'ticket reads must use the shared Query state layer and retain the previous page while filters load');
assert.match(source, /getLatestSupportRequestsDirectoryData[\s\S]*support_requests_retained_notice/, 'failed filter loads must retain and honestly label the last successful page');
assert.match(source, /displayScope\.isRetainedScope \|\| updateRequest\.isPending/, 'retained or placeholder results must stay read-only');
assert.match(source, /params\.set\('sort', sort\)/, 'the selected sort must be sent to the server before pagination');
assert.doesNotMatch(source, /sortSupportRequests/, 'the client must not reorder a page after server pagination');
assert.match(source, /global risk ordering before pagination/, 'the queue must state its server-owned global ordering');

assert.match(source, /data-ui="support-request-queue-item"/, 'tickets must render as a responsive task list');
assert.match(source, /id="support-request-inspector"/, 'ticket queue must provide one persistent inspector');
assert.ok(source.indexOf('support_requests_customer_submission_title') < source.indexOf('support_requests_internal_handling_title'), 'customer submission must be separated from internal handling');
assert.equal(source.match(/<textarea/g)?.length || 0, 1, 'internal handling must expose one note editor in the inspector, not one editor per row');

assert.match(source, /method: 'PATCH'/, 'the bounded ticket status update must remain available');
assert.match(source, /invalidateQueries[\s\S]*supportRequestKeys\.directories/, 'successful updates must invalidate the authoritative ticket directory');
assert.match(source, /setActionError[\s\S]*role="alert"/, 'ticket update failures must stay in the inspector context');
assert.match(source, /toast\.success/, 'successful ticket updates must use global toast feedback');
assert.match(source, /admin\.support_requests_open_conversation_action/, 'the inspector must explicitly open the full conversation surface');
assert.match(source, /return_to/, 'ticket detail links must preserve the queue return context');
assert.match(detailSource, /sanitizeSupportRequestReturnPath/, 'ticket detail must reject untrusted return paths');
assert.match(source + detailSource, /\/admin\/accounts\/\$\{encodeURIComponent/, 'ticket context must link directly to the customer');
assert.match(source + detailSource, /\/admin\/sites\/\$\{encodeURIComponent/, 'ticket context must link directly to the related site');
assert.match(source, /no WordPress write is created/, 'the queue must state its Cloud service-plane boundary');

console.log('admin_support_requests_queue_v2_contract: ok');
