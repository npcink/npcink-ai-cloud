import { expect, test, type Locator } from '@playwright/test';
import { readFileSync } from 'node:fs';
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
  const pageHeader = page.locator('[data-ui="backoffice-page-header"]');
  await expect(pageHeader).toBeVisible();
  await expect(page.locator('[data-ui="runtime-diagnostic-issue"]')).toHaveCount(1);
  const anomalyTable = page.locator('[data-ui="runtime-diagnostic-table"]');
  await expect(anomalyTable.getByRole('columnheader', { name: /Severity|严重度/i })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-ui="editor-assist-quality-panel"]')).toHaveCount(0);
  await expect(page.locator('[data-ui="runtime-data-integrity"]')).toHaveCount(0);
  await expect(page.locator('#evidence-lanes')).toHaveCount(0);
  await expect(page.locator('[data-ui="runtime-diagnostic-conclusion"]')).toContainText(/Call records missing|调用记录缺失/i);
  const inspect = anomalyTable.getByRole('button');
  await inspect.click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toContainText(/Individual requests cannot be identified|暂无法定位具体请求/i);
  await expect(drawer.locator('[data-ui="runtime-issue-evidence"]')).toContainText('50%');
  await expect(page).toHaveURL(/focus=hosted_model.provider_call_gap/);
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(inspect).toBeFocused();
  await expect(page).not.toHaveURL(/focus=/);
  await page.getByRole('button', { name: /^More diagnostics$|^更多诊断$/ }).click();
  const integrity = page.locator('[data-ui="runtime-data-integrity"]');
  await integrity.locator('summary').first().click();
  await expect(integrity).toContainText(/not request success|不代表请求成功率/i);
  const qualityPanel = page.locator('[data-ui="editor-assist-quality-panel"]');
  await expect(qualityPanel).not.toHaveAttribute('open', '');
  await expect(qualityPanel).toContainText(/Editor-assist quality|编辑辅助质量/i);
  await expect(qualityPanel).toContainText(/Sessions with known outcome \/ total|结果已关联 \/ 总会话/i);
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

  await expect.poll(() => qualityRequests.some((url) => url.includes('task_key=content_summary'))).toBe(true);


  const downloadPromise = page.waitForEvent('download');
  await qualityPanel.getByRole('button', { name: /Export JSON|导出 JSON/i }).click();
  const qualityDownload = await downloadPromise;
  expect(qualityDownload.suggestedFilename()).toBe(
    'npcink-editor-assist-quality-content_summary-24h-2026-04-08.json'
  );
  const qualityDownloadPath = await qualityDownload.path();
  expect(qualityDownloadPath).toBeTruthy();
  const exportedQuality = JSON.parse(readFileSync(qualityDownloadPath!, 'utf8'));
  expect(exportedQuality.contract_version).toBe('editor_assist_quality.v1');
  expect(exportedQuality.filters).toEqual({
    task_key: 'content_summary',
    window_hours: 24,
  });
  expect(exportedQuality.read_only).toBe(true);

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '72h' }).click();
  await page.getByRole('button', { name: /^More diagnostics$|^更多诊断$/ }).click();
  await qualityPanel.locator('summary').click();
  await expect(page).toHaveURL(/window=72/);
  await expect.poll(() => telemetryRequests.some((url) => url.includes('recent_minutes=4320'))).toBe(true);
  await expect.poll(() => qualityRequests.some((url) => url.includes('window_hours=72'))).toBe(true);
  await expect.poll(() => countQualityTrendAccentPixels(qualityPanel)).toBeGreaterThan(20);

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Call records missing|调用记录缺失/i }).click();
  await expect(page).toHaveURL(/focus=hosted_model.provider_call_gap/);
  await expect(page.getByRole('dialog')).toContainText(/Call records missing|调用记录缺失/i);
  await page.reload();
  await expect(page.getByRole('button', { name: /Call records missing|调用记录缺失/i })).toHaveAttribute('aria-expanded', 'true');

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^More diagnostics$|^更多诊断$/ }).click();
  await qualityPanel.locator('summary').click();
  await page.locator('[data-ui="runtime-data-integrity"] summary').first().click();
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

  await page.keyboard.press('Escape');
  failNextTelemetry = true;
  await page.getByRole('button', { name: /^Refresh$|^刷新$/i }).click();
  const sourceError = page.locator('[data-ui="runtime-diagnostic-source-error"]');
  await expect(sourceError).toContainText(/could not refresh|刷新失败/i);
  await expect(sourceError.getByText(/last successfully loaded diagnostic snapshot|最近一次成功加载的诊断快照/i)).toBeVisible();
  await expect(sourceError.getByText('temporary diagnostic failure')).not.toBeVisible();
  await sourceError.locator('summary').click();
  await expect(sourceError.getByText('temporary diagnostic failure')).toBeVisible();

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
      { id: 'dialog-focus-recovery', status: 'pass', evidence: 'shared drawer closes with Escape and restores the inspection trigger' },
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
  await page.getByRole('button', { name: /^More diagnostics$|^更多诊断$/ }).click();
  await expect(qualityPanel).toBeVisible();
  await qualityPanel.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -88));
  await testInfo.attach('p4-e03-editor-assist-quality-mobile', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});

test('anomaly selection keeps counts honest and preserves the diagnostic time window', async ({ page }) => {
  await installAdminMocks(page);
  await page.route('**/api/admin/runtime-telemetry*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildAdminApiEnvelope({
      generated_at: '2026-04-08T10:00:00Z',
      totals: { runs: 10, provider_call_run_coverage_rate: 1, metered_run_coverage_rate: 1 },
      capability_groups: [],
      alert_summary: { status: 'warning', alert_count: 3, alerts: [
        { code: 'hosted_model.provider_errors', severity: 'warning', count: 4, capabilities: ['text'], suggested_action: 'inspect_provider_credentials_quota_and_health' },
        { code: 'hosted_model.failed_runs', severity: 'warning', count: 2, capabilities: ['text'], suggested_action: 'inspect_runtime_failure_detail' },
        { code: 'hosted_model.unmetered_runs', severity: 'error', count: 1, capabilities: ['knowledge'], suggested_action: 'inspect_metering_callback_or_usage_event_mapping' },
      ] },
    })) });
  });
  await page.goto('/admin/troubleshooting?window=72');
  await page.getByRole('button', { name: /Provider call errors|供应商调用错误/ }).click();
  const inspector = page.locator('#runtime-diagnostic-inspector');
  const detail = inspector.locator('[data-ui="runtime-issue-evidence"]');
  await expect(page.locator('[data-ui="runtime-diagnostic-conclusion"]')).toContainText(/Provider call errors|供应商调用错误/i);
  await expect(inspector).toContainText(/No failed-call details|本次未返回具体失败记录/);

  await expect(detail).toContainText(/Failed provider calls: 4|模型调用失败次数: 4/);
  await expect(detail).not.toContainText(/Affected requests|受影响请求数/);
  await expect(detail).toContainText(/No matching function-level data|未返回匹配的功能分组数据/);

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Runtime runs failed|运行任务失败/ }).click();

  await expect(inspector.locator('a[href="/admin/plugin-observability?window=72"]')).toBeVisible();

  await expect(detail).toContainText(/Affected requests: 2|受影响请求数: 2/);
  await expect(page).toHaveURL(/window=72.*focus=hosted_model.failed_runs/);

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Usage records missing|计量记录缺失/ }).click();
  await expect(inspector).toContainText(/Investigation steps|按这个顺序处理/);
  await expect(inspector.locator('a[href="/admin/runtime-profiles"]')).toBeVisible();
  await expect(inspector).not.toContainText('inspect_metering_callback_or_usage_event_mapping');
});

test('no traffic is distinct from no monitored anomaly', async ({ page }) => {
  await installAdminMocks(page);
  let runs = 0;
  await page.route('**/api/admin/runtime-telemetry*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildAdminApiEnvelope({
      generated_at: '2026-04-08T10:00:00Z',
      totals: { runs },
      alert_summary: { status: runs ? 'ok' : 'inactive', alert_count: 0, alerts: [] },
    })) });
  });
  await page.goto('/admin/troubleshooting');
  const queue = page.locator('[data-ui="runtime-diagnostic-table-frame"]');
  await expect(queue).toContainText(/No requests in this period|所选时段没有请求/);
  await expect(queue).not.toContainText(/No monitored anomalies found|未发现已监测异常/);
  await expect(page.locator('#runtime-diagnostic-inspector')).toHaveCount(0);
  runs = 8;
  await page.getByRole('button', { name: /^Refresh$|^刷新$/ }).click();
  await expect(queue).toContainText(/No monitored anomalies found|未发现已监测异常/);
  await expect(page.locator('[data-ui="runtime-diagnostic-conclusion"]')).not.toContainText(/cannot be assessed|暂无法判断/);
});

test('runtime diagnostics keeps total source failure actionable without exposing raw errors by default', async ({ page }) => {
  await installAdminMocks(page);
  await page.route('**/api/admin/runtime-telemetry*', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiErrorEnvelope('runtime source unavailable')),
    });
  });
  await page.route('**/api/admin/editor-assist-quality*', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiErrorEnvelope('quality source unavailable')),
    });
  });

  await page.goto('/admin/troubleshooting');
  const sourceError = page.locator('[data-ui="runtime-diagnostic-source-error"]');
  await expect(sourceError).toContainText(/temporarily unavailable|暂时不可用/i);
  await expect(sourceError.getByText('runtime source unavailable')).not.toBeVisible();

  const tableFrame = page.locator('[data-ui="runtime-diagnostic-table-frame"]');
  await expect(tableFrame).toContainText(/Runtime anomaly data unavailable|运行异常数据不可用/i);
  await expect(tableFrame).not.toContainText(/No active runtime anomalies|当前没有运行异常/i);
  await sourceError.locator('summary').click();
  await expect(sourceError.getByText('runtime source unavailable')).toBeVisible();
});

test('runtime diagnostics keeps narrow evidence lanes as secondary navigation', async ({ page }) => {
  await installAdminMocks(page);
  await page.goto('/admin/troubleshooting');

  await page.getByRole('button', { name: /^More diagnostics$|^更多诊断$/ }).click();
  const lanes = page.locator('#evidence-lanes');
  await expect(lanes).toBeVisible();
  await expect(lanes).not.toHaveAttribute('open', '');
  await expect(lanes.locator('a').first()).not.toBeVisible();
  await lanes.locator('summary').click();
  await expect(lanes.locator('a[href="/admin/audit"]')).toBeVisible();
  await expect(lanes.locator('a[href="/admin/plugin-observability"]')).toBeVisible();
  await expect(lanes.locator('a[href="/admin/media-observability"]')).toBeVisible();
  await expect(lanes.locator('a[href="/admin/vector-observability"]')).toBeVisible();
  await expect(lanes.locator('a[href="/admin/agent-feedback"]')).toBeVisible();
  await expect(lanes.locator('a[href="/admin/ai-advisor"]')).toBeVisible();
  await expect(lanes.getByRole('combobox')).toHaveCount(0);
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
  await page.getByRole('button', { name: /^More diagnostics$|^更多诊断$/ }).click();
  const qualityPanel = page.locator('[data-ui="editor-assist-quality-panel"]');
  await expect(qualityPanel).toContainText(/Too few samples to assess quality|样本不足，暂不能判断效果/i);
  await expect(qualityPanel).toContainText(/insufficient|样本不足/i);
  await expect(qualityPanel).not.toContainText(/No review candidate|无复核候选/i);
});


test('provider failure details explain cause, export evidence and keep recovery unverified', async ({ page }) => {
  await installAdminMocks(page);
  await page.route('**/api/admin/runtime-telemetry*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildAdminApiEnvelope({
      generated_at: '2026-09-10T10:00:00Z', totals: { runs: 45 },
      provider_failures: [{ run_id: 'run-schema-rejected', site_id: 'site-alpha', profile_id: 'wp-ai.classification', provider_id: 'openai', model_id: 'gpt-5.5', reason: 'output_schema_invalid', error_code: 'provider.invalid_request', occurred_at: '2026-09-05T10:00:00Z', recovery: 'unverified' }],
      alert_summary: { status: 'warning', alerts: [{ code: 'hosted_model.provider_errors', severity: 'warning', count: 3, capabilities: ['text'] }] },
    })) });
  });
  await page.goto('/admin/troubleshooting?window=168&focus=hosted_model.provider_errors');
  const details = page.locator('[data-ui="provider-failure-details"]');
  await expect(details).toContainText(/程序发送的返回格式定义|Output schema rejected/i);
  await expect(details).toContainText('site-alpha');
  await expect(details).toContainText(/恢复待验证|Recovery unverified/i);
  await expect(page.locator('#runtime-diagnostic-inspector')).not.toContainText(/当前仅有功能分组统计|only function-level totals/i);
  await expect(details.getByText('run-schema-rejected', { exact: true })).not.toBeVisible();
  await details.locator('summary').first().click();
  await details.locator('summary').nth(1).click();
  await expect(details.getByText('run-schema-rejected', { exact: true })).toBeVisible();
  const downloadEvent = page.waitForEvent('download');
  await details.getByRole('button', { name: /Download investigation|下载排查资料/ }).click();
  const download = await downloadEvent;
  const evidence = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  expect(evidence.recovery).toBe('unverified');
  expect(evidence.windowHours).toBe(168);
  expect(evidence.failures[0].runId).toBe('run-schema-rejected');
});
