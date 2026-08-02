import { expect, test, type Page } from '@playwright/test';
import {
  buildAdminApiEnvelope,
  buildAdminApiErrorEnvelope,
  installAdminMocks,
} from './helpers/admin-operator-fixture';
import {
  observeAdminBrowserEvidence,
  writeAdminVisualReceipt,
} from './helpers/admin-visual-receipt';

const connections = [
  {
    connection_id: 'model_attention',
    provider_id: 'minimax',
    display_name: 'MiniMax',
    kind: 'minimax',
    enabled: true,
    configured: false,
    status: 'missing_secret',
    configuration_status: 'missing_secret',
    verification_status: 'failed',
    attention_required: true,
    attention_reasons: ['missing_secret', 'last_test_failed'],
    base_url: 'https://api.minimax.io/v1',
    capability_ids: ['text_generation'],
    runtime_profile_ids: ['text.ai'],
    model_ids: ['MiniMax-M2.1'],
    last_tested_at: '2026-07-10T08:00:00Z',
    managed_by: 'cloud_provider_connections',
    metadata: {},
  },
  {
    connection_id: 'model_ready',
    provider_id: 'openai',
    display_name: 'MQZJ',
    kind: 'openai_compatible',
    enabled: true,
    configured: true,
    status: 'ready',
    configuration_status: 'ready',
    verification_status: 'passed',
    attention_required: false,
    attention_reasons: [],
    base_url: 'https://new-api.example.test/v1',
    capability_ids: ['text_generation', 'image_generation'],
    runtime_profile_ids: ['text.ai'],
    model_ids: ['gpt-5.5', 'gpt-5.4-mini'],
    config: { image_response_format: 'b64_json' },
    last_tested_at: '2026-07-12T00:25:00Z',
    managed_by: 'cloud_provider_connections',
    metadata: {},
  },
  {
    connection_id: 'model_disabled',
    provider_id: 'tei',
    display_name: 'TEI',
    kind: 'tei',
    enabled: false,
    configured: true,
    status: 'disabled',
    base_url: 'https://tei.example.test',
    capability_ids: ['text_generation'],
    runtime_profile_ids: ['text.ai'],
    model_ids: ['bge-m3'],
    managed_by: 'cloud_provider_connections',
    metadata: {},
  },
  {
    connection_id: 'search_ready',
    provider_id: 'tavily',
    display_name: 'Tavily Search',
    kind: 'web_search_provider',
    enabled: true,
    configured: true,
    status: 'ready',
    base_url: 'https://api.tavily.com',
    capability_ids: ['web_search'],
    runtime_profile_ids: ['search.ai'],
    last_tested_at: '2026-07-12T01:00:00Z',
    managed_by: 'cloud_provider_connections',
    metadata: {},
  },
  {
    connection_id: 'vector_attention',
    provider_id: 'qdrant',
    display_name: 'Qdrant',
    kind: 'vector_store_provider',
    enabled: true,
    configured: false,
    status: 'missing_secret',
    base_url: 'https://qdrant.example.test',
    capability_ids: ['vector_store'],
    runtime_profile_ids: ['vector.ai'],
    managed_by: 'cloud_provider_connections',
    metadata: {},
  },
  {
    connection_id: 'embedding_ready',
    provider_id: 'siliconflow',
    display_name: 'SiliconFlow Embedding',
    kind: 'embedding_provider',
    enabled: true,
    configured: true,
    status: 'ready',
    base_url: 'https://api.siliconflow.cn/v1',
    capability_ids: ['embedding'],
    runtime_profile_ids: ['embed.default'],
    managed_by: 'cloud_provider_connections',
    metadata: {},
  },
];

async function installProviderDirectoryHarness(page: Page) {
  await installAdminMocks(page);
  let requestCount = 0;
  await page.route('**/api/admin/ai-resources', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    requestCount += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        buildAdminApiEnvelope({
          surface: 'admin_ai_resources',
          connections,
          capabilities: [],
          capability_matrix: [],
          runtime_resolution: [],
          feature_model_usage: [],
          runtime_profiles: [],
          boundary: {
            direct_wordpress_write: false,
            final_writes: 'excluded',
            secret_exposure: 'masked',
            not_a_control_plane: true,
          },
        })
      ),
    });
  });
  await page.route('**/api/admin/provider-connections/*/test', async (route) => {
    const connectionId = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-2) || '');
    const connection = connections.find((item) => item.connection_id === connectionId);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        buildAdminApiEnvelope({
          connection_id: connectionId,
          provider_id: connection?.provider_id || 'unknown',
          kind: connection?.kind || 'unknown',
          status: 'ready',
          stage: 'config_preflight',
          ok: true,
          error_code: '',
          message: 'provider runtime configuration is present',
          tested_at: '2026-07-12T02:00:00Z',
          receipt: {
            event_kind: 'provider_connection.test',
            scope_kind: 'provider_connection',
            scope_id: connectionId,
            outcome: 'succeeded',
          },
        })
      ),
    });
  });
  await page.route('**/api/admin/provider-connections', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    const payload = route.request().postDataJSON() as { connection_id?: string; provider_id?: string };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        buildAdminApiEnvelope({
          connection_id: payload.connection_id || 'openai_compatible',
          provider_id: payload.provider_id || 'openai',
          receipt: {
            event_kind: 'provider_connection.save',
            scope_kind: 'provider_connection',
            scope_id: payload.connection_id || 'openai_compatible',
            outcome: 'succeeded',
          },
        })
      ),
    });
  });
  return { getRequestCount: () => requestCount };
}

test('model supplier table keeps PC operations and filters in one workspace', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  const harness = await installProviderDirectoryHarness(page);
  await page.goto('/admin/ai-resources');

  await expect(page.locator('[data-ui="backoffice-page-header"]')).toBeVisible();
  await expect(page.locator('[data-ui="model-supplier-directory"] [data-connection-id]')).toHaveCount(3);
  await expect(page.locator('[data-connection-id="embedding_ready"]')).toHaveCount(0);
  await expect(page.locator('[data-ui="model-supplier-table"]')).toBeVisible();
  await expect(page.locator('[data-ui="supplier-inspector"]')).toHaveCount(0);
  await expect(page.locator('aside.admin-sidebar')).toHaveCSS('width', '208px');
  await expect(page.locator('[data-ui="model-supplier-directory"]')).toHaveScreenshot('admin-provider-table-pc.png', {
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
    maxDiffPixelRatio: 0.015,
  });
  expect(harness.getRequestCount()).toBe(1);
  await testInfo.attach('p4-e03-admin-provider-runtime', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });

  const readyRow = page.locator('[data-connection-id="model_ready"]');
  await expect(readyRow.locator('[data-ui="supplier-name"]')).toHaveText('MQZJ');
  await expect(readyRow.getByRole('button', { name: 'MQZJ' })).toHaveCount(0);
  await readyRow.getByRole('button', { name: /^Configure$|^配置$/i }).click();
  await expect(page).toHaveURL(/focus=model_ready/);
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('[data-connection-id="model_ready"]')).toHaveAttribute('data-selected', 'true');

  await expect(page.getByLabel(/^Status$|^状态$/i)).toHaveValue('all');
  await page.getByLabel(/^Status$|^状态$/i).selectOption('ready');
  await expect(page).toHaveURL(/status=ready/);
  await expect(page.locator('[data-ui="model-supplier-directory"] [data-connection-id]')).toHaveCount(1);
  await expect(page.locator('[data-connection-id="model_ready"]')).toBeVisible();
  expect(await page.locator('[data-ui="model-supplier-directory"]').evaluate((element) => element.getBoundingClientRect().top)).toBeLessThan(420);

  await page.getByLabel(/^Status$|^状态$/i).selectOption('attention');
  await expect(page).toHaveURL(/status=attention/);
  await expect(page.locator('[data-connection-id="model_attention"]')).toBeVisible();

  await page.getByLabel(/^Status$|^状态$/i).selectOption('missing_secret');
  await page.getByPlaceholder(/Name, provider, model, capability|名称、provider、模型、能力/i).fill('no-such-provider');
  await expect(page.locator('[data-ui="admin-empty-state"]')).toBeVisible();
  await page.getByRole('button', { name: /Clear filters|清除筛选/i }).click();
  await expect(page.locator('[data-ui="model-supplier-directory"] [data-connection-id]')).toHaveCount(3);
});

test('model supplier workspace does not expose capability-service controls', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installProviderDirectoryHarness(page);
  await page.goto('/admin/ai-resources');

  await expect(page.getByRole('button', { name: /Add model supplier|添加模型供应商/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Add capability supplier|添加能力供应商/i })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /Capability suppliers|能力供应商/i })).toHaveCount(0);
  await expect(page.locator('[data-ui="capability-supplier-directory"]')).toHaveCount(0);
  await expect(page.locator('[data-connection-id="search_ready"]')).toHaveCount(0);
});

test('supplier row keeps test feedback nearby and deletion under more actions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await installProviderDirectoryHarness(page);
  await page.goto('/admin/ai-resources?focus=model_ready');

  const supplierRow = page.locator('[data-connection-id="model_ready"]');
  await supplierRow.getByRole('button', { name: /^Test$|^测试$/i }).click();
  const feedbackRow = page.locator('[data-feedback-for="model_ready"]');
  await expect(feedbackRow.getByRole('status').filter({ hasText: /Test passed|连接测试通过/i })).toBeVisible();

  const rowHeightBefore = await supplierRow.evaluate((element) => element.getBoundingClientRect().height);
  const moreButton = supplierRow.getByRole('button', { name: /More actions|更多操作/i });
  await moreButton.click();
  await expect(supplierRow.getByRole('menu')).toBeVisible();
  await expect(supplierRow).toHaveCSS('height', `${rowHeightBefore}px`);
  await page.keyboard.press('Escape');
  await expect(supplierRow.getByRole('menu')).toHaveCount(0);
  await expect(moreButton).toBeFocused();

  await moreButton.click();
  await expect(supplierRow.getByRole('menuitem')).toHaveCount(4);
  await supplierRow.getByRole('menuitem', { name: /Delete connection|删除连接/i }).click();
  await expect(feedbackRow.getByRole('alert').filter({ hasText: /removes this runtime connection|移除这条运行时连接/i })).toBeVisible();
  await expect(feedbackRow.getByRole('button', { name: /Confirm delete|确认删除/i })).toBeVisible();
  await feedbackRow.getByRole('button', { name: /^Cancel$|^取消$/i }).click();
  await expect(feedbackRow.getByRole('button', { name: /Confirm delete|确认删除/i })).toHaveCount(0);
});

test('failed supplier test keeps its canonical error and audit receipt', async ({ page }) => {
  await installProviderDirectoryHarness(page);
  await page.route('**/api/admin/provider-connections/model_attention/test', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        buildAdminApiErrorEnvelope(
          'provider credential is missing',
          'provider_connection.missing_secret',
          {
            connection_id: 'model_attention',
            provider_id: 'minimax',
            kind: 'minimax',
            status: 'missing_secret',
            stage: 'config_preflight',
            ok: false,
            error_code: 'provider_connection.missing_secret',
            message: 'provider credential is missing',
            tested_at: '2026-07-12T02:00:00Z',
            receipt: {
              event_kind: 'provider_connection.test',
              scope_kind: 'provider_connection',
              scope_id: 'model_attention',
              outcome: 'error',
            },
          }
        )
      ),
    });
  });
  await page.goto('/admin/ai-resources?focus=model_attention');

  const supplierRow = page.locator('[data-connection-id="model_attention"]');
  await supplierRow.getByRole('button', { name: /^Test$|^测试$/i }).click();
  await expect(page.locator('[data-feedback-for="model_attention"]').getByRole('alert')).toContainText(/provider credential is missing|供应商凭据缺失/i);
  await expect(page.getByText(/provider credential is missing|供应商凭据缺失/i).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Latest operation|最近操作/i })).toBeVisible();
});

test('provider configuration dialog supports PC keyboard entry, focus loop, and Escape recovery', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await installProviderDirectoryHarness(page);
  await page.goto('/admin/ai-resources');

  const addButton = page.getByRole('button', { name: /Add model supplier|添加模型供应商/i });
  await addButton.click();
  const dialog = page.getByRole('dialog', { name: /Add model supplier|添加模型供应商|Add provider|添加供应商/i });
  await expect(dialog).toBeVisible();

  const closeButton = dialog.getByRole('button', { name: /^Close$|^关闭$/i });
  await expect(closeButton).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: /Save and test(?: provider)?|保存并测试(?:供应商)?/i })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(addButton).toBeFocused();

});

test('editing a provider separates dense connection settings from model management', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await installProviderDirectoryHarness(page);
  await page.goto('/admin/ai-resources?focus=model_ready');

  const supplierRow = page.locator('[data-connection-id="model_ready"]');
  await supplierRow.getByRole('button', { name: /^Configure$|^配置$/i }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.admin-workbench-dialog')).toHaveCSS('max-width', '1152px');
  const configurationTable = dialog.getByRole('table', { name: /MQZJ configuration|MQZJ 配置/i });
  await expect(configurationTable).toBeVisible();
  await expect(configurationTable.locator('tbody tr')).toHaveCount(7);
  await expect(dialog.locator('[data-configuration-row="image-response-format"]')).toBeVisible();
  await expect(dialog.locator('[data-configuration-row="image-output-hosts"]')).toHaveCount(0);
  await dialog.getByLabel(/Provider image response|服务商图片返回方式/i).selectOption('url');
  await expect(dialog.locator('[data-configuration-row="image-output-hosts"]')).toBeVisible();
  await dialog.getByLabel(/Provider image response|服务商图片返回方式/i).selectOption('b64_json');
  await expect(dialog.getByLabel(/Provider type|服务商类型/i)).toHaveCount(0);
  await expect(dialog.locator('details[data-ui="provider-connection-settings"]')).toHaveCount(0);
  await expect(dialog.locator('details[data-ui="image-delivery-settings"]')).toHaveCount(0);
  await expect(dialog.getByRole('heading', { name: /Model visibility|模型可见性/i })).toHaveCount(0);
  await dialog.getByRole('tab', { name: /Model management|模型管理/i }).click();
  await expect(configurationTable).toHaveCount(0);
  await expect(dialog.getByRole('heading', { name: /Model visibility|模型可见性/i })).toBeVisible();
  await expect(dialog.locator('[data-ui="model-visibility-toolbar"]')).toBeVisible();
  await expect(dialog.locator('[data-ui="model-sync-primary"]')).toBeVisible();
  const moreFiltersButton = dialog.getByRole('button', { name: /More filters|更多筛选/i });
  await expect(moreFiltersButton).toBeVisible();
  await expect(dialog.getByText(/Show historical\/deprecated|显示历史\/废弃/i)).toHaveCount(0);
  await moreFiltersButton.click();
  await expect(dialog.getByText(/Show historical\/deprecated|显示历史\/废弃/i)).toBeVisible();
  await moreFiltersButton.click();
  const maintenanceDisclosure = dialog.locator('[data-ui="model-maintenance-table"]');
  await expect(maintenanceDisclosure).not.toHaveAttribute('open', '');
  await expect(dialog.locator('.admin-workbench-dialog')).toHaveScreenshot('admin-provider-workbench-pc.png', {
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
    maxDiffPixelRatio: 0.015,
  });

  await maintenanceDisclosure.locator('summary').click();
  const maintenanceTable = maintenanceDisclosure.getByRole('table');
  await expect(maintenanceTable).toBeVisible();
  await expect(maintenanceTable.locator('tbody tr')).toHaveCount(4);
  await dialog.locator('[data-ui="model-clear-all-request"]').click();
  await expect(dialog.locator('[data-ui="model-clear-all-confirm"]')).toBeVisible();
  await expect(dialog.getByText(/Disable all 2 currently enabled models|取消启用当前 2 个模型/i)).toBeVisible();
  await maintenanceTable.getByRole('button', { name: /^Cancel$|^取消$/i }).click();
  await expect(dialog.locator('[data-ui="model-clear-all-request"]')).toBeVisible();

  await dialog.getByRole('tab', { name: /Connection settings|连接设置/i }).click();
  const replaceCredentialButton = dialog.getByRole('button', { name: /Replace credential|替换凭据/i });
  await expect(replaceCredentialButton).toBeVisible();
  await expect(dialog.getByLabel(/API Key|Credential|凭据/i)).toHaveCount(0);
  await replaceCredentialButton.click();
  await expect(dialog.getByLabel(/API Key|Credential|凭据/i)).toBeVisible();

  await testInfo.attach('provider-workbench-dialog', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});

test('large model directories render one bounded page and reset pagination when searched', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await installProviderDirectoryHarness(page);
  const referenceItems = Array.from({ length: 60 }, (_, index) => ({
    source_id: 'models.dev',
    source_label: 'models.dev',
    provider_id: 'openai',
    provider_label: 'OpenAI',
    model_id: `catalog-model-${String(index + 1).padStart(2, '0')}`,
    display_name: `Catalog model ${index + 1}`,
    family: 'catalog',
    feature: 'text',
    status: 'active',
    modalities: { input: ['text'], output: ['text'] },
    capability_flags: {},
    context_window: 128000,
    output_limit: 8192,
    price: { input: 1, output: 2, unit: 'USD', billing_truth: false },
    source_updated_at: '2026-07-12T00:00:00Z',
    synced_at: '2026-07-12T00:00:00Z',
    is_deprecated: false,
    override_present: false,
  }));
  await page.route('**/api/admin/model-references?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiEnvelope({
        items: referenceItems,
        total: referenceItems.length,
        source_summary: [{
          source_id: 'models.dev',
          display_name: 'models.dev',
          source_url: 'https://models.dev',
          status: 'active',
          last_synced_at: '2026-07-12T00:00:00Z',
          last_error_code: '',
          last_error_message: '',
        }],
      })),
    });
  });
  await page.goto('/admin/ai-resources?focus=model_ready');
  const supplierRow = page.locator('[data-connection-id="model_ready"]');
  await supplierRow.getByRole('button', { name: /^Configure$|^配置$/i }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: /Model management|模型管理/i }).click();
  const directory = dialog.locator('[data-ui="model-visibility-directory"]');
  await expect(directory.locator('tbody tr')).toHaveCount(25);
  await expect(dialog.locator('[data-ui="model-visibility-pagination"]')).toContainText(/25.*62|62.*25/);
  await dialog.getByRole('button', { name: /^Next$|^下一页$/i }).click();
  await expect(dialog.locator('[data-ui="model-visibility-pagination"]')).toContainText(/2 \/ 3|第 2 \/ 3 页/);

  await dialog.getByPlaceholder(/model, family, provider|模型、系列、供应商/i).fill('catalog-model-60');
  await expect(directory.locator('tbody tr')).toHaveCount(1);
  await expect(dialog.locator('[data-ui="model-visibility-pagination"]')).toContainText(/1 \/ 1|第 1 \/ 1 页/);

  await dialog.locator('[data-ui="model-maintenance-table"] summary').click();
  await dialog.locator('[data-ui="model-filtered-enable-request"]').click();
  await expect(dialog.getByText(/enabled total will become 3|已启用总数为 3/i)).toBeVisible();
  await dialog.locator('[data-ui="model-filtered-batch-confirm"]').click();
  await expect(directory.locator('tbody tr').first()).toContainText(/Enabled|已启用/i);

  await dialog.locator('[data-ui="model-filtered-disable-request"]').click();
  await expect(dialog.getByText(/enabled total will become 2|已启用总数为 2/i)).toBeVisible();
  await dialog.locator('[data-ui="model-filtered-batch-confirm"]').click();
  await expect(directory.locator('tbody tr').first()).toContainText(/Not enabled|未启用/i);
});

test('save and test closes the dialog, uses a compact toast, and keeps the receipt near the toolbar', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await installProviderDirectoryHarness(page);
  await page.goto('/admin/ai-resources');

  await page.getByRole('button', { name: /Add model supplier|添加模型供应商/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/API Key|Credential|凭据/i).fill('test-secret');
  await dialog.getByRole('button', { name: /Save and test(?: provider)?|保存并测试(?:供应商)?/i }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: /saved and tested|已保存并完成测试/i })).toBeVisible();
  await expect(page.locator('main [role="status"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Latest operation|最近操作/i })).toBeVisible();
});

test('model supplier pilot emits the risk-tiered Admin visual receipt', async ({ page }, testInfo) => {
  const browserEvidence = observeAdminBrowserEvidence(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await installProviderDirectoryHarness(page);
  await page.route('**/api/admin/provider-connections/model_attention/test', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        buildAdminApiErrorEnvelope(
          'provider credential is missing',
          'provider_connection.missing_secret',
          {
            connection_id: 'model_attention',
            provider_id: 'minimax',
            kind: 'minimax',
            status: 'missing_secret',
            stage: 'config_preflight',
            ok: false,
            error_code: 'provider_connection.missing_secret',
            message: 'provider credential is missing',
            tested_at: '2026-07-12T02:00:00Z',
            receipt: {
              event_kind: 'provider_connection.test',
              scope_kind: 'provider_connection',
              scope_id: 'model_attention',
              outcome: 'error',
            },
          }
        )
      ),
    });
  });
  await page.goto('/admin/ai-resources');

  const directory = page.locator('[data-ui="model-supplier-directory"]');
  const readyRow = page.locator('[data-connection-id="model_ready"]');
  const attentionRow = page.locator('[data-connection-id="model_attention"]');
  await expect(directory).toBeVisible();
  await expect(page.getByRole('button', { name: /Add model supplier|添加模型供应商/i })).toHaveCount(1);
  await expect(readyRow).toContainText(/Ready|就绪/i);
  await expect(readyRow).toContainText(/Passed|通过/i);
  await expect(attentionRow.getByRole('button', { name: /^Configure$|^配置$/i })).toBeVisible();
  await expect(attentionRow.getByRole('button', { name: /^Test$|^测试$/i })).toBeVisible();

  await expect(readyRow.locator('[data-ui="supplier-name"]')).toHaveText('MQZJ');
  await expect(readyRow.getByRole('button', { name: 'MQZJ' })).toHaveCount(0);
  await readyRow.getByRole('button', { name: /^Configure$|^配置$/i }).click();
  await expect(readyRow).toHaveAttribute('data-selected', 'true');
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(readyRow).toHaveAttribute('data-selected', 'true');
  await expect(page).toHaveURL(/focus=model_ready/);
  await page.getByLabel(/^Status$|^状态$/i).selectOption('ready');
  await expect(page).toHaveURL(/status=ready/);
  await page.reload();
  await expect(page.getByLabel(/^Status$|^状态$/i)).toHaveValue('ready');

  await page.goto('/admin/ai-resources?focus=model_attention');
  await expect(attentionRow).toBeVisible();
  await attentionRow.getByRole('button', { name: /^Test$|^测试$/i }).click();
  await expect(page.locator('[data-feedback-for="model_attention"]').getByRole('alert')).toContainText(
    /provider credential is missing|供应商凭据缺失/i
  );

  const addButton = page.getByRole('button', { name: /Add model supplier|添加模型供应商/i });
  await addButton.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^Close$|^关闭$/i })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(addButton).toBeFocused();

  await writeAdminVisualReceipt({
    page,
    testInfo,
    route: '/admin/ai-resources',
    pageModel: 'queue',
    testedStates: ['ready', 'selected', 'filtered', 'operation_error', 'dialog'],
    humanAcceptance: 'not_required',
    pageTitle: page.locator('main h1').filter({ hasText: /^Model providers$|^模型供应商$/i }),
    workingSurface: directory,
    browserEvidence,
    expectedConsoleErrors: [/^provider credential is missing$/],
    routeRuleResults: [
      { id: 'single-primary-action', status: 'pass', evidence: 'one Add model supplier header action is visible' },
      { id: 'textual-status', status: 'pass', evidence: 'supplier rows expose Configured and missing-credential text labels' },
      { id: 'action-object-proximity', status: 'pass', evidence: 'Configure and Test remain inside the affected supplier row' },
      { id: 'distinct-interaction-states', status: 'pass', evidence: 'selected supplier uses data-selected and the status filter retains its value' },
      { id: 'dialog-focus-recovery', status: 'pass', evidence: 'Escape closes the provider dialog and returns focus to Add model supplier' },
      { id: 'context-stability', status: 'pass', evidence: 'focus survives reload before filtering and the status filter survives its own reload' },
    ],
    interactionResults: [
      { id: 'filter-and-focus', status: 'pass', evidence: 'URL-backed focus and status were each verified across reload' },
      { id: 'row-operation-error', status: 'pass', evidence: 'failed provider test stayed next to the affected row' },
      { id: 'dialog-keyboard-recovery', status: 'pass', evidence: 'dialog closed with Escape and restored focus' },
    ],
  });
});
