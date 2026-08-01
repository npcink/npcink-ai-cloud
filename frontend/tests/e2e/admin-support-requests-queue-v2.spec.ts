import { expect, test, type Page, type Route } from '@playwright/test';
import {
  buildAdminApiEnvelope,
  buildAdminApiErrorEnvelope,
  installAdminMocks,
} from './helpers/admin-operator-fixture';

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
      created_at: '2026-07-09T05:00:00Z',
      updated_at: '2026-07-11T05:00:00Z',
    },
  ];
}

async function installSupportQueueMocks(page: Page) {
  await installAdminMocks(page);
  let tickets = initialTickets();
  let requestCount = 0;
  let failQuery = '';

  await page.route('**/api/admin/support-requests?*', async (route) => {
    requestCount += 1;
    const url = new URL(route.request().url());
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
    const topic = url.searchParams.get('topic') || '';
    const filteredItems = tickets.filter((ticket) => {
      const searchable = [ticket.request_id, ticket.email, ticket.title, ticket.account_id, ticket.site_id].join(' ').toLowerCase();
      return (!status || ticket.status === status) && (!topic || ticket.topic === topic) && (!query || searchable.includes(query));
    });
    const sort = url.searchParams.get('sort') || 'risk';
    const offset = Number(url.searchParams.get('offset') || 0);
    const riskRank = (ticket: TicketFixture) => {
      if (['critical', 'urgent'].includes(ticket.priority) || ticket.status === 'open') return 0;
      if (ticket.priority === 'high') return 1;
      if (ticket.status === 'in_progress') return 2;
      return 3;
    };
    const orderedItems = [...filteredItems].sort((left, right) => {
      const updatedDifference = new Date(left.updated_at).getTime() - new Date(right.updated_at).getTime();
      if (sort === 'updated_at') return -updatedDifference;
      return riskRank(left) - riskRank(right) || updatedDifference;
    });
    const items = orderedItems.slice(offset, offset + 20);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiEnvelope({
        items,
        pagination: { total: filteredItems.length, limit: 20, offset, has_more: offset + items.length < filteredItems.length },
        summary: {
          open: filteredItems.filter((ticket) => ticket.status === 'open').length,
          in_progress: filteredItems.filter((ticket) => ticket.status === 'in_progress').length,
          critical: filteredItems.filter((ticket) => riskRank(ticket) === 0).length,
          warning: filteredItems.filter((ticket) => riskRank(ticket) === 1).length,
          monitor: filteredItems.filter((ticket) => riskRank(ticket) === 2).length,
          stable: filteredItems.filter((ticket) => riskRank(ticket) === 3).length,
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
    failRequestForQuery: (query: string) => { failQuery = query; },
  };
}

test('ticket queue persists filters and focus while retaining usable results on failure', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const mocks = await installSupportQueueMocks(page);
  await page.goto('/admin/support-requests');

  await expect(page.getByRole('heading', { name: /Customer ticket queue|客户工单队列/i })).toBeVisible();
  await expect(page.locator('[data-ui="support-request-row"]')).toHaveCount(4);
  await expect(page.locator('[data-ui="support-request-table"] table')).toHaveCount(1);
  await expect(page.locator('[data-ui="admin-context-drawer"]')).toHaveCount(0);
  expect(mocks.getRequestCount()).toBe(1);

  const rows = page.locator('[data-ui="support-request-row"]');
  await expect(rows.nth(0)).toContainText('Payment confirmation is still missing');
  await expect(rows.nth(1)).toContainText('Site connection needs review');
  await expect(rows.nth(2)).toContainText('Usage total needs explanation');

  await page.getByLabel(/Ticket status|工单状态/i).selectOption('open');
  await expect(page).toHaveURL(/status=open/);
  await expect(rows).toHaveCount(2);

  await page.getByLabel(/Search tickets|搜索工单/i).fill('Payment');
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
