import { expect, test } from '@playwright/test';
import { buildRuntimeTelemetryFixture } from './helpers/runtime-telemetry-fixture';
import {
  buildAdminApiEnvelope,
  buildAdminApiErrorEnvelope,
  installAdminMocks,
} from './helpers/admin-operator-fixture';

test('admin overview keeps canonical work destinations primary and evidence collapsed', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await installAdminMocks(page);
  await page.goto('/admin');

  await expect(page.getByText(/Not operationally ready|未达到运营就绪/i).first()).toBeVisible();
  await expect(page.locator('[data-ui="admin-overview-conclusion"]')).toContainText(
    /2 formal readiness checks failed across workers, operations cadence|正式运营就绪检查有 2 项失败.*工作进程.*运维定时任务/i
  );
  await expect(page.getByText(/Provider call coverage gap|Call records missing|供应商调用遥测缺口|调用记录缺失/i).first()).toBeVisible();
  await expect(page.getByText(/Attention subscriptions already need review|Attention 订阅已经需要审查/i)).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Inspect readiness failures|检查就绪失败项/i })).toHaveAttribute(
    'href',
    '/admin/troubleshooting'
  );
  await expect(page.locator('[data-ui="admin-overview-action"]')).toHaveCount(2);
  await expect(page.locator('[data-ui="admin-overview-action-count"]')).toContainText('2');
  await expect(page.locator('[data-ui="admin-overview-action"] a').first()).toHaveAttribute(
    'href',
    '/admin/troubleshooting'
  );
  await expect(page.locator('[data-ui="admin-overview-destination"]')).toHaveCount(4);
  await expect(page.locator('[data-ui="admin-overview-destination"][href="/admin/accounts"]')).toBeVisible();
  await expect(page.locator('[data-ui="admin-overview-destination"][href="/admin/coverage"]')).toBeVisible();
  await expect(page.locator('[data-ui="admin-overview-destination"][href="/admin/support-requests"]')).toBeVisible();
  await expect(page.locator('[data-ui="admin-overview-destination"][href="/admin/troubleshooting"]')).toBeVisible();
  await expect(page.locator('[data-ui="admin-overview-destinations"] a[href="/admin/ai-resources"]')).toHaveCount(0);
  await expect(page.locator('[data-ui="admin-overview-destinations"] a[href="/admin/service-settings"]')).toHaveCount(0);

  const extendedEvidence = page.locator('details').filter({
    hasText: /Platform usage and extended evidence|平台用量与扩展证据/i,
  });
  await expect(extendedEvidence).not.toHaveAttribute('open', '');
  await expect(page.getByRole('heading', { name: /Runtime and usage snapshot|运行与用量快照/i })).toBeHidden();
  const overviewScreenshotPath = testInfo.outputPath('p4-e03-admin-overview.png');
  await page.screenshot({ path: overviewScreenshotPath, fullPage: true });
  await testInfo.attach('p4-e03-admin-overview', {
    path: overviewScreenshotPath,
    contentType: 'image/png',
  });

  for (const width of [1440, 900]) {
    await page.setViewportSize({ width, height: 1050 });
    const firstAction = await page.locator('[data-ui="admin-overview-action"]').first().boundingBox();
    expect(firstAction && firstAction.y + firstAction.height).toBeLessThan(1050);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/admin-hierarchy-home-${width}.png` });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('admin overview surfaces provider budget pressure before dispatch widens', async ({ page }) => {
  await installAdminMocks(page);
  await page.route('**/api/admin/overview', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiEnvelope({
        generated_at: '2026-09-23T12:00:00Z',
        counts: { sites_active: 1 },
        operational_readiness: { status: 'ok', checks_failed: 0, failure_scopes: [], href: '/admin/troubleshooting' },
        runtime_diagnostics: { callback: { failed: 0, pending: 0 }, guard: { recent_events: 0 } },
        runtime_telemetry: { alert_summary: { status: 'inactive', alert_count: 0, alerts: [] } },
        provider_budget: { status: 'warning', items: [{ warning: true }] },
        operator_projection: {
          revision: 'admin-overview-operator-projection-v1',
          status: 'warning',
          conclusion_code: 'warning',
          conclusion_args: {},
          readiness: { status: 'ready', checks_failed: 0, failure_scopes: [], href: '/admin/troubleshooting' },
          primary_action: { kind: 'provider_budget', href: '/admin/ai-resources' },
          follow_up_focus: 'runtime',
          watch_items: [{
            code: 'provider_budget_pressure',
            scope: 'runtime.provider_budget',
            severity: 'warn',
            value: 1,
            detail_code: 'provider_budget_warning',
            detail_args: {},
          }],
        },
        attention_subscriptions: [],
        expiring_subscriptions: { within_7_days: 0 },
      })),
    });
  });
  await page.goto('/admin');

  await expect(page.getByText(/Provider budget needs review|Provider 预算需要复核/i)).toBeVisible();
  await expect(page.getByText(/near its warning threshold|接近警告阈值/i)).toBeVisible();
  await expect(page.getByRole('link', { name: /Review provider budget|复核 Provider 预算/i })).toHaveAttribute(
    'href',
    '/admin/ai-resources'
  );
});

test('quick switcher discovers diagnostic child routes without expanding the sidebar', async ({ page }) => {
  await installAdminMocks(page);
  await page.goto('/admin');

  await expect(page.locator('[data-ui="admin-primary-nav"] a[href="/admin/media-observability"]')).toHaveCount(0);
  await expect(page.locator('[data-ui="admin-primary-nav"] a[href="/admin/accounts"]')).toHaveAttribute(
    'data-nav-level',
    'primary'
  );
  await page.getByRole('button', { name: /Collapse sidebar|收起侧栏/i }).click();
  const collapsedLabels = page.locator('[data-ui="admin-primary-nav"] [data-nav-collapsed-label]');
  const labelValues = await collapsedLabels.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-nav-collapsed-label')));
  expect(new Set(labelValues).size).toBe(labelValues.length);
  await expect(page.locator('[data-nav-collapsed-label="CU"]')).toHaveCount(1);
  await expect(page.locator('[data-ui="admin-primary-nav"] a[href="/admin/accounts"]')).toBeVisible();

  const switcherButton = page.getByRole('button', { name: /Open quick switcher|打开快速跳转/i });
  await switcherButton.click();
  const dialog = page.getByRole('dialog', { name: /Quick switcher|快速跳转/i });
  const input = dialog.locator('input');
  await input.fill('customer');
  await expect(dialog.locator('a[href="/admin/accounts"]')).toContainText(/Customer Ops|客户运营/i);

  await input.fill('media');
  await expect(dialog.locator('a[href="/admin/media-observability"]')).toBeVisible();
  await expect(dialog.getByText(/Diagnostics|诊断/i)).toBeVisible();

  await input.fill('feedback');
  await expect(dialog.locator('a[href="/admin/agent-feedback"]')).toBeVisible();
  await input.fill('vector');
  await expect(dialog.locator('a[href="/admin/vector-observability"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(switcherButton).toBeFocused();
});

test('admin overview API failure preserves the page shell and safe retry', async ({ page }) => {
  await installAdminMocks(page);
  await page.unroute('**/api/admin/**');
  await page.route('**/api/admin/overview', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify(
        buildAdminApiErrorEnvelope(
          'overview unavailable',
          'admin.overview_unavailable'
        )
      ),
    });
  });
  await page.goto('/admin');

  await expect(page.getByRole('heading', { name: /Platform state comes first|先看平台概况/i })).toBeVisible();
  await expect(page.locator('[role="alert"]').filter({ hasText: /加载数据失败|Failed to load data\./ })).toBeVisible();
  await expect(page.getByText('overview unavailable', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Retry$|^重试$/i })).toBeVisible();
});

test('overview shows stale read failures and preserves missing metrics as unknown', async ({ page }) => {
  await installAdminMocks(page);
  await page.goto('/admin');
  await expect(page.locator('[data-ui="admin-overview-attention"]')).toBeVisible();
  await page.route('**/api/admin/overview', (route) => route.fulfill({ status: 503, json: buildAdminApiErrorEnvelope('read unavailable') }));
  await page.getByRole('button', { name: /^Refresh$|^刷新$/ }).click();
  await expect(page.getByText(/Refresh failed.*previous snapshot|刷新失败.*旧快照/)).toBeVisible();
  await expect(page.locator('[data-ui="admin-overview-attention"]')).toBeVisible();
  await page.route('**/api/admin/overview', (route) => route.fulfill({ json: buildAdminApiEnvelope({}) }));
  await page.getByRole('button', { name: /^Retry$|^重试$/ }).click();
  await expect(page.getByText(/Some metrics are unavailable|部分指标未返回/)).toBeVisible();
  await expect(page.locator('main').getByText('—', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Refresh failed.*previous snapshot|刷新失败.*旧快照/)).toHaveCount(0);
});

test('commercial watch action names the general service-status destination', async ({ page }) => {
  await installAdminMocks(page);
  await page.route('**/api/admin/overview', route => route.fulfill({ json: buildAdminApiEnvelope({
    counts: { sites_active: 1 },
    operator_projection: {
      revision: 'admin-overview-operator-projection-v1', status: 'warning',
      readiness: { status: 'ready', checks_failed: 0, failure_scopes: [] },
      watch_items: [{ code: 'commercial_subscription_expiring', scope: 'commercial.subscription', severity: 'warn', value: 2, detail_args: {} }],
    },
  }) }));
  await page.goto('/admin');
  await expect(page.locator('[data-ui="admin-overview-action"]').getByRole('link', { name: /Open service status|打开服务状态/ })).toHaveAttribute('href', '/admin/coverage');
});


test('overview diagnostic links retain the selected problem and source start for fresh review', async ({ page }) => {
  await installAdminMocks(page);
  // The shared historical fixture predates this source scope. Return a valid,
  // fresh destination response with a different issue to test preserved focus.
  await page.route(/\/api\/admin\/runtime-telemetry\?/, route => route.fulfill({ json: buildAdminApiEnvelope(buildRuntimeTelemetryFixture({
    generated_at: '2026-11-03T08:01:00Z',
    totals: { runs: 2, provider_call_run_coverage_rate: 0.5 },
    alert_summary: { status: 'warning', alerts: [{ code: 'hosted_model.provider_call_gap', count: 1, severity: 'warning', capabilities: ['text'] }] },
  }, new URL(route.request().url()).searchParams)) }));
  const code = 'hosted_model.failed_runs';
  await page.route('**/api/admin/overview', route => route.fulfill({ json: buildAdminApiEnvelope({
    runtime_telemetry: { generated_at: '2026-11-03T08:00:00Z', filters: { site_id: 'site-alpha', recent_minutes: 1440 }, alert_summary: { status: 'warning', alerts: [{ code, count: 1, severity: 'warning', capabilities: ['text'] }] } },
    operator_projection: {
      revision: 'admin-overview-operator-projection-v1', status: 'warning', readiness: { status: 'ready', checks_failed: 0, failure_scopes: [] }, primary_action: { kind: 'runtime_telemetry', href: '/admin/troubleshooting' },
      watch_items: [{ code: 'runtime_telemetry', scope: 'runtime.telemetry_coverage', severity: 'warn', value: 1, detail_args: { alert_code: code } }],
    },
  }) }));
  await page.goto('/admin');
  const expected = '/admin/troubleshooting?window=336&site=site-alpha&since=2026-11-02T08%3A00%3A00.000Z&focus=hosted_model.failed_runs';
  await expect(page.locator('[data-ui="admin-overview-action"] a')).toHaveAttribute('href', expected);
  await expect(page.locator('[data-ui="backoffice-page-header"] a.btn-primary')).toHaveAttribute('href', expected);
  const link = page.locator('[data-ui="overview-runtime-issue-link"]');
  await expect(link).toHaveAttribute('href', expected);
  await page.locator('details').filter({ has: page.locator('summary', { hasText: /Platform usage and extended evidence|平台用量与扩展证据/ }) }).locator('summary').click();
  await link.click();
  await expect(page).toHaveURL(/focus=hosted_model.failed_runs/);
  // A changed live scope may not contain the snapshot's issue; never silently select another.
  await expect(page.locator('[data-ui="runtime-focus-absent"]')).toBeVisible();
  await expect(page.locator('[data-ui="runtime-diagnostic-issue"][aria-pressed="true"]')).toHaveCount(0);
});

test('overview keeps an unmatched projected issue distinct and does not invent source time', async ({ page }) => {
  await installAdminMocks(page);
  await page.route('**/api/admin/overview', route => route.fulfill({ json: buildAdminApiEnvelope({
    runtime_telemetry: { generated_at: 'not-a-time', filters: { recent_minutes: 1440 }, alert_summary: { status: 'warning', alerts: [{ code: 'hosted_model.provider_call_gap', count: 1, severity: 'warning', capabilities: [] }] } },
    operator_projection: {
      revision: 'admin-overview-operator-projection-v1', status: 'warning', readiness: { status: 'ready', checks_failed: 0, failure_scopes: [] }, primary_action: { kind: 'runtime_telemetry', href: '/admin/troubleshooting' },
      watch_items: [{ code: 'runtime_telemetry', scope: 'runtime.telemetry_coverage', severity: 'warn', value: 1, detail_args: { alert_code: 'hosted_model.failed_runs' } }],
    },
  }) }));
  await page.goto('/admin');
  const action = page.locator('[data-ui="admin-overview-action"]');
  await expect(action).not.toContainText(/Call records missing|调用记录缺失/);
  await expect(action.locator('a')).toHaveAttribute('href', '/admin/troubleshooting?window=336&focus=hosted_model.failed_runs');
});
