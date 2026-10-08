import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromFrontendRoot } from './_paths.mjs';
const read = p => readFileSync(fromFrontendRoot(p), 'utf8');
const backend = read('../app/domain/advisor/service.py');
const presentation = read('src/features/admin/ai-advisor/advisor-presentation.ts');
const actions = new Set([...backend.matchAll(/_action\("([^"]+)"\)/g)].map(m => m[1]));
for (const code of actions) assert.ok(presentation.includes(`${code}:`), `missing backend action mapping: ${code}`);
const siteActionSource = backend.split('def _site_diagnostic_action_id(', 2)[1].split('\ndef ', 1)[0];
const dynamicActions = new Set([...siteActionSource.matchAll(/return "([^"]+)"/g)].map(m => m[1]));
const genericSiteActions = new Set([
  'inspect_cloud_api_key_connection', 'inspect_plugin_observability_attention',
  'inspect_media_failures_and_source_assets', 'inspect_site_knowledge_index_and_refresh',
  'inspect_runtime_runs_provider_health', 'review_usage_quota_and_entitlement',
  'verify_cloud_addon_connection_and_event_flush', 'inspect_site_monitoring_detail',
]);
for (const code of dynamicActions) assert.ok(presentation.includes(`${code}:`) || genericSiteActions.has(code), `unreviewed dynamic action: ${code}`);
assert.deepEqual(dynamicActions, genericSiteActions);
assert.match(read('src/app/admin/ai-advisor/page.tsx'), /if \(!entry\) return \{[\s\S]*action_unknown[\s\S]*action_unknown_detail/);
const translations = read('src/lib/i18n.ts');
for (const copy of new Set([...presentation.matchAll(/copy: '([^']+)'/g)].map(m => m[1]))) {
  for (const suffix of ['', '_detail']) {
    const key = `admin.ai_advisor.action_${copy}${suffix}`;
    assert.equal(translations.split(`'${key}':`).length - 1, 2, `${key} needs both locales`);
  }
}
for (const key of ['last_24h', 'last_7d']) assert.equal(translations.split(`'admin.ai_resources.provider_health_window_${key}':`).length - 1, 2);
console.log(`advisor_action_contract: ok (${actions.size} mapped static codes; ${dynamicActions.size} site actions use reviewed generic fallback; two locales)`);
