import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { frontendRoot } from './_paths.mjs';

const source = readFileSync(resolve(frontendRoot, 'src/app/admin/subscriptions/page.tsx'), 'utf8');
const layoutSource = readFileSync(resolve(frontendRoot, 'src/app/admin/layout.tsx'), 'utf8');

assert.match(source, /BackofficePageHeader[\s\S]*secondaryAction=\{[\s\S]*summaryItems=\{\[/, 'subscription queue must start with the shared compact page header and factual summary');
assert.doesNotMatch(source, /BackofficeMetricStrip|BackofficeLayer|BackofficePrimaryPanel|BackofficeStackCard/, 'subscription queue must not regress to a section header, metric cards, or a landing-page hero');

assert.match(source, /usePathname[\s\S]*useRouter[\s\S]*useSearchParams/, 'queue state must be addressable from the route');
for (const parameter of ['risk', 'status_group', 'status', 'account_id', 'plan_id', 'expires_before', 'sort', 'offset', 'focus']) {
  assert.match(source, new RegExp(`searchParams\\.get\\('${parameter}'\\)|${parameter}:`), `${parameter} must participate in route-backed queue state`);
}

assert.match(source, /activeRequestKeyRef[\s\S]*requestSequenceRef/, 'subscription reads must deduplicate Strict Mode requests and reject stale responses');
assert.doesNotMatch(source, /window\.location\.reload/, 'refresh recovery must preserve the current queue instead of reloading the page');
assert.match(source, /error && !hasLoaded[\s\S]*error \?/, 'initial load failure and retained-data refresh failure must have distinct UI states');
assert.match(source, /isShowingRetainedResults = Boolean\(error && hasLoaded\)[\s\S]*last successfully loaded results/, 'every failed refresh with retained data must identify the last successful result set');

assert.match(source, /operator_risk[\s\S]*reason_code[\s\S]*readSubscriptionQueue\(payload, requestKey\)[\s\S]*validated\.summary/, 'the queue must validate and consume backend-owned risk reasons and full-filter summary counts');
assert.match(source, /normalizeRiskFilter[\s\S]*'needs_action'[\s\S]*params\.set\('risk', appliedRisk\)/, 'the queue must default to the server-owned needs-action risk view');
assert.match(source, /subscription-enumerated-filters[\s\S]*role="group"[\s\S]*risk_filter_label[\s\S]*role="group"[\s\S]*status_filter_label[\s\S]*subscription-filter-toolbar[\s\S]*customer_filter_placeholder[\s\S]*plan_filter_placeholder[\s\S]*admin\.expires_before[\s\S]*sort_label/, 'independent named risk and lifecycle groups stay with the existing explicit search toolbar');
assert.match(source, /const PAGE_SIZE = 10;/, 'subscription pages have a fixed ten-row limit');
assert.match(source, /BackofficeFilterPill[\s\S]*aria-pressed=\{appliedRisk === risk\}[\s\S]*aria-pressed=\{!appliedStatusGroup && appliedStatus === status\}/, 'each named filter group preserves its independent selected state');
assert.match(source, /setLoadedRequestKey\(requestKey\)[\s\S]*new URLSearchParams\(loadedRequestKey\)\.get\('offset'\)/, 'displayed range belongs to the last successful request');
assert.match(source, /loadedQuery\.delete\('offset'\)[\s\S]*requestedQuery\.delete\('offset'\)[\s\S]*const isRetainingDifferentQuery = hasLoaded && loadedQuery\.toString\(\) !== requestedQuery\.toString\(\)/, 'retained pagination must distinguish offset-only navigation from changed query dimensions');
assert.match(source, /if \(isRetainingDifferentQuery\) return;/, 'old result offsets must never paginate a different requested query');
assert.match(source, /isLoading=\{isRefreshing \|\| isRetainingDifferentQuery\}/, 'the shared pager must stay disabled while retaining another query');
assert.match(source, /action=\{isOutOfRangePage[\s\S]*disabled=\{isRefreshing \|\| isRetainingDifferentQuery\}/, 'empty-page recovery must respect the retained-query boundary');
assert.match(source, /nextOffset === offset[\s\S]*updateQueueUrl\(\{ focus: null \}\)[\s\S]*void loadSubscriptions\(true\)/, 'same-URL next-page retries issue a real request');
assert.match(source, /ListPagination[\s\S]*offset=\{loadedOffset\}[\s\S]*subscription-queue-range[\s\S]*common.pagination_summary/, 'shared multi-page pagination and honest zero/single ranges remain');
assert.match(source, /isOutOfRangePage[\s\S]*empty.no_data_title[\s\S]*Math.floor\(\(total - 1\) \/ PAGE_SIZE\) \* PAGE_SIZE/, 'positive-total empty pages offer explicit bounded recovery');
assert.doesNotMatch(source, /searchParams\.get\('limit'\)|QuietQueuePagination|function \w*Pagination/, 'no URL page-size contract or copied pager');
for (const key of ['summary_critical_metric', 'summary_warning_metric', 'summary_monitor_metric', 'summary_stable_metric', 'common.updated_at']) assert.ok(source.includes(key), `preserve summary/freshness ${key}`);

assert.doesNotMatch(source, /function subscriptionRiskLevel|function subscriptionPriority|subscriptions\]\.sort|subscriptions\)\.sort/, 'the browser must not rebuild subscription risk or global ordering');
assert.match(source, /role="list"[\s\S]*data-ui="subscription-queue-item"/, 'subscriptions must render as a responsive task list');
assert.doesNotMatch(source, /<table/, 'the primary subscription queue must not depend on a desktop table');
assert.doesNotMatch(source, /<BackofficeIdentifier value=\{subscription\.account_id\}/, 'internal account IDs must not occupy the default queue row');
assert.match(source, /customerDisplayName[\s\S]*normalizedName === accountId[\s\S]*startsWith\('acct_'\)[\s\S]*unnamedLabel/, 'technical account identifiers must not be promoted into customer-facing row titles');
assert.match(source, /riskLevel === 'stable'[\s\S]*'hidden'/, 'normal rows must not render an explanatory risk block when explicitly included');
assert.match(source, /AdminInspectorDrawer[\s\S]*aria-controls="subscription-inspector"[\s\S]*id="subscription-inspector"/, 'row inspection must open the shared accessible drawer');
assert.match(source, /onClick=\{\(\) => inspect\(subscription\.subscription_id\)\}/, 'row inspection must select its exact subscription through the shared hook');
assert.match(source, /onFocus: \(subscriptionId\) => updateQueueUrl\(\{ focus: subscriptionId \}\)/, 'the shared hook selection must persist subscription focus in the URL');
assert.match(source, /focusedSubscriptionId\s*\?[\s\S]*find\([\s\S]*: null/, 'the queue must not select the first subscription until the operator asks');
assert.doesNotMatch(source, /xl:grid-cols-\[minmax\(0,1\.65fr\)/, 'the subscription queue must remain full width while the drawer is closed');
assert.match(source, /onClose=\{\(\) => updateQueueUrl\(\{ focus: null \}\)\}/, 'closing the drawer must clear only URL-backed focus');
assert.match(source, /previousSubscription[\s\S]*nextSubscription[\s\S]*inspector_previous[\s\S]*inspector_next/, 'the drawer must support bounded previous and next inspection');
assert.match(source, /buildAdminQueueReturnTo[\s\S]*currentQueueHref[\s\S]*buildAdminDetailHref/, 'subscription detail links must use the shared contract to preserve the current filtered queue return path');
assert.doesNotMatch(source, /admin\.back_to_coverage/, 'the independent subscription workspace must not offer a parent-workspace return action');
assert.match(
  layoutSource,
  /href: '\/admin\/subscriptions'[\s\S]*labelKey: 'admin\.nav_commercial_records'[\s\S]*activePrefixes: \['\/admin\/coverage', '\/admin\/plans', '\/admin\/credit-packs', '\/admin\/economics'\]/,
  'subscription queue and detail routes must own the commercial sidebar entry'
);

assert.match(source, /params\.set\('sort', sort\)[\s\S]*params\.set\('limit'[\s\S]*<ListPagination/, 'server-filtered results must send an explicit sort and keep pagination');
assert.match(source, /Filters, risk classification, and sorting are applied across all matching subscriptions by the service API/, 'the UI must state the backend-owned global queue scope');
assert.match(source, /does not create checkout, payment, entitlement, or WordPress write controls/, 'inspector copy must preserve the Cloud service-plane boundary');

console.log('admin_subscriptions_queue_v2_contract: ok');
