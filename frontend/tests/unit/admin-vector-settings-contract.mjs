import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromFrontendRoot } from './_paths.mjs';

const page = readFileSync(fromFrontendRoot('src/app/admin/vector-settings/page.tsx'), 'utf8');
const layout = readFileSync(fromFrontendRoot('src/app/admin/layout.tsx'), 'utf8');

assert.match(
  page,
  /data-page-model="configuration"/,
  'Vector settings must use the configuration page model'
);
assert.match(
  page,
  /AdminConfigurationTable[\s\S]*data-vector-section="configuration"[\s\S]*rowId="fixed-profile"[\s\S]*rowId="provider-key"[\s\S]*rowId="zilliz-endpoint"[\s\S]*rowId="zilliz-token"[\s\S]*rowId="fixed-collection"/,
  'Vector settings must keep fixed facts and both connection credentials in one continuous configuration table'
);
assert.match(
  page,
  /admin\.vector_settings\.model[\s\S]*BAAI\/bge-m3/,
  'Vector settings must render the localized fixed model fact'
);
assert.match(
  page,
  /BAAI\/bge-m3[\s\S]*1024[\s\S]*COSINE/,
  'Vector settings must preserve the fixed dimensions and metric'
);
assert.match(
  page,
  /AdminCredentialField[\s\S]*SiliconFlow API Key[\s\S]*AdminCredentialField[\s\S]*Zilliz Token/,
  'Vector settings must use the shared credential field for both saved secrets'
);
assert.doesNotMatch(
  page,
  /type="password"|type={'password'}/,
  'Vector settings must not keep route-local password inputs'
);
assert.match(
  page,
  /profile\?\.provider\.configured \? 'edit' : 'create'[\s\S]*unchangedLabel[\s\S]*profile\?\.vector_store\.token_configured \? 'edit' : 'create'[\s\S]*unchangedLabel/,
  'Saved credentials must use replacement mode and never prefill their original values'
);
assert.match(
  page,
  /site-knowledge-vector-profile\/vector-store/,
  'Vector storage must save through the dedicated verified profile endpoint'
);
assert.match(
  page,
  /data-vector-section="validation"[\s\S]*AdminConfigurationTable[\s\S]*连接检测[\s\S]*索引检测[\s\S]*真实检索/,
  'Vector settings must distinguish connection, index, and live retrieval evidence in a validation table'
);
assert.match(
  page,
  /site-knowledge-vector-profile\/index-rebuilds[\s\S]*rebuild_site_knowledge_index/,
  'Vector settings must rebuild through the fixed server-owned profile endpoint'
);
assert.match(
  page,
  /不会写入 WordPress[\s\S]*普通 AI 积分[\s\S]*重建向量索引/,
  'The rebuild action must preserve the Cloud and metering boundary in operator copy'
);
assert.match(
  page,
  /embedding_space_mismatch[\s\S]*全量 Site Knowledge 同步/,
  'Mixed embedding spaces must direct the operator to a clean full sync instead of silent migration'
);
assert.match(
  page,
  /site_knowledge_vector_profile\.zilliz_sdk_unavailable[\s\S]*admin\.vector_settings\.zilliz_sdk_unavailable/,
  'Vector storage must distinguish a missing server SDK from external connection failures'
);
assert.match(
  page,
  /admin\.vector_settings\.reindex_policy[\s\S]*admin\.vector_settings\.reindex_required/,
  'Vector settings must retain the fixed profile reindex policy'
);
assert.match(
  page,
  /\/admin\/vector-observability/,
  'Vector settings must link to the existing read-only diagnostics surface'
);
assert.match(
  page,
  /<BackofficeConfigurationHeader[\s\S]*secondaryAction=\{[\s\S]*\/admin\/vector-observability[\s\S]*summaryItems=\{\[/,
  'Vector settings must keep diagnostics and status in a compact runtime-style header'
);
assert.match(
  page,
  /AdminSettingsDisclosure[\s\S]*vector-settings-technical-details[\s\S]*admin\.vector_settings\.boundary/,
  'Vector settings must keep low-frequency technical detail and the Cloud boundary behind the shared disclosure'
);
assert.match(
  page,
  /btn btn-primary[\s\S]*saveConfiguration[\s\S]*btn btn-secondary[\s\S]*rebuildIndex/,
  'Save must be the only primary configuration action and index work must remain secondary'
);
assert.doesNotMatch(
  page,
  /priority|channel note|通道备注/,
  'Vector settings must not reintroduce channel priority or notes'
);
assert.doesNotMatch(
  page,
  /rerank_provider|Result reranking|结果重排|store_postgres|data-vector-group/,
  'Vector settings must not restore the retired multi-provider configuration surface'
);
assert.match(
  layout,
  /href: '\/admin\/vector-settings'[\s\S]*activePrefixes: \['\/admin\/vector-settings'\]/,
  'Admin navigation must expose Vector Settings under Runtime Plane'
);

console.log('admin_vector_settings_contract: ok');
