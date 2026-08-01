import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { frontendRoot } from './_paths.mjs';

const source = readFileSync(resolve(frontendRoot, 'src/app/admin/subscriptions/page.tsx'), 'utf8');
const layoutSource = readFileSync(resolve(frontendRoot, 'src/app/admin/layout.tsx'), 'utf8');

assert.match(source, /BackofficePageHeader[\s\S]*secondaryAction=\{[\s\S]*summaryItems=\{\[/, 'subscription queue must start with the shared compact page header and factual summary');
assert.doesNotMatch(source, /BackofficeMetricStrip|BackofficeLayer|BackofficePrimaryPanel|BackofficeStackCard/, 'subscription queue must not regress to a section header, metric cards, or a landing-page hero');

assert.match(source, /usePathname[\s\S]*useRouter[\s\S]*useSearchParams/, 'queue state must be addressable from the route');
for (const parameter of ['risk', 'status', 'account_id', 'plan_id', 'expires_before', 'sort', 'offset', 'focus']) {
  assert.match(source, new RegExp(`searchParams\\.get\\('${parameter}'\\)|${parameter}:`), `${parameter} must participate in route-backed queue state`);
}

assert.match(source, /activeRequestKeyRef[\s\S]*requestSequenceRef/, 'subscription reads must deduplicate Strict Mode requests and reject stale responses');
assert.doesNotMatch(source, /window\.location\.reload/, 'refresh recovery must preserve the current queue instead of reloading the page');
assert.match(source, /error && !hasLoaded[\s\S]*error \?/, 'initial load failure and retained-data refresh failure must have distinct UI states');
assert.match(source, /isShowingRetainedResults = Boolean\(error && hasLoaded\)[\s\S]*last successfully loaded results/, 'every failed refresh with retained data must identify the last successful result set');

assert.match(source, /operator_risk[\s\S]*reason_code[\s\S]*payload\.summary/, 'the queue must consume backend-owned risk reasons and full-filter summary counts');
assert.match(source, /normalizeRiskFilter[\s\S]*'needs_action'[\s\S]*params\.set\('risk', appliedRisk\)/, 'the queue must default to the server-owned needs-action risk view');
assert.match(source, /data-ui="subscription-filter-toolbar"[\s\S]*risk_filter_label[\s\S]*status_filter_label[\s\S]*account_filter_placeholder[\s\S]*plan_filter_placeholder[\s\S]*admin\.expires_before[\s\S]*sort_label/, 'risk, lifecycle, customer, package, expiry, and sort controls must share one toolbar');
assert.doesNotMatch(source, /function subscriptionRiskLevel|function subscriptionPriority|subscriptions\]\.sort|subscriptions\)\.sort/, 'the browser must not rebuild subscription risk or global ordering');
assert.match(source, /role="list"[\s\S]*data-ui="subscription-queue-item"/, 'subscriptions must render as a responsive task list');
assert.doesNotMatch(source, /<table/, 'the primary subscription queue must not depend on a desktop table');
assert.doesNotMatch(source, /<BackofficeIdentifier value=\{subscription\.account_id\}/, 'internal account IDs must not occupy the default queue row');
assert.match(source, /customerDisplayName[\s\S]*normalizedName === accountId[\s\S]*startsWith\('acct_'\)[\s\S]*unnamedLabel/, 'technical account identifiers must not be promoted into customer-facing row titles');
assert.match(source, /riskLevel === 'stable'[\s\S]*'hidden'/, 'normal rows must not render an explanatory risk block when explicitly included');
assert.match(source, /AdminInspectorDrawer[\s\S]*aria-controls="subscription-inspector"[\s\S]*id="subscription-inspector"/, 'row inspection must open the shared accessible drawer');
assert.match(source, /focus: subscription\.subscription_id/, 'inspector focus must persist in the URL');
assert.match(source, /focusedSubscriptionId\s*\?[\s\S]*find\([\s\S]*: null/, 'the queue must not select the first subscription until the operator asks');
assert.doesNotMatch(source, /xl:grid-cols-\[minmax\(0,1\.65fr\)/, 'the subscription queue must remain full width while the drawer is closed');
assert.match(source, /onClose=\{\(\) => updateQueueUrl\(\{ focus: null \}\)\}/, 'closing the drawer must clear only URL-backed focus');
assert.match(source, /previousSubscription[\s\S]*nextSubscription[\s\S]*inspector_previous[\s\S]*inspector_next/, 'the drawer must support bounded previous and next inspection');
assert.match(source, /currentQueueHref[\s\S]*return_to=\$\{encodeURIComponent\(currentQueueHref\)\}/, 'subscription detail links must preserve the current filtered queue return path');
assert.doesNotMatch(source, /admin\.back_to_coverage/, 'the independent subscription workspace must not offer a parent-workspace return action');
assert.match(
  layoutSource,
  /href: '\/admin\/subscriptions'[\s\S]*labelKey: 'admin\.nav_subscriptions'[\s\S]*activePrefixes: \['\/admin\/subscriptions'\]/,
  'subscription queue and detail routes must own their sidebar state'
);

assert.match(source, /params\.set\('sort', sort\)[\s\S]*params\.set\('limit'[\s\S]*<ListPagination/, 'server-filtered results must send an explicit sort and keep pagination');
assert.match(source, /Filters, risk classification, and sorting are applied across all matching subscriptions by the service API/, 'the UI must state the backend-owned global queue scope');
assert.match(source, /does not create checkout, payment, entitlement, or WordPress write controls/, 'inspector copy must preserve the Cloud service-plane boundary');

console.log('admin_subscriptions_queue_v2_contract: ok');
