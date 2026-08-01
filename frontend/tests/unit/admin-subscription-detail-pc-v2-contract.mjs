import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { frontendRoot } from './_paths.mjs';

const page = readFileSync(resolve(frontendRoot, 'src/app/admin/subscriptions/[subscriptionId]/page.tsx'), 'utf8');

assert.match(page, /normalizeSubscriptionReturnTo[\s\S]*parsed\.pathname === '\/admin\/subscriptions'[\s\S]*admin\.back_to_subscriptions/, 'subscription detail must preserve only a safe return path to the subscription queue');
const commercialCopy = readFileSync(resolve(frontendRoot, 'src/lib/admin-commercial-copy.ts'), 'utf8');
const i18n = readFileSync(resolve(frontendRoot, 'src/lib/i18n.ts'), 'utf8');
const auditSummary = readFileSync(resolve(frontendRoot, 'src/components/admin/AdminAuditSummaryPanel.tsx'), 'utf8');

assert.match(page, /conclusionTitle[\s\S]*conclusionDescription[\s\S]*accountCoverageHref/, 'subscription detail must derive one current conclusion and one bounded next destination');
assert.match(page, /admin\.subscription_detail\.current_follow_up[\s\S]*hasSnapshotFollowUp[\s\S]*admin\.subscription_detail\.open_customer_coverage_action/, 'the first-screen action must follow snapshot and customer-coverage priority');
assert.match(page, /actions=\{\([\s\S]*admin\.back_to_subscriptions[\s\S]*actionPlacement="header"/, 'the header must preserve one compact return action');
assert.match(page, /data-ui="subscription-summary-card"[\s\S]*admin\.subscription_detail\.basic_information[\s\S]*<dl/, 'subscription facts must fill the top summary beside the current conclusion');
assert.match(page, /data-ui="subscription-operational-grid"[\s\S]*xl:grid-cols-2[\s\S]*2xl:grid-cols-[\s\S]*admin\.subscription_detail\.usage_title[\s\S]*admin\.subscription_detail\.covered_sites_label/, 'usage, sites, and audit must share one responsive operational grid');
assert.match(page, /AdminAuditSummaryPanel[\s\S]*display="table"/, 'subscription audit evidence must use the compact table presentation');
assert.match(page, /BackofficeDisclosure[\s\S]*admin\.subscription_detail\.advanced_operational_evidence[\s\S]*admin\.subscription_detail\.route_hint[\s\S]*BackofficeIdentifier/, 'boundary copy and support identifiers must remain behind the advanced disclosure');
assert.doesNotMatch(page, /BackofficeMetricStrip|BackofficeStackCard/, 'subscription detail must not regress to a repeated metric-card mosaic');
assert.match(page, /cost_cny_snapshot_missing_count[\s\S]*data-ui="cost-snapshot-completeness"[\s\S]*admin\.subscription_detail\.cost_snapshot_incomplete/, 'incomplete CNY totals must expose their call-time snapshot gap beside the known minimum');
assert.match(page, /BackofficeDiagnosticNotice[\s\S]*setLoadVersion/, 'initial read failures must preserve the route shell and provide bounded retry');
assert.doesNotMatch(page, /window\.location\.reload/, 'retry must not reload the entire admin application');
assert.match(auditSummary, /eventTotal > 0[\s\S]*AdminInspectorDrawer[\s\S]*trailItems\.map/, 'audit action must appear only for non-empty evidence and open a human-readable drawer');
assert.doesNotMatch(auditSummary, /<Link[^>]+href=\{trailHref\}|target="_blank"/, 'audit evidence must never navigate an operator directly to the JSON API');

for (const text of [
  'Read current status and grace posture first.',
  'Use site detail and filtered audit evidence to confirm whether snapshot posture and impact are aligned.',
  'Open site detail for runtime and entitlement impact.',
]) {
  assert.ok(commercialCopy.includes(`'${text}'`), `known backend copy must be localized: ${text}`);
}

for (const key of [
  'admin.subscription_detail.load_error_title',
  'admin.subscription_detail.current_follow_up',
  'admin.subscription_detail.follow_up_focus',
  'admin.subscription_detail.conclusion_snapshot_title',
  'admin.subscription_detail.conclusion_coverage_title',
  'admin.subscription_detail.open_customer_coverage_action',
  'admin.subscription_detail.advanced_operational_evidence',
  'admin.subscription_detail.cost_snapshot_incomplete',
]) {
  const occurrences = Array.from(i18n.matchAll(new RegExp(`'${key.replaceAll('.', '\\.')}':`, 'g'))).length;
  assert.equal(occurrences, 2, `${key} must exist in English and Simplified Chinese`);
}

console.log('admin_subscription_detail_pc_v2_contract: ok');
