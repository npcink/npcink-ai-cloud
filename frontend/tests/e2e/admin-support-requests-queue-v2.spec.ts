import { expect, test, type Page, type Route } from '@playwright/test';
import {
  buildAdminApiEnvelope,
  buildAdminApiErrorEnvelope,
  installAdminMocks,
} from './helpers/admin-operator-fixture';
import { observeAdminBrowserEvidence, writeAdminVisualReceipt } from './helpers/admin-visual-receipt';

// This base predates the English cold-start fix. Keep real Chinese hydration;
// visual English coverage switches through the existing control after mount.
const pageErrors: string[] = [];
const unhandledAdminRequests: string[] = [];
test.beforeEach(async ({ page }) => {
  pageErrors.length = 0;
  unhandledAdminRequests.length = 0;
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'zh-CN');
  });
});
test.afterEach(async () => {
  expect(pageErrors).toEqual([]);
  expect(unhandledAdminRequests).toEqual([]);
});

type TicketFixture = {
  request_id: string;
  account_id: string;
  site_id: string;
  email: string;
  topic: string;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: string;
  admin_note: string;
  waiting_on: 'operator' | 'customer' | 'none';
  waiting_since?: string;
  first_operator_response_at?: string;
  created_at: string;
  updated_at: string;
};

function initialTickets(): TicketFixture[] {
  return [
    {
      request_id: 'sr_overdue_payment',
      account_id: 'acct_beta',
      site_id: 'site_beta',
      email: 'beta@example.com',
      topic: 'payment',
      title: 'Payment confirmation is still missing',
      description: 'The payment provider returned successfully but the order still shows pending.',
      status: 'open',
      priority: 'normal',
      admin_note: '',
      waiting_on: 'operator',
      waiting_since: '2026-07-08T08:00:00Z',
      created_at: '2026-07-08T08:00:00Z',
      updated_at: '2026-07-08T08:00:00Z',
    },
    {
      request_id: 'sr_open_site',
      account_id: 'acct_alpha',
      site_id: 'site_alpha',
      email: 'alpha@example.com',
      topic: 'site',
      title: 'Site connection needs review',
      description: 'The connected site is active but its latest status has not refreshed.',
      status: 'open',
      priority: 'normal',
      admin_note: '',
      waiting_on: 'operator',
      waiting_since: '2026-07-12T05:00:00Z',
      created_at: '2026-07-12T05:00:00Z',
      updated_at: '2026-07-12T05:00:00Z',
    },
    {
      request_id: 'sr_progress_usage',
      account_id: 'acct_gamma',
      site_id: 'site_gamma',
      email: 'gamma@example.com',
      topic: 'usage',
      title: 'Usage total needs explanation',
      description: 'The customer needs clarification about the current billing-period usage total.',
      status: 'in_progress',
      priority: 'normal',
      admin_note: 'Checking the current billing snapshot.',
      waiting_on: 'customer',
      waiting_since: '2026-07-12T06:00:00Z',
      first_operator_response_at: '2026-07-12T06:00:00Z',
      created_at: '2026-07-10T05:00:00Z',
      updated_at: '2026-07-12T06:00:00Z',
    },
    {
      request_id: 'sr_resolved_account',
      account_id: 'acct_delta',
      site_id: '',
      email: 'delta@example.com',
      topic: 'account',
      title: 'Account display name was corrected',
      description: 'The requested account display-name correction has already been completed.',
      status: 'resolved',
      priority: 'normal',
      admin_note: 'Resolved after identity verification.',
      waiting_on: 'none',
      created_at: '2026-07-09T05:00:00Z',
      updated_at: '2026-07-11T05:00:00Z',
    },
  ];
}

async function installSupportQueueMocks(page: Page, initial = initialTickets()) {
  await installAdminMocks(page, { unhandledAdminRequests });
  let tickets = initial;
  let requestCount = 0;
  let failQuery = '';
  const requests: URLSearchParams[] = [];

  await page.route('**/api/admin/support-requests?*', async (route) => {
    requestCount += 1;
    const url = new URL(route.request().url());
    requests.push(url.searchParams);
    expect(url.searchParams.get('limit')).toBe('10');
    const query = (url.searchParams.get('q') || '').toLowerCase();
    if (failQuery && query === failQuery.toLowerCase()) {
      failQuery = '';
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify(buildAdminApiErrorEnvelope('temporary ticket queue failure')),
      });
      return;
    }
    const status = url.searchParams.get('status') || '';
    const attention = url.searchParams.get('attention') || '';
    const topic = url.searchParams.get('topic') || '';
    const filteredItems = tickets.filter((ticket) => {
      const searchable = [ticket.request_id, ticket.email, ticket.title, ticket.account_id, ticket.site_id].join(' ').toLowerCase();
      const waitingForOperator = ticket.waiting_on === 'operator';
      const overdue = waitingForOperator && Boolean(ticket.waiting_since) && new Date(ticket.waiting_since || 0).getTime() <= new Date('2026-07-10T08:00:00Z').getTime();
      return (!status || ticket.status === status)
        && (!topic || ticket.topic === topic)
        && (!attention || (attention === 'waiting_for_operator' ? waitingForOperator : overdue))
        && (!query || searchable.includes(query));
    });
    const sort = url.searchParams.get('sort') || 'risk';
    const offset = Number(url.searchParams.get('offset') || 0);
    const riskRank = (ticket: TicketFixture) => {
      const active = ticket.status === 'open' || ticket.status === 'in_progress';
      const overdue = ticket.waiting_on === 'operator' && Boolean(ticket.waiting_since) && new Date(ticket.waiting_since || 0).getTime() <= new Date('2026-07-10T08:00:00Z').getTime();
      if (active && (['critical', 'urgent'].includes(ticket.priority) || overdue)) return 0;
      if (active && (ticket.waiting_on === 'operator' || ticket.priority === 'high')) return 1;
      if (active) return 2;
      return 3;
    };
    const orderedItems = [...filteredItems].sort((left, right) => {
      const updatedDifference = new Date(left.updated_at).getTime() - new Date(right.updated_at).getTime();
      if (sort === 'updated_at') return -updatedDifference;
      return riskRank(left) - riskRank(right) || updatedDifference;
    });
    const limit = Number(url.searchParams.get('limit'));
    const items = orderedItems.slice(offset, offset + limit);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiEnvelope({
        items,
        pagination: { total: filteredItems.length, limit, offset, has_more: offset + items.length < filteredItems.length },
        summary: {
          open: filteredItems.filter((ticket) => ticket.status === 'open').length,
          in_progress: filteredItems.filter((ticket) => ticket.status === 'in_progress').length,
          critical: filteredItems.filter((ticket) => riskRank(ticket) === 0).length,
          warning: filteredItems.filter((ticket) => riskRank(ticket) === 1).length,
          monitor: filteredItems.filter((ticket) => riskRank(ticket) === 2).length,
          stable: filteredItems.filter((ticket) => riskRank(ticket) === 3).length,
          waiting_for_operator: filteredItems.filter((ticket) => ticket.waiting_on === 'operator').length,
          waiting_for_customer: filteredItems.filter((ticket) => ticket.waiting_on === 'customer').length,
          overdue: filteredItems.filter((ticket) => ticket.waiting_on === 'operator' && Boolean(ticket.waiting_since) && new Date(ticket.waiting_since || 0).getTime() <= new Date('2026-07-10T08:00:00Z').getTime()).length,
        },
      })),
    });
  });

  await page.route('**/api/admin/support-requests/*', async (route: Route) => {
    if (route.request().method() !== 'PATCH') {
      await route.fallback();
      return;
    }
    const requestId = decodeURIComponent(route.request().url().split('/').pop() || '');
    const payload = route.request().postDataJSON() as { status: TicketFixture['status']; admin_note: string };
    let updated: TicketFixture | undefined;
    tickets = tickets.map((ticket) => {
      if (ticket.request_id !== requestId) return ticket;
      updated = { ...ticket, status: payload.status, admin_note: payload.admin_note, updated_at: '2026-07-12T07:00:00Z' };
      return updated;
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiEnvelope({ request: updated })),
    });
  });

  return {
    getRequestCount: () => requestCount,
    getRequests: () => requests,
    failRequestForQuery: (query: string) => { failQuery = query; },
  };
}

test('ticket queue persists filters and focus while retaining usable results on failure', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const mocks = await installSupportQueueMocks(page);
  await page.goto('/admin/support-requests');

  await expect(page.getByRole('heading', { name: /Customer ticket queue|客户工单队列/i })).toBeVisible();
  await expect(page.locator('[data-ui="support-request-row"]')).toHaveCount(4);
  await expect(page.locator('[data-ui="support-request-table"] table')).toHaveCount(1);
  await expect(page.locator('[data-ui="admin-context-drawer"]')).toHaveCount(0);
  expect(mocks.getRequestCount()).toBe(1);

  const toolbarControls = [
    page.getByLabel(/Search tickets|搜索工单/i),
    page.getByLabel(/Ticket topic|工单类型/i),
    page.getByLabel(/Sort|排序/i),
    page.getByRole('button', { name: /^Apply$|^应用$/i }),
    page.getByRole('button', { name: /^Clear filters$|^清除筛选$/i }),
  ];
  const toolbarCenters = await Promise.all(toolbarControls.map(async (control) => {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    return box!.y + box!.height / 2;
  }));
  expect(Math.max(...toolbarCenters) - Math.min(...toolbarCenters)).toBeLessThan(4);

  const rows = page.locator('[data-ui="support-request-row"]');
  await expect(rows.nth(0)).toContainText('Payment confirmation is still missing');
  await expect(rows.nth(1)).toContainText('Site connection needs review');
  await expect(rows.nth(2)).toContainText('Usage total needs explanation');

  const views = page.getByRole('group', { name: /Ticket view|工单视图/i });
  await views.getByRole('button', { name: /Waiting for support|等待客服/i }).click();
  await expect(page).toHaveURL(/attention=waiting_for_operator/);
  await expect(rows).toHaveCount(2);
  await views.getByRole('button', { name: /^Overdue$|^已超时$/i }).click();
  await expect(page).toHaveURL(/attention=overdue/);
  await expect(rows).toHaveCount(1);

  await views.getByRole('button', { name: /^Open$|^待处理$/i }).click();
  await expect(page).not.toHaveURL(/attention=/);
  await expect(views.locator('[aria-pressed="true"]')).toHaveCount(1);
  await expect(page).toHaveURL(/status=open/);
  await expect(rows).toHaveCount(2);

  const requestsBeforeTyping = mocks.getRequestCount();
  await page.getByLabel(/Search tickets|搜索工单/i).fill('Payment');
  await page.waitForTimeout(350);
  expect(mocks.getRequestCount()).toBe(requestsBeforeTyping);
  await expect(page).not.toHaveURL(/q=Payment/);
  await page.getByRole('button', { name: /^Apply$|^应用$/i }).click();
  await expect(page).toHaveURL(/q=Payment/);
  await expect(rows).toHaveCount(1);

  const inspectButton = page.getByRole('button', { name: /^Inspect$|^检查$/i });
  await inspectButton.focus();
  await inspectButton.press('Enter');
  await expect(page).toHaveURL(/focus=sr_overdue_payment/);
  await expect(page.locator('[data-ui="admin-context-drawer"]')).toContainText('Payment confirmation is still missing');
  await page.reload();
  await expect(page.getByLabel(/Search tickets|搜索工单/i)).toHaveValue('Payment');
  await expect(page.locator('[data-ui="admin-context-drawer"]')).toContainText('Payment confirmation is still missing');
  await page.getByRole('button', { name: /Close ticket inspector|关闭工单检查器/i }).click();

  mocks.failRequestForQuery('Missing');
  await page.getByLabel(/Search tickets|搜索工单/i).fill('Missing');
  await page.getByRole('button', { name: /^Apply$|^应用$/i }).click();
  await expect(page).toHaveURL(/q=Missing/);
  await expect(page.getByText(/last successfully loaded page|最近一次成功加载的页面/i)).toBeVisible();
  await expect(rows).toHaveCount(1);
  await page.getByRole('button', { name: /^Inspect$|^检查$/i }).click();
  await expect(page.getByRole('button', { name: /Edit handling|编辑处理/i })).toBeDisabled();
  await page.getByRole('button', { name: /Close ticket inspector|关闭工单检查器/i }).click();
  await page.getByRole('button', { name: /^Retry$|^重试$/i }).click();
  await expect(page.getByText(/last successfully loaded page|最近一次成功加载的页面/i)).toHaveCount(0);
  await page.getByLabel(/Search tickets|搜索工单/i).fill('NeverMatches');
  await page.getByRole('button', { name: /^Apply$|^应用$/i }).click();
  const emptyState = page.locator('[data-ui="admin-empty-state"]');
  await expect(emptyState).toContainText(/No tickets match these filters|没有符合当前筛选条件的工单/i);
  await emptyState.getByRole('button', { name: /Clear filters|清除筛选/i }).click();
  await expect(rows).toHaveCount(4);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('ticket drawer inspects context and shared dialog owns bounded internal handling', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installSupportQueueMocks(page);
  await page.goto('/admin/support-requests');

  const paymentRow = page.locator('[data-ui="support-request-row"]').filter({ hasText: 'Payment confirmation is still missing' });
  const paymentInspectButton = paymentRow.getByRole('button', { name: /^Inspect$|^检查$/i });
  await paymentInspectButton.click();
  const inspector = page.locator('[data-ui="admin-context-drawer"]');
  await expect(inspector.getByRole('heading', { name: /Customer submission|客户提交内容/i })).toBeVisible();
  await expect(inspector.getByRole('heading', { name: /Internal handling|内部处理/i })).toBeVisible();
  await expect(page.locator('textarea')).toHaveCount(0);
  await expect(inspector.getByRole('link', { name: /Open conversation|打开会话/i })).toHaveAttribute('href', /\/admin\/support-requests\/sr_overdue_payment\?return_to=/);
  await expect(inspector.getByRole('link', { name: 'acct_beta' })).toHaveAttribute('href', '/admin/accounts/acct_beta');
  await expect(inspector.getByRole('link', { name: 'site_beta' })).toHaveAttribute('href', '/admin/sites/site_beta');

  await inspector.getByRole('button', { name: /Edit handling|编辑处理/i }).click();
  const editor = page.getByRole('dialog', { name: /Edit internal handling|编辑内部处理/i });
  const statusSelect = editor.getByRole('combobox', { name: /Status for|的状态/i });
  await statusSelect.selectOption('in_progress');
  await editor.getByLabel(/Internal note for|内部备注/i).fill('Provider confirmation is being reconciled.');
  await editor.getByRole('button', { name: /^Save$|^保存$/i }).click();

  await expect(page.getByText(/Ticket updated|工单已更新/i).first()).toBeVisible();
  await expect(editor).toHaveCount(0);
  await expect(inspector).toContainText(/In progress|处理中/i);
  await expect(inspector).toContainText('Provider confirmation is being reconciled.');
  await page.getByRole('button', { name: /Close ticket inspector|关闭工单检查器/i }).click();
  await expect(paymentInspectButton).toBeFocused();
});

test('ticket queue keyboard flow moves focus, ignores typing, and opens detail with return context', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installSupportQueueMocks(page);
  await page.route('**/api/admin/support-requests/sr_overdue_payment', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiEnvelope({
        request: initialTickets()[0],
        messages: [],
        attachments: [],
        feedback: null,
      })),
    });
  });
  await page.goto('/admin/support-requests');
  await expect(page.locator('[data-ui="support-request-row"]')).toHaveCount(4);
  const keyboardHelp = page.getByRole('button', { name: /^Keyboard shortcuts$|^键盘快捷键$/i });
  await keyboardHelp.focus();
  await expect(page.locator('[data-ui="admin-queue-keyboard-hint"]')).toBeVisible();
  await keyboardHelp.press('Escape');

  const search = page.getByLabel(/Search tickets|搜索工单/i);
  await search.focus();
  await page.keyboard.press('j');
  await expect(page).not.toHaveURL(/focus=/);
  await search.fill('');
  await search.blur();

  await page.keyboard.press('j');
  await expect(page).toHaveURL(/focus=sr_overdue_payment/);
  await expect(page.locator('[data-ui="support-request-row"]').nth(0)).toHaveClass(/bg-blue-50/);
  await expect(page.locator('[data-ui="admin-context-drawer"]')).toHaveCount(0);
  const supportKeyboardScreenshotPath = testInfo.outputPath('p3-support-queue-keyboard.png');
  await page.screenshot({ path: supportKeyboardScreenshotPath, fullPage: true });
  await testInfo.attach('p3-support-queue-keyboard', {
    path: supportKeyboardScreenshotPath,
    contentType: 'image/png',
  });

  await page.keyboard.press('j');
  await expect(page).toHaveURL(/focus=sr_open_site/);
  await page.keyboard.press('k');
  await expect(page).toHaveURL(/focus=sr_overdue_payment/);

  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/focus=/);
  await expect(page.locator('[data-ui="support-request-row"]').nth(0)).not.toHaveClass(/bg-blue-50/);

  await page.keyboard.press('j');
  await expect(page).toHaveURL(/focus=sr_overdue_payment/);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/admin\/support-requests\/sr_overdue_payment\?return_to=/);
});

function pageTickets(count: number): TicketFixture[] {
  return Array.from({ length: count }, (_, index) => ({
    ...initialTickets()[index % 4],
    request_id: `sr_page_${index}`,
    title: `Queue sample ${String(index).padStart(2, '0')}`,
    topic: 'general',
    updated_at: new Date(Date.UTC(2026, 6, 12, index)).toISOString(),
  }));
}

for (const count of [0, 1, 10, 11]) {
  test(`ticket queue shows an honest range for ${count} results`, async ({ page }) => {
    await installSupportQueueMocks(page, pageTickets(count));
    await page.goto('/admin/support-requests');
    await expect(page.locator('[data-ui="support-request-table"]')).toBeVisible();
    await expect(page.locator('[data-ui="support-request-row"]')).toHaveCount(Math.min(count, 10));
    const pagination = page.getByRole('navigation', { name: /Pagination|分页/i, exact: true });
    if (count <= 10) {
      await expect(pagination).toHaveCount(0);
      await expect(page.locator('[data-ui="support-request-single-page-range"]')).toHaveText(
        new RegExp(`(?:${count ? 1 : 0}-${count} of ${count}|第 ${count ? 1 : 0}–${count} 条，共 ${count} 条)`)
      );
    } else {
      await expect(page.locator('[data-ui="support-request-single-page-range"]')).toHaveCount(0);
      await expect(pagination).toContainText(/1-10 of 11|第 1–10 条，共 11 条/);
      await expect(pagination.getByRole('button', { name: /Next page|下一页/i })).toBeEnabled();
    }
  });
}

test('ticket paging keeps filters and sort while clearing row focus', async ({ page }) => {
  const mocks = await installSupportQueueMocks(page, pageTickets(21));
  await page.goto('/admin/support-requests');
  const rows = page.locator('[data-ui="support-request-row"]');
  await expect(rows).toHaveCount(10);
  await page.getByLabel(/Sort|排序/i).selectOption('updated_at');
  await page.getByLabel(/Search tickets|搜索工单/i).fill('Queue sample');
  await page.getByRole('button', { name: /^Apply$|^应用$/i }).click();
  await expect(rows.first()).toContainText('Queue sample 20');
  await page.getByLabel(/Search tickets|搜索工单/i).blur();
  await page.keyboard.press('j');
  await expect(page).toHaveURL(/focus=/);
  const pagination = page.getByRole('navigation', { name: /Pagination|分页/i, exact: true });
  const nextPage = pagination.getByRole('button', { name: /Next page|下一页/i });
  await nextPage.click();
  await expect(page).toHaveURL(/offset=10/);
  await expect(page).not.toHaveURL(/focus=/);
  await expect(rows).toHaveCount(10);
  await expect(rows.first()).toContainText('Queue sample 10');
  await expect(page.locator('[data-ui="admin-context-drawer"]')).toHaveCount(0);
  expect(mocks.getRequests().at(-1)?.get('offset')).toBe('10');
  await page.reload();
  await expect(rows.first()).toContainText('Queue sample 10');
  await expect(page.getByLabel(/Search tickets|搜索工单/i)).toHaveValue('Queue sample');
  await expect(page.getByLabel(/Sort|排序/i)).toHaveValue('updated_at');
  await pagination.getByRole('button', { name: /Next page|下一页/i }).click();
  await expect(page).toHaveURL(/offset=20/);
  await expect(rows).toHaveCount(1);
  await expect(pagination).toContainText(/21-21 of 21|第 21–21 条，共 21 条/);
  await expect(pagination.getByRole('button', { name: /Next page|下一页/i })).toBeDisabled();
  await pagination.getByRole('button', { name: /Previous|上一页/i }).click();
  await expect(page).toHaveURL(/offset=10/);
  await expect(rows).toHaveCount(10);
  expect(mocks.getRequests().at(-1)?.get('q')).toBe('Queue sample');
  expect(mocks.getRequests().at(-1)?.get('sort')).toBe('updated_at');
});

test('ticket Quiet PC preview keeps real language and theme controls', async ({ page }, testInfo) => {
  const browserEvidence = observeAdminBrowserEvidence(page);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const tickets = pageTickets(11);
  await installSupportQueueMocks(page, tickets);
  await page.route('**/api/admin/support-requests/sr_page_*', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    const request = tickets.find(item => route.request().url().endsWith(item.request_id));
    expect(request).toBeDefined();
    await route.fulfill({ json: buildAdminApiEnvelope({ request, messages: [], attachments: [], feedback: null }) });
  });
  await page.goto('/admin/support-requests');
  const table = page.locator('[data-ui="support-request-table"]');
  await expect(table.locator('[data-ui="support-request-row"]')).toHaveCount(10);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await page.screenshot({ path: testInfo.outputPath('support-zh-light.png'), fullPage: true });
  // Do not call this English cold coverage: switch only after Chinese hydration.
  await page.getByRole('button', { name: '语言', exact: true }).click();
  await page.getByRole('option', { name: 'English', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  const views = page.getByRole('group', { name: 'Ticket view', exact: true });
  await expect(views.locator('button')).toHaveCount(7);
  await expect(views.locator('[aria-pressed="true"]')).toHaveCount(1);
  for (const width of [1440, 1280]) {
    await page.setViewportSize({ width, height: 1050 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Apply', exact: true })).toBeVisible();
    await expect(table.getByRole('button', { name: 'Inspect', exact: true }).first()).toBeVisible();
    const tableBox = await table.boundingBox();
    const actionBox = await table.getByRole('link', { name: 'Open conversation', exact: true }).first().boundingBox();
    expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(tableBox!.x + tableBox!.width);
    await page.screenshot({ path: testInfo.outputPath(`support-en-light-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1050 });
  if (!await page.locator('html').evaluate(element => element.classList.contains('dark'))) {
    await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
  }
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.screenshot({ path: testInfo.outputPath('support-en-dark.png'), fullPage: true });
  await views.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page).toHaveURL(/status=open/);
  const firstRow = table.locator('[data-ui="support-request-row"]').first();
  const inspect = firstRow.getByRole('button', { name: 'Inspect', exact: true });
  await inspect.click();
  await expect(page.locator('[data-ui="admin-context-drawer"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(inspect).toBeFocused();
  await firstRow.getByRole('link', { name: 'Open conversation', exact: true }).click();
  await expect(page.locator('[data-ui="support-request-detail-workspace"]')).toBeVisible();
  await page.getByRole('link', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(/status=open/);
  await expect(firstRow.getByRole('button', { name: 'Inspect', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await writeAdminVisualReceipt({
    page, testInfo, artifactId: 'support-quiet-controls', route: '/admin/support-requests', pageModel: 'queue',
    testedStates: ['ready', 'filtered', 'selected', 'returned'], humanAcceptance: 'not_required',
    pageTitle: page.getByRole('heading', { name: 'Tickets', exact: true }), workingSurface: table, browserEvidence,
    routeRuleResults: [
      { id: 'single-primary-action', status: 'pass', evidence: 'Explicit Apply and per-row Open conversation remain in separate working regions' },
      { id: 'textual-status', status: 'pass', evidence: 'risk and status badges retain visible text; view pills have labels' },
      { id: 'action-object-proximity', status: 'pass', evidence: 'Inspect and Open conversation remain beside each ticket' },
      { id: 'distinct-interaction-states', status: 'pass', evidence: 'One view pill is pressed, previous is disabled on first page, next is enabled' },
      { id: 'dialog-focus-recovery', status: 'pass', evidence: 'Escape closes Inspect drawer and restores its trigger focus' },
      { id: 'context-stability', status: 'pass', evidence: 'Theme and language controls retain the results; detail Back restores open view and row selection' },
    ],
    interactionResults: [
      { id: 'hydrated-language-control', status: 'pass', evidence: 'Chinese cold document then real language control switched to English; no English cold claim' },
      { id: 'pc-width-and-theme', status: 'pass', evidence: '1440 and 1280 PC views keep actions visible without document overflow; real theme control selects dark' },
    ],
  });
});


test('ticket mixed input keeps search and explicit inspection separate from keyboard selection', async ({ page }, testInfo) => {
  const mocks = await installSupportQueueMocks(page);
  await page.goto('/admin/support-requests');
  const rows = page.locator('[data-ui="support-request-row"]');
  const drawer = page.locator('[data-ui="admin-context-drawer"]');
  await expect(rows).toHaveCount(4);
  const drawerEvidence = await page.evaluateHandle(() => {
    const openings: string[] = [];
    const observer = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node instanceof Element && (node.matches('[data-ui="admin-context-drawer"]') || node.querySelector('[data-ui="admin-context-drawer"]'))) openings.push('drawer');
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return { openings, stop: () => observer.disconnect() };
  });
  await page.keyboard.press('j');
  await expect(page).toHaveURL(/focus=sr_overdue_payment/);
  const search = page.getByLabel(/Search tickets|搜索工单/i);
  const beforeTyping = mocks.getRequestCount();
  await search.click();
  await expect(search).toBeFocused();
  await search.fill('Site connection');
  await page.keyboard.press('j');
  await expect(page).toHaveURL(/focus=sr_overdue_payment/);
  expect(mocks.getRequestCount()).toBe(beforeTyping);
  await search.fill('Site connection');
  await page.getByRole('button', { name: /^Apply$|^应用$/i }).click();
  await expect(page).toHaveURL(/q=Site\+connection/);
  await expect(page).not.toHaveURL(/focus=/);
  await expect(rows).toHaveCount(1);
  await expect(drawer).toHaveCount(0);
  expect(mocks.getRequests().at(-1)?.get('q')).toBe('Site connection');
  await page.keyboard.press('j');
  await expect(page).toHaveURL(/focus=sr_open_site/);
  const beforeRefresh = mocks.getRequestCount();
  await page.getByRole('button', { name: /Refresh tickets|刷新工单/i }).click();
  await expect.poll(() => mocks.getRequestCount()).toBe(beforeRefresh + 1);
  await expect(drawer).toHaveCount(0);
  expect(await drawerEvidence.evaluate(state => state.openings)).toEqual([]);
  await drawerEvidence.evaluate(state => state.stop());
  const inspect = rows.getByRole('button', { name: /^Inspect$|^检查$/i });
  await inspect.click();
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText('Site connection needs review');
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(page).not.toHaveURL(/focus=/);
  await expect(inspect).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('ticket-mixed-input-returned.png'), fullPage: true });
});


test('ticket keyboard selection A inspects only B and yields to its edit dialog', async ({ page }, testInfo) => {
  await installSupportQueueMocks(page);
  await page.route('**/api/admin/support-requests/sr_open_site', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: buildAdminApiEnvelope({ request: initialTickets()[1], messages: [], attachments: [], feedback: null }) });
  });
  await page.goto('/admin/support-requests');
  const rows = page.locator('[data-ui="support-request-row"]');
  const drawer = page.locator('[data-ui="admin-context-drawer"]');
  await expect(rows).toHaveCount(4);
  await page.keyboard.press('j');
  await expect(page).toHaveURL(/focus=sr_overdue_payment/);
  const observedTitles = await page.evaluateHandle(() => {
    const titles: string[] = [];
    const observer = new MutationObserver(() => {
      const title = document.querySelector('#support-request-drawer-title')?.textContent;
      if (title && titles.at(-1) !== title) titles.push(title);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return { titles, stop: () => observer.disconnect() };
  });
  const secondInspect = rows.nth(1).getByRole('button', { name: /^Inspect$|^检查$/i });
  await secondInspect.click();
  await expect(page).toHaveURL(/focus=sr_open_site/);
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('#support-request-drawer-title')).toHaveText('Site connection needs review');
  const inspectedTitles = await observedTitles.evaluate(state => state.titles);
  expect(inspectedTitles).toEqual(['Site connection needs review']);
  await observedTitles.evaluate(state => state.stop());
  await page.screenshot({ path: testInfo.outputPath('ticket-explicit-inspect-b.png'), fullPage: true });
  await drawer.getByRole('button', { name: /Edit handling|编辑处理/i }).click();
  const editor = page.getByRole('dialog', { name: /Edit internal handling|编辑内部处理/i });
  await expect(editor).toBeVisible();
  await page.keyboard.press('j');
  await expect(page).toHaveURL(/focus=sr_open_site/);
  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
  await expect(drawer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(secondInspect).toBeFocused();
  await secondInspect.blur();
  await page.keyboard.press('j');
  await expect(page).toHaveURL(/focus=sr_overdue_payment/);
  await rows.nth(1).getByRole('link', { name: /Open conversation|打开会话/i }).click();
  await expect(page).toHaveURL(/\/admin\/support-requests\/sr_open_site\?return_to=/);
  await page.getByRole('link', { name: /^Back$|^返回$/i }).click();
  await expect(page).toHaveURL(/\/admin\/support-requests\?focus=sr_open_site/);
  await expect(drawer).toContainText('Site connection needs review');
  await testInfo.attach('inspected-records', { body: JSON.stringify({ titles: inspectedTitles }), contentType: 'application/json' });
});
