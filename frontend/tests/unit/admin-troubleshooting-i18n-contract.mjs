import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { fromFrontendRoot } from './_paths.mjs';

// Contract scope (downgraded 2026-09-22 with operator approval): this
// contract guarantees the bilingual diagnostic catalog, shared-module
// ownership, URL-backed scope, and the read-only boundary. Text-order
// layout assertions moved to the route's Playwright suite so internal
// refactors no longer pay a source-shape tax on every reorder.
const pageSource = readFileSync(
  fromFrontendRoot('src/app/admin/troubleshooting/page.tsx'),
  'utf8'
);
const catalogSource = readFileSync(
  fromFrontendRoot('src/features/admin/observability/runtimeIssueCatalog.ts'),
  'utf8'
);
const i18nSource = readFileSync(fromFrontendRoot('src/lib/i18n.ts'), 'utf8');
const zhStart = i18nSource.indexOf("'zh-CN': {");

assert.ok(zhStart > 0, 'i18n dictionary must contain a Simplified Chinese section');

const enSource = i18nSource.slice(0, zhStart);
const zhSource = i18nSource.slice(zhStart);

const troubleshootingKeys = Array.from(
  pageSource.matchAll(/(?:titleKey|descKey):\s*['`](admin\.[a-z0-9_.]+)['`]|t\(['`](admin\.troubleshooting\.[a-z0-9_.]+)['`]/g)
)
  .map((match) => match[1] || match[2])
  .filter((key, index, keys) => keys.indexOf(key) === index)
  .sort();

// The shared issue catalog owns the diagnostic copy mappings. Every
// `admin.*` key it references — whether inside a t() call or a catalog
// record — must stay bilingual, so collect quoted literals broadly.
const catalogKeys = Array.from(
  catalogSource.matchAll(/['`](admin\.[a-z0-9_.]+)['`]/g)
)
  .map((match) => match[1])
  .filter((key, index, keys) => keys.indexOf(key) === index)
  .sort();

const workspaceKeys = [
  'admin.advanced.runtime_resolution_title',
  'admin.advanced.runtime_resolution_desc',
  'admin.advanced.capability_matrix_title',
  'admin.advanced.capability_matrix_desc',
  'admin.advanced.runtime_profiles_title',
  'admin.advanced.runtime_profiles_desc',
  'admin.advanced.recent_runtime_evidence_title',
  'admin.advanced.recent_runtime_evidence_desc',
  'admin.advanced.runtime_evidence_boundary',
  'admin.advanced.action_open_runtime_profiles',
];

const requiredKeys = [...new Set([...troubleshootingKeys, ...catalogKeys, ...workspaceKeys])].sort();

assert.ok(
  troubleshootingKeys.length >= 35,
  'Runtime diagnostics workspace must declare localized copy for health, anomaly, inspector, and evidence states'
);

for (const key of requiredKeys) {
  assert.match(
    enSource,
    new RegExp(`'${key.replaceAll('.', '\\.')}':`),
    `${key} must exist in the English translation dictionary`
  );
  assert.match(
    zhSource,
    new RegExp(`'${key.replaceAll('.', '\\.')}':`),
    `${key} must exist in the Simplified Chinese translation dictionary`
  );
}

assert.match(
  pageSource,
  /from '@\/features\/admin\/observability\/runtimeTelemetry'/,
  'Runtime diagnostics must reuse the shared telemetry normalization module'
);
assert.match(
  pageSource,
  /from '@\/features\/admin\/observability\/runtimeIssueCatalog'/,
  'Runtime diagnostics must reuse the shared diagnostic issue catalog'
);

// Presence-level scope markers; ordering and interaction behavior are
// owned by tests/e2e/admin-runtime-diagnostics-v2.spec.ts.
for (const [marker, message] of [
  [/searchParams\.get\('window'\)/, 'the observation window stays URL-addressable'],
  [/searchParams\.get\('focus'\)/, 'the focused anomaly stays URL-addressable'],
  [/recent_minutes: String\(windowHours \* 60\)/, 'telemetry requests stay derived from the URL window'],
  [/`\/api\/admin\/runtime-telemetry\?\$\{params\.toString\(\)\}`/, 'the page consumes the governed runtime telemetry route'],
  [/data-ui="runtime-diagnostic-issue-grid"/, 'anomalies render through the compact issue-card grid'],
  [/data-ui="runtime-data-integrity"/, 'the record-completeness caveat stays attached to the coverage tiles'],
  [/data-ui="runtime-diagnostic-metrics"/, 'the KPI tile row stays part of the diagnostics tier'],
  [/id="runtime-diagnostic-inspector"/, 'the selected anomaly keeps a dedicated inspector region'],
  [/id="runtime-evidence"/, 'the runtime evidence guide stays reachable'],
  [/id="evidence-lanes"/, 'evidence lanes stay reachable'],
  [/runtime-evidence-lane-list/, 'evidence lanes render through the shared lane list'],
]) {
  assert.match(pageSource, marker, `Runtime diagnostics: ${message}`);
}

assert.doesNotMatch(
  pageSource,
  /admin\.troubleshooting\.column_code/,
  'Low-frequency evidence codes must stay out of the primary anomaly queue'
);

assert.doesNotMatch(
  pageSource,
  /advancedGroups|activeGroupKey|group_filter_label|Choose an evidence lane/,
  'Runtime diagnostics must not keep a fake one-group catalog filter or static first-entry focus'
);

assert.doesNotMatch(
  pageSource,
  /createCheckout|paymentIntent|invoice_create|wordpress_write|auto_apply|publish_to_wordpress|registerAbility|workflowRegistry|routerEditor|promptEditor/,
  'Advanced troubleshooting must remain a read-only evidence catalog, not a mutation or control-plane surface'
);

assert.match(
  i18nSource,
  /'admin\.nav_agent_feedback': 'Agent 反馈质量'/,
  'Agent Feedback advanced card title must provide Simplified Chinese copy'
);

assert.match(
  i18nSource,
  /'admin\.advanced\.action_view_agent_feedback': '查看质量反馈'/,
  'Agent Feedback advanced card action must provide Simplified Chinese copy'
);
