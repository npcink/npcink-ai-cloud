import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import serializers from '../fixtures/admin-diagnostic-serializers.json' with { type: 'json' };
import { buildAdminApiEnvelope, buildAdminApiErrorEnvelope, installAdminMocks } from './helpers/admin-operator-fixture';
import { buildRuntimeTelemetryFixture } from './helpers/runtime-telemetry-fixture';
import { buildAuditMetadata } from '../fixtures/admin-audit-metadata';

type Mode = 'normal' | 'broken' | 'rows' | 'empty' | 'failure';
async function harness(page: Page) {
  const unhandled: string[] = [], errors: string[] = [], network: string[] = [], api: string[] = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('requestfailed', request => network.push(`${request.method()} ${request.url()} ${request.failure()?.errorText}`));
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/admin/')) api.push(`${request.method()} ${request.url()}`); });
  await installAdminMocks(page, { unhandledAdminRequests: unhandled });
  return { unhandled, errors, network, api };
}
async function picture(page: Page, testInfo: TestInfo, name: string, observation: Awaited<ReturnType<typeof harness>>, surface: string) {
  const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const gitOptions = { cwd: repoRoot, encoding: 'utf8' as const };
  const viewport = page.viewportSize()!;
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('main h1')).toHaveCount(1);
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width + 1);
  const box = await page.locator(surface).boundingBox(); expect(box).not.toBeNull();
  await page.screenshot({ path: testInfo.outputPath(`${name}-${viewport.width}.png`), fullPage: true, animations: 'disabled' });
  writeFileSync(testInfo.outputPath(`${name}-${viewport.width}.json`), JSON.stringify({ route: new URL(page.url()).pathname,
    scope: new URL(page.url()).search, pageModel: 'diagnostic', viewport, dimensions, workingSurface: box, state: name,
    dataMode: 'mocked', environment: 'local', source: {
      revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      status: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
      files: [...new Set([
        ...execFileSync('git', ['diff', '--name-only'], gitOptions).trim().split('\n'),
        ...execFileSync('git', ['diff', '--cached', '--name-only'], gitOptions).trim().split('\n'),
        ...execFileSync('git', ['ls-files', '--others', '--exclude-standard'], gitOptions).trim().split('\n'),
      ])].filter(Boolean).map(path => ({ path, sha256: createHash('sha256').update(readFileSync(resolve(repoRoot, path))).digest('hex') })),
    },
    rules: { singleTitle: 'pass', noHorizontalOverflow: 'pass', visibleWorkingSurface: 'pass', textualState: 'pass',
      contextRecovery: 'pass', visualScan: 'review_required' }, screenshot: `${name}-${viewport.width}.png`,
    browser: observation, expectedFaults: ['503 synthetic failures', 'RSC prefetch cancellation during route navigation'], humanAcceptance: 'pending',
  }, null, 2));
}
function verifyBrowser(state: Awaited<ReturnType<typeof harness>>) {
  expect(state.unhandled).toEqual([]);
  expect(state.api.filter(value => !value.startsWith('GET '))).toEqual([]);
  expect(state.errors.filter(value => !/Failed to load resource: the server responded with a status of 503/.test(value))).toEqual([]);
  expect(state.network.filter(value => !/^GET http:\/\/127\.0\.0\.1:3301\/admin[^ ]*[?&]_rsc=[^ ]+ net::ERR_ABORTED$/.test(value))).toEqual([]);
}
const refresh = (page: Page) => page.getByRole('button', { name: /^Refresh$|^刷新$/ }).click();

for (const width of [1440, 1056]) {
  test(`audit review fixes site precedence microseconds and response scope at PC ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1050 }); const state = await harness(page);
    const navigate = async (url: string) => {
      await page.goto(url);
      // Let this document finish its chunk requests before replacing it.
      await page.waitForLoadState('networkidle');
    };
    let mode: 'normal' | 'wrong-empty' | 'missing' | 'sort' | 'empty' = 'normal';
    let created = '2026-11-02T06:00:00.000001Z';
    await page.route('**/api/admin/audit-events?*', async route => {
      const data: any = structuredClone(serializers.audit);
      if (mode === 'wrong-empty') data.filters.site_id = 'site_other';
      else if (mode === 'missing') delete data.filters;
      else if (mode === 'sort') data.sort.created_at = 'asc';
      else Object.assign(data, buildAuditMetadata(new URL(route.request().url()).searchParams));
      data.items[0].created_at = created;
      if (mode === 'wrong-empty' || mode === 'empty') {
        data.items = []; data.total = data.pagination.total = data.diagnostics.returned_count = 0;
      }
      await route.fulfill({ json: buildAdminApiEnvelope(data) });
    });
    const rows = page.locator('[data-ui="admin-audit-directory"] tbody tr');
    const issues = page.locator('[data-ui="admin-audit-evidence-issues"]');
    await navigate('/admin/audit?site_id=site_contract&account_id=acct_other');
    await expect(rows).toHaveCount(1); await expect(issues).toHaveCount(0);
    await rows.getByRole('button').click(); await expect(page.getByRole('dialog')).toContainText('acct_contract');
    await page.keyboard.press('Escape');
    await picture(page, testInfo, 'audit-review-site-precedence', state, '[data-ui="admin-audit-directory"]');
    await navigate('/admin/audit?account_id=acct_other');
    await expect(rows).toHaveCount(0); await expect(issues).toContainText('items[1]');
    await navigate('/admin/audit?site_id=site_contract'); await expect(rows).toHaveCount(1);
    for (const [key, bound, rowTime] of [
      ['created_from', '2026-11-02T06:00:00.000002Z', '2026-11-02T06:00:00.000001Z'],
      ['created_to', '2026-11-02T06:00:00.000001Z', '2026-11-02T06:00:00.000002Z'],
    ]) {
      created = rowTime;
      await navigate(`/admin/audit?${new URLSearchParams({ site_id: 'site_contract', [key]: bound })}`);
      await expect(rows).toHaveCount(0); await expect(issues).toContainText('items[1]');
      expect(new URL(state.api.at(-1)!.slice(4)).searchParams.get(key)).toBe(bound);
    }
    await picture(page, testInfo, 'audit-review-microsecond-rejected', state, '[data-ui="admin-audit-directory"]');
    created = '2026-11-02T06:00:00.000001Z';
    const instant = '2026-11-02T14:00:00.000001+08:00';
    await navigate(`/admin/audit?${new URLSearchParams({ site_id: 'site_contract', created_from: instant, created_to: instant })}`);
    await expect(rows).toHaveCount(1); await expect(issues).toHaveCount(0);
    await page.getByText(/More filters|更多筛选/, { exact: true }).click();
    await page.getByRole('button', { name: /Apply filters|应用筛选/ }).click();
    expect(new URL(page.url()).searchParams.get('created_from')).toBe(instant);
    expect(new URL(page.url()).searchParams.get('created_to')).toBe(instant);
    for (const fault of ['wrong-empty', 'missing', 'sort'] as const) {
      mode = fault; await navigate('/admin/audit?site_id=site_contract');
      await expect(page.locator('main [role="alert"]')).toBeVisible();
      await expect(page.getByText(/No matching audit evidence|没有匹配的审计证据/)).toHaveCount(0);
      await expect(rows).toHaveCount(0);
    }
    await picture(page, testInfo, 'audit-review-metadata-rejected', state, '[data-ui="admin-audit-directory"]');
    mode = 'empty'; await refresh(page);
    await expect(page.getByText(/No matching audit evidence|没有匹配的审计证据/)).toBeVisible();
    await expect(page.locator('main [role="alert"]')).toHaveCount(0);
    mode = 'normal'; await refresh(page); await expect(rows).toHaveCount(1); verifyBrowser(state);
  });

  test(`coverage preserves valid evidence and rejects broken targets at PC ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1050 }); const state = await harness(page);
    let mode: Mode = 'broken';
    await page.route('**/api/admin/coverage-work-queue?*', async route => {
      if (mode === 'failure') { await route.fulfill({ status: 503, json: buildAdminApiErrorEnvelope('synthetic coverage read failure') }); return; }
      const params = new URL(route.request().url()).searchParams;
      const data: any = structuredClone(serializers.coverage);
      data.filters = { q: params.get('q') || '', status: params.get('status'), reason: params.get('reason') || '', sort: params.get('sort'), offset: Number(params.get('offset')), limit: Number(params.get('limit')) };
      if (mode === 'empty') { data.items = []; data.total = data.pagination.total = data.summary.total = data.summary.visible = data.summary.error = data.summary.needs_action = 0; data.summary.reason_counts = {}; }
      if (mode === 'rows') {
        data.items.push(null, { ...data.items[0], account: null }, { ...data.items[0], action_href: '/admin/accounts/other#customer-access' });
        data.total = data.pagination.total = data.summary.total = data.summary.visible = data.summary.error = data.summary.needs_action = 4;
      }
      await route.fulfill({ json: buildAdminApiEnvelope(mode === 'broken' ? {} : data) });
    });
    await page.goto('/admin/coverage'); await expect(page.getByRole('button', { name: /^Retry$|^重试$/ })).toBeVisible();
    await expect(page.getByText(/No customers match|没有匹配客户/)).toHaveCount(0);
    mode = 'rows'; await page.getByRole('button', { name: /^Retry$|^重试$/ }).click();
    await expect(page.locator('[data-ui="coverage-queue-item"]')).toHaveCount(1);
    await expect(page.locator('[data-ui="coverage-evidence-issues"]')).toContainText('3');
    await expect(page.locator('a[href*="/accounts/other"]')).toHaveCount(0);
    await picture(page, testInfo, 'coverage-partial', state, '[data-ui="coverage-workspace"]');
    await page.getByRole('button', { name: /Inspect evidence|查看证据/ }).click();
    await expect(page.getByRole('dialog')).toContainText('acct_contract'); await page.keyboard.press('Escape');
    mode = 'failure'; await refresh(page); await expect(page.locator('main [role="alert"]').first()).toBeVisible();
    await expect(page.locator('[data-ui="coverage-queue-item"]')).toHaveCount(1);
    await picture(page, testInfo, 'coverage-refresh-failed', state, '[data-ui="coverage-workspace"]');
    mode = 'normal'; await refresh(page); await expect(page.locator('[data-ui="coverage-evidence-issues"]')).toHaveCount(0);
    mode = 'empty'; await refresh(page); await expect(page.locator('[data-ui="coverage-queue-item"]')).toHaveCount(0);
    await expect(page.getByText(/No customers match|没有客户符合|没有匹配/).first()).toBeVisible();
    await picture(page, testInfo, 'coverage-empty', state, '[data-ui="coverage-workspace"]'); verifyBrowser(state);
  });

  test(`audit distinguishes bad scope empty and failed evidence at PC ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1050 }); const state = await harness(page); let mode: Mode = 'broken';
    await page.route('**/api/admin/audit-events?*', async route => {
      if (mode === 'failure') { await route.fulfill({ status: 503, json: buildAdminApiErrorEnvelope('synthetic audit read failure') }); return; }
      const data: any = structuredClone(serializers.audit);
      Object.assign(data, buildAuditMetadata(new URL(route.request().url()).searchParams));
      if (mode === 'rows') { data.items.push(null, { ...data.items[0], event_id: 999, site_id: 'site_other' }); data.total = data.pagination.total = data.diagnostics.returned_count = 3; }
      if (mode === 'empty') { data.items = []; data.total = data.pagination.total = data.diagnostics.returned_count = 0; }
      await route.fulfill({ json: buildAdminApiEnvelope(mode === 'broken' ? {} : data) });
    });
    await page.goto('/admin/audit?site_id=site_contract'); await expect(page.locator('main [role="alert"]')).toBeVisible();
    await expect(page.getByText(/No matching audit evidence|没有匹配的审计证据/)).toHaveCount(0);
    mode = 'rows'; await refresh(page); await expect(page.locator('[data-ui="admin-audit-directory"] tbody tr')).toHaveCount(1);
    await expect(page.locator('[data-ui="admin-audit-evidence-issues"]')).toContainText('2');
    await picture(page, testInfo, 'audit-partial', state, '[data-ui="admin-audit-directory"]');
    await page.locator('[data-ui="admin-audit-directory"] tbody button').click();
    await expect(page.getByRole('dialog')).toContainText('site_contract'); await expect(page.getByRole('dialog')).not.toContainText('site_other'); await page.keyboard.press('Escape');
    mode = 'failure'; await refresh(page); await expect(page.getByText(/last loaded audit page remains visible|仍保留上次成功加载的审计页/)).toBeVisible();
    await picture(page, testInfo, 'audit-refresh-failed', state, '[data-ui="admin-audit-directory"]');
    mode = 'normal'; await refresh(page); await expect(page.locator('[data-ui="admin-audit-evidence-issues"]')).toHaveCount(0);
    mode = 'empty'; await refresh(page); await expect(page.getByText(/No matching audit evidence|没有匹配的审计证据/)).toBeVisible();
    await picture(page, testInfo, 'audit-empty', state, '[data-ui="admin-audit-directory"]'); verifyBrowser(state);
  });

  test(`audit retains short-page rows with explicit incomplete pagination at PC ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1050 }); const state = await harness(page); let partial = true;
    await page.route('**/api/admin/audit-events?*', async route => {
      const data = structuredClone(serializers.audit);
      Object.assign(data, buildAuditMetadata(new URL(route.request().url()).searchParams));
      if (partial) {
        data.total = data.pagination.total = 2; data.pagination.has_more = true; data.pagination.next_offset = 1;
      }
      await route.fulfill({ json: buildAdminApiEnvelope(data) });
    });
    await page.goto('/admin/audit?site_id=site_contract');
    await expect(page.locator('[data-ui="admin-audit-directory"] tbody tr')).toHaveCount(1);
    await expect(page.locator('[data-ui="admin-audit-evidence-issues"]')).toContainText(/page completeness is unverified|分页证据不完整/);
    await picture(page, testInfo, 'audit-short-page-incomplete', state, '[data-ui="admin-audit-directory"]');
    partial = false; await page.getByRole('button', { name: /^Retry$|^重试$/ }).click();
    await expect(page.locator('[data-ui="admin-audit-evidence-issues"]')).toHaveCount(0);
    await expect(page.locator('[data-ui="admin-audit-directory"] tbody tr')).toHaveCount(1); verifyBrowser(state);
  });

  test(`runtime never infers health from missing metrics and isolates cross-site runs at PC ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1050 }); const state = await harness(page);
    let mode: Mode = 'broken', runMode: Mode = 'rows';
    await page.route('**/api/admin/runtime-telemetry?*', async route => {
      if (mode === 'failure') { await route.fulfill({ status: 503, json: buildAdminApiErrorEnvelope('synthetic diagnostics read failure') }); return; }
      const params = new URL(route.request().url()).searchParams;
      const data: any = buildRuntimeTelemetryFixture(mode === 'empty' ? serializers.telemetryEmpty : serializers.telemetry, params);
      if (mode === 'rows') data.provider_failures = [null];
      await route.fulfill({ json: buildAdminApiEnvelope(mode === 'broken' ? { totals: { runs: 6 } } : data) });
    });
    await page.route('**/api/admin/runtime-telemetry/runs?*', async route => {
      if (runMode === 'failure') { await route.fulfill({ status: 503, json: buildAdminApiErrorEnvelope('synthetic run read failure') }); return; }
      const data: any = structuredClone(serializers.runs);
      if (runMode === 'rows') data.items.push(null, { ...data.items[0], run_id: 'run_other', site_id: 'site_other' });
      if (runMode === 'empty') data.items = [];
      await route.fulfill({ json: buildAdminApiEnvelope(data) });
    });
    await page.goto('/admin/troubleshooting?site=site_contract&focus=hosted_model.provider_call_gap&panel=records');
    await expect(page.locator('[data-ui="runtime-diagnostic-source-error"]')).toBeVisible();
    await expect(page.getByText(/No requests in this period|所选时段没有请求|No monitored anomalies found|未发现已监测异常/)).toHaveCount(0);
    mode = 'rows'; await refresh(page);
    await expect(page.locator('[data-ui="runtime-diagnostic-evidence-issues"]')).toBeVisible();
    await expect(page.locator('[data-ui="runtime-run-evidence-issues"]')).toContainText('2');
    await expect(page.locator('[data-ui="runtime-run-evidence"]')).not.toContainText('site_other');
    await picture(page, testInfo, 'runtime-partial', state, '[data-ui="runtime-diagnostic-table-frame"]');
    await page.locator('[data-ui="runtime-run-evidence"]').getByRole('button', { name: /View detail|查看详情/ }).click();
    await expect(page.getByRole('dialog')).toContainText('run_contract'); await page.keyboard.press('Escape');
    mode = 'failure'; await refresh(page); await expect(page.locator('[data-ui="runtime-diagnostic-source-error"]')).toBeVisible();
    await picture(page, testInfo, 'runtime-refresh-failed', state, '[data-ui="runtime-diagnostic-table-frame"]');
    mode = 'normal'; runMode = 'normal'; await refresh(page); await expect(page.locator('[data-ui="runtime-diagnostic-source-error"]')).toHaveCount(0);
    await expect(page.locator('[data-ui="runtime-run-evidence-issues"]')).toHaveCount(0);
    // Exact run mode must reject the wrong target as well.
    await page.goto('/admin/troubleshooting?site=site_other&run_id=run_contract');
    await expect(page.locator('[data-ui="runtime-exact-evidence-issues"]')).toBeVisible();
    await expect(page.locator('[data-ui="runtime-exact-run"]')).not.toContainText('text.contract');
    mode = 'empty'; runMode = 'empty'; await page.goto('/admin/troubleshooting?site=site_contract');
    await expect(page.getByText(/No requests in this period|所选时段没有请求/).first()).toBeVisible();
    await picture(page, testInfo, 'runtime-empty', state, 'main'); verifyBrowser(state);
  });
}
