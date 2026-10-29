import { expect, type Page } from '@playwright/test';
import type { SupplierConnection } from '../../src/features/admin/ai-resources/types';
import { test } from './helpers/critical-network-fixture';
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

const providerModelHealth24hRows = [
  {
    provider_id: 'openai',
    model_id: 'gpt-5.5',
    status: 'healthy',
    call_count: 412,
    success_count: 410,
    error_count: 2,
    success_rate: 0.995,
    avg_latency_ms: 1804,
    p95_latency_ms: 4120,
    tokens_in: 12000,
    tokens_out: 34000,
    cost: 0.8621,
    retry_count: 1,
    fallback_count: 2,
    last_error_code: '',
    last_observed_at: '2026-09-18T06:00:00Z',
  },
  {
    provider_id: 'minimax',
    model_id: 'MiniMax-M2.1',
    status: 'degraded',
    call_count: 31,
    success_count: 28,
    error_count: 3,
    success_rate: 0.903,
    avg_latency_ms: 6200,
    p95_latency_ms: 11400,
    tokens_in: 900,
    tokens_out: 2100,
    cost: 0.1201,
    retry_count: 0,
    fallback_count: 5,
    last_error_code: 'provider.timeout',
    last_observed_at: '2026-09-18T05:40:00Z',
  },
];

const providerModelHealthFixture = {
  source: 'provider_call_records',
  content_exposed: false,
  recent_call_limit: 200,
  default_window_id: 'last_24h',
  windows: [
    {
      window_id: 'last_24h',
      label: 'Last 24h',
      hours: 24,
      rows: providerModelHealth24hRows,
    },
    {
      window_id: 'last_7d',
      label: 'Last 7d',
      hours: 168,
      rows: [
        ...providerModelHealth24hRows,
        {
          provider_id: 'openai',
          model_id: 'gpt-5.4-mini',
          status: 'error',
          call_count: 12,
          success_count: 3,
          error_count: 9,
          success_rate: 0.25,
          avg_latency_ms: null,
          p95_latency_ms: 21000,
          tokens_in: 0,
          tokens_out: 400,
          cost: 0.004,
          retry_count: 3,
          fallback_count: 9,
          last_error_code: 'provider.upstream_unavailable',
          last_observed_at: '2026-09-17T21:10:00Z',
        },
      ],
    },
  ],
};

async function installProviderDirectoryHarness(
  page: Page,
  options: { deleteConflict?: boolean; auditUnavailable?: boolean; connections?: SupplierConnection[] } = {}
) {
  await installAdminMocks(page);
  const fixtureConnections = options.connections || connections;
  let requestCount = 0;
  let deletePreflightCount = 0;
  let deletePayload: unknown = null;
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
          connections: fixtureConnections,
          provider_model_health: providerModelHealthFixture,
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
    const connection = fixtureConnections.find((item) => item.connection_id === connectionId);
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
  await page.route('**/api/admin/provider-connections/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const pathParts = pathname.split('/');
    if (request.method() === 'GET' && pathname.endsWith('/delete-preflight')) {
      const connectionId = decodeURIComponent(pathParts.at(-2) || '');
      const connection = connections.find((item) => item.connection_id === connectionId);
      deletePreflightCount += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildAdminApiEnvelope({
          surface: 'admin_provider_connection_delete_preflight',
          connection: {
            connection_id: connectionId,
            provider_id: connection?.provider_id || 'unknown',
            display_name: connection?.display_name || connectionId,
            enabled: connection?.enabled ?? false,
            configuration_status: connection?.configuration_status || connection?.status || 'unknown',
          },
          expected_updated_at: '2026-07-12T00:25:00Z',
          impact: {
            risk_level: 'high',
            runtime_profile_ids: connection?.runtime_profile_ids || [],
            uncovered_runtime_profile_ids: connection?.runtime_profile_ids || [],
            capability_ids: connection?.capability_ids || [],
            model_count: connection?.model_ids?.length || 0,
            alternative_connections: [],
          },
          requires_confirmation: true,
          boundary: {
            direct_wordpress_write: false,
            final_writes: 'excluded',
          },
        })),
      });
      return;
    }
    if (request.method() === 'DELETE') {
      const connectionId = decodeURIComponent(pathParts.at(-1) || '');
      deletePayload = request.postDataJSON();
      if (options.deleteConflict) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify(buildAdminApiErrorEnvelope(
            'provider connection changed after delete preflight',
            'provider_connection.delete_conflict'
          )),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildAdminApiEnvelope({
          connection_id: connectionId,
          receipt: {
            event_kind: 'provider_connection.delete',
            scope_kind: 'provider_connection',
            scope_id: connectionId,
            outcome: 'succeeded',
            effective_summary: `Provider connection ${connectionId} was deleted.`,
            audit_state: options.auditUnavailable ? 'unavailable' : 'persisted',
          },
        })),
      });
      return;
    }
    await route.fallback();
  });
  return {
    getRequestCount: () => requestCount,
    getDeletePreflightCount: () => deletePreflightCount,
    getDeletePayload: () => deletePayload,
  };
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
  // Dev-mode React StrictMode double-mounts the directory query, so the
  // initial load may legitimately fetch twice on a dev server; production
  // serves one request per mount. The invariant under test is that the
  // workspace performs its initial load and never enters a request loop.
  expect(harness.getRequestCount()).toBeGreaterThanOrEqual(1);
  expect(harness.getRequestCount()).toBeLessThan(3);
  await testInfo.attach('p4-e03-admin-provider-runtime', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });

  const readyRow = page.locator('[data-connection-id="model_ready"]');
  await expect(readyRow.locator('[data-ui="supplier-name"]')).toHaveText('MQZJ');
  await expect(readyRow.getByRole('button', { name: 'MQZJ', exact: true })).toHaveCount(0);
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
  const harness = await installProviderDirectoryHarness(page);
  await page.goto('/admin/ai-resources?focus=model_ready');

  const supplierRow = page.locator('[data-connection-id="model_ready"]');
  await supplierRow.getByRole('button', { name: /More actions|更多操作/i }).click();
  await page.getByRole('menuitem', { name: /^Test$|^测试$/i }).click();
  const feedbackRow = page.locator('[data-feedback-for="model_ready"]');
  await expect(feedbackRow.getByRole('status').filter({ hasText: /Test passed|连接测试通过/i })).toBeVisible();

  const rowHeightBefore = await supplierRow.evaluate((element) => element.getBoundingClientRect().height);
  const moreButton = supplierRow.getByRole('button', { name: /More actions|更多操作/i });
  await moreButton.click();
  const actionMenu = page.getByRole('menu');
  await expect(actionMenu).toBeVisible();
  expect(Math.abs((await supplierRow.boundingBox())!.height - rowHeightBefore)).toBeLessThan(1);
  const [triggerBox, menuBox] = await Promise.all([moreButton.boundingBox(), actionMenu.boundingBox()]);
  expect(triggerBox).not.toBeNull();
  expect(menuBox).not.toBeNull();
  expect(menuBox!.x).toBeGreaterThanOrEqual(8);
  expect(menuBox!.y).toBeGreaterThanOrEqual(8);
  expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(1432);
  expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(1042);
  expect(Math.abs((menuBox!.x + menuBox!.width) - (triggerBox!.x + triggerBox!.width))).toBeLessThanOrEqual(12);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(moreButton).toBeFocused();

  await moreButton.click();
  await expect(page.getByRole('menuitem')).toHaveCount(5);
  await page.getByRole('menuitem', { name: /Delete connection|删除连接/i }).click();
  await expect(feedbackRow.getByRole('alert')).toContainText(/2 models|2 个模型/i);
  await expect(feedbackRow.getByRole('alert')).toContainText(/text\.ai/);
  expect(harness.getDeletePreflightCount()).toBe(1);
  await expect(feedbackRow.getByRole('button', { name: /Confirm delete|确认删除/i })).toBeVisible();
  await feedbackRow.getByRole('button', { name: /Confirm delete|确认删除/i }).click();
  await expect.poll(() => harness.getDeletePayload()).toEqual({
    expected_updated_at: '2026-07-12T00:25:00Z',
  });
});

test('stale provider deletion refreshes the row and clears confirmation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const harness = await installProviderDirectoryHarness(page, { deleteConflict: true });
  await page.goto('/admin/ai-resources?focus=model_ready');

  const supplierRow = page.locator('[data-connection-id="model_ready"]');
  await supplierRow.getByRole('button', { name: /More actions|更多操作/i }).click();
  await page.getByRole('menuitem', { name: /Delete connection|删除连接/i }).click();
  const feedbackRow = page.locator('[data-feedback-for="model_ready"]');
  await feedbackRow.getByRole('button', { name: /Confirm delete|确认删除/i }).click();

  await expect(page.getByText(/changed after the deletion check|删除检查后.*发生变化/i).first()).toBeVisible();
  await expect(feedbackRow.getByRole('button', { name: /Confirm delete|确认删除/i })).toHaveCount(0);
  await expect(supplierRow).toBeVisible();
  expect(harness.getRequestCount()).toBeGreaterThan(1);
});

test('successful provider mutation does not claim unavailable audit evidence', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await installProviderDirectoryHarness(page, { auditUnavailable: true });
  await page.goto('/admin/ai-resources?focus=model_ready');

  const supplierRow = page.locator('[data-connection-id="model_ready"]');
  await supplierRow.getByRole('button', { name: /More actions|更多操作/i }).click();
  await page.getByRole('menuitem', { name: /Delete connection|删除连接/i }).click();
  await page.locator('[data-feedback-for="model_ready"]')
    .getByRole('button', { name: /Confirm delete|确认删除/i })
    .click();

  await page.getByRole('button', { name: /Latest operation|最近操作/i }).click();
  const receipt = page.locator('[data-audit-state="unavailable"]');
  await expect(receipt).toBeVisible();
  await expect(receipt.getByRole('alert')).toContainText(
    /operation record is unavailable|变更记录暂不可用/i
  );
  await expect(receipt.getByRole('link', { name: /View change record|查看变更记录/i })).toHaveCount(0);
  await receipt.locator('summary').click();
  await expect(receipt.getByRole('button', { name: /Copy details|复制详情/i })).toBeVisible();
});

test('unsaved provider draft reopens before deletion preflight', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const harness = await installProviderDirectoryHarness(page);
  await page.goto('/admin/ai-resources?focus=model_ready');

  const supplierRow = page.locator('[data-connection-id="model_ready"]');
  await supplierRow.getByRole('button', { name: /^Configure$|^配置$/i }).click();
  const dialog = page.getByRole('dialog');
  const displayName = dialog.getByLabel(/Display name|显示名称/i);
  await displayName.fill('MQZJ unsaved');
  await dialog.getByRole('button', { name: /^Close$|^关闭$/i }).click();
  await expect(dialog).toHaveCount(0);

  await supplierRow.getByRole('button', { name: /More actions|更多操作/i }).click();
  await page.getByRole('menuitem', { name: /Delete connection|删除连接/i }).click();

  await expect(dialog).toBeVisible();
  await expect(displayName).toHaveValue('MQZJ unsaved');
  await expect(page.getByText(/Save or discard the unsaved provider draft|保存或放弃.*未保存/i).first()).toBeVisible();
  expect(harness.getDeletePreflightCount()).toBe(0);
});

test('detected provider image host stays contextual and requires evidence-bound approval', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await installProviderDirectoryHarness(page);
  let approved = false;
  let approvalPayload: unknown = null;
  await page.route('**/api/admin/ai-resources', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    const repairConnections = connections.map((connection) => (
      connection.connection_id === 'model_ready'
        ? {
          ...connection,
          config: approved
            ? { image_response_format: 'url', image_output_hosts: ['images.provider.example'] }
            : connection.config,
          image_delivery_repair: approved ? { status: 'approved' } : {
            status: 'pending',
            reason_code: 'host_not_allowlisted',
            detected_host: 'images.provider.example',
            run_id: 'run_image_host_review',
            observed_at: '2026-08-11T00:00:00Z',
          },
        }
        : connection
    ));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiEnvelope({ connections: repairConnections })),
    });
  });
  await page.route('**/api/admin/provider-connections/model_ready/approve-image-host', async (route) => {
    approvalPayload = route.request().postDataJSON();
    approved = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiEnvelope({
        approved_image_output_host: 'images.provider.example',
        receipt: {
          event_kind: 'provider_connection.image_host_approve',
          scope_kind: 'provider_connection',
          scope_id: 'model_ready',
          outcome: 'succeeded',
        },
      })),
    });
  });
  await page.goto('/admin/ai-resources?focus=model_ready');

  const repair = page.locator('[data-ui="provider-image-host-repair"]');
  await expect(repair).toContainText('images.provider.example');
  const approvalButton = repair.getByRole('button', { name: /Approve this exact host|批准此精确域名/i });
  await expect(approvalButton).toBeVisible();
  await approvalButton.click();

  await expect(repair).toHaveCount(0);
  expect(approvalPayload).toEqual({ evidence_run_id: 'run_image_host_review' });
  await expect(page.getByText(/Exact image host approved|精确图片域名已批准/i)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await testInfo.attach('provider-image-host-approval', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});

test('image delivery probe discovers the exact host without manual entry', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await installProviderDirectoryHarness(page);
  let approvalPayload: unknown = null;
  await page.route('**/api/admin/provider-connections/model_ready/image-delivery-probes', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiEnvelope({
        probe_id: 'image-probe-browser',
        connection_id: 'model_ready',
        provider_id: 'openai',
        model_id: 'gpt-image-2',
        status: 'approval_required',
        ok: false,
        delivery_format: 'url',
        detected_host: 'images.provider.example',
        host_approved: false,
        latency_ms: 321,
        estimated_cost: 0.0123,
        provider_call_billable: true,
        tested_at: '2026-08-11T00:00:00Z',
        message: 'provider image host approval is required',
        receipt: {
          event_kind: 'provider_connection.image_delivery_probe',
          scope_kind: 'provider_connection',
          scope_id: 'model_ready',
          outcome: 'succeeded',
        },
      })),
    });
  });
  await page.route('**/api/admin/provider-connections/model_ready/approve-image-host', async (route) => {
    approvalPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiEnvelope({
        approved_image_output_host: 'images.provider.example',
        evidence_probe_id: 'image-probe-browser',
        receipt: {
          event_kind: 'provider_connection.image_host_approve',
          scope_kind: 'provider_connection',
          scope_id: 'model_ready',
          outcome: 'succeeded',
        },
      })),
    });
  });
  await page.goto('/admin/ai-resources?focus=model_ready');

  await page.locator('[data-connection-id="model_ready"]')
    .getByRole('button', { name: /^Configure$|^配置$/i })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/may incur a small provider charge|可能收取少量费用/i)).toBeVisible();
  await dialog.getByRole('button', { name: /Generate test image|生成测试图/i }).click();
  await expect(dialog.getByText(/images\.provider\.example/)).toBeVisible();
  await dialog.getByRole('button', { name: /Approve this exact host|批准此精确域名/i }).click();

  expect(approvalPayload).toEqual({ evidence_probe_id: 'image-probe-browser' });
  await expect(dialog.getByText(/Run the test again|再次测试/i)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

for (const locale of ['en', 'zh-CN']) {
  test(`image delivery uses saved settings and preserves verification evidence in ${locale}`, async ({ page }, testInfo) => {
    const browserEvidence = observeAdminBrowserEvidence(page);
    await page.addInitScript(value => localStorage.setItem('locale', value), locale);
    await page.setViewportSize({ width: 1440, height: 1050 });
    const fixtureConnections: SupplierConnection[] = structuredClone(connections);
    const ready = fixtureConnections.find(connection => connection.connection_id === 'model_ready')!;
    await installProviderDirectoryHarness(page, { connections: fixtureConnections });
    let calls = 0;
    await page.route('**/api/admin/provider-connections/model_ready/image-delivery-probes', async route => {
      calls += 1;
      if (calls === 1) {
        ready.image_delivery_probe = { status: 'failed', model_id: 'image-model', tested_at: '2026-10-28T00:00:00Z' };
        return route.fulfill({ status: 502, json: buildAdminApiErrorEnvelope('Image delivery test failed.', 'provider_connection.image_delivery_probe_failed') });
      }
      ready.image_delivery_probe = {
        probe_id: 'image-probe-verified', status: 'ready', model_id: 'image-model',
        delivery_format: 'base64', tested_at: '2026-10-28T00:01:00Z',
      };
      await route.fulfill({ json: buildAdminApiEnvelope({
        ...ready.image_delivery_probe, connection_id: ready.connection_id, provider_id: ready.provider_id,
        ok: true, host_approved: true, latency_ms: 1, estimated_cost: 0, provider_call_billable: true,
      }) });
    });
    await page.goto('/admin/ai-resources');
    await page.getByLabel(/^Status$|^状态$/i).selectOption('ready');
    await expect(page).toHaveURL(/status=ready/);
    await expect(page.locator('[data-ui="model-supplier-directory"] [data-connection-id]')).toHaveCount(1);
    const configure = page.locator('[data-connection-id="model_ready"]').getByRole('button', { name: /^Configure$|^配置$/i });
    await configure.click();
    const dialog = page.getByRole('dialog');
    const delivery = dialog.locator('[data-configuration-row="image-delivery"]');
    const generate = dialog.getByRole('button', { name: /Generate test image|生成测试图/i });
    await expect(delivery.getByRole('status')).toContainText(/Not verified|未验证/i);
    await expect(dialog.locator('[data-configuration-row="image-response-format"]')).not.toBeVisible();
    const name = dialog.getByLabel(/^Display name$|^显示名称$/i);
    await name.fill('Unsaved image supplier');
    await expect(generate).toBeDisabled();
    await expect(delivery).toContainText(/Save your changes|请先保存修改/i);
    expect(calls).toBe(0);
    await name.fill('MQZJ');
    await expect(generate).toBeEnabled();
    await generate.click();
    await expect(delivery.getByRole('status')).toContainText(/Failed|验证失败/i);
    await page.keyboard.press('Escape');
    await configure.click();
    await expect(delivery.getByRole('status')).toContainText(/Failed|验证失败/i);
    await generate.click();
    await expect(delivery.getByRole('status')).toContainText(/Verified|已验证/i);
    await expect(delivery).toContainText('image-model');
    await page.keyboard.press('Escape');
    await configure.click();
    await expect(delivery.getByRole('status')).toContainText(/Verified|已验证/i);
    await dialog.getByText(/Image delivery · Advanced settings|图片交付 · 高级设置/i, { exact: true }).click();
    const format = dialog.getByLabel(/Provider image response|服务商图片返回方式/i);
    await format.selectOption('url');
    await expect(generate).toBeDisabled();
    await expect(delivery.getByRole('status')).not.toContainText(/Verified|已验证/i);
    await expect(dialog.locator('[data-configuration-row="image-output-hosts"]')).toBeVisible();
    await format.selectOption('b64_json');
    await expect(generate).toBeEnabled();
    expect(calls).toBe(2);
    await dialog.getByText(/Image delivery · Advanced settings|图片交付 · 高级设置/i, { exact: true }).click();
    await writeAdminVisualReceipt({
      page, testInfo, route: '/admin/ai-resources', pageModel: 'queue', dataMode: 'mocked',
      testedStates: ['ready', 'selected', 'filtered', 'operation_error', 'dialog', 'unverified', 'unsaved', 'failed', 'retry', 'verified', 'advanced', locale],
      humanAcceptance: 'not_required', browserEvidence,
      expectedConsoleErrors: [/Image delivery test failed\./, /^Failed to load resource: the server responded with a status of 502 \(Bad Gateway\)$/],
      pageTitle: page.locator('main h1'), workingSurface: delivery,
      routeRuleResults: [
        { id: 'single-primary-action', status: 'pass', evidence: 'Save supplier is primary; optional paid image test is secondary' },
        { id: 'textual-status', status: 'pass', evidence: 'Unverified, failed, verified and unsaved states are distinct; tested model is named' },
        { id: 'action-object-proximity', status: 'pass', evidence: 'Generate test image is beside its delivery state and cost notice' },
        { id: 'distinct-interaction-states', status: 'pass', evidence: 'Unsaved changes disable the test and suppress stale success' },
        { id: 'dialog-focus-recovery', status: 'pass', evidence: 'Escape closes the dialog; the Configure action opens it again' },
        { id: 'context-stability', status: 'pass', evidence: 'Failure and success survive closing and reopening the supplier editor' },
      ],
      interactionResults: [
        { id: 'saved-settings-only', status: 'pass', evidence: 'No probe during unsaved edits; only two explicit mocked calls' },
        { id: 'verification-recovery', status: 'pass', evidence: 'Failure persists; retry replaces it with model-scoped success' },
      ],
    });
    await page.setViewportSize({ width: 1056, height: 800 });
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await testInfo.attach(`image-delivery-narrow-${locale}`, { body: await page.screenshot(), contentType: 'image/png' });
  });
}

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
  await supplierRow.getByRole('button', { name: /More actions|更多操作/i }).click();
  await page.getByRole('menuitem', { name: /^Test$|^测试$/i }).click();
  await expect(page.locator('[data-feedback-for="model_attention"]').getByRole('alert')).toContainText(/provider credential is missing|供应商凭据缺失/i);
  await expect(page.getByText(/provider credential is missing|供应商凭据缺失/i).first()).toBeVisible();
  await page.getByRole('button', { name: /Latest operation|最近操作/i }).click();
  const receipt = page.locator('[data-ui="admin-mutation-receipt"]');
  await expect(receipt.getByRole('alert')).toContainText(/connection test failed|连接测试失败/i);
  await expect(receipt).toHaveAttribute('data-outcome', 'error');
  await expect(receipt.getByText('provider_connection.test', { exact: true })).toBeHidden();
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
  await expect(dialog.locator('[data-ui="admin-help-tip-trigger"]')).toBeFocused();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: /Save supplier|保存供应商/i })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.locator('[data-ui="admin-help-tip-trigger"]')).toBeFocused();

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
  await expect(dialog.locator('[data-configuration-row="image-response-format"]')).not.toBeVisible();
  await dialog.getByText(/Image delivery · Advanced settings|图片交付 · 高级设置/i, { exact: true }).click();
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
  await expect(dialog.getByRole('heading', { name: /Model management|模型管理/i })).toBeVisible();
  await expect(dialog.locator('[data-ui="model-visibility-toolbar"]')).toBeVisible();
  await expect(dialog.locator('[data-ui="model-sync-primary"]')).toBeVisible();
  await expect(dialog.getByRole('option', { name: /All visibility|全部可见性/i })).toHaveCount(1);
  await expect(dialog.getByRole('option', { name: /All capabilities|全部能力/i })).toHaveCount(1);
  await expect(dialog.locator('[data-ui="model-metadata-gap-filter"]')).toBeHidden();
  await expect(dialog.locator('[data-ui="manual-model-add"]')).toBeHidden();
  await expect(dialog.locator('[data-ui="model-visibility-pagination"]')).toHaveCount(0);
  await expect(dialog.getByText(/Include historical\/deprecated|含历史\/废弃/i)).toBeHidden();
  await expect(dialog.getByRole('button', { name: /More filters|更多筛选/i })).toHaveCount(0);
  const maintenanceDisclosure = dialog.locator('[data-ui="model-maintenance-table"]');
  await expect(maintenanceDisclosure).toHaveCount(0);
  await expect(dialog.locator('.admin-workbench-dialog')).toHaveScreenshot('admin-provider-workbench-pc.png', {
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
    maxDiffPixelRatio: 0.015,
  });

  await dialog.getByRole('tab', { name: /Reference information|参考资料/i }).click();
  await expect(dialog.locator('[data-ui="model-reference-panel"]')).toBeVisible();
  await expect(dialog.getByRole('switch')).toHaveCount(0);
  await expect(dialog.locator('[data-ui="model-clear-all-request"]')).toHaveCount(0);

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
  const referenceCheckedAt = new Date().toISOString();
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
    synced_at: referenceCheckedAt,
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
          last_synced_at: referenceCheckedAt,
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
  await expect(dialog.locator('[data-content-mode="contained"]')).toBeVisible();
  const directory = dialog.locator('[data-ui="model-visibility-directory"]');
  await expect(directory.locator('tbody tr')).toHaveCount(2);
  await expect(dialog.locator('[data-ui="model-maintenance-table"]')).toHaveCount(0);
  await dialog.getByRole('tab', { name: /Reference information|参考资料/i }).click();
  await dialog.locator('[data-ui="model-reference-browse"] > summary').click();
  const otherReferences = dialog.locator('[data-ui="model-reference-browse"]');
  await expect(otherReferences.locator('[data-ui="reference-record"]')).toHaveCount(25);
  await expect(otherReferences.locator('[data-ui="reference-pagination"]')).toContainText('1 / 3');
  await otherReferences.getByRole('button', { name: /^Next$|^下一页$/i }).click();
  await expect(otherReferences.locator('[data-ui="reference-pagination"]')).toContainText('2 / 3');
  await otherReferences.getByRole('textbox').fill('catalog-model-60');
  await expect(otherReferences.locator('[data-ui="reference-record"]')).toHaveCount(1);
  await expect(otherReferences.locator('[data-ui="reference-pagination"]')).toHaveCount(0);
  await expect(otherReferences.getByRole('switch')).toHaveCount(0);
  await dialog.getByRole('tab', { name: /Model management|模型管理/i }).click();
  await expect(directory.locator('tbody tr')).toHaveCount(2);
  await page.route('**/api/admin/provider-connections/preview-catalog', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiEnvelope({
        models: referenceItems.map((item) => ({
          model_id: item.model_id, feature: item.feature, family: item.family,
          status: item.status, is_deprecated: false, runtime_supported: true,
          verified: false, capability_tags: ['text_generation'],
        })),
        model_ids: referenceItems.map((item) => item.model_id),
        model_count: referenceItems.length,
      })),
    });
  });
  await dialog.locator('[data-ui="model-sync-primary"]').click();
  await expect(directory.locator('tbody tr')).toHaveCount(25);
  const verticalScrollOwners = await dialog.evaluate((element) => [element, ...Array.from(element.querySelectorAll<HTMLElement>('*'))]
    .filter(candidate => /(auto|scroll)/.test(window.getComputedStyle(candidate).overflowY) && candidate.scrollHeight > candidate.clientHeight + 1)
    .map(candidate => candidate.dataset.ui || candidate.tagName.toLowerCase()));
  expect(verticalScrollOwners).toEqual(['model-visibility-scroll']);
  await dialog.getByRole('button', { name: /^Next$|^下一页$/i }).click();
  await expect(dialog.locator('[data-ui="model-visibility-pagination"]')).toContainText(/2 \/ 3|第 2 \/ 3 页/);
  await dialog.getByPlaceholder(/model, family, provider|模型、系列、供应商/i).fill('catalog-model-60');
  await expect(directory.locator('tbody tr')).toHaveCount(1);
  await expect(dialog.locator('[data-ui="model-visibility-pagination"]')).toHaveCount(0);
  await dialog.locator('[data-ui="model-maintenance-table"] > summary').click();
  await expect(dialog.locator('[data-ui="model-filtered-enable-request"]')).toBeEnabled();
  await dialog.locator('[data-ui="model-filtered-enable-request"]').click();
  await expect(dialog.getByText(/enabled total will become 3|已启用总数为 3/i)).toBeVisible();
  await dialog.locator('[data-ui="model-filtered-batch-confirm"]').click();
  await expect(directory.locator('tbody tr').first()).toContainText(/Enabled|已启用/i);

  await dialog.locator('[data-ui="model-filtered-disable-request"]').click();
  await expect(dialog.getByText(/enabled total will become 2|已启用总数为 2/i)).toBeVisible();
  await dialog.locator('[data-ui="model-filtered-batch-confirm"]').click();
  await expect(directory.locator('tbody tr').first()).toContainText(/Not enabled|未启用/i);
});

test('model reference loading continues past the API page limit', async ({ page }) => {
  await installProviderDirectoryHarness(page);
  const referenceCheckedAt = new Date().toISOString();
  const referenceItems = Array.from({ length: 1001 }, (_, index) => ({
    source_id: 'models.dev',
    source_label: 'models.dev',
    provider_id: 'openai',
    provider_label: 'OpenAI',
    model_id: `catalog-model-${String(index + 1).padStart(4, '0')}`,
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
    synced_at: referenceCheckedAt,
    is_deprecated: false,
    override_present: false,
  }));
  const requestedOffsets: number[] = [];
  await page.route('**/api/admin/model-references?**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const offset = Number(requestUrl.searchParams.get('offset') || 0);
    const limit = Number(requestUrl.searchParams.get('limit') || 500);
    requestedOffsets.push(offset);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiEnvelope({
        items: referenceItems.slice(offset, offset + limit),
        total: referenceItems.length,
        source_summary: [{ source_id: 'models.dev', display_name: 'models.dev', source_url: 'https://models.dev', status: 'active', last_synced_at: referenceCheckedAt, last_error_code: '', last_error_message: '' }],
      })),
    });
  });

  await page.goto('/admin/ai-resources');
  const supplierRow = page.locator('[data-connection-id="model_ready"]');
  await supplierRow.getByRole('button', { name: /^Configure$|^配置$/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: /Reference information|参考资料/i }).click();
  await dialog.locator('[data-ui="model-reference-browse"] > summary').click();
  await expect(dialog.locator('[data-ui="model-reference-browse"] [data-ui="reference-record"]')).toHaveCount(25);
  await expect.poll(() => requestedOffsets).toEqual([0, 500, 1000]);

  await dialog.getByPlaceholder(/model, family, provider|模型、系列、供应商/i).fill('catalog-model-1001');
  await expect(dialog.locator('[data-ui="model-reference-browse"] [data-ui="reference-record"]')).toHaveCount(1);
  await expect(dialog.locator('[data-ui="model-reference-browse"] [data-ui="reference-record"]')).toContainText('catalog-model-1001');
});

test('save uses one compact toast, actionable next step, and no automatic test success row', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await installProviderDirectoryHarness(page);
  await page.goto('/admin/ai-resources');

  await page.getByRole('button', { name: /Add model supplier|添加模型供应商/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/API Key|Credential|凭据/i).fill('test-secret');
  await dialog.getByRole('button', { name: /Save supplier|保存供应商/i }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: /Supplier saved\.|供应商已保存。/ })).toHaveCount(1);
  await expect(page.locator('[data-ui="supplier-next-step"]')).toContainText(/Enable an account model|先启用账户模型/i);
  await expect(page.locator('[data-ui="supplier-next-step"]')).not.toContainText(/Connection saved|连接已保存/i);
  await expect(page.locator('[data-feedback-for] [role="status"]')).toHaveCount(0);
  await expect(page.locator('[data-ui="supplier-next-step"]')).toBeVisible();
  await expect(page.getByRole('button', { name: /Latest operation|最近操作/i })).toBeVisible();
});

test('save and test clears the transient testing message when the test fails', async ({ page }) => {
  await installProviderDirectoryHarness(page);
  let catalogAttempts = 0;
  await page.route('**/api/admin/provider-connections/*/test', async (route) => {
    catalogAttempts += 1;
    if (catalogAttempts > 1) { await route.fallback(); return; }
    await route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify(
        buildAdminApiErrorEnvelope(
          'provider connection catalog request failed',
          'provider_connection.upstream_error',
          {
            connection_id: 'openai_compatible',
            provider_id: 'openai',
            kind: 'openai_compatible',
            status: 'upstream_error',
            stage: 'catalog_fetch',
            ok: false,
            error_code: 'provider_connection.upstream_error',
            message: 'provider connection catalog request failed',
          }
        )
      ),
    });
  });
  await page.goto('/admin/ai-resources');

  await page.getByRole('button', { name: /Add model supplier|添加模型供应商/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/API Key|Credential|凭据/i).fill('test-secret');
  await dialog.getByRole('button', { name: /Save supplier|保存供应商/i }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-ui="supplier-next-step"]')).toContainText(/Connection saved; catalog sync failed|连接已保存；目录同步失败/i);
  await expect(page.getByText(/Provider connection saved\. Running connection test now\.|Provider 连接已保存，正在运行连接测试/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Retry catalog sync|重试目录同步/i })).toBeEnabled();
  await expect(page.getByRole('alert').filter({ hasText: /catalog sync failed|目录同步失败/ })).toHaveCount(1);
  await page.getByRole('button', { name: /Retry catalog sync|重试目录同步/i }).click();
  await expect(page.locator('[data-ui="supplier-next-step"]')).not.toContainText(/catalog sync failed|目录同步失败/);
  await expect(page.getByRole('button', { name: /Retry catalog sync|重试目录同步/i })).toHaveCount(0);
  await expect(page.locator('[data-feedback-for] [role="status"]')).toHaveCount(0);
  expect(catalogAttempts).toBe(2);
});

test('catalog sync reaches a terminal state and can run again', async ({ page }) => {
  await installProviderDirectoryHarness(page);
  let previewCount = 0;
  let releasePreview!: () => void;
  const previewPending = new Promise<void>((resolve) => { releasePreview = resolve; });
  await page.route('**/api/admin/provider-connections/preview-catalog', async (route) => {
    previewCount += 1;
    if (previewCount === 1) await previewPending;
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(buildAdminApiEnvelope({ models: [], model_ids: [], model_count: 0 })),
    });
  });
  await page.goto('/admin/ai-resources?focus=model_ready');
  await page.locator('[data-connection-id="model_ready"]').getByRole('button', { name: /^Configure$|^配置$/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: /Model management|模型管理/i }).click();
  const sync = dialog.locator('[data-ui="model-sync-primary"]');
  await expect(sync).toBeEnabled();
  await sync.click();
  await expect(sync).toBeDisabled();
  releasePreview();
  await expect(sync).toBeEnabled();
  await sync.click();
  await expect.poll(() => previewCount).toBe(2);
  await expect(sync).toBeEnabled();
  await expect(sync).not.toContainText(/Syncing|同步中/i);
});

test('catalog success with reference failure remains retryable', async ({ page }) => {
  await installProviderDirectoryHarness(page);
  await page.route('**/api/admin/provider-connections/preview-catalog', async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(buildAdminApiEnvelope({ models: [], model_ids: [], model_count: 0 })),
    });
  });
  await page.route('**/api/admin/model-references/sync', async (route) => {
    await route.fulfill({
      status: 503, contentType: 'application/json',
      body: JSON.stringify(buildAdminApiErrorEnvelope('reference unavailable', 'service.unavailable')),
    });
  });
  await page.goto('/admin/ai-resources?focus=model_ready');
  await page.locator('[data-connection-id="model_ready"]').getByRole('button', { name: /^Configure$|^配置$/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: /Model management|模型管理/i }).click();
  const sync = dialog.locator('[data-ui="model-sync-primary"]');
  await sync.click();
  await expect(dialog.locator('[data-ui="account-reference-status"]')).toContainText(/failed|失败/i);
  await expect(sync).toBeEnabled();
  await dialog.getByRole('tab', { name: /Reference information|参考资料/i }).click();
  const reference = dialog.locator('[data-ui="model-reference-retry"]');
  await reference.click();
  await expect(dialog.locator('[data-ui="model-reference-panel"]')).toContainText(/reference|参考/i);
  await expect(reference).toBeEnabled();
  await dialog.getByRole('tab', { name: /Model management|模型管理/i }).click();
  await expect(sync).toBeEnabled();
  await expect(sync).not.toContainText(/Syncing|同步中/i);
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
  await expect(readyRow).toContainText(/Catalog fetched|目录已获取/i);
  await expect(readyRow.getByRole('button', { name: /^Test$|^测试$/i })).toHaveCount(0);
  expect((await readyRow.boundingBox())!.height).toBeLessThan(80);
  const help = readyRow.locator('[data-ui="admin-help-tip-trigger"]');
  await help.focus();
  await expect(page.getByRole('tooltip')).toContainText('https://new-api.example.test/v1');
  await page.keyboard.press('Escape');
  await expect(attentionRow.getByRole('button', { name: /^Configure$|^配置$/i })).toBeVisible();
  await expect(attentionRow.getByRole('button', { name: /Retry test|重试测试/i })).toBeVisible();

  await expect(readyRow.locator('[data-ui="supplier-name"]')).toHaveText('MQZJ');
  await expect(readyRow.getByRole('button', { name: 'MQZJ', exact: true })).toHaveCount(0);
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
  await attentionRow.getByRole('button', { name: /More actions|更多操作/i }).click();
  await page.getByRole('menuitem', { name: /^Test$|^测试$/i }).click();
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
      { id: 'action-object-proximity', status: 'pass', evidence: 'Configure stays in the row; Test is reachable through its More menu' },
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

test('provider model health stays a collapsed read-only evidence panel', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await installProviderDirectoryHarness(page);
  await page.goto('/admin/ai-resources');

  const healthPanel = page.locator('[data-ui="provider-model-health"]');
  await expect(healthPanel).toBeAttached();
  await expect(healthPanel.locator('table')).toBeHidden();
  await expect(healthPanel.getByText(/No provider call evidence|该窗口暂无 Provider 调用证据/i)).toHaveCount(0);

  await healthPanel.locator('summary').click();
  await expect(healthPanel.locator('table')).toBeVisible();
  await expect(healthPanel.locator('tbody tr')).toHaveCount(2);
  await expect(healthPanel.locator('[data-ui="backoffice-status-badge"]').first()).toBeVisible();
  await expect(healthPanel.getByText(/Read-only evidence|只读证据/i)).toBeVisible();
  await expect(
    healthPanel.getByRole('button', { name: /Save|保存|Test|测试|Delete|删除|Configure|配置/i })
  ).toHaveCount(0);

  await healthPanel.getByRole('button', { name: /Last 7d|Last 7 days|最近 7 天|近 7 天/i }).click();
  await expect(healthPanel.locator('tbody tr')).toHaveCount(3);
  await expect(healthPanel.getByText(/gpt-5\.4-mini/)).toBeVisible();
  await page.goto('/admin/ai-resources#provider-model-health');
  await expect(healthPanel).toHaveAttribute('open', '');
  await expect(healthPanel.locator('table')).toBeVisible();
});

test('provider failures show one localized reason near the affected row', async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.addInitScript(() => localStorage.setItem('locale', 'zh-CN'));
  await installProviderDirectoryHarness(page);
  let errorCode = 'provider.auth_invalid';
  await page.route('**/api/admin/provider-connections/model_ready/test', async (route) => {
    await route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiErrorEnvelope('provider catalog request failed', errorCode, {
        connection_id: 'model_ready', provider_id: 'openai', kind: 'openai_compatible',
        status: 'failed', stage: 'catalog_fetch', ok: false, error_code: errorCode,
        message: 'provider catalog request failed',
        receipt: { event_kind: 'provider_connection.test', outcome: 'error' },
      })),
    });
  });
  await page.goto('/admin/ai-resources');
  for (const [code, text] of [
    ['provider.auth_invalid', '供应商认证失败'],
    ['provider.network_error', '无法连接供应商'],
    ['provider.timeout', '供应商请求超时'],
    ['provider.rate_limited', '供应商请求受到限流'],
    ['client.network_error', '无法连接云端服务'],
    ['client.request_timeout', '云端服务请求超时'],
    ['provider.unknown', '测试 provider 连接失败'],
  ]) {
    errorCode = code;
    await page.locator('[data-connection-id="model_ready"]').getByRole('button', { name: /More actions|更多操作/i }).click();
    await page.getByRole('menuitem', { name: /^Test$|^测试$/i }).click();
    await expect(page.locator('[data-feedback-for="model_ready"]').getByRole('alert')).toContainText(text);
    await expect(page.getByRole('alert').filter({ hasText: text })).toHaveCount(1);
    if (code === 'provider.auth_invalid') {
      await testInfo.attach('localized-provider-failure-pc', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    }
    await expect(page.getByText('provider catalog request failed', { exact: false })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  expect(pageErrors, 'handled provider failures must not escape the row action').toEqual([]);
});

test('reference models are separate from account models and catalog fetch preserves explicit enabled choices', async ({ page }) => {
  await installProviderDirectoryHarness(page);
  const reference = {
    source_id: 'models.dev', source_label: 'models.dev', provider_id: 'openai', provider_label: 'OpenAI',
    model_id: 'reference-only', display_name: 'Reference only', family: 'reference', feature: 'text', status: 'active',
    modalities: { input: ['text'], output: ['text'] }, capability_flags: {}, price: { unit: 'USD', billing_truth: false },
    source_updated_at: '', synced_at: new Date().toISOString(), is_deprecated: false, override_present: false,
  };
  await page.route('**/api/admin/model-references?**', async (route) => {
    await route.fulfill({ json: buildAdminApiEnvelope({ items: [reference], total: 1, source_summary: [{ source_id: 'models.dev', display_name: 'models.dev', source_url: 'https://models.dev', status: 'error', last_synced_at: reference.synced_at, last_error_code: '', last_error_message: '' }] }) });
  });
  let previews = 0;
  let referenceRefreshes = 0;
  let submitted: Record<string, unknown> | undefined;
  await page.route('**/api/admin/model-references/sync', async (route) => {
    referenceRefreshes += 1;
    await route.fulfill({ status: 503, json: buildAdminApiErrorEnvelope('reference refresh unavailable') });
  });
  await page.route('**/api/admin/provider-connections/preview-catalog', async (route) => {
    previews += 1;
    await route.fulfill({ json: buildAdminApiEnvelope({
      provider_id: 'openai', model_count: 2, model_ids: ['account-one', 'account-two'],
      models: ['account-one', 'account-two'].map(model_id => ({ model_id, family: 'text', feature: 'text', status: 'active', capability_tags: ['text'], verified: true, runtime_supported: true, is_deprecated: false })),
    }) });
  });
  await page.route('**/api/admin/provider-connections', async (route) => {
    if (route.request().method() === 'POST') submitted = route.request().postDataJSON();
    await route.fallback();
  });
  await page.goto('/admin/ai-resources');
  await page.getByRole('button', { name: /Add model supplier|添加模型供应商/ }).click();
  const dialog = page.getByRole('dialog');
  const modelsTab = dialog.getByRole('tab', { name: /Model management|模型管理/ });
  await modelsTab.click();
  await expect(dialog).toContainText(/Account catalog 0|账户目录 0/);
  await expect(dialog.getByRole('row').filter({ hasText: 'reference-only' })).toHaveCount(0);
  await dialog.getByRole('tab', { name: /Reference information|参考资料/ }).click();
  await dialog.locator('[data-ui="model-reference-browse"] > summary').click();
  await dialog.getByRole('checkbox', { name: /Show historical|显示历史/ }).check();
  const referenceRow = dialog.locator('[data-ui="reference-record"]').filter({ hasText: 'reference-only' });
  await expect(referenceRow).toBeVisible();
  await expect(referenceRow.getByRole('switch')).toHaveCount(0);
  await modelsTab.click();
  const catalog = dialog.locator('[data-ui="model-sync-primary"]');
  await expect(catalog).toHaveText(/Enter API Key first|先填写 API Key/);
  await catalog.click();
  await expect(dialog.getByRole('tab', { name: /Connection settings|连接设置/ })).toHaveAttribute('aria-selected', 'true');
  expect(previews).toBe(0);
  await modelsTab.click();
  await expect(dialog.locator('[data-ui="manual-model-add"]')).toHaveCount(0);
  await dialog.getByRole('tab', { name: /Connection settings|连接设置/ }).click();
  await dialog.getByLabel(/API Key|Credential|凭据/).fill('fixture-account-key');
  await modelsTab.click();
  await catalog.click();
  await expect(dialog).toContainText(/Enabled 0 · Account catalog 2|已启用 0 · 账户目录 2/);
  await expect(dialog.locator('[data-ui="model-visibility-directory"] tbody tr')).toHaveCount(2);
  await expect(page.getByRole('status').filter({ hasText: /Fetched 2 account models|已获取 2 个账户型号/ })).toHaveCount(1);
  await expect.poll(() => referenceRefreshes).toBe(1);
  await expect(dialog.locator('[data-ui="account-reference-status"]')).toContainText(/failed|失败/i);
  await dialog.getByRole('switch', { name: /account-one/ }).check();
  await dialog.getByRole('tab', { name: /Reference information|参考资料/ }).click();
  await dialog.locator('[data-ui="model-reference-retry"]').click();
  await expect.poll(() => referenceRefreshes).toBe(2);
  await expect(dialog.getByRole('alert')).toContainText(/failed|失败/i);
  await modelsTab.click();
  await expect(catalog).toBeEnabled();
  await expect(dialog).toContainText(/Account catalog 2|账户目录 2/);
  await expect(dialog.getByRole('switch', { checked: true })).toHaveCount(1);
  await dialog.getByRole('button', { name: /Save supplier|保存供应商/ }).click();
  await expect(dialog).toHaveCount(0);
  expect((submitted?.config as Record<string, unknown>).model_ids).toEqual(['account-one']);
});

for (const recent of [true, false]) {
  test(`account catalog ${recent ? 'reuses recent reference data' : 'refreshes stale reference data once'}`, async ({ page }) => {
    await installProviderDirectoryHarness(page);
    let referenceRefreshes = 0;
    const source = () => ({ source_id: 'models.dev', display_name: 'models.dev', source_url: 'https://models.dev', status: 'active',
      last_synced_at: recent || referenceRefreshes ? new Date().toISOString() : '2026-01-01T00:00:00Z', last_error_code: '', last_error_message: '' });
    await page.route('**/api/admin/model-references?**', route => route.fulfill({ json: buildAdminApiEnvelope({ items: [], total: 0, source_summary: [source()] }) }));
    await page.route('**/api/admin/model-references/sync', route => {
      referenceRefreshes += 1;
      return route.fulfill({ json: buildAdminApiEnvelope({ model_count: 0 }) });
    });
    await page.route('**/api/admin/provider-connections/preview-catalog', route => route.fulfill({ json: buildAdminApiEnvelope({
      model_count: 1, model_ids: ['exact-model'], models: [{ model_id: 'exact-model', feature: 'text', runtime_supported: true }],
    }) }));
    await page.goto('/admin/ai-resources');
    await page.locator('[data-connection-id="model_ready"]').getByRole('button', { name: /^Configure$|^配置$/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('tab', { name: /Model management|模型管理/ }).click();
    await dialog.locator('[data-ui="model-sync-primary"]').click();
    await expect(dialog.locator('[data-ui="model-visibility-directory"] tbody tr')).toHaveCount(3);
    await dialog.getByRole('tab', { name: /Reference information|参考资料/ }).click();
    await expect(dialog.locator('[data-ui="model-reference-panel"]')).toContainText(/within 24 hours|24 小时内/);
    expect(referenceRefreshes).toBe(recent ? 0 : 1);
    await dialog.getByRole('tab', { name: /Model management|模型管理/ }).click();
    await dialog.locator('[data-ui="model-sync-primary"]').click();
    await expect(dialog.locator('[data-ui="model-sync-primary"]')).toBeEnabled();
    await dialog.locator('[data-ui="model-reference-details"] > summary').first().click();
    await expect(dialog.locator('[data-ui="model-reference-details"]').first()).toContainText(/unavailable|暂无可用的最新参考资料/);
    expect(referenceRefreshes).toBe(recent ? 0 : 1);
  });
}

test('a fresh source cannot make a retained old record current again', async ({ page }) => {
  await installProviderDirectoryHarness(page);
  const checkedAt = new Date().toISOString();
  const records = ['current-account-model', 'old-account-model'].map((model_id, index) => ({
    source_id: 'models.dev', source_label: 'models.dev', provider_id: 'openai', provider_label: 'OpenAI', model_id,
    display_name: model_id, family: 'text', feature: 'text', status: 'reference', modalities: {}, capability_flags: {},
    context_window: 128000, output_limit: 8192, price: { input: index ? 999 : 1, output: 2, unit: 'usd_per_1m_tokens', billing_truth: false },
    synced_at: index ? '2000-01-01T00:00:00Z' : checkedAt, source_updated_at: '', is_deprecated: false, override_present: false,
  }));
  await page.route('**/api/admin/model-references?**', route => route.fulfill({ json: buildAdminApiEnvelope({ items: records, total: 2,
    source_summary: [{ source_id: 'models.dev', display_name: 'models.dev', source_url: 'https://models.dev', status: 'active', last_synced_at: checkedAt, last_error_code: '', last_error_message: '' }],
  }) }));
  await page.route('**/api/admin/provider-connections/preview-catalog', route => route.fulfill({ json: buildAdminApiEnvelope({
    model_count: 2, model_ids: records.map(record => record.model_id), models: records.map(record => ({ model_id: record.model_id, feature: 'text', runtime_supported: true })),
  }) }));
  await page.clock.install({ time: new Date(checkedAt) });
  await page.goto('/admin/ai-resources');
  await page.locator('[data-connection-id="model_ready"]').getByRole('button', { name: /^Configure$|^配置$/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: /Model management|模型管理/ }).click();
  await dialog.locator('[data-ui="model-sync-primary"]').click();
  const oldModel = dialog.getByRole('row').filter({ hasText: 'old-account-model' });
  await oldModel.locator('summary').click();
  await expect(oldModel).toContainText(/unavailable|暂无可用的最新参考资料/);
  await expect(oldModel).not.toContainText('$999');
  await dialog.getByRole('tab', { name: /Reference information|参考资料/ }).click();
  await expect(dialog.locator('[data-ui="account-model-references"] [data-ui="reference-record"]')).toHaveCount(1);
  await dialog.locator('[data-ui="model-reference-browse"] > summary').click();
  await expect(dialog.locator('[data-ui="model-reference-browse"] [data-ui="reference-record"]')).toHaveCount(0);
  await dialog.getByRole('checkbox', { name: /Show historical|显示历史/ }).check();
  const historical = dialog.locator('[data-ui="model-reference-browse"] [data-ui="reference-record"]');
  await expect(historical).toContainText(/Absent from the latest|最新来源未再返回/);
  await expect(historical).toContainText('$999');
  await expect(historical.getByRole('switch')).toHaveCount(0);
  await dialog.getByRole('tab', { name: /Model management|模型管理/ }).click();
  const currentModel = dialog.getByRole('row').filter({ hasText: 'current-account-model' });
  await currentModel.locator('summary').click();
  await expect(currentModel).toContainText('$1 / $2');
  await page.clock.fastForward(24 * 60 * 60 * 1000 + 60_000);
  await expect(currentModel).toContainText(/unavailable|暂无可用的最新参考资料/);
  await expect(currentModel).not.toContainText('$1 / $2');
});

test('a delayed reference failure does not leak into another supplier workbench', async ({ page }) => {
  await installProviderDirectoryHarness(page);
  let finish: (() => void) | undefined;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  let syncing = false;
  await page.route('**/api/admin/model-references/sync', async route => {
    syncing = true;
    await gate;
    await route.fulfill({ status: 503, json: buildAdminApiErrorEnvelope('old supplier reference failed') });
  });
  await page.route('**/api/admin/provider-connections/preview-catalog', route => route.fulfill({ json: buildAdminApiEnvelope({ models: [], model_count: 0 }) }));
  await page.goto('/admin/ai-resources');
  await page.locator('[data-connection-id="model_ready"]').getByRole('button', { name: /^Configure$|^配置$/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: /Model management|模型管理/ }).click();
  await dialog.locator('[data-ui="model-sync-primary"]').click();
  await expect.poll(() => syncing).toBe(true);
  await page.keyboard.press('Escape');
  await page.locator('[data-connection-id="model_attention"]').getByRole('button', { name: /^Configure$|^配置$/ }).click();
  await dialog.getByRole('tab', { name: /Reference information|参考资料/ }).click();
  finish!();
  await expect(dialog.locator('[data-ui="model-reference-retry"]')).toBeEnabled();
  await expect(dialog.locator('[data-ui="model-reference-panel"]')).not.toContainText('old supplier reference failed');
});

test('existing supplier uses PATCH without replacing the Key and keeps the next action visible at 1056px', async ({ page }) => {
  await installProviderDirectoryHarness(page);
  let submitted: Record<string, unknown> | undefined;
  await page.route('**/api/admin/provider-connections/model_ready', async (route) => {
    expect(route.request().method()).toBe('PATCH');
    submitted = route.request().postDataJSON();
    await route.fulfill({ json: buildAdminApiEnvelope({ connection_id: 'model_ready' }) });
  });
  await page.setViewportSize({ width: 1056, height: 900 });
  await page.goto('/admin/ai-resources');
  const row = page.locator('[data-connection-id="model_ready"]');
  const action = row.getByRole('button', { name: /^Configure$|^配置$/ });
  const box = await action.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x + box!.width).toBeLessThanOrEqual(1056);
  await row.getByRole('button', { name: /More actions|更多操作/ }).click();
  await page.getByRole('menuitem', { name: /^Test$|^测试$/ }).click();
  const feedback = page.locator('[data-feedback-for="model_ready"]');
  await expect(feedback).toContainText(/no model request was sent|未发起模型调用/);
  await action.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel(/API Key|Credential|凭据/)).toHaveCount(0);
  await dialog.getByRole('button', { name: /Save supplier|保存供应商/ }).click();
  await expect(dialog).toHaveCount(0);
  expect(submitted).not.toHaveProperty('credential');
  await expect(feedback).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: /Supplier saved\.|供应商已保存。/ })).toHaveCount(1);
  await expect(page.getByRole('link', { name: /Configure usage|配置用途/ })).toHaveAttribute('href', '/admin/runtime-profiles?provider=openai');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1056);
});


test('duplicate create explains recovery and a new display name submits a new ID without losing the draft', async ({ page }) => {
  await installProviderDirectoryHarness(page);
  const ids: string[] = [];
  await page.route('**/api/admin/provider-connections', async (route) => {
    if (route.request().method() !== 'POST') { await route.fallback(); return; }
    ids.push(route.request().postDataJSON().connection_id);
    if (ids.length === 1) {
      await route.fulfill({ status: 409, json: buildAdminApiErrorEnvelope('internal diagnostic', 'provider_connection.already_exists') });
    } else await route.fallback();
  });
  await page.setViewportSize({ width: 1056, height: 900 });
  await page.goto('/admin/ai-resources');
  await page.getByRole('button', { name: /Add model supplier|添加模型供应商/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/API Key|Credential|凭据/).fill('fixture-key');
  const name = dialog.getByRole('textbox', { name: /Display name|显示名称/ });
  await name.fill('第一个模型供应商');
  await dialog.getByRole('button', { name: /Save supplier|保存供应商/ }).click();
  await expect(dialog.getByRole('alert')).toContainText(/already exists|供应商已存在/);
  await expect(dialog.getByRole('alert')).not.toContainText('internal diagnostic');
  await expect(dialog.getByLabel(/API Key|Credential|凭据/)).toHaveValue('fixture-key');
  await name.fill('第二个模型供应商');
  await dialog.getByRole('button', { name: /Save supplier|保存供应商/ }).click();
  await expect(dialog).toHaveCount(0);
  expect(ids).toHaveLength(2);
  expect(ids[0]).not.toBe(ids[1]);
  await expect(page.locator('[data-ui="supplier-next-step"]')).toBeVisible();
});

test('a removed supplier explains refresh recovery and retains its editing draft', async ({ page }) => {
  await installProviderDirectoryHarness(page);
  await page.route('**/api/admin/provider-connections/model_ready', async (route) => {
    if (route.request().method() !== 'PATCH') { await route.fallback(); return; }
    await route.fulfill({ status: 404, json: buildAdminApiErrorEnvelope('internal diagnostic', 'provider_connection.not_found') });
  });
  await page.goto('/admin/ai-resources');
  await page.locator('[data-connection-id="model_ready"]').getByRole('button', { name: /^Configure$|^配置$/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: /Display name|显示名称/ }).fill('Edited name');
  await dialog.getByRole('button', { name: /Save supplier|保存供应商/ }).click();
  await expect(dialog.getByRole('alert')).toContainText(/no longer exists|供应商已不存在/);
  await expect(dialog.getByRole('alert')).toContainText(/refresh|刷新/);
  await expect(dialog.getByRole('textbox', { name: /Display name|显示名称/ })).toHaveValue('Edited name');
});


test('historical model visibility is a browser preference and survives reopening and refresh without saving the supplier', async ({ page }) => {
  await installProviderDirectoryHarness(page);
  let writes = 0;
  await page.route('**/api/admin/provider-connections/model_ready', async route => {
    if (route.request().method() === 'PATCH') writes += 1;
    await route.fallback();
  });
  await page.goto('/admin/ai-resources');
  const openReferences = async () => {
    await page.locator('[data-connection-id="model_ready"]').getByRole('button', { name: /^Configure$|^配置$/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('tab', { name: /Reference information|参考资料/ }).click();
    await dialog.locator('[data-ui="model-reference-browse"] > summary').click();
    return dialog;
  };
  let dialog = await openReferences();
  const preference = () => page.getByRole('checkbox', { name: /Show historical|显示历史/ });
  await expect(preference()).not.toBeChecked();
  await preference().check();
  await expect(dialog.getByRole('button', { name: /Save supplier|保存供应商/ })).toHaveCount(0);
  await dialog.locator('[data-ui="model-reference-browse"]').getByRole('textbox').press('Enter');
  await expect(dialog).toBeVisible();
  expect(writes).toBe(0);
  await dialog.getByRole('button', { name: /^Manage models$|^管理模型$/ }).click();
  await expect(dialog.getByRole('button', { name: /Save supplier|保存供应商/ })).toBeEnabled();
  expect(writes).toBe(0);
  await dialog.getByRole('tab', { name: /Reference information|参考资料/ }).click();
  await dialog.getByRole('button', { name: /^Cancel$|^取消$/ }).click();
  dialog = await openReferences();
  await expect(preference()).toBeChecked();
  await dialog.getByRole('button', { name: /^Cancel$|^取消$/ }).click();
  await page.reload();
  dialog = await openReferences();
  await expect(preference()).toBeChecked();
  await preference().uncheck();
  await dialog.getByRole('button', { name: /^Cancel$|^取消$/ }).click();
  await page.reload();
  await openReferences();
  await expect(preference()).not.toBeChecked();
  expect(writes).toBe(0);
});


test('model switches and collapsed tools fit the narrow PC preview in dark mode', async ({ page }, testInfo) => {
  await installProviderDirectoryHarness(page);
  await page.setViewportSize({ width: 1056, height: 733 });
  await page.goto('/admin/ai-resources');
  await page.getByRole('button', { name: /Toggle theme|切换主题/i }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.locator('[data-connection-id="model_ready"]').getByRole('button', { name: /^Configure$|^配置$/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: /Model management|模型管理/i }).click();
  await expect(dialog.getByRole('switch', { checked: true })).toHaveCount(2);
  await expect(dialog.locator('[data-ui="manual-model-add"]')).toBeHidden();
  const directory = dialog.locator('[data-ui="model-visibility-directory"]');
  const box = await directory.boundingBox();
  expect(box!.height).toBeGreaterThan(200);
  expect(box!.x + box!.width).toBeLessThanOrEqual(1056);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1056);
  const save = await dialog.getByRole('button', { name: /Save supplier|保存供应商/i }).boundingBox();
  expect(save!.y + save!.height).toBeLessThanOrEqual(733);
  await page.screenshot({ path: testInfo.outputPath('models-dark-1056.png'), animations: 'disabled' });
  await expect(dialog.locator('[data-ui="model-maintenance-table"]')).toHaveCount(0);
  await dialog.getByRole('tab', { name: /Reference information|参考资料/i }).click();
  await expect(dialog.locator('[data-ui="model-reference-panel"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1056);
  await page.screenshot({ path: testInfo.outputPath('references-dark-1056.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('supplier model names hide only the system namespace and expose saved model impact', async ({ page }, testInfo) => {
  await installProviderDirectoryHarness(page);
  const supplier = {
    ...connections[1], connection_id: 'deepseek', provider_id: 'deepseek', display_name: 'DeepSeek',
    model_ids: ['deepseek-v4-flash', 'deepseek-v4-pro'],
    model_usage_references: [{ model_id: 'deepseek/deepseek-v4-pro', profile_id: 'wp-ai.short-text', role: 'primary' }, { model_id: 'deepseek/already-disabled', profile_id: 'vision.default', role: 'primary' }],
    metadata: { model_catalog_preview: {
      provider_id: 'deepseek', model_count: 2, model_ids: ['deepseek/deepseek-flash', 'deepseek/deepseek-v4-pro'],
      models: [
        { model_id: 'deepseek/deepseek-flash', upstream_model_id: 'deepseek-flash', feature: 'vision', runtime_supported: true },
        { model_id: 'deepseek/deepseek-v4-pro', upstream_model_id: 'deepseek-v4-pro', feature: 'text', runtime_supported: true },
      ],
    } },
  };
  await page.route('**/api/admin/ai-resources', route => route.fulfill({ json: buildAdminApiEnvelope({ surface: 'admin_ai_resources', connections: [supplier], capabilities: [], capability_matrix: [], runtime_resolution: [], feature_model_usage: [], runtime_profiles: [] }) }));
  await page.setViewportSize({ width: 1056, height: 900 });
  await page.goto('/admin/ai-resources');
  await page.getByRole('button', { name: /^Configure$|^配置$/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: /Model management|模型管理/ }).click();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  const flash = dialog.getByRole('row').filter({ hasText: 'deepseek-flash' });
  await expect(flash).toContainText(/Text · Image input|文本 · 支持图片输入/);
  await expect(flash.getByText('Internal ID: deepseek/deepseek-flash', { exact: false })).toBeHidden();
  await flash.locator('summary').click();
  await expect(flash).toContainText('deepseek/deepseek-flash');
  await expect(flash).toContainText(/Capabilities declared|能力来自账户目录声明/);
  const old = dialog.getByRole('row').filter({ hasText: 'deepseek-v4-flash' });
  await expect(old).toContainText(/Saved; not returned|已保存，目录未返回/);
  const pro = dialog.getByRole('row').filter({ hasText: 'deepseek-v4-pro' });
  await expect(pro.getByRole('link')).toBeVisible();
  await pro.getByRole('switch').uncheck();
  await expect(dialog.getByRole('alert')).toContainText(/unavailable|无法再使用/);
  await expect(dialog.getByRole('button', { name: /Save supplier|保存供应商/ })).toBeInViewport();
  await testInfo.attach('supplier-identity-narrow-pc', { body: await page.screenshot(), contentType: 'image/png' });
  await dialog.getByRole('button', { name: /^Cancel$|^取消$/ }).click();
});


test('supplier presets never preselect model IDs', async ({ page }) => {
  await installProviderDirectoryHarness(page);
  await page.goto('/admin/ai-resources');
  await page.getByRole('button', { name: /Add model supplier|添加模型供应商/ }).click();
  const dialog = page.getByRole('dialog');
  const connectionTab = dialog.getByRole('tab', { name: /Connection settings|连接设置/ });
  const modelsTab = dialog.getByRole('tab', { name: /Model management|模型管理/ });
  const preset = dialog.getByLabel(/Provider type|服务商类型/);
  const ids = await preset.locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
  for (const id of ids) {
    await connectionTab.click();
    await preset.selectOption(id);
    await modelsTab.click();
    await expect(dialog).toContainText(/Enabled 0 · Account catalog 0|已启用 0 · 账户目录 0/);
    await expect(dialog.getByRole('switch', { checked: true })).toHaveCount(0);
    await expect(dialog.locator('[data-ui="manual-model-add"]')).toHaveCount(0);
  }
});

for (const width of [1056, 1440]) {
  test(`exact-model test preserves supplier draft and supports failure retry at PC ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 1440 ? 1050 : 733 });
    await installProviderDirectoryHarness(page);
    let patches = 0;
    const calls: Array<Record<string, unknown>> = [];
    await page.route('**/api/admin/provider-connections/model_ready', async route => {
      if (route.request().method() === 'PATCH') patches += 1;
      await route.fallback();
    });
    await page.route('**/api/admin/provider-connections/preview-catalog', route => route.fulfill({ json: buildAdminApiEnvelope({
      provider_id: 'openai', model_count: 2, model_ids: ['gpt-5.5', 'new-unsaved'],
      models: ['gpt-5.5', 'new-unsaved'].map(model_id => ({ model_id, feature: 'text', capability_tags: model_id === 'gpt-5.5' ? ['text', 'vision'] : ['text'], status: 'available', runtime_supported: true, is_deprecated: false })),
    }) }));
    await page.route('**/api/admin/provider-connections/model_ready/model-tests', async route => {
      calls.push(route.request().postDataJSON());
      if (calls.length === 1) return route.fulfill({ status: 502, json: buildAdminApiErrorEnvelope('private upstream details', 'model_test.failed') });
      await route.fulfill({ json: buildAdminApiEnvelope({ test_id: 'model_test_browser', provider_id: 'openai', model_id: 'gpt-5.5', output_text: '**A clear model answer**\n\n- First\n- Second\n\n```js\nconst answer = 42;\n```\n\n| Input | Output |\n| - | - |\n| 18 | 8 |\n\n![tracking](https://tracker.invalid/pixel)\n\n[unsafe](javascript:alert%281%29)\n\n<script>window.injected = true</script>', latency_ms: 1234, tokens_in: 18, tokens_out: 8, finish_reason: 'stop', cost: width === 1056 ? { amount_usd: 0.000068, basis: 'reference', rates: { input: 2, output: 4, cache_read: null, cache_write: null }, source: 'models.dev', price_checked_at: new Date().toISOString() } : { amount_usd: null, basis: 'unavailable' } }) });
    });
    await page.goto('/admin/ai-resources');
    await page.locator('[data-connection-id="model_ready"]').getByRole('button', { name: /^Configure$|^配置$/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/^Display name$|^显示名称$/).fill('Retained draft');
    await dialog.getByRole('tab', { name: /Model management|模型管理/ }).click();
    await dialog.locator('[data-ui="model-sync-primary"]').click();
    const unsaved = dialog.getByRole('row').filter({ hasText: 'new-unsaved' });
    await unsaved.getByRole('switch').click();
    await expect(unsaved.getByRole('button', { name: /^Test |^测试 / })).toHaveCount(0);
    await dialog.getByRole('button', { name: /^Test gpt-5.5$|^测试 gpt-5.5$/ }).click();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(dialog.getByRole('heading', { name: /^Model test$|^模型测试$/ })).toBeVisible();
    await expect(dialog.getByLabel(/^Test type$|^测试类型$/)).toHaveValue('vision');
    await dialog.getByLabel(/^Test type$|^测试类型$/).selectOption('text');
    await dialog.getByLabel(/^Test input$|^测试输入$/).fill('Keep my input after failure');
    const run = dialog.getByRole('button', { name: /^Run test$|^开始测试$/ });
    await expect(run).toBeInViewport();
    await run.click();
    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(dialog.getByRole('alert')).not.toContainText('private upstream details');
    await expect(dialog.getByLabel(/^Test input$|^测试输入$/)).toHaveValue('Keep my input after failure');
    await dialog.getByLabel(/^Test type$|^测试类型$/).selectOption('vision');
    await expect(dialog.getByRole('img', { name: /Default image|默认图片/ })).toBeVisible();
    await run.click();
    const output = dialog.locator('[data-ui="model-test-output"]');
    await expect(output.locator('strong')).toHaveText('A clear model answer');
    await expect(output.locator('li')).toHaveCount(2);
    await expect(output.locator('pre code')).toContainText('const answer = 42');
    await expect(output.locator('table')).toBeVisible();
    await expect(output.locator('img, script, a')).toHaveCount(0);
    await expect(dialog.locator('[data-ui="model-test-cost"]')).toContainText(width === 1056 ? '≈ $0.000068 USD' : /Unable to estimate|暂无法估算/);
    await dialog.locator('summary').filter({ hasText: /Cost basis|费用依据/ }).click();
    await expect(dialog).toContainText(width === 1056 ? /supplier’s bill|供应商账单/ : /does not mean|不代表/);
    if (width === 1056) await expect(dialog).toContainText('models.dev');
    expect(await output.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await expect(dialog).toContainText('model_test_browser');
    await expect(run).toBeInViewport();
    expect(calls[1]).toMatchObject({ model_id: 'gpt-5.5', capability: 'vision' });
    expect(calls[1]).not.toHaveProperty('image_data_url');
    expect(patches).toBe(0);
    const rect = await dialog.boundingBox();
    expect(rect?.x).toBeGreaterThanOrEqual(0);
    expect((rect?.x || 0) + (rect?.width || 0)).toBeLessThanOrEqual(width);
    const screenshotPath = testInfo.outputPath(`model-test-PC-${width}.png`);
    await page.screenshot({ path: screenshotPath });
    await testInfo.attach(`model-test-PC-${width}`, { path: screenshotPath, contentType: 'image/png' });
    await dialog.getByLabel(/Use your image|使用自己的图片/).setInputFiles({ name: 'bad.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
    await expect(dialog.getByRole('alert')).toContainText(/PNG/);
    await expect(dialog.locator('[data-ui="model-test-output"]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(dialog.getByRole('tab', { name: /Model management|模型管理/ })).toBeVisible();
    await dialog.getByRole('tab', { name: /Connection settings|连接设置/ }).click();
    await expect(dialog.getByLabel(/^Display name$|^显示名称$/)).toHaveValue('Retained draft');
    expect(patches).toBe(0);
  });
}

test('provider workspace tabs expose panels and support roving keyboard navigation', async ({ page }) => {
  await installProviderDirectoryHarness(page);
  await page.goto('/admin/ai-resources');
  await page.locator('[data-connection-id="model_ready"]').getByRole('button', { name: /Configure|配置/ }).click();
  const dialog = page.getByRole('dialog');
  const connection = dialog.getByRole('tab', { name: /Connection settings|连接设置/ });
  const models = dialog.getByRole('tab', { name: /Model management|模型管理/ });
  const references = dialog.getByRole('tab', { name: /Reference information|参考资料/ });
  await connection.focus();
  await connection.press('ArrowRight');
  await expect(models).toBeFocused();
  await expect(models).toHaveAttribute('tabindex', '0');
  await expect(connection).toHaveAttribute('tabindex', '-1');
  await expect(dialog.getByRole('tabpanel')).toHaveAttribute('id', 'provider-panel-models');
  await models.press('End');
  await expect(references).toBeFocused();
  await expect(dialog.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'provider-tab-references');
  await references.press('ArrowRight');
  await expect(connection).toBeFocused();
  await expect(connection).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
