import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');
const pageSource = read('src/app/admin/ai-resources/page.tsx');
const externalServicesSource = read('src/app/admin/external-services/page.tsx');
const vectorSettingsSource = read('src/app/admin/vector-settings/page.tsx');
const layoutSource = read('src/app/admin/layout.tsx');
const toolbarSource = read('src/components/admin/SupplierToolbar.tsx');
const tablesSource = read('src/components/admin/SupplierConnectionTables.tsx');
const tableFrameSource = read('src/components/admin/AdminDataTableFrame.tsx');
const providerWorkbenchStateSource = read(
  'src/features/admin/ai-resources/provider-workbench-state.ts'
);
const providerPresetsSource = read(
  'src/features/admin/ai-resources/provider-presets.ts'
);
const i18nSource = read('src/lib/i18n.ts');
const aiResourcesTranslationSource = i18nSource
  .split('\n')
  .filter((line) => line.includes("'admin.ai_resources."))
  .join('\n');

const aiResourcesNavIndex = layoutSource.indexOf("href: '/admin/ai-resources'");
const externalServicesNavIndex = layoutSource.indexOf("href: '/admin/external-services'");
const vectorSettingsNavIndex = layoutSource.indexOf("href: '/admin/vector-settings'");
const diagnosticsNavIndex = layoutSource.indexOf("href: '/admin/troubleshooting'");
const runtimeProfilesNavIndex = layoutSource.indexOf("href: '/admin/runtime-profiles'");

assert.ok(aiResourcesNavIndex >= 0, 'Model suppliers must have a primary admin navigation entry');
assert.ok(externalServicesNavIndex > aiResourcesNavIndex, 'Search and images must follow model suppliers');
assert.ok(vectorSettingsNavIndex > externalServicesNavIndex, 'Vector settings must follow search and images');
assert.ok(runtimeProfilesNavIndex > vectorSettingsNavIndex, 'Hosted runtime profiles must follow vector settings');
assert.ok(diagnosticsNavIndex > runtimeProfilesNavIndex, 'Runtime diagnostics must follow hosted runtime profiles');
assert.ok(diagnosticsNavIndex > vectorSettingsNavIndex, 'Runtime diagnostics must remain the final runtime-plane entry');
assert.match(layoutSource, /href: '\/admin\/ai-resources'[\s\S]*fallback: 'Model Suppliers'/);
assert.match(layoutSource, /href: '\/admin\/external-services'[\s\S]*fallback: 'Search & Images'/);
assert.match(i18nSource, /'admin\.nav_ai_resources': '模型供应商'/);
assert.match(i18nSource, /'admin\.nav_external_services': '搜索与图片'/);
assert.match(i18nSource, /'admin\.ai_resources\.title': '模型供应商'/);

assert.match(pageSource, /<BackofficePageHeader[\s\S]*primaryAction=\{\([\s\S]*summaryItems=\{\[/);
assert.match(pageSource, /openNewProviderConnection[\s\S]*action_add_model_supplier/);
assert.match(pageSource, /<ModelSupplierTable[\s\S]*toolbar=\{\([\s\S]*<SupplierToolbar/);
assert.doesNotMatch(pageSource, /<SupplierSummaryCards/);
assert.match(pageSource, /<ModelSupplierTable[\s\S]*connections=\{aiSupplierConnections\}/);
assert.match(pageSource, /href="\/admin\/runtime-profiles"[\s\S]*action_open_runtime_profiles/);
assert.match(pageSource, /modelFeatureLabel/);
assert.match(pageSource, /hosted runtime profile candidate chains/);
assert.doesNotMatch(pageSource, /abilityModelFeatureLabel|ability-model routing|new routing choices/i);
assert.doesNotMatch(
  aiResourcesTranslationSource,
  /ability-model routing|能力-模型路由|能力路由只能|模型路由和 WordPress|新的路由选择/i,
  'Model suppliers copy must use hosted runtime profile vocabulary instead of the retired ability-model routing boundary'
);
assert.match(pageSource, /supplierCategory\(connection\) === 'ai'/);
assert.match(pageSource, /connection\.kind === 'embedding_provider'/);
assert.doesNotMatch(pageSource, /connection\.capability_ids\.includes\('embedding'\)/);
assert.doesNotMatch(pageSource, /CAPABILITY_PROVIDER_TEMPLATES|CapabilityProviderTemplate|CapabilitySupplierTable/);
assert.doesNotMatch(pageSource, /isCapabilityProviderForm|capabilityAddDialogOpen|supplierTypeFilter/);
assert.doesNotMatch(pageSource, /action_add_capability_supplier|capability_channel_form|capability_diagnostics/);
assert.doesNotMatch(pageSource, /runtime-telemetry|RuntimeTelemetrySummary|provider_model_health|capability_matrix/);
assert.doesNotMatch(pageSource, /providerConnectionForm\.(priority|note)|field_channel_priority|field_channel_note/);
assert.match(pageSource, /buildProviderConnectionForm\(connection, providerPreset\)/);
assert.match(providerWorkbenchStateSource, /imageResponseFormat: String\(connection\.config\?\.image_response_format \|\| ''\)/);
assert.match(providerWorkbenchStateSource, /imageOutputHosts: Array\.isArray\(connection\.config\?\.image_output_hosts\)/);
assert.match(pageSource, /image_response_format: providerConnectionForm\.imageResponseFormat/);
assert.match(pageSource, /image_output_hosts: imageOutputHosts/);
assert.match(pageSource, /providerConnectionForm\.imageResponseFormat === 'url' && !imageOutputHosts\.length/);
assert.match(pageSource, /imageOutputHostsAreExact\(imageOutputHosts\)/);
assert.match(pageSource, /Connection testing does not prove image delivery/);
assert.match(pageSource, /URL mode accepts exact hosts only; no scheme, path, port, or wildcard/);
assert.match(pageSource, /data-ui="model-visibility-toolbar"/);
assert.match(pageSource, /data-ui="model-maintenance-table"/);
assert.match(pageSource, /providerWorkbenchSection === 'connection'/);
assert.match(pageSource, /role="tab"[\s\S]*workbench_connection_tab/);
assert.match(pageSource, /role="tab"[\s\S]*workbench_models_tab/);
assert.match(pageSource, /providerFormMode === 'edit'[\s\S]*provider_type_locked_hint/);
assert.match(pageSource, /providerConnectionForm\.imageResponseFormat === 'url'[\s\S]*rowId="image-output-hosts"/);
assert.match(pageSource, /modelMoreFiltersOpen[\s\S]*action_more_filters/);
assert.match(pageSource, /<details data-ui="model-maintenance-table"/);
assert.match(pageSource, /data-ui="model-clear-all-request"/);
assert.match(pageSource, /clear_all_models_confirmation[\s\S]*data-ui="model-clear-all-confirm"/);
assert.match(pageSource, /data-ui="model-filtered-enable-request"/);
assert.match(pageSource, /data-ui="model-filtered-disable-request"/);
assert.match(pageSource, /filtered_models_batch_confirmation[\s\S]*data-ui="model-filtered-batch-confirm"/);
assert.match(pageSource, /model_reference_compact_partial/);
assert.match(pageSource, /catalog_model_status_upstream_available/);
assert.match(providerPresetsSource, /id: 'ollama'[\s\S]*https:\/\/docs\.ollama\.com\/api\/openai-compatibility/);
assert.match(providerPresetsSource, /connection\.metadata\?\.website_url/);
assert.doesNotMatch(pageSource, /model_visibility_more_operations[\s\S]*sm:absolute sm:right-0 sm:z-30/);
assert.match(i18nSource, /'admin\.ai_resources\.field_image_output_hosts': '精确图片下载域名'/);
assert.match(i18nSource, /文本或模型目录连接测试通过，不代表生成图片一定可以交付/);
assert.match(i18nSource, /不能包含协议、路径、端口或通配符/);

assert.doesNotMatch(toolbarSource, /action_add_model_supplier|onAddModelSupplier/);
assert.match(toolbarSource, /data-ui="supplier-directory-toolbar"/);
assert.match(toolbarSource, /sm:w-\[30rem\] xl:w-\[34rem\]/);
assert.doesNotMatch(toolbarSource, /SupplierTypeFilter|supplierTypeFilter|action_add_capability_supplier/);
assert.match(tablesSource, /export function ModelSupplierTable/);
assert.match(tablesSource, /headerActions=\{toolbar\}/);
assert.match(tablesSource, /className="btn btn-secondary btn-sm shrink-0 whitespace-nowrap"/);
assert.match(tablesSource, /connection\.verification_status === 'passed'/);
assert.match(tablesSource, /connection\.attention_reasons/);
assert.match(tablesSource, /role="menuitem"[\s\S]*action_delete_connection/);
assert.doesNotMatch(tablesSource, /TABLE_DELETE_BUTTON_CLASS/);
assert.doesNotMatch(tablesSource, /CapabilitySupplierTable|capability-supplier-directory|CapabilityProviderCategory/);
assert.match(tableFrameSource, /headerActions\?: ReactNode/);

for (const providerId of ['tavily', 'bocha', 'doubao_search', 'apify', 'zhihu', 'jina_reader', 'unsplash', 'pixabay', 'pexels']) {
  assert.match(externalServicesSource, new RegExp(`id: '${providerId}'`), `${providerId} must remain a fixed external-service option`);
}
for (const [providerId, credentialName, credentialHelpUrl] of [
  ['tavily', 'API Key', 'https://app.tavily.com/home'],
  ['bocha', 'API Key', 'https://open.bochaai.com/dashboard'],
  ['doubao_search', 'API Key', 'https://console.volcengine.com/search-infinity/api-key'],
  ['apify', 'API Token', 'https://console.apify.com/settings/integrations'],
  ['zhihu', 'Access Secret', 'https://developer.zhihu.com/docs'],
  ['unsplash', 'Access Key', 'https://unsplash.com/oauth/applications'],
  ['pixabay', 'API Key', 'https://pixabay.com/api/docs/'],
  ['pexels', 'API Key', 'https://www.pexels.com/api/key/'],
]) {
  assert.ok(
    externalServicesSource.includes(
      `{ id: '${providerId}', category: `
    ) &&
      externalServicesSource
        .split('\n')
        .some(
          (line) =>
            line.includes(`{ id: '${providerId}', category: `) &&
            line.includes(`credentialName: '${credentialName}'`) &&
            line.includes(`credentialHelpUrl: '${credentialHelpUrl}'`)
        ),
    `${providerId} must keep its verified ${credentialName} management URL`
  );
}
assert.match(externalServicesSource, /type ServiceCategory = 'search' \| 'image'/);
assert.match(externalServicesSource, /role: 'primary'/);
assert.match(externalServicesSource, /role: 'enhancer'[\s\S]*secretless: true/);
assert.match(externalServicesSource, /role: 'parallel'/);
assert.match(externalServicesSource, /One primary \+ Reader enhancement/);
assert.match(externalServicesSource, /Enabled sources in parallel/);
assert.match(externalServicesSource, /data-external-service-id=\{option\.id\}/);
assert.match(externalServicesSource, /AdminDataTableFrame[\s\S]*dataUi="external-service-directory"/);
assert.match(
  externalServicesSource,
  /<BackofficePageHeader[\s\S]*secondaryAction=\{<Link href="\/admin\/troubleshooting"[\s\S]*summaryItems=\{\[/,
  'External services must keep diagnostics and status in a compact operational header'
);
assert.match(externalServicesSource, /AdminWorkbenchDialog[\s\S]*width="compact"/);
assert.match(externalServicesSource, /AdminConfigurationTable[\s\S]*AdminConfigurationRow/);
assert.match(externalServicesSource, /rowId="service-url"[\s\S]*editingOption\.baseUrl/);
assert.match(externalServicesSource, /AdminCredentialField/);
assert.match(externalServicesSource, /data-external-credential-link=\{editingOption\.id\}/);
assert.match(externalServicesSource, /target="_blank"/);
assert.match(externalServicesSource, /rel="noreferrer noopener"/);
assert.doesNotMatch(externalServicesSource, /AdminSettingsDisclosure/);
assert.match(externalServicesSource, /Clear credential and disable/);
assert.match(externalServicesSource, /Clear and disable/);
assert.match(externalServicesSource, /\/api\/admin\/provider-connections/);
assert.match(externalServicesSource, /metadata: \{ ui_source: 'external_services', service_role: option\.role \}/);
assert.doesNotMatch(externalServicesSource, /priority|channel_note|Add capability supplier|Delete supplier/);

assert.match(vectorSettingsSource, /admin\.vector_settings\.configuration_title/);
assert.match(vectorSettingsSource, /AdminConfigurationTable[\s\S]*AdminCredentialField[\s\S]*AdminSettingsDisclosure/);
assert.match(vectorSettingsSource, /site-knowledge-vector-profile\/vector-store/);
assert.match(vectorSettingsSource, /site_knowledge_zh_v1/);
assert.doesNotMatch(vectorSettingsSource, /rerank_provider|Result reranking|结果重排/);
assert.doesNotMatch(vectorSettingsSource, /field_channel_priority|field_channel_note/);

for (const retiredKey of [
  'action_add_capability_supplier',
  'capability_add_dialog_title',
  'capability_channel_form_title',
  'capability_directory_title',
  'supplier_filter_capability',
]) {
  assert.doesNotMatch(i18nSource, new RegExp(`admin\\.ai_resources\\.${retiredKey}`), `${retiredKey} must not remain in translations`);
}

for (const retiredPage of ['web-search', 'image-sources', 'wordpress-ai-routing']) {
  assert.equal(
    existsSync(resolve(process.cwd(), `src/app/admin/${retiredPage}/page.tsx`)),
    false,
    `${retiredPage} must not return as a parallel admin configuration surface`
  );
}

console.log('admin_ai_resources_contract: ok');
