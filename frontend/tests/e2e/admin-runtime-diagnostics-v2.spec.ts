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

async function selectPanel(page: import('@playwright/test').Page, name: 'records' | 'trend' | 'overview') {
  await page.locator(`#diagnostic-tab-${name}`).click();
}

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

test('runtime diagnostics shows evidence in three tabs with default selection and scoped links', async ({ page }, testInfo) => {
  const browserEvidence = observeAdminBrowserEvidence(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await installAdminMocks(page);
  const telemetryRequests: string[] = [];
  let failNextTelemetry = false;
  await page.route('**/api/admin/runtime-telemetry*', async (route) => {
    if (!failNextTelemetry) { await route.fallback(); return; }
    failNextTelemetry = false;
    await route.fulfill({ status: 503, json: buildAdminApiErrorEnvelope('temporary diagnostic failure') });
  });
  page.on('request', (request) => {
    if (request.url().includes('/api/admin/runtime-telemetry')) telemetryRequests.push(request.url());
  });
  await page.goto('/admin/troubleshooting');
  await expect(page.locator('[data-ui="backoffice-page-header"][data-density="compact"]')).toBeVisible();
  await expect(page.locator('[data-ui="runtime-diagnostic-metrics"]')).toContainText('83%');
  await expect(page.locator('[data-ui="runtime-diagnostic-issue"]')).toHaveCount(1);
  await expect(page.locator('[data-ui="runtime-diagnostic-conclusion"]')).not.toContainText(/1 (?:类问题|problem types)/);
  await expect(page.locator('[data-ui="runtime-diagnostic-table-frame"]')).toContainText(/1 (?:类问题|problem types)/);
  await expect(page.locator('[data-ui="editor-assist-quality-panel"]')).toHaveCount(0);
  await expect(page.locator('details')).toHaveCount(0);
  await expect(page.locator('#runtime-diagnostic-inspector')).toBeVisible();
  await expect(page.locator('#diagnostic-tab-overview')).toHaveAttribute('aria-selected', 'true');
  const metricHelp = page.locator('[data-ui="runtime-data-integrity"]').first().getByRole('button');
  await metricHelp.hover();
  await expect(page.getByRole('tooltip')).toContainText(/not request success|不代表请求成功率/i);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('runtime-diagnostics-ready.png'), animations: 'disabled' });

  const inspect = page.locator('[data-ui="runtime-diagnostic-issue"]').first();
  await inspect.click();
  const inspector = page.locator('#runtime-diagnostic-inspector');
  await expect(inspector).toBeVisible();
  await expect(inspect).toHaveAttribute('aria-pressed', 'true');
  await selectPanel(page, 'records');
  await expect(inspector.getByText(/No related run records|所选时段内未返回相关运行记录/i)).toBeVisible();
  await selectPanel(page, 'overview');
  await expect(inspector.locator('details')).toHaveCount(0);
  await expect(inspector.locator('details details')).toHaveCount(0);
  await expect(inspector.locator('[data-ui="runtime-issue-evidence"]')).toContainText('50%');
  await expect(inspector.getByRole('columnheader', { name: /Total runs|总运行数/ })).toBeVisible();
  await expect(inspector.locator('[data-ui="runtime-investigation-actions"]')).toBeVisible();
  const queueBox = await page.locator('[data-ui="runtime-diagnostic-table-frame"]').boundingBox();
  const inspectorBox = await inspector.boundingBox();
  expect(queueBox!.height).toBeLessThan(inspectorBox!.height);
  await page.screenshot({ path: testInfo.outputPath('runtime-diagnostics-inspector.png'), animations: 'disabled' });
  await selectPanel(page, 'trend');
  const trend = inspector.locator('[data-ui="runtime-issue-trend"]');
  await expect(trend.locator('canvas').first()).toBeVisible();
  await expect(trend.getByRole('heading')).toHaveCount(0);
  await trend.getByRole('button', { name: /^表格$|^Table$/ }).click();
  await expect(trend.getByRole('columnheader')).toHaveCount(2);
  await expect(trend.getByRole('columnheader').nth(1)).toHaveCSS('text-align', 'right');
  await expect(trend.locator('tbody td').nth(1)).toHaveCSS('text-align', 'right');
  await expect(trend.getByRole('table')).toContainText('2026-04-08');
  const trendDownloadEvent = page.waitForEvent('download');
  await trend.getByRole('button', { name: /Download data|下载数据/ }).click();
  const trendDownload = await trendDownloadEvent;
  const trendExport = JSON.parse(readFileSync((await trendDownload.path())!, 'utf8'));
  expect(trendExport.selected_issue).toBe('hosted_model.provider_call_gap');
  expect(trendExport.unit).toBe('runs');
  expect(trendExport.issues).toBeUndefined();
  await page.screenshot({ path: testInfo.outputPath('runtime-diagnostics-trend-expanded.png'), animations: 'disabled' });
  await selectPanel(page, 'overview');
  await page.getByRole('button', { name: /^14 天$|^14 days$/ }).click();
  await expect(page).toHaveURL(/window=336/);
  await expect.poll(() => telemetryRequests.some((url) => url.includes('recent_minutes=20160'))).toBe(true);
  await inspect.click();
  await page.reload();
  await expect(inspect).toHaveAttribute('aria-pressed', 'true');

  const guide = page.locator('#runtime-evidence');
  await guide.click();
  await expect(page.getByRole('dialog').getByText(/Runtime resolution|运行时解析/i)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(guide).toBeFocused();
  failNextTelemetry = true;
  await page.getByRole('button', { name: /^Refresh$|^刷新$/i }).click();
  const sourceError = page.locator('[data-ui="runtime-diagnostic-source-error"]');
  await expect(sourceError).toContainText(/could not refresh|刷新失败/i);
  await expect(sourceError.getByText(/last successfully loaded diagnostic snapshot|最近一次成功加载的诊断快照/i)).toBeVisible();
  await sourceError.getByRole('button').click();
  await expect(page.getByRole('dialog').getByText('temporary diagnostic failure')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sourceError.getByRole('button')).toBeFocused();
  await expect(page.locator('[data-ui="runtime-diagnostic-issue"]')).toHaveCount(1);
  await writeAdminVisualReceipt({
    page, testInfo, route: '/admin/troubleshooting', pageModel: 'diagnostic',
    testedStates: ['ready', 'selected', 'partial_error', 'disclosure'], dataMode: 'mocked', humanAcceptance: 'pending',
    pageTitle: page.getByRole('heading', { name: /^Runtime diagnostics$|^运行诊断$/i }),
    workingSurface: page.locator('[data-ui="runtime-diagnostic-table-frame"]'), browserEvidence,
    expectedConsoleErrors: [/^Failed to load resource: the server responded with a status of 503 \(Service Unavailable\)$/],
    routeRuleResults: [
      { id: 'single-primary-action', status: 'not_applicable', evidence: 'read-only diagnostics with one recommended navigation action' },
      { id: 'textual-status', status: 'pass', evidence: 'record availability and errors are visible without expansion' },
      { id: 'action-object-proximity', status: 'pass', evidence: 'records and next action sit alongside the selected anomaly' },
      { id: 'distinct-interaction-states', status: 'pass', evidence: 'aria-pressed marks selection separately from keyboard focus' },
      { id: 'dialog-focus-recovery', status: 'pass', evidence: 'shared guide/error drawer closes on Escape and restores the trigger' },
      { id: 'context-stability', status: 'pass', evidence: 'failed refresh retains the selected anomaly and previous summary' },
    ],
    interactionResults: [
      { id: 'window-and-focus', status: 'pass', evidence: 'scope and anomaly selection survive reload via URL' },
      { id: 'direct-evidence', status: 'pass', evidence: 'record state and actions require no disclosure; each evidence view is one explicit task tab' },
      { id: 'partial-refresh-recovery', status: 'pass', evidence: 'partial failure preserves evidence and exposes retry' },
    ],
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: testInfo.outputPath('runtime-diagnostics-mobile.png'), animations: 'disabled' });
});

test('editorial quality detail remains available on the dedicated statistics view', async ({ page }) => {
  await installAdminMocks(page);
  await page.goto('/admin/troubleshooting?site=site-alpha');
  await expect(page.locator('[data-ui="editor-assist-quality-panel"]')).toHaveCount(0);
  const qualityRequest = page.waitForRequest((request) => request.url().includes('/api/admin/editor-assist-quality') && request.url().includes('site_id=site-alpha'));
  await page.locator('[data-ui="runtime-quality-link"]').click();
  await qualityRequest;
  await expect(page).toHaveURL(/view=quality/);
  await expect(page).toHaveURL(/site=site-alpha/);
  const qualityPanel = page.locator('[data-ui="editor-assist-quality-panel"]');
  await expect(qualityPanel).toHaveAttribute('open', '');
  await expect(qualityPanel).toContainText(/Exact adoption|精确采纳率/i);
  await expect(qualityPanel.locator('[data-ui="editor-assist-quality-candidate-table"]')).toBeVisible();
  await expect.poll(() => countQualityTrendAccentPixels(qualityPanel)).toBeGreaterThan(20);
  await qualityPanel.getByLabel(/Task|任务/i).selectOption('content_summary');
  const downloadEvent = page.waitForEvent('download');
  await qualityPanel.getByRole('button', { name: /Export JSON|导出 JSON/i }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('npcink-editor-assist-quality-content_summary-336h-2026-04-08.json');
  const exported = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  expect(exported.contract_version).toBe('editor_assist_quality.v2');
  expect(exported.filters).toEqual({ task_key: 'content_summary', window_hours: 336 });
  expect(exported.read_only).toBe(true);
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
  await page.goto('/admin/troubleshooting?window=720');
  await expect(page.locator('[data-ui="runtime-diagnostic-issue"]').first()).toContainText(/Usage records missing|计量记录缺失/i);
  await expect(page.locator('[data-ui="runtime-diagnostic-table-frame"]')).toContainText(/3 problem types|3 类问题/i);
  await page.getByRole('button', { name: /Provider call errors|供应商调用错误/ }).click();
  const inspector = page.locator('#runtime-diagnostic-inspector');
  const detail = inspector.locator('[data-ui="runtime-issue-evidence"]');
  await expect(inspector).toContainText(/No failed-call details|本次未返回具体失败记录/);

  await expect(page.locator('[data-ui="runtime-diagnostic-issue"][aria-pressed="true"]')).toContainText(/4 calls|4 次调用/);
  await expect(detail).not.toContainText(/Affected requests|受影响请求数/);
  await expect(detail).toContainText(/No matching function-level data|未返回匹配的功能分组数据/);

  await expect(inspector).not.toContainText('{count}');

  await page.getByRole('button', { name: /Runtime runs failed|运行任务失败/ }).click();

  await expect(inspector.getByRole('button', { name: /Inspect failure records|查看失败记录/ })).toBeVisible();

  await expect(page.locator('[data-ui="runtime-diagnostic-issue"][aria-pressed="true"]')).toContainText(/2 runs|2 次运行/);
  await expect(page).toHaveURL(/window=720.*focus=hosted_model.failed_runs/);

  await page.getByRole('button', { name: /Usage records missing|计量记录缺失/ }).click();
  await expect(inspector).toContainText(/Next action|下一步/);
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
  await sourceError.getByRole('button').click();
  await expect(page.getByRole('dialog').getByText('runtime source unavailable')).toBeVisible();
});

test('runtime diagnostics exposes direct secondary tools on desktop and mobile', async ({ page }, testInfo) => {
  await installAdminMocks(page);
  await page.goto('/admin/troubleshooting');

  const lanes = page.locator('#evidence-lanes');
  const toolLinks = lanes;
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /More diagnostic tools|更多诊断工具/ })).toHaveCount(0);
  await expect(toolLinks.getByRole('link')).toHaveCount(7);
  await expect(lanes).toBeVisible();
  await expect(lanes.locator('summary')).toHaveCount(0);
  await expect(toolLinks.locator('a[href="/admin/audit"]')).toBeVisible();
  await expect(toolLinks.locator('a[href^="/admin/plugin-observability"]')).toBeVisible();
  await expect(toolLinks.locator('a[href^="/admin/media-observability"]')).toBeVisible();
  await expect(toolLinks.locator('a[href^="/admin/vector-observability"]')).toBeVisible();
  await expect(toolLinks.locator('a[href^="/admin/agent-feedback"]')).toBeVisible();
  await expect(toolLinks.locator('a[href^="/admin/ai-advisor"]')).toBeVisible();
  await expect(lanes.getByRole('combobox')).toHaveCount(0);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await lanes.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    const boxes = await lanes.getByRole('link').evaluateAll((links) => links.map((link) => {
      const rect = link.getBoundingClientRect(); return { left: rect.left, right: rect.right, height: rect.height };
    }));
    expect(boxes.every((box) => box.left >= 0 && box.right <= width && box.height >= 32)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`runtime-diagnostic-tools-${width}.png`), animations: 'disabled' });
  }
  await lanes.getByRole('link').first().focus();
  await lanes.getByRole('link').first().press('Tab');
  await expect(lanes.getByRole('link').nth(1)).toBeFocused();
  await lanes.locator('a[href^="/admin/plugin-observability"]').click();
  await expect(page).toHaveURL(/\/admin\/plugin-observability\?window=336$/);
  await expect(page.getByRole('heading', { level: 1, name: /Plugin observability|插件观测/i })).toBeVisible();
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

  await page.goto('/admin/usage-statistics?view=quality&window=336');
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
  await page.route('**/api/admin/runtime-telemetry/runs*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildAdminApiEnvelope({
      generated_at: '2026-09-10T10:00:00Z', sampled: false, truncated: false,
      items: [{ run_id: 'run-schema-rejected', site_id: 'site-alpha', ability_name: 'wp-ai/classification', ability_family: 'text', profile_id: 'wp-ai.classification', status: 'failed', error_code: 'provider.invalid_request', started_at: '2026-09-05T10:00:00Z', finished_at: '2026-09-05T10:00:01Z', duration_ms: 1000, provider_call_count: 1, has_meter_event: false }],
    })) });
  });
  await page.goto('/admin/troubleshooting?window=168&focus=hosted_model.provider_errors');
  await expect(page.getByRole('main').getByRole('link', { name: /Usage Statistics|使用统计/ })).toHaveAttribute('href', '/admin/usage-statistics?window=336&from=troubleshooting');
  const details = page.locator('[data-ui="provider-failure-details"]');
  await expect(page.locator('[data-ui="runtime-inspector-summary"]')).toContainText(/程序发送的返回格式定义|Output schema rejected/i);
  await selectPanel(page, 'records');
  await expect(page.locator('[data-ui="runtime-run-evidence"]')).toContainText('site-alpha');
  await expect(page.locator('[data-ui="provider-recovery-status"]')).toContainText(/恢复待验证|Recovery unverified/i);
  const trigger = page.locator('[data-ui="runtime-run-evidence"]').getByRole('button', { name: /View detail|查看详情/ });
  await trigger.click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByText('run-schema-rejected', { exact: true })).toBeVisible();
  await expect(drawer.locator('details')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await selectPanel(page, 'overview');
  const downloadEvent = page.waitForEvent('download');
  await details.click();
  const download = await downloadEvent;
  const evidence = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  expect(evidence.recovery).toBe('unverified');
  expect(evidence.windowHours).toBe(336);
  expect(evidence.failures[0].runId).toBe('run-schema-rejected');
});


test('successful runs remain successful inside a call-record gap', async ({ page }, testInfo) => {
  await installAdminMocks(page);
  await page.setViewportSize({ width: 628, height: 837 });
  await page.route('**/api/admin/runtime-telemetry/runs*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildAdminApiEnvelope({
      sampled: false, truncated: false,
      items: [{ run_id: 'run-success-with-evidence-gap', site_id: 'site-alpha', ability_name: 'npcink-cloud/site-knowledge-status', ability_family: 'knowledge', profile_id: 'site-knowledge.managed', status: 'SUCCEEDED', error_code: null, duration_ms: 118, provider_call_count: 0, has_meter_event: true }],
    })) });
  });
  await page.goto('/admin/troubleshooting');
  await expect(page.locator('[data-ui="runtime-diagnostic-issue"]')).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('runtime-diagnostics-ready-narrow.png'), animations: 'disabled' });
  await page.getByRole('button', { name: /Call records missing|调用记录缺失/ }).click();
  await selectPanel(page, 'records');
  const evidence = page.locator('[data-ui="runtime-run-evidence"]');
  await expect(evidence.getByText(/^Succeeded$|^成功$/)).toBeVisible();
  await expect(evidence.getByText(/^Succeeded$|^成功$/)).toHaveClass(/emerald/);
  await expect(evidence.getByText('run-success-with-evidence-gap', { exact: true })).not.toBeVisible();
  const trigger = evidence.getByRole('button', { name: /View detail|查看详情/ });
  await trigger.click();
  await expect(page.getByRole('dialog').getByText('run-success-with-evidence-gap', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(628);
  await testInfo.attach('runtime-diagnostics-success-narrow', { body: await page.screenshot({ path: testInfo.outputPath('runtime-diagnostics-success-narrow.png'), animations: 'disabled' }), contentType: 'image/png' });
});

test('inherited scope filters stay visible at the scope row and clear independently', async ({ page }) => {
  await installAdminMocks(page);
  await page.goto('/admin/troubleshooting?site=site-alpha&function=text');
  const scopeFilters = page.locator('[data-ui="runtime-diagnostic-scope-filters"]');
  const sitePill = scopeFilters.getByRole('button', { name: /^Clear site filter$|^清除站点筛选$/ });
  const functionPill = scopeFilters.getByRole('button', { name: /^Clear function filter$|^清除功能筛选$/ });
  await expect(sitePill).toBeVisible();
  await expect(sitePill).toContainText(/site-alpha/);
  await expect(functionPill).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: /Usage Statistics|使用统计/ })).toHaveAttribute('href', '/admin/usage-statistics?window=336&from=troubleshooting&group=sites&site=site-alpha&function=text');
  await expect(page.locator('[data-ui="editor-assist-quality-panel"]')).toHaveCount(0);

  await sitePill.click();
  await expect(page).not.toHaveURL(/site=/);
  await expect(page).toHaveURL(/function=text/);
  await expect(sitePill).toHaveCount(0);
  await expect(functionPill).toBeVisible();

  await functionPill.click();
  await expect(page).not.toHaveURL(/function=/);
  await expect(scopeFilters).toHaveCount(0);
});

test('multi-function evidence retains successful scopes, distinguishes failures, and retries', async ({ page }, testInfo) => {
  await installAdminMocks(page);
  await page.setViewportSize({ width: 1440, height: 1050 });
  const requests: URL[] = [];
  let failKnowledge = true;
  let failAll = false;
  let malformed = false;
  const summary = {
    generated_at: '2026-10-07T10:00:00Z',
    totals: { runs: 211, provider_call_run_coverage_rate: 0.66, metered_run_coverage_rate: 1 },
    capability_groups: [
      { group_id: 'text', runs_total: 30, failed: 9, provider_errors: 14, provider_call_run_coverage_rate: 1, metered_run_coverage_rate: 1 },
      { group_id: 'knowledge', runs_total: 181, failed: 0, provider_errors: 0, provider_call_run_coverage_rate: 0.61, metered_run_coverage_rate: 1 },
    ],
    alert_summary: { status: 'error', alerts: [
      { code: 'hosted_model.provider_errors', severity: 'error', count: 14, capabilities: ['text'] },
      { code: 'hosted_model.provider_call_gap', severity: 'warning', count: 72, capabilities: ['text', 'knowledge'] },
      { code: 'hosted_model.failed_runs', severity: 'warning', count: 9, capabilities: ['text'] },
    ] },
  };
  await page.route(/\/api\/admin\/runtime-telemetry(?:\/runs)?\?/, async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.endsWith('/runs')) {
      if (url.searchParams.get('recent_minutes') === '43200') await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({ json: buildAdminApiEnvelope(summary) });
      return;
    }
    requests.push(url);
    const scope = url.searchParams.get('capability')!;
    if (failAll || (scope === 'knowledge' && failKnowledge)) {
      await route.fulfill({ status: 503, json: buildAdminApiErrorEnvelope('evidence source unavailable') });
      return;
    }
    if (malformed) {
      await route.fulfill({ json: buildAdminApiEnvelope({ items: [{ run_id: null }, { run_id: null }] }) });
      return;
    }
    await route.fulfill({ json: buildAdminApiEnvelope({ items: [{
      run_id: `run-${scope}`, site_id: 'site-alpha', ability_name: `inspect-${scope}`, ability_family: scope,
      profile_id: `${scope}.managed`, status: 'succeeded', duration_ms: 118, provider_call_count: 0,
      has_meter_event: true, started_at: '2026-10-07T10:00:00Z',
    }], sampled: false, truncated: false }) });
  });
  await page.goto('/admin/troubleshooting?site=site-alpha');
  await expect(page.locator('[data-ui="runtime-diagnostic-issue"]')).toHaveCount(3);
  await page.screenshot({ path: testInfo.outputPath('runtime-diagnostics-three-issues.png'), animations: 'disabled' });
  const gap = page.getByRole('button', { name: /Call records missing|调用记录缺失/ });
  await gap.focus();
  await gap.press('Enter');

  await selectPanel(page, 'records');
  const evidence = page.locator('[data-ui="runtime-run-evidence"]');
  await expect(evidence.getByRole('alert')).toContainText(/Some functions could not load|部分功能的记录加载失败/);
  await expect(evidence).toContainText('inspect-text');
  await expect(evidence).not.toContainText(/No related run records|未返回相关运行记录/);
  expect(requests.filter((url) => url.searchParams.get('issue_code') === 'hosted_model.provider_call_gap').map((url) => url.searchParams.get('capability')).sort()).toEqual(['knowledge', 'text']);
  expect(requests.every((url) => url.searchParams.get('site_id') === 'site-alpha' && url.searchParams.get('recent_minutes') === '20160')).toBe(true);
  failKnowledge = false;
  await evidence.getByRole('button', { name: /Retry records|重试加载记录/ }).click();
  await expect(evidence).toContainText('inspect-knowledge');
  await expect(evidence.getByRole('alert')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('runtime-diagnostics-three-issues-selected.png'), animations: 'disabled' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: testInfo.outputPath('runtime-diagnostics-three-issues-dark.png'), animations: 'disabled' });

  failAll = true;
  await page.getByRole('button', { name: /Runtime runs failed|运行任务失败/ }).click();
  await selectPanel(page, 'records');
  await expect(evidence.getByRole('alert')).toContainText(/Run records could not load|运行记录加载失败/);
  await expect(evidence).not.toContainText('inspect-text');
  await expect(evidence).not.toContainText(/No related run records|未返回相关运行记录/);
  failAll = false;
  await evidence.getByRole('button', { name: /Retry records|重试加载记录/ }).click();
  await expect(evidence).toContainText('inspect-text');
  await expect(evidence.getByRole('alert')).toHaveCount(0);
  malformed = true;
  await page.getByRole('button', { name: /Call records missing|调用记录缺失/ }).click();
  await selectPanel(page, 'records');
  await expect(evidence.getByRole('alert')).toContainText(/Run records could not load|运行记录加载失败/);
  await expect(evidence).not.toContainText('inspect-text');
  malformed = false;
  await evidence.getByRole('button', { name: /Retry records|重试加载记录/ }).click();
  await expect(evidence).toContainText('inspect-text');
  await expect(evidence.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: /^30 days$|^30 天$/ }).click();
  await expect(page.getByLabel(/^Loading runtime diagnostics$|^正在加载运行诊断$/)).toBeVisible();
  await expect(page.locator('[data-ui="runtime-diagnostic-metrics"]')).toHaveCount(0);
  await expect(page.locator('[data-ui="runtime-diagnostic-issue"]')).toHaveCount(3);
});

test('four anomalies keep a five-record default, a short queue and a single-unit trend', async ({ page }, testInfo) => {
  await installAdminMocks(page);
  await page.setViewportSize({ width: 1440, height: 1050 });
  const codes = ['hosted_model.unmetered_runs', 'hosted_model.provider_errors', 'hosted_model.provider_call_gap', 'hosted_model.failed_runs'];
  await page.route(/\/api\/admin\/runtime-telemetry(?:\/runs)?\?/, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/runs')) {
      await route.fulfill({ json: buildAdminApiEnvelope({ sampled: true, truncated: true, items: Array.from({ length: 13 }, (_, index) => ({
        run_id: `run-sample-${index}`, site_id: 'site-alpha', ability_name: 'wp-ai/classification', ability_family: 'text',
        profile_id: 'text.managed', status: url.searchParams.get('issue_code') === 'hosted_model.provider_errors' ? 'failed' : 'succeeded', duration_ms: 1000, provider_call_count: 1, has_meter_event: false,
        started_at: `2026-10-07T10:${String(index).padStart(2, '0')}:00Z`,
      })) }) });
      return;
    }
    await route.fulfill({ json: buildAdminApiEnvelope({
      generated_at: '2026-10-07T10:00:00Z', totals: { runs: 1858, provider_call_run_coverage_rate: 0.94, metered_run_coverage_rate: 0.91 },
      capability_groups: [
        { group_id: 'knowledge', runs_total: 151, metered_run_coverage_rate: 0.54 },
        { group_id: 'text', runs_total: 1593, metered_run_coverage_rate: 0.94 },
      ],
      provider_failures: Array.from({ length: 13 }, (_, index) => ({ run_id: `run-sample-${index}`, site_id: 'site-alpha', profile_id: 'text.managed', provider_id: 'provider-local', model_id: 'model-local', reason: 'unknown', error_code: 'provider.error', occurred_at: '2026-10-07T10:00:00Z' })),
      alert_summary: { status: 'error', alerts: codes.map((code, index) => ({ code, severity: index < 2 ? 'error' : 'warning',
        count: [166, 122, 102, 60][index], capabilities: index === 0 ? ['text', 'knowledge'] : ['text', 'vision'],
        daily_counts: [{ day: '2026-10-06', count: [100, 110, 90, 50][index] }, { day: '2026-10-07', count: [66, 12, 12, 10][index] }],
      })) },
    }) });
  });
  await page.goto('/admin/troubleshooting?focus=hosted_model.unmetered_runs');
  const inspector = page.locator('#runtime-diagnostic-inspector');
  await selectPanel(page, 'records');
  const records = inspector.locator('[data-ui="runtime-run-evidence"]');
  await expect(records.getByRole('row')).toHaveCount(6);
  await expect(records.getByRole('columnheader').nth(2)).toHaveCSS('text-align', 'right');
  await expect(records.getByRole('row').nth(1).getByRole('cell').nth(2)).toHaveCSS('text-align', 'right');
  await expect(records).toContainText(/5.*13/);
  await expect(records).toContainText(/bounded sample|有限样本/i);
  await expect(page.locator('[data-ui="runtime-diagnostic-issue"]')).toHaveCount(4);
  await expect(page.locator('[data-ui="runtime-diagnostic-issue-grid"]')).toContainText(/图像理解|Image understanding/);
  await expect(inspector.locator('details')).toHaveCount(0);
  await expect(inspector.locator('details details')).toHaveCount(0);
  await selectPanel(page, 'overview');
  const actionBox = await inspector.locator('[data-ui="runtime-investigation-actions"]').boundingBox();
  expect(actionBox!.y + actionBox!.height).toBeLessThan(1050);
  const queueBox = await page.locator('[data-ui="runtime-diagnostic-table-frame"]').boundingBox();
  const inspectorBox = await inspector.boundingBox();
  expect(queueBox!.height).toBeLessThan(500);
  expect(inspectorBox!.height).toBeLessThan(600);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440);
  await page.screenshot({ path: testInfo.outputPath('runtime-diagnostics-four-issues.png'), animations: 'disabled' });
  await selectPanel(page, 'records');
  await records.getByRole('button', { name: /Show 5 more|再显示 5 条/ }).click();
  await expect(records.getByRole('row')).toHaveCount(11);
  await records.getByRole('button', { name: /View detail|查看详情/ }).first().click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByText('run-sample-12', { exact: true })).toBeVisible();
  const close = drawer.locator('[data-ui="admin-inspector-drawer-close"]');
  await expect(close).toBeFocused();
  await close.press('Shift+Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(records.getByRole('button', { name: /View detail|查看详情/ }).first()).toBeFocused();
  await page.getByRole('button', { name: /Provider call errors|供应商调用错误/ }).click();
  await selectPanel(page, 'records');
  await expect(records.getByRole('row')).toHaveCount(6);
  await expect(records.getByText(/^Failed$|^失败$/)).toHaveCount(5);
  await expect(records).not.toContainText(/cause not yet classified|原因未分类/);
  await selectPanel(page, 'overview');
  const providerActionBox = await inspector.locator('[data-ui="runtime-investigation-actions"]').boundingBox();
  expect(providerActionBox!.y + providerActionBox!.height).toBeLessThan(1050);
  await selectPanel(page, 'trend');
  const trend = inspector.locator('[data-ui="runtime-issue-trend"]');
  await trend.getByRole('button', { name: /^Table$|^表格$/ }).click();
  await expect(trend.getByRole('columnheader')).toHaveCount(2);
  await expect(trend.getByRole('columnheader', { name: /^Calls$|^调用次数$/ })).toBeVisible();
  await expect(trend.getByRole('table')).toContainText('110');
  await expect(trend.getByRole('table')).not.toContainText('100');
  await page.screenshot({ path: testInfo.outputPath('runtime-diagnostics-four-issues-trend.png'), animations: 'disabled' });
});


test('task tabs support keyboard, help is optional, and navigation retains supported scopes', async ({ page }) => {
  await installAdminMocks(page);
  await page.goto('/admin/troubleshooting?site=site-alpha&function=knowledge&focus=unknown');
  const issue = page.locator('[data-ui="runtime-diagnostic-issue"]').first();
  await expect(issue).toHaveAttribute('aria-pressed', 'true');
  await expect(page).not.toHaveURL(/focus=unknown/);
  const overview = page.locator('#diagnostic-tab-overview');
  const records = page.locator('#diagnostic-tab-records');
  await overview.focus();
  await overview.press('ArrowRight');
  await expect(records).toBeFocused();
  await expect(overview).toHaveAttribute('aria-selected', 'true');
  await records.press('Enter');
  await expect(records).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/panel=records/);
  await page.reload();
  await expect(records).toHaveAttribute('aria-selected', 'true');
  await issue.click();
  await expect(overview).toHaveAttribute('aria-selected', 'true');
  const help = page.getByRole('button', { name: /^About this issue$|^问题含义$/ });
  await help.focus();
  await expect(page.getByRole('tooltip')).toContainText(/evidence gap|证据缺口/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await help.click();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await help.click();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await expect(page.locator('#runtime-diagnostic-inspector a[href*="plugin-observability"]')).toHaveAttribute('href', '/admin/plugin-observability?window=336&site=site-alpha');
  const tools = page.locator('#evidence-lanes');
  await expect(tools.locator('a[href^="/admin/vector-observability"]')).toHaveAttribute('href', '/admin/vector-observability?window=336&site=site-alpha');
  await expect(tools.locator('a[href^="/admin/audit"]')).toHaveAttribute('href', '/admin/audit?site_id=site-alpha');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

for (const width of [1280, 1440, 1920]) {
  test(`diagnostic geometry aligns adjacent panels and uses available width at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await installAdminMocks(page);
    await page.goto('/admin/troubleshooting');
    const queue = page.locator('[data-ui="runtime-diagnostic-table-frame"]');
    const inspector = page.locator('#runtime-diagnostic-inspector');
    await expect(inspector).toBeVisible();
    const queueBox = (await queue.boundingBox())!;
    const inspectorBox = (await inspector.boundingBox())!;
    expect(Math.abs(queueBox.y - inspectorBox.y)).toBeLessThanOrEqual(1);
    expect(queueBox.width).toBe(320);
    expect(queueBox.y).toBeLessThan(220);
    const leftTitle = (await queue.getByRole('heading', { level: 2 }).boundingBox())!;
    const rightTitle = (await inspector.getByRole('heading', { level: 2 }).boundingBox())!;
    expect(Math.abs(leftTitle.y + leftTitle.height / 2 - rightTitle.y - rightTitle.height / 2)).toBeLessThanOrEqual(1);
    const header = page.locator('[data-ui="backoffice-page-header"]');
    const title = (await header.getByRole('heading', { level: 1 }).boundingBox())!;
    const window = (await header.locator('[data-ui="admin-observation-window"]').boundingBox())!;
    expect(Math.abs(title.y + title.height / 2 - window.y - window.height / 2)).toBeLessThanOrEqual(1);
    const metrics = (await page.locator('[data-ui="runtime-diagnostic-metrics"]').boundingBox())!;
    const conclusion = (await page.locator('[data-ui="runtime-diagnostic-conclusion"]').boundingBox())!;
    expect(Math.abs(metrics.y + metrics.height / 2 - conclusion.y - conclusion.height / 2)).toBeLessThanOrEqual(1);
    const summary = (await inspector.locator('[data-ui="runtime-inspector-summary"]').boundingBox())!;
    const actions = (await inspector.locator('[data-ui="runtime-investigation-actions"]').boundingBox())!;
    if (width >= 1600) {
      expect(actions.x).toBeGreaterThan(summary.x + summary.width);
      expect(Math.abs(actions.y - summary.y)).toBeLessThanOrEqual(1);
    } else {
      expect(actions.y).toBeGreaterThan(summary.y + summary.height);
    }
    const table = inspector.locator('[data-ui="runtime-issue-evidence"] table');
    await expect(table.getByRole('columnheader').nth(1)).toHaveCSS('text-align', 'right');
    await expect(table.locator('tbody td').first()).toHaveCSS('text-align', 'right');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({ path: testInfo.outputPath(`runtime-diagnostics-geometry-${width}.png`), animations: 'disabled' });
  });
}

test('diagnostic help remains inside a short viewport and flips above its trigger', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 300 });
  await installAdminMocks(page);
  await page.goto('/admin/troubleshooting');
  const trigger = page.locator('[data-ui="runtime-issue-evidence"] thead button');
  await trigger.focus();
  await expect(page.getByRole('tooltip')).toBeVisible();
  const triggerBox = (await trigger.boundingBox())!;
  const tipBox = (await page.getByRole('tooltip').boundingBox())!;
  expect(tipBox.y).toBeGreaterThanOrEqual(8);
  expect(tipBox.y + tipBox.height).toBeLessThanOrEqual(292);
  expect(tipBox.y + tipBox.height).toBeLessThanOrEqual(triggerBox.y);
  await trigger.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
});
