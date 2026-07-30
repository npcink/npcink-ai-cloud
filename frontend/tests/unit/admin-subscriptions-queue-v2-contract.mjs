import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { frontendRoot } from './_paths.mjs';

const source = readFileSync(resolve(frontendRoot, 'src/app/admin/subscriptions/page.tsx'), 'utf8');

assert.match(source, /BackofficeLayer[\s\S]*BackofficeSummaryStrip/, 'subscription queue must start with a compact operating layer and summary strip');
assert.doesNotMatch(source, /BackofficeMetricStrip|BackofficePrimaryPanel|BackofficeStackCard/, 'subscription queue must not regress to metric cards or a landing-page hero');

assert.match(source, /usePathname[\s\S]*useRouter[\s\S]*useSearchParams/, 'queue state must be addressable from the route');
for (const parameter of ['status', 'account_id', 'plan_id', 'expires_before', 'sort', 'offset', 'focus']) {
  assert.match(source, new RegExp(`searchParams\\.get\\('${parameter}'\\)|${parameter}:`), `${parameter} must participate in route-backed queue state`);
}

assert.match(source, /activeRequestKeyRef[\s\S]*requestSequenceRef/, 'subscription reads must deduplicate Strict Mode requests and reject stale responses');
assert.doesNotMatch(source, /window\.location\.reload/, 'refresh recovery must preserve the current queue instead of reloading the page');
assert.match(source, /error && !hasLoaded[\s\S]*error \?/, 'initial load failure and retained-data refresh failure must have distinct UI states');
assert.match(source, /isShowingRetainedResults = Boolean\(error && hasLoaded\)[\s\S]*last successfully loaded results/, 'every failed refresh with retained data must identify the last successful result set');

assert.match(source, /operator_risk[\s\S]*reason_code[\s\S]*payload\.summary/, 'the queue must consume backend-owned risk reasons and full-filter summary counts');
assert.doesNotMatch(source, /function subscriptionRiskLevel|function subscriptionPriority|subscriptions\]\.sort|subscriptions\)\.sort/, 'the browser must not rebuild subscription risk or global ordering');
assert.match(source, /role="list"[\s\S]*data-ui="subscription-queue-item"/, 'subscriptions must render as a responsive task list');
assert.doesNotMatch(source, /<table/, 'the primary subscription queue must not depend on a desktop table');
assert.match(source, /aria-controls="subscription-inspector"[\s\S]*id="subscription-inspector"/, 'row inspection must have an explicit accessible inspector target');
assert.match(source, /focus: subscription\.subscription_id/, 'inspector focus must persist in the URL');

assert.match(source, /params\.set\('sort', sort\)[\s\S]*params\.set\('limit'[\s\S]*<ListPagination/, 'server-filtered results must send an explicit sort and keep pagination');
assert.match(source, /Filters, risk classification, and sorting are applied across all matching subscriptions by the service API/, 'the UI must state the backend-owned global queue scope');
assert.match(source, /does not create checkout, payment, entitlement, or WordPress write controls/, 'inspector copy must preserve the Cloud service-plane boundary');

console.log('admin_subscriptions_queue_v2_contract: ok');
