import { expect, test, type Page } from '@playwright/test';
import { buildAdminApiEnvelope, buildAdminApiErrorEnvelope, installAdminMocks } from './helpers/admin-operator-fixture';
const usage = { families: { text: { runs: 3, tokens_total: 3000, provider_call_count: 4, provider_call_cost_usd: 0.25 }, knowledge: { runs: 1, tokens_total: 1000, provider_call_count: 1, provider_call_cost_usd: 0 } } };
const revenue = { net_revenue_cny: 200, subscription_revenue_cny: 160, credit_pack_revenue_cny: 60, refunds_cny: 20, active_paid_accounts: 2, trialing_accounts: 1, account_counts_scope: 'current_snapshot' };
async function setup(page: Page, options: { empty?: boolean; error?: boolean | 'usage' | 'revenue'; locale?: string } = {}) {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.addInitScript((locale) => { localStorage.setItem('locale', locale); }, options.locale || 'en');
  await installAdminMocks(page);
  await page.route('**/api/admin/economics/**', async route => {
    const request = route.request(); const url = new URL(request.url());
    expect(request.method()).toBe('GET'); expect(request.postData()).toBeNull();
    expect(Array.from(url.searchParams.keys())).toEqual(['month']);
    const isUsage = url.pathname.endsWith('/usage-by-family');
    const failed = options.error === true || options.error === (isUsage ? 'usage' : 'revenue');
    await route.fulfill({ status: failed ? 503 : 200, contentType: 'application/json', body: JSON.stringify(failed ? buildAdminApiErrorEnvelope('fixture unavailable') : buildAdminApiEnvelope(isUsage ? options.empty ? { families: {} } : usage : revenue)) });
  });
}

test('PC allocation persists locally, never uploads bills, and isolates months', async ({ page }, info) => {
  await setup(page);
  const requests: string[] = [];
  const pageErrors: string[] = [];
  page.on('request', request => requests.push(`${request.method()} ${request.url()} ${request.postData() || ''}`));
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/admin/economics?month=2026-10');
  await expect(page.getByRole('heading', { name: 'Unit economics', exact: true })).toBeVisible();
  await expect(page.locator('[data-ui="economics-usage"] tbody tr')).toHaveCount(2);
  await expect(page.getByText('Current paid / trial accounts')).toBeVisible();
  await page.getByRole('button', { name: 'Add local bill' }).click();
  await expect(page.locator('[data-ui="economics-workspace"]')).not.toContainText('100.0%');
  await page.getByRole('textbox', { name: 'Provider name 1', exact: true }).fill('PRIVATE_BILL_SENTINEL');
  await page.getByRole('spinbutton', { name: 'Amount · CNY 1', exact: true }).fill('1234.56');
  const bill = page.locator('[data-ui="economics-bill-row"]');
  await bill.getByRole('checkbox', { name: 'Text', exact: true }).check();
  await bill.getByRole('checkbox', { name: 'Site Knowledge', exact: true }).check();
  await expect(page.locator('[data-ui="economics-usage"] tbody tr').filter({ hasText: 'Text' })).toContainText('¥925.92');
  await page.getByRole('button', { name: 'Refresh data' }).click();
  await expect(page.locator('[data-ui="economics-usage"] tbody tr')).toHaveCount(2);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Provider name 1', exact: true })).toHaveValue('PRIVATE_BILL_SENTINEL');
  await page.getByLabel('UTC month').fill('2026-09');
  await expect(page).toHaveURL(/month=2026-09/);
  await expect(page.locator('[data-ui="economics-bill-row"]')).toHaveCount(0);
  await page.getByLabel('UTC month').fill('2026-10');
  await expect(page.getByRole('textbox', { name: 'Provider name 1', exact: true })).toHaveValue('PRIVATE_BILL_SENTINEL');
  expect(requests.filter(request => request.includes('PRIVATE_BILL_SENTINEL') || request.includes('1234.56'))).toEqual([]);
  expect(requests.filter(request => !request.startsWith('GET '))).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator('h1')).toHaveCount(1);
  await page.screenshot({ path: info.outputPath('economics-pc-populated.png'), fullPage: true });
});

for (const failedSource of [true, 'usage', 'revenue'] as const) {
test(`API failure (${failedSource}) preserves local bills and recovers`, async ({ page }) => {
  await setup(page, { error: failedSource });
  await page.addInitScript(() => localStorage.setItem('npcink_economics_bills_2026-10', JSON.stringify([{ id: 'bill', provider_name: 'local only', amount_cny: 50, families: ['text'] }])));
  await page.goto('/admin/economics?month=2026-10');
  if (failedSource !== 'usage') await expect(page.getByText('Revenue unavailable.', { exact: false })).toBeVisible();
  if (failedSource !== 'revenue') await expect(page.getByText('Usage unavailable.', { exact: false })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Provider name 1', exact: true })).toHaveValue('local only');
  if (failedSource !== 'revenue') await expect(page.locator('[data-ui="economics-unallocated"]')).toContainText('¥50.00');
  await setup(page);
  await page.getByRole('button', { name: 'Refresh data' }).click();
  await expect(page.locator('[data-ui="economics-usage"] tbody tr')).toHaveCount(2);
  await expect(page.getByRole('textbox', { name: 'Provider name 1', exact: true })).toHaveValue('local only');
});

}

test('empty usage and invalid local storage remain usable in Chinese dark mode', async ({ page }, info) => {
  await setup(page, { empty: true, locale: 'zh-CN' });
  await page.addInitScript(() => { localStorage.setItem('npcink_economics_bills_2026-10', '{invalid'); localStorage.setItem('theme', 'dark'); });
  await page.goto('/admin/economics?month=2026-10');
  await expect(page.getByRole('heading', { name: '单位经济学', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.getByText('本月暂无留存用量。')).toBeVisible();
  await expect(page.getByText('本地存储不可用或数据无效', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '添加本地账单' }).click();
  await expect(page.locator('[data-ui="economics-bill-row"]')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('economics-pc-empty-zh-dark.png'), fullPage: true });
});
