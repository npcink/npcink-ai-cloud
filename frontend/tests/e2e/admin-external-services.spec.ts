import { expect, test, type Page } from '@playwright/test';
import { buildAdminApiEnvelope, installAdminMocks } from './helpers/admin-operator-fixture';

const connections = [
  {
    connection_id: 'external_tavily',
    provider_id: 'tavily',
    provider_type: 'web_search_provider',
    kind: 'web_search_provider',
    display_name: 'Tavily',
    enabled: true,
    configured: true,
    status: 'ready',
    base_url: 'https://api.tavily.com',
    source_role: 'execution_source',
    capability_ids: ['web_search'],
    runtime_profile_ids: ['web-search.managed'],
    config: {},
    metadata: {},
  },
];

async function installExternalServicesHarness(page: Page) {
  await installAdminMocks(page);
  const writes: Array<Record<string, unknown>> = [];
  let currentConnections = connections.map((connection) => ({ ...connection }));
  await page.route('**/api/admin/provider-connections**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildAdminApiEnvelope({ connections: currentConnections })),
      });
      return;
    }
    if (request.method() === 'POST' && pathname.endsWith('/test')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildAdminApiEnvelope({ ok: true })),
      });
      return;
    }
    if (request.method() === 'POST' || request.method() === 'PATCH') {
      const payload = request.postDataJSON() as Record<string, unknown>;
      writes.push(payload);
      const existingIndex = currentConnections.findIndex(
        (connection) => connection.provider_id === payload.provider_id && connection.kind === payload.kind
      );
      const nextConnection = {
        connection_id: String(payload.connection_id),
        provider_id: String(payload.provider_id),
        provider_type: String(payload.provider_type),
        kind: String(payload.kind),
        display_name: String(payload.display_name),
        enabled: Boolean(payload.enabled),
        configured: payload.credential === '' ? false : Boolean(payload.credential) || existingIndex >= 0,
        status: Boolean(payload.enabled) ? 'ready' : 'disabled',
        base_url: String(payload.base_url),
        source_role: String(payload.source_role),
        capability_ids: payload.capability_ids as string[],
        runtime_profile_ids: payload.runtime_profile_ids as string[],
        config: payload.config as Record<string, unknown>,
        metadata: payload.metadata as Record<string, unknown>,
      };
      currentConnections = existingIndex >= 0
        ? currentConnections.map((connection, index) => index === existingIndex ? nextConnection : connection)
        : [...currentConnections, nextConnection];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildAdminApiEnvelope({})),
      });
      return;
    }
    await route.fallback();
  });
  return writes;
}

test('fixed service directory uses a table and one configuration workbench', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  const writes = await installExternalServicesHarness(page);
  await page.goto('/admin/external-services');

  await expect(page.locator('[data-ui="external-service-table"]')).toBeVisible();
  await expect(page.locator('[data-external-service-id="tavily"]')).toBeVisible();
  await expect(page.locator('[data-external-service-id="doubao_search"]')).toBeVisible();
  await expect(page.locator('[data-external-service-id="jina_reader"]')).toBeVisible();
  await expect(page.getByRole('button', { name: /Add|添加/i })).toHaveCount(0);
  await expect(page.locator('aside.admin-sidebar')).toHaveCSS('width', '208px');
  await expect(page.locator('[data-ui="external-service-directory"]')).toHaveScreenshot('admin-external-services-table-pc.png', {
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
    maxDiffPixelRatio: 0.015,
  });

  await page.getByRole('tab', { name: /Image sources|图库来源/i }).click();
  await expect(page.locator('[data-external-service-id="unsplash"]')).toBeVisible();
  await expect(page.locator('[data-external-service-id="pixabay"]')).toBeVisible();
  await expect(page.locator('[data-external-service-id="pexels"]')).toBeVisible();

  const unsplash = page.locator('[data-external-service-id="unsplash"]');
  await unsplash.getByRole('button', { name: /Configure|配置/i }).click();
  const dialog = page.getByRole('dialog', { name: /Configure Unsplash|配置 Unsplash/i });
  await expect(dialog).toBeVisible();
  const unsplashCredentialLink = dialog.locator('[data-external-credential-link="unsplash"]');
  await expect(unsplashCredentialLink).toHaveText(/Get Access Key|获取 Access Key/);
  await expect(unsplashCredentialLink).toHaveAttribute('href', 'https://unsplash.com/oauth/applications');
  await expect(unsplashCredentialLink).toHaveAttribute('target', '_blank');
  await expect(unsplashCredentialLink).toHaveAttribute('rel', 'noreferrer noopener');
  await dialog.getByLabel(/API key|API Key|Token/i).fill('test-image-key');
  await dialog.getByLabel(/Enable for runtime calls|启用于运行时调用/i).check();
  page.once('dialog', async (browserDialog) => {
    expect(browserDialog.type()).toBe('confirm');
    await browserDialog.dismiss();
  });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-width="compact"]')).toHaveScreenshot('admin-external-services-workbench-pc.png', {
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
    maxDiffPixelRatio: 0.015,
  });
  await testInfo.attach('admin-external-services-workbench', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  await dialog.getByRole('button', { name: /Save settings|保存设置|^Save$|^保存$/i }).click();

  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({
    provider_id: 'unsplash',
    kind: 'image_source_provider',
    enabled: true,
    capability_ids: ['image_source'],
    runtime_profile_ids: ['image-source.managed'],
  });
  expect(writes[0]).not.toHaveProperty('priority');
  expect(writes[0]).not.toHaveProperty('note');
  await expect(page.locator('[data-external-service-feedback="unsplash"]')).toContainText(/saved|已保存/i);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440);
});

test('stored credentials require explicit replacement and clearing needs confirmation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  const writes = await installExternalServicesHarness(page);
  await page.goto('/admin/external-services');

  const tavily = page.locator('[data-external-service-id="tavily"]');
  await tavily.getByRole('button', { name: /Configure|配置/i }).click();
  const dialog = page.getByRole('dialog', { name: /Configure Tavily|配置 Tavily/i });
  await expect(dialog.getByText(/Current saved credential remains unchanged|保留当前已保存凭据/i)).toBeVisible();
  await expect(dialog.locator('[data-external-credential-link="tavily"]')).toHaveText(/Manage API Key|管理 API Key/);
  await expect(dialog.locator('[data-external-credential-link="tavily"]')).toHaveAttribute('href', 'https://app.tavily.com/home');
  await expect(dialog.getByLabel(/API key|API Key|Token/i)).toHaveCount(0);
  await dialog.getByRole('button', { name: /Replace credential|替换凭据/i }).click();
  await expect(dialog.getByLabel(/API key|API Key|Token/i)).toBeVisible();
  await dialog.getByRole('button', { name: /Cancel replacement|取消替换/i }).click();
  await expect(dialog.getByLabel(/API key|API Key|Token/i)).toHaveCount(0);

  const configurationTable = dialog.locator('[data-ui="admin-configuration-table"]');
  await expect(configurationTable).toBeVisible();
  await expect(configurationTable).toHaveAttribute('data-boundary', 'header-only');
  await expect(configurationTable).toHaveCSS('border-top-width', '0px');
  await expect(configurationTable.locator('[data-configuration-row="service-url"]')).toHaveCSS('border-top-width', '0px');
  await expect(dialog.locator('[data-ui="admin-workbench-close"]')).toHaveCSS('border-top-width', '0px');
  await expect(dialog.locator('[data-configuration-row="service-url"]')).toContainText('https://api.tavily.com');
  await dialog.getByRole('button', { name: /Clear credential and disable|清除凭据并停用/i }).click();
  await expect(dialog.getByText(/Clear the credential for Tavily|确认清除 Tavily/i)).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^Save$|^保存$/i })).toHaveCount(0);
  await dialog.getByRole('button', { name: /Clear and disable|确认清除并停用/i }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({
    provider_id: 'tavily',
    enabled: false,
    credential: '',
  });

  const reader = page.locator('[data-external-service-id="jina_reader"]');
  await reader.getByRole('button', { name: /Configure|配置/i }).click();
  const readerDialog = page.getByRole('dialog', { name: /Configure Jina Reader|配置 Jina Reader/i });
  await expect(readerDialog.locator('[data-external-credential-link]')).toHaveCount(0);
  await readerDialog.getByLabel(/Enable for runtime calls|启用于运行时调用/i).check();
  await readerDialog.getByRole('button', { name: /Save settings|保存设置|^Save$|^保存$/i }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1]).toMatchObject({
    provider_id: 'jina_reader',
    enabled: true,
    source_role: 'reader_enhancement',
    runtime_profile_ids: ['web-search.reader'],
    metadata: {
      ui_source: 'external_services',
      service_role: 'enhancer',
    },
  });
});

test('connection test feedback stays with the affected service row', async ({ page }) => {
  await installExternalServicesHarness(page);
  await page.goto('/admin/external-services');

  const tavily = page.locator('[data-external-service-id="tavily"]');
  await tavily.getByRole('button', { name: /^Test$|^测试$/i }).click();
  await expect(page.locator('[data-external-service-feedback="tavily"]')).toContainText(/Connection test passed|连接测试通过/i);
});
