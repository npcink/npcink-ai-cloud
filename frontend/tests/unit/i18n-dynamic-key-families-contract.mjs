import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import assert from 'node:assert/strict';
import { frontendRoot } from './_paths.mjs';

// Dynamic i18n key families.
//
// The bilingual catalog in `src/lib/i18n.ts` is referenced two ways: literal
// `t('full.key.path')` calls, which a static scan can see, and dynamically
// constructed keys such as `t(`status.${token}`)` or helper-mediated keys such
// as `aiText('model_usage_title')` where the prefix is prepended inside the
// helper. A catalog key under one of these family prefixes is NOT dead just
// because no literal full-path reference exists, so dead-key tooling must skip
// the whole family subtree.
//
// This contract keeps the family list honest in both directions:
//   1. every registered prefix still has an active dynamic construction site
//      in `frontend/src` (the list does not rot when call sites are removed);
//   2. every dynamically constructed `t(`prefix${...}`)` site in
//      `frontend/src` is covered by a registered prefix (new families cannot
//      be added silently);
//   3. every registered prefix still owns at least one catalog key in the
//      `en` block of `src/lib/i18n.ts`.
//
// Reuse: import { FAMILY_PREFIXES, FAMILY_SOURCES } from this module to keep
// dead-key analysis and the catalog in sync with one source of truth.

export const FAMILY_SOURCES = {
  'status.':
    'src/lib/status-display.ts translateStatusLabel and direct pages; normalizeStatusToken over backend status/health/severity/workflow tokens plus "unknown"',
  'portal.usage.credit_ledger_feature_':
    'src/app/portal/usage/page.tsx; entry.feature_key / top_feature_key from backend credit ledger groupings',
  'portal.usage.credit_events_component_':
    'src/app/portal/usage/page.tsx; component.key from backend credit event components',
  'portal.usage.credit_pack_':
    'PortalPaymentOrderHistory.tsx / PortalCreditPackDialog.tsx; pack.pack_id / order pack keys from backend credit pack catalog',
  'portal.support_topic_':
    'portal/support pages and admin support workspaces; SUPPORT_REQUEST_TOPICS and backend support request topics',
  'portal.support_status_':
    'portal/support pages; backend support request status enum (open/in_progress/resolved/closed)',
  'admin.support_status_':
    'SupportRequestsWorkspace.tsx and admin support request pages; SUPPORT_REQUEST_STATUS_FILTERS and backend status values',
  'admin.support_requests_risk_':
    'SupportRequestsWorkspace.tsx; SupportRequestRisk enum from backend operator risk projection',
  'admin.support_requests_waiting_on_':
    'SupportRequestsWorkspace.tsx; backend support request waiting_on values',
  'admin.home_readiness_scope_':
    'src/app/admin/page.tsx; overview.operatorProjection.readiness.failureScopes from backend',
  'admin.accounts.identity_':
    'src/app/admin/accounts/page.tsx, [accountId]/page.tsx, CustomerAccessPanel.tsx; identity_relationship_state enum from backend accounts',
  'admin.plugin_obs_action_':
    'src/app/admin/plugin-observability/page.tsx attentionActionLabel; bounded AttentionStateAction values (acknowledge/mute/...)',
  'admin.plans.state_':
    'src/app/admin/plans/page.tsx; plan state values from backend plans directory',
  'admin.troubleshooting.failure_reason_':
    'src/app/admin/troubleshooting/page.tsx; bounded set output_schema_invalid/invalid_request/timeout/unknown from provider failure reasons',
  'admin.troubleshooting.failure_step_':
    'src/app/admin/troubleshooting/page.tsx; bounded set schema/timeout/unknown from provider failure reasons',
  'admin.plugin_obs_attention_':
    'src/app/admin/plugin-observability/page.tsx attentionCopy; field title/detail with suffixes from attentionCodeSuffix over backend plugin_observability.* attention codes, plus *_default',
  'admin.plugin_obs_window_':
    'src/app/admin/plugin-observability/page.tsx; WINDOW_OPTIONS values 24/72/168',
  'admin.plugin_obs_col_':
    'src/app/admin/plugin-observability/page.tsx; problem/site table column key arrays',
  'admin.plugin_obs_severity_':
    'src/app/admin/plugin-observability/page.tsx; item.severity from backend attention items',
  'admin.plugin_obs_workflow_':
    'src/app/admin/plugin-observability/page.tsx; item.workflowStatus from backend attention items',
  'admin.subscriptions.risk_filter_':
    'src/app/admin/subscriptions/page.tsx; ALLOWED_RISK_FILTERS values',
  'admin.subscriptions.risk_':
    'src/app/admin/subscriptions/page.tsx; ALLOWED_RISK_LEVELS values from backend operator risk levels',
  'admin.runtime_profiles.':
    'src/app/admin/runtime-profiles/page.tsx copy(); suffix-only literals plus profileLabelKey(profile.profile_id) over the bounded runtime profile map',
  'admin.ai_resources.':
    'src/app/admin/ai-resources/page.tsx aiText(); suffix-only literals plus directory query fields, prefix prepended inside the helper',
  'admin.coverage.reason.':
    'src/app/admin/coverage/page.tsx translateReasonCode; backend coverage reason codes (service_*)',
  'admin.coverage.action.':
    'src/app/admin/coverage/page.tsx translateActionLabel; backend coverage action codes',
  'admin.coverage.reason_short.':
    'src/app/admin/coverage/page.tsx translateReasonShortLabel; backend coverage reason codes',
  'workflow_metadata.':
    'CloudWorkflowMetadataPanel.tsx translateWorkflowField/translateMetadataValue; metadataKey(workflowId) and backend metadata group/value pairs',
  'admin.editor_quality.issue_':
    'EditorAssistQualityPanel.tsx; candidate.code from backend editor assist quality findings',
  'admin.editor_quality.sample_':
    'EditorAssistQualityPanel.tsx; sampleStage from backend editor assist quality sampling stage',
  'admin.editor_quality.confidence_':
    'EditorAssistQualityPanel.tsx; candidate.confidence from backend editor assist quality findings',
  'admin.editor_quality.persistence_':
    'EditorAssistQualityPanel.tsx; candidate.persistence from backend editor assist quality findings',
  'admin.editor_quality.task_':
    'EditorAssistQualityPanel.tsx; candidate.taskKey from backend editor assist quality findings',
  'admin.editor_quality.action_':
    'EditorAssistQualityPanel.tsx; candidate.nextAction from backend editor assist quality findings',
};

export const FAMILY_PREFIXES = Object.keys(FAMILY_SOURCES).sort();

const srcRoot = join(frontendRoot, 'src');
const i18nSource = readFileSync(join(srcRoot, 'lib/i18n.ts'), 'utf8');

function collectSourceFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      results.push(...collectSourceFiles(fullPath));
      continue;
    }
    const extension = extname(fullPath);
    if (extension === '.ts' || extension === '.tsx') {
      results.push(fullPath);
    }
  }
  return results;
}

const sourceFiles = collectSourceFiles(srcRoot).filter(
  (filePath) => !filePath.endsWith(join('lib', 'i18n.ts'))
);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Every `t(`literal-prefix${...`) template construction in frontend/src.
// The prefix is the literal text before the FIRST interpolation (literal
// catalog prefixes never contain "$"); templates without interpolation do
// not construct keys dynamically and are ignored.
const dynamicConstructionPrefixes = new Map();
const constructionPattern = /\bt\(\s*`([^`$]*)\$\{/g;
for (const filePath of sourceFiles) {
  const source = readFileSync(filePath, 'utf8');
  for (const match of source.matchAll(constructionPattern)) {
    const prefix = match[1];
    if (!prefix) {
      assert.fail(
        `${filePath} constructs t() keys with no literal prefix; every dynamic key family needs a registrable literal prefix`
      );
    }
    if (!dynamicConstructionPrefixes.has(prefix)) {
      dynamicConstructionPrefixes.set(prefix, []);
    }
    dynamicConstructionPrefixes.get(prefix).push(filePath);
  }
}

// 1. Every registered prefix keeps at least one active construction site.
for (const prefix of FAMILY_PREFIXES) {
  const sitePattern = new RegExp(
    `t\\(\\s*\`${escapeRegExp(prefix)}\\$\\{`
  );
  const sites = sourceFiles.filter((filePath) =>
    sitePattern.test(readFileSync(filePath, 'utf8'))
  );
  assert.ok(
    sites.length > 0,
    `family prefix ${prefix} has no dynamic construction site left in frontend/src; remove it from FAMILY_PREFIXES or restore its construction`
  );
}

// 2. Every dynamically constructed prefix is covered by a registered family.
for (const [prefix, sites] of dynamicConstructionPrefixes) {
  const covered = FAMILY_PREFIXES.some(
    (registered) => prefix === registered || prefix.startsWith(registered)
  );
  assert.ok(
    covered,
    `dynamic t() construction with prefix "${prefix}" (${sites[0]}) is not covered by any registered family prefix; register it in FAMILY_SOURCES before adding catalog keys for it`
  );
}

// 3. Every registered prefix still owns at least one en catalog key.
const enBlockStart = i18nSource.indexOf('  en: {');
const zhBlockStart = i18nSource.indexOf("  'zh-CN': {");
assert.ok(enBlockStart > 0, 'i18n catalog must contain the en block');
assert.ok(zhBlockStart > enBlockStart, 'i18n catalog must contain the zh-CN block');
const enBlock = i18nSource.slice(enBlockStart, zhBlockStart);
for (const prefix of FAMILY_PREFIXES) {
  const keyPattern = new RegExp(`^\\s*'${escapeRegExp(prefix)}[^']*':`, 'm');
  assert.ok(
    keyPattern.test(enBlock),
    `family prefix ${prefix} owns no catalog key in the en block; the family and the catalog have drifted apart`
  );
}

console.log(
  `i18n_dynamic_key_families_contract: ok (${FAMILY_PREFIXES.length} families, ` +
    `${dynamicConstructionPrefixes.size} distinct construction prefixes)`
);
