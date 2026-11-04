import { expect, test, type Page } from '@playwright/test';
import { LONG_ACCOUNT_ID, installAdminMocks } from './helpers/admin-operator-fixture';

const baseOrder = {
  order_id: 'pay_admin_full_refund_20261030_example', subject: 'Npcink AI Cloud Plus 月度套餐',
  provider: 'alipay', status: 'paid', amount: 15, currency: 'CNY',
  external_order_no: 'pay_admin_full_refund_20261030_example',
  created_at: '2026-10-30T07:00:00Z', paid_at: '2026-10-30T07:02:00Z',
  refund_window_end_at: '2026-11-06T07:02:00Z', refund_blocker: '', refund: null,
};

function envelope(data: unknown) {
  return { status: 'ok', error_code: '', message: 'test fixture', data, meta: { trace_id: '', revision: 'm6' } };
}

async function setup(page: Page, mode: 'success' | 'unknown' | 'empty' = 'success') {
  await installAdminMocks(page);
  let submitted = 0;
  let readFailed = false;
  let wasSubmitted = false;
  let allowResult = true;
  await page.route(`**/api/admin/accounts/${LONG_ACCOUNT_ID}/payment-orders**`, async route => {
    if (route.request().method() === 'POST') {
      submitted += 1;
      expect(route.request().postDataJSON()).toEqual({ reason: '操作者退款测试' });
      expect(route.request().headers()['idempotency-key']).toBeTruthy();
      wasSubmitted = true;
      if (mode === 'unknown') {
        allowResult = false;
        await route.fulfill({ status: 502, json: {
          ...envelope({}), status: 'error', error_code: 'proxy.admin_post_unreachable',
          message: 'test response lost',
        } });
      } else {
        await new Promise(resolve => setTimeout(resolve, 250));
        await route.fulfill({ json: envelope({ refund: { status: 'succeeded' } }) });
      }
      return;
    }
    if (wasSubmitted && !allowResult && !readFailed) {
      readFailed = true;
      await route.fulfill({ status: 502, json: {
        ...envelope({}), status: 'error', error_code: 'proxy.admin_get_unreachable', message: 'test refresh failed',
      } });
      return;
    }
    const refund = wasSubmitted ? {
      refund_id: 'refund_stable_example', external_refund_no: 'refund_stable_example',
      provider_refund_no: 'alipay_refund_example', status: mode === 'unknown' ? 'unknown' : 'succeeded',
      amount: 15, currency: 'CNY', reason: '操作者退款测试',
    } : null;
    const items = mode === 'empty' ? [] : [
      { ...baseOrder, status: wasSubmitted && mode === 'success' ? 'refunded' : 'paid',
        refund_blocker: wasSubmitted ? 'refund_exists' : '', refund },
      { ...baseOrder, order_id: 'pay_old_window', subject: '退款期限已过的订单', refund_blocker: 'window_expired' },
    ];
    await route.fulfill({ json: envelope({ items, pagination: { total: items.length, offset: 0, limit: 5 } }) });
  });
  await page.goto(`/admin/accounts/${LONG_ACCOUNT_ID}#payment-orders`);
  const panel = page.locator('[data-ui="account-payment-orders"]');
  await expect(panel).toBeVisible();
  return { panel, submissions: () => submitted };
}

test('account orders confirm a full refund once and preserve PC focus and result evidence', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => {
    if (request.failure()?.errorText !== 'net::ERR_ABORTED') errors.push(request.failure()?.errorText || 'request failed');
  });
  const { panel, submissions } = await setup(page);
  await expect(panel).toContainText('¥15.00');
  await expect(panel).toContainText('已超过退款申请期限');
  const trigger = panel.getByRole('button', { name: '全额退款…', exact: true });
  await trigger.click();
  let dialog = page.getByRole('dialog', { name: '确认全额退款' });
  await expect(dialog).toContainText(baseOrder.order_id);
  await expect(dialog.getByRole('button', { name: '确认退款', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(submissions()).toBe(0);
  await trigger.click();
  dialog = page.getByRole('dialog', { name: '确认全额退款' });
  await dialog.getByRole('textbox', { name: '退款原因' }).fill('操作者退款测试');
  expect(await dialog.getByRole('textbox', { name: '退款原因' }).evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(80);
  await dialog.getByRole('button', { name: '确认退款', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(dialog.locator('[data-ui="admin-workbench-close"]')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: '确认退款', exact: true })).toBeFocused();
  for (const width of [1440, 1056]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1050 : 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(dialog.getByRole('button', { name: '确认退款', exact: true })).toBeInViewport();
    await page.screenshot({ path: `.tmp/admin-refunds/dialog-${width}.png` });
  }
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.screenshot({ path: '.tmp/admin-refunds/dialog-dark.png' });
  await dialog.getByRole('button', { name: '确认退款', exact: true }).click();
  await expect(dialog).toContainText('退款：已成功退款');
  expect(submissions()).toBe(1);
  await expect(dialog.getByRole('button', { name: '确认退款', exact: true })).toHaveCount(0);
  await dialog.locator('[data-ui="admin-workbench-close"]').click();
  await expect(panel).toContainText('已退款');
  await panel.getByText('退款单号与原因').first().click();
  await expect(panel.getByText('alipay_refund_example')).toBeVisible();
  await expect(panel.getByRole('button', { name: '刷新客户权益' })).toBeVisible();
  await page.screenshot({ path: '.tmp/admin-refunds/result.png' });
  expect(errors).toEqual([]);
});

test('lost refund response and failed readback offer only original-record refresh', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  const { panel, submissions } = await setup(page, 'unknown');
  await panel.getByRole('button', { name: '全额退款…' }).click();
  const dialog = page.getByRole('dialog', { name: '确认全额退款' });
  await dialog.getByRole('textbox', { name: '退款原因' }).fill('操作者退款测试');
  await dialog.getByRole('button', { name: '确认退款', exact: true }).click();
  await expect(dialog).toContainText('退款结果待确认');
  await expect(dialog).toContainText('订单刷新失败');
  await expect(dialog.getByRole('button', { name: '确认退款', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(dialog).toContainText('退款：结果待确认');
  await dialog.locator('[data-ui="admin-workbench-close"]').click();
  await expect(panel.getByRole('button', { name: '全额退款…' })).toHaveCount(0);
  expect(submissions()).toBe(1);
});

test('empty payment history is explicit and adds no refund action', async ({ page }) => {
  const { panel, submissions } = await setup(page, 'empty');
  await expect(panel).toContainText('该客户暂无支付订单');
  await expect(panel.getByRole('button', { name: '全额退款…' })).toHaveCount(0);
  expect(submissions()).toBe(0);
});

test('malformed payment read is unavailable rather than empty or writable', async ({ page }) => {
  await installAdminMocks(page);
  await page.route(`**/api/admin/accounts/${LONG_ACCOUNT_ID}/payment-orders**`, route => (
    route.fulfill({ json: envelope({}) })
  ));
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`/admin/accounts/${LONG_ACCOUNT_ID}#payment-orders`);
  const panel = page.locator('[data-ui="account-payment-orders"]');
  await expect(panel).toContainText('订单刷新失败');
  await expect(panel).not.toContainText('该客户暂无支付订单');
  await expect(panel.getByRole('button', { name: '全额退款…' })).toHaveCount(0);
  expect(errors).toEqual([]);
});
