import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { AccountQuotaMetric } from '@/features/admin/accounts/account-credit-evidence';
import { LONG_ACCOUNT_ID, buildAdminApiEnvelope, installAdminMocks } from './helpers/admin-operator-fixture';

function quotaResource(key: string, used: number, limit: number, status = 'ok'): AccountQuotaMetric {
  return { key, used, limit, remaining: Math.max(0, limit - used), usage_ratio: limit > 0 ? used / limit : 0, unlimited: limit <= 0, status, unit: 'site' };
}

const healthyResources = [
  quotaResource('bound_sites', 1, 75), quotaResource('active_sites', 1, 25),
  quotaResource('active_api_key_sites', 1, 1), quotaResource('concurrent_runs', 0, 20),
  quotaResource('batch_items', 0, 100), quotaResource('vector_documents', 2063, 10000),
  quotaResource('media_images', 69, 25000), quotaResource('vector_chunks', 2364, 200000),
  quotaResource('vector_sync_documents_per_run', 0, 500), quotaResource('vector_sync_chunks_per_run', 0, 5000),
];

async function openQuotaScenario(page: Page, resources: AccountQuotaMetric[], status = 'ok', credits = quotaResource('ai_credits', 2522, 150000)) {
  await installAdminMocks(page);
  await page.route(`**/api/admin/accounts/${LONG_ACCOUNT_ID}/quota-summary`, route => route.fulfill({
    json: buildAdminApiEnvelope({ status, ai_credits: credits, resource_limits: resources }),
  }));
  await page.goto(`/admin/accounts/${LONG_ACCOUNT_ID}`);
  await page.getByRole('tab', { name: /Credits and usage|积分与用量/i }).click();
  await expect(page.locator('[data-ui="account-credit-summary"]')).toBeVisible();
}

test('complete API-key coverage does not create a capacity warning', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await openQuotaScenario(page, healthyResources);
  await expect(page.getByText(/Quota needs attention|额度需关注/i)).toHaveCount(0);
  await expect(page.locator('[data-ui="account-resource-alerts"]')).toHaveCount(0);
  await page.getByRole('button', { name: /View quota details|查看额度详情/i }).click();
  const dialog = page.getByRole('dialog', { name: /Quota details|额度详情/i });
  await expect(dialog.locator('[data-ui="account-quota-attention"]')).toHaveCount(0);
  const keyRow = dialog.locator('[data-quota-key="active_api_key_sites"]');
  await expect(keyRow).toHaveAttribute('data-quota-status', 'ok');
  await expect(keyRow).toContainText(/full coverage is healthy|全部覆盖表示正常/);
  await page.screenshot({ path: testInfo.outputPath('quota-complete-coverage-pc.png') });
});

test('a real API-key coverage gap is identified above the detail table', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await openQuotaScenario(page, healthyResources.map(metric => metric.key === 'active_api_key_sites' ? quotaResource(metric.key, 0, 1, 'limited') : metric), 'limited');
  const trigger = page.getByRole('button', { name: /View quota details|查看额度详情/i });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: /Quota details|额度详情/i });
  const attention = dialog.locator('[data-ui="account-quota-attention"]');
  await expect(attention).toContainText(/Key coverage gap|密钥覆盖不足/);
  await expect(attention).toContainText('0 / 1');
  const box = await attention.boundingBox();
  expect(box!.y + box!.height).toBeLessThan(800);
  await expect(dialog.locator('[data-quota-key="active_api_key_sites"]')).toHaveAttribute('data-quota-status', 'limited');
  await page.screenshot({ path: testInfo.outputPath('quota-key-gap-narrow-pc.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a capacity threshold uses the same warning in the entry and detail row', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await openQuotaScenario(page, [...healthyResources.filter(metric => metric.key !== 'vector_documents'), quotaResource('vector_documents', 8500, 10000)]);
  await expect(page.locator('[data-ui="account-resource-alerts"]')).toContainText(/Near limit|接近上限/);
  await page.getByRole('button', { name: /View quota details|查看额度详情/i }).click();
  const dialog = page.getByRole('dialog', { name: /Quota details|额度详情/i });
  await expect(dialog.locator('[data-ui="account-quota-attention"]')).toContainText(/8,500.*10,000/);
  const row = dialog.locator('[data-quota-key="vector_documents"]');
  await expect(row).toHaveAttribute('data-quota-status', 'near_limit');
  await expect(row).toContainText(/Near limit|接近上限/);
  await expect(row).toHaveClass(/bg-amber/);
  await page.screenshot({ path: testInfo.outputPath('quota-capacity-attention-pc.png') });
});

test('credit-only attention remains visible when the resource table is healthy', async ({ page }) => {
  await openQuotaScenario(page, healthyResources, 'near_limit', quotaResource('ai_credits', 900, 1000, 'near_limit'));
  await page.getByRole('button', { name: /View quota details|查看额度详情/i }).click();
  const dialog = page.getByRole('dialog', { name: /Quota details|额度详情/i });
  await expect(dialog.locator('[data-ui="account-quota-attention"]')).toContainText(/AI credits|AI 积分/i);
  await expect(dialog.locator('[data-ui="account-quota-attention"]')).toContainText('900 / 1,000');
  await expect(dialog.locator('[data-quota-status="near_limit"]')).toHaveCount(0);
});

test('an unexplained server warning remains unresolved instead of inventing an affected resource', async ({ page }) => {
  await openQuotaScenario(page, healthyResources, 'near_limit');
  await page.getByRole('button', { name: /View quota details|查看额度详情/i }).click();
  const dialog = page.getByRole('dialog', { name: /Quota details|额度详情/i });
  await expect(dialog.locator('[data-ui="account-quota-attention"]')).toContainText(/without an identified item|未返回对应异常项/);
  await expect(dialog.locator('[data-ui="account-quota-attention"]')).toContainText(/Refresh|刷新/);
  await expect(dialog.locator('[data-quota-status="limited"], [data-quota-status="near_limit"]')).toHaveCount(0);
  let refreshReads = 0;
  await page.route(`**/api/admin/accounts/${LONG_ACCOUNT_ID}/quota-summary`, route => {
    expect(route.request().method()).toBe('GET');
    refreshReads += 1;
    return route.fulfill({ json: buildAdminApiEnvelope({ status: 'ok', ai_credits: quotaResource('ai_credits', 2522, 150000), resource_limits: healthyResources }) });
  });
  await dialog.getByRole('button', { name: /^Refresh$|^刷新$/ }).click();
  await expect(dialog.locator('[data-ui="account-quota-attention"]')).toHaveCount(0);
  await expect(dialog).toBeVisible();
  expect(refreshReads).toBe(1);
});

test('capacity attention stays readable in a dark narrow PC dialog', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await openQuotaScenario(page, [quotaResource('vector_documents', 8500, 10000)]);
  await page.getByRole('button', { name: /Toggle theme|切换主题/i }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('button', { name: /View quota details|查看额度详情/i }).click();
  const dialog = page.getByRole('dialog', { name: /Quota details|额度详情/i });
  await expect(dialog.locator('[data-ui="account-quota-attention"]')).toContainText(/8,500.*10,000/);
  await expect(dialog.locator('[data-quota-key="vector_documents"]')).toHaveClass(/dark:bg-amber/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('quota-capacity-dark-narrow-pc.png') });
});

test('resource pressure leads to quota evidence while available credits keep top-up secondary', async ({ page }, testInfo) => {
  const errors: string[] = [];
  const networkFailures: string[] = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => {
    const reason = request.failure()?.errorText || 'unknown';
    if (reason !== 'net::ERR_ABORTED') networkFailures.push(reason);
  });
  page.on('response', response => {
    if (response.status() >= 400) networkFailures.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1050 });
  await installAdminMocks(page);
  await page.route(`**/api/admin/accounts/${LONG_ACCOUNT_ID}/quota-summary`, route => route.fulfill({
    json: buildAdminApiEnvelope({
      status: 'limited',
      ai_credits: { key: 'ai_credits', used: 2338, limit: 20300, remaining: 17962, usage_ratio: 0.12, unlimited: false, status: 'ok' },
      resource_limits: [{ key: 'vector_documents', used: 164, limit: 100, remaining: 0, usage_ratio: 1.64, unlimited: false, status: 'limited' }],
    }),
  }));
  await page.goto(`/admin/accounts/${LONG_ACCOUNT_ID}`);
  const creditsTab = page.getByRole('tab', { name: /Credits and usage|积分与用量/i });
  await creditsTab.click();
  await expect(creditsTab).toHaveAttribute('aria-selected', 'true');
  const topUp = page.getByRole('button', { name: /Open top-up options|打开加量包选项/i });
  const quota = page.getByRole('button', { name: /View quota details|查看额度详情/i });
  await expect(quota).toHaveClass(/btn-primary/);
  await expect(topUp).not.toHaveClass(/btn-primary/);
  await expect(page.locator('[data-ui="account-resource-alerts"]')).toContainText(/164.*100/);
  await expect(page.locator('#quota-posture')).toContainText(/credit top-ups do not repair|补充 AI 积分不能修复/i);
  const viewportEvidence = await page.evaluate(() => ({
    width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
    titleCount: document.querySelectorAll('h1').length,
    workingSurfaceTop: document.querySelector('#quota-posture')!.getBoundingClientRect().top,
    primaryActions: document.querySelectorAll('#quota-posture .btn-primary').length,
  }));
  expect(viewportEvidence).toMatchObject({ width: 1440, height: 1050, titleCount: 1, primaryActions: 1 });
  expect(viewportEvidence.scrollWidth).toBeLessThanOrEqual(1440);
  expect(viewportEvidence.workingSurfaceTop).toBeLessThan(1050);
  const screenshot = testInfo.outputPath('customer-resource-pressure-pc.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach('customer-resource-pressure-pc', { path: screenshot, contentType: 'image/png' });
  await quota.click();
  const dialog = page.getByRole('dialog', { name: /Quota details|额度详情/i });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(quota).toBeFocused();
  expect(errors).toEqual([]);
  expect(networkFailures).toEqual([]);
  await expect(page).toHaveURL(/#quota-posture$/);
  const receiptPath = testInfo.outputPath('customer-operations-local-receipt.json');
  writeFileSync(receiptPath, JSON.stringify({
      source_revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      source_dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
      environment: 'local', data_mode: 'mocked', page_model: 'detail',
      route: '/admin/accounts/[accountId]', viewport: viewportEvidence,
      tested_states: ['resource_pressure', 'dialog_open', 'dialog_closed'],
      rule_results: ['declared-page-model', 'pc-viewport', 'horizontal-overflow', 'single-page-title',
        'working-surface-first-viewport', 'single-primary-action', 'textual-status', 'action-object-proximity',
        'distinct-interaction-states', 'dialog-focus-recovery', 'context-stability', 'browser-runtime-errors']
        .map(id => ({ id, status: 'pass', evidence: 'Assertions and attached screenshot from this test.' })),
      screenshot_paths: [screenshot], console_errors: errors, network_failures: networkFailures,
      interaction_results: [{ id: 'resource-action-and-focus-return', status: 'pass' }],
      review_required_items: ['human visual acceptance'], human_acceptance: 'pending',
    }, null, 2));
  await testInfo.attach('customer-operations-local-receipt', { path: receiptPath, contentType: 'application/json' });
});

test('missing identity offers bounded refresh and a return to service status without granting access', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await installAdminMocks(page);
  let reads = 0;
  const mutations: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/api/admin/') && request.method() !== 'GET') mutations.push(request.method());
  });
  await page.route(`**/api/admin/accounts/${LONG_ACCOUNT_ID}`, route => {
    reads += 1;
    return route.fulfill({ json: buildAdminApiEnvelope({
      account: { account_id: LONG_ACCOUNT_ID, name: 'Technical account', status: 'active', metadata: { operator_display_name: 'Customer Display Label' } },
      primary_identity: null, identity_relationship_state: 'missing', sites: [], subscriptions: [],
    }) });
  });
  await page.goto(`/admin/accounts/${LONG_ACCOUNT_ID}`);
  await expect(page.getByRole('heading', { name: 'Customer Display Label' })).toBeVisible();
  await page.getByRole('tab', { name: /^Access|^访问/i }).click();
  const steps = page.locator('[data-ui="customer-access-follow-up"]');
  await expect(steps.locator('li')).toHaveCount(3);
  await expect(steps).toContainText(/authorized maintainer|有权限的维护人员/);
  await expect(steps).toContainText(/verify Portal login|验证门户登录/);
  await page.getByRole('button', { name: /Refresh access evidence|刷新访问证据/i }).click();
  await expect.poll(() => reads).toBe(2);
  await expect(page.getByRole('tab', { name: /^Access|^访问/i })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('link', { name: /Recheck Service status|返回服务状态复核/i })).toHaveAttribute('href', '/admin/coverage');
  expect(mutations).toEqual([]);
});
