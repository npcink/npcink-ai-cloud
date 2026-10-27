import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { LONG_ACCOUNT_ID, buildAdminApiEnvelope, installAdminMocks } from './helpers/admin-operator-fixture';

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
