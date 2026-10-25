import { expect, type Page } from '@playwright/test';
import { test, captureIsolatedCheckpoint } from './helpers/isolated-channel-fixture';

test.skip(
  !process.env.NPCINK_CLOUD_FRONTEND_BASE_URL,
  'agent/workflow metadata smoke expects a running Cloud dev surface'
);

async function expectNoConsoleFailures(page: Page) {
  const messages: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const text = message.text();
      if (!text.includes('favicon.ico') && !text.startsWith('Failed to load resource:')) {
        messages.push(text);
      }
    }
  });
  page.on('pageerror', (error) => messages.push(error.message));
  return () => expect(messages).toEqual([]);
}

test('paused Advisor and retained read-only runtime metadata remain correctly separated', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const assertNoConsoleFailures = await expectNoConsoleFailures(page);

  await page.goto('/admin/dev-entry?redirect=%2Fadmin%2Fai-advisor');
  await expect(page).toHaveURL(/\/admin\/ai-advisor/);
  await expect(page.locator('[data-ui="ai-advisor-paused"]')).toBeVisible();
  await expect(page.getByText(/AI evaluation details|AI 评估详情/u)).toHaveCount(0);

  await captureIsolatedCheckpoint(page, testInfo, 'metadata-advisor-paused');
  await page.goto('/admin/ai-resources?view=connections&supplier=capability');
  // The old capability tab was retired by the supplier IA consolidation (#1201).
  // Keep its runtime-only ownership contract through the authenticated read projection.
  await expect(page.getByRole('heading', { name: /Model suppliers|模型供应商/u })).toBeVisible();
  await page.getByLabel(/Manage Cloud runtime model-provider|管理 Cloud 运行时模型供应商/u).focus();
  await expect(page.getByRole('tooltip')).toContainText(/Cloud runtime|Cloud 运行时/u);
  const projectionResponse = await page.request.get('/api/admin/agent-workflow-metadata');
  expect(projectionResponse.status()).toBe(200);
  const projection = (await projectionResponse.json()).data;
  expect(projection.projection_kind).toBe('read_only_runtime_metadata');
  expect(projection.projection_version).toBe('cloud-agent-workflow-metadata.v1');
  expect(projection).not.toHaveProperty('registry_version');
  expect(projection).not.toHaveProperty('compatibility_registry_version');
  expect(projection.workflows).toEqual(expect.arrayContaining([expect.objectContaining({
    workflow_id: 'media_derivative_artifact_generation', handoff_owner: 'wordpress_local',
    direct_wordpress_write: false,
  })]));

  await captureIsolatedCheckpoint(page, testInfo, 'metadata-runtime');
  await page.goto('/admin/media-observability');
  // Read-only workflow details are intentionally collapsed in the current Admin shell.
  await page.getByText(/Advanced workflow and error evidence|高级工作流与错误证据/u).click();
  await expect(page.getByText(/Workflow metadata|工作流元数据/u, { exact: true })).toBeVisible();
  await expect(page.getByText(/Media derivative artifact generation|媒体衍生工件生成/u)).toBeVisible();
  await expect(page.getByText(/whole run offload|整次运行卸载/u).first()).toBeVisible();
  await expect(page.getByText(/return_artifact_unavailable|返回工件不可用/u)).toBeVisible();
  await page.getByText(/Technical metadata|技术元数据/u).click();
  await expect(page.getByText('media_derivative_artifact_generation')).toBeVisible();
  await expect(page.getByText(/short TTL artifact|短 TTL 工件/u).first()).toBeVisible();

  await captureIsolatedCheckpoint(page, testInfo, 'metadata-workflow');
  assertNoConsoleFailures();
});
