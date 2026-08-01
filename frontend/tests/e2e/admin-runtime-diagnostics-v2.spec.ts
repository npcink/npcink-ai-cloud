import { expect, test, type Locator } from '@playwright/test';
import {
  buildAdminApiEnvelope,
  buildAdminApiErrorEnvelope,
  installAdminMocks,
} from './helpers/admin-operator-fixture';
import {
  observeAdminBrowserEvidence,
  writeAdminVisualReceipt,
} from './helpers/admin-visual-receipt';

async function countQualityTrendAccentPixels(panel: Locator): Promise<number> {
  return panel.locator('canvas').evaluate((canvas) => {
    const context = canvas.getContext('2d');
    if (!context) return 0;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let accentPixels = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const alpha = pixels[index + 3];
      const pixelX = (index / 4) % canvas.width;
      const matchesAdoption = Math.abs(red - 5) < 24
        && Math.abs(green - 150) < 24
        && Math.abs(blue - 105) < 24;
      const matchesRepeat = Math.abs(red - 217) < 24
        && Math.abs(green - 119) < 24
        && Math.abs(blue - 6) < 24;
      if (
        pixelX > canvas.width * 0.65
        && alpha > 100
        && (matchesAdoption || matchesRepeat)
      ) {
        accentPixels += 1;
      }
    }
    return accentPixels;
  });
}

test('runtime diagnostics is telemetry-driven, URL-backed, and mobile safe', async ({ page }, testInfo) => {
  const browserEvidence = observeAdminBrowserEvidence(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await installAdminMocks(page);
  const telemetryRequests: string[] = [];
  const qualityRequests: string[] = [];
  let failNextTelemetry = false;
  let delayNextQuality = false;
  await page.route('**/api/admin/runtime-telemetry*', async (route) => {
    if (!failNextTelemetry) {
      await route.fallback();
      return;
    }
    failNextTelemetry = false;
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify(buildAdminApiErrorEnvelope('temporary diagnostic failure')) });
  });
  await page.route('**/api/admin/editor-assist-quality*', async (route) => {
    if (delayNextQuality) {
      delayNextQuality = false;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    await route.fallback();
  });
  page.on('request', (request) => {
    if (request.url().includes('/api/admin/runtime-telemetry')) telemetryRequests.push(request.url());
    if (request.url().includes('/api/admin/editor-assist-quality')) qualityRequests.push(request.url());
  });

  await page.goto('/admin/troubleshooting');
  await expect(page.locator('[data-ui="runtime-diagnostic-issue"]')).toHaveCount(1);
  const anomalyTable = page.locator('[data-ui="runtime-diagnostic-table"]');
  await expect(anomalyTable.getByRole('columnheader', { name: /Severity|严重度/i })).toBeVisible();
  await expect(anomalyTable.getByRole('columnheader', { name: /Affected scope|影响范围/i })).toBeVisible();
  await expect(anomalyTable.getByRole('columnheader', { name: /Evidence code|证据代码/i })).toHaveCount(0);
  await expect(page.locator('[data-ui="runtime-diagnostic-conclusion"]')).toContainText(/Runtime telemetry has|运行遥测/i);
  await expect(page.locator('[data-ui="diagnostic-source-freshness"]')).toContainText(/Runtime updated|运行数据更新于/i);
  await expect(page.locator('[data-ui="diagnostic-source-freshness"]')).toContainText(/Quality updated|质量数据更新于/i);
  expect(await anomalyTable.locator('thead').evaluate((element) => getComputedStyle(element).position)).toBe('sticky');
  await expect(page.locator('#runtime-diagnostic-inspector')).toContainText(/Provider call coverage gap|供应商调用遥测缺口/i);
  await expect(page.locator('#runtime-diagnostic-inspector')).toContainText(/Affected runs|受影响运行/i);
  await expect(page.locator('#runtime-diagnostic-inspector')).toContainText(/Evidence code|证据代码/i);
  await expect(page.locator('#runtime-diagnostic-inspector a')).toHaveAttribute('href', '#runtime-evidence');
  const queueBox = await page.locator('[data-ui="runtime-diagnostic-table-frame"]').boundingBox();
  const inspectorBox = await page.locator('#runtime-diagnostic-inspector').boundingBox();
  expect(queueBox?.height || 0).toBeLessThan(inspectorBox?.height || 0);
  await expect(page.locator('main input')).toHaveCount(0);
  const qualityPanel = page.locator('[data-ui="editor-assist-quality-panel"]');
  await expect(qualityPanel).not.toHaveAttribute('open', '');
  await expect(qualityPanel).toContainText(/Editor-assist quality|编辑辅助质量/i);
  await expect(qualityPanel).toContainText(/Resolved \/ total|已归因 \/ 总会话/i);
  await expect(qualityPanel).toContainText(/Sample stage|样本阶段/i);
  await qualityPanel.locator('summary').click();
  await expect(qualityPanel).toHaveAttribute('open', '');
  await expect(qualityPanel).toContainText(/Exact adoption|精确采纳率/i);
  await expect(qualityPanel).toContainText(/Repeat pressure|重复生成偏高/i);
  const candidateTable = qualityPanel.locator('[data-ui="editor-assist-quality-candidate-table"]');
  await expect(candidateTable.getByRole('columnheader', { name: /Rate \/ sample|发生率 \/ 样本/i })).toBeVisible();
  await expect(candidateTable.getByRole('columnheader', { name: /Next action|下一步/i })).toBeVisible();
  await expect.poll(() => countQualityTrendAccentPixels(qualityPanel)).toBeGreaterThan(20);
  delayNextQuality = true;
  await qualityPanel.getByLabel(/Task|任务/i).selectOption('content_summary');
  await expect(page.getByRole('button', { name: /Refreshing|刷新中/i })).toBeDisabled();
  await expect.poll(() => qualityRequests.some((url) => url.includes('task_key=content_summary'))).toBe(true);
  await expect(page.getByRole('button', { name: /^Refresh$|^刷新$/i })).toBeEnabled();

  await page.getByRole('button', { name: '72h' }).click();
  await expect(page).toHaveURL(/window=72/);
  await expect.poll(() => telemetryRequests.some((url) => url.includes('recent_minutes=4320'))).toBe(true);
  await expect.poll(() => qualityRequests.some((url) => url.includes('window_hours=72'))).toBe(true);
  await expect.poll(() => countQualityTrendAccentPixels(qualityPanel)).toBeGreaterThan(20);

  await page.getByRole('button', { name: /Provider call coverage gap|供应商调用遥测缺口/i }).click();
  await expect(page).toHaveURL(/focus=hosted_model.provider_call_gap/);
  await expect(page.locator('#runtime-diagnostic-inspector')).toContainText(/Provider call coverage gap|供应商调用遥测缺口/i);
  await page.reload();
  await expect(page.getByRole('button', { name: /Provider call coverage gap|供应商调用遥测缺口/i })).toHaveAttribute('aria-pressed', 'true');

  const metadata = page.locator('#runtime-evidence');
  await expect(metadata).not.toHaveAttribute('open', '');
  await expect(metadata.locator('summary')).toContainText(/Runtime evidence guide|运行证据说明/i);
  await metadata.locator('summary').click();
  await expect(metadata.getByText(/Runtime resolution|运行时解析/i)).toBeVisible();
  await expect.poll(() => countQualityTrendAccentPixels(qualityPanel)).toBeGreaterThan(20);
  await testInfo.attach('p4-e03-editor-assist-quality', {
    body: await qualityPanel.screenshot(),
    contentType: 'image/png',
  });
  await testInfo.attach('p4-e03-admin-runtime-diagnostics', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });

  failNextTelemetry = true;
  await page.getByRole('button', { name: /^Refresh$|^刷新$/i }).click();
  await expect(page.getByText(/last successfully loaded diagnostic snapshot|最近一次成功加载的诊断快照/i)).toBeVisible();
  await expect(page.locator('[data-ui="diagnostic-source-freshness"]')).toContainText(/Partial data|部分数据可用/i);
  await expect(page.locator('[data-ui="runtime-diagnostic-issue"]')).toHaveCount(1);

  await writeAdminVisualReceipt({
    page,
    testInfo,
    route: '/admin/troubleshooting',
    pageModel: 'diagnostic',
    testedStates: ['ready', 'selected', 'partial_error', 'disclosure'],
    humanAcceptance: 'not_required',
    pageTitle: page.getByRole('heading', { name: /^Runtime diagnostics$|^运行诊断$/i }),
    workingSurface: page.locator('[data-ui="runtime-diagnostic-table-frame"]'),
    browserEvidence,
    expectedConsoleErrors: [/^Failed to load resource: the server responded with a status of 503 \(Service Unavailable\)$/],
    routeRuleResults: [
      { id: 'single-primary-action', status: 'not_applicable', evidence: 'diagnostic reference is read-only and exposes no mutation primary action' },
      { id: 'textual-status', status: 'pass', evidence: 'severity, freshness, and partial-data states include text labels' },
      { id: 'action-object-proximity', status: 'pass', evidence: 'anomaly inspection starts from the selected anomaly row and opens its evidence inspector' },
      { id: 'distinct-interaction-states', status: 'pass', evidence: 'focused anomaly uses aria-pressed and partial refresh has a distinct status message' },
      { id: 'dialog-focus-recovery', status: 'not_applicable', evidence: 'the diagnostic reference uses in-flow disclosures and no dialog' },
      { id: 'context-stability', status: 'pass', evidence: 'failed refresh retains the last successful diagnostic snapshot and selected anomaly' },
    ],
    interactionResults: [
      { id: 'window-and-focus', status: 'pass', evidence: 'time window and anomaly focus are URL-backed' },
      { id: 'evidence-disclosure', status: 'pass', evidence: 'runtime and quality evidence disclosures open without displacing the queue' },
      { id: 'partial-refresh-recovery', status: 'pass', evidence: 'partial failure keeps prior evidence visible' },
    ],
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(page.locator('[data-ui="runtime-diagnostic-issue"]').first()).toBeVisible();
  await expect(qualityPanel).toBeVisible();
  await qualityPanel.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -88));
  await testInfo.attach('p4-e03-editor-assist-quality-mobile', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});

test('runtime diagnostics keeps narrow evidence lanes as secondary navigation', async ({ page }) => {
  await installAdminMocks(page);
  await page.goto('/admin/troubleshooting');

  const lanes = page.locator('#evidence-lanes');
  await expect(lanes).not.toHaveAttribute('open', '');
  await lanes.locator('summary').click();
  await expect(lanes).toHaveAttribute('open', '');
  const laneTable = lanes.locator('[data-ui="runtime-evidence-lane-table"]');
  await expect(laneTable.getByRole('columnheader', { name: /Channel|通道/i })).toBeVisible();
  await expect(laneTable.getByRole('columnheader', { name: /Evidence scope|证据范围/i })).toBeVisible();
  await expect(lanes.locator('a[href="/admin/plugin-observability"]')).toBeVisible();
  await expect(lanes.locator('a[href="/admin/media-observability"]')).toBeVisible();
  await expect(lanes.locator('a[href="/admin/vector-observability"]')).toBeVisible();
  await expect(lanes.locator('a[href="/admin/agent-feedback"]')).toBeVisible();
  await expect(lanes.locator('a[href="/admin/ai-advisor"]')).toBeVisible();
  await expect(page.getByText(/Groups|分组/)).toHaveCount(0);
});

test('editor quality keeps sample sufficiency separate from candidate status', async ({ page }) => {
  await installAdminMocks(page);
  await page.route('**/api/admin/editor-assist-quality*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiEnvelope({
        generated_at: '2026-04-08T10:00:00Z',
        totals: {
          session_total: 5,
          resolved_session_total: 3,
          repeat_session_rate: 0,
          exact_saved_rate: 0,
          unmatched_saved_rate: 0,
          expired_without_save_rate: 0,
          sample_stage: 'insufficient',
        },
        trend: [],
        issue_candidates: [],
      })),
    });
  });

  await page.goto('/admin/troubleshooting');
  const qualityPanel = page.locator('[data-ui="editor-assist-quality-panel"]');
  await expect(qualityPanel).toContainText(/Collecting evidence|正在积累证据/i);
  await expect(qualityPanel).toContainText(/insufficient|样本不足/i);
  await expect(qualityPanel).not.toContainText(/No review candidate|无复核候选/i);
});
