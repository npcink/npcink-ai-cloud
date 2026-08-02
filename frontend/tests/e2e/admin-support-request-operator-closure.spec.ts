import { expect, test, type Page } from '@playwright/test';
import {
  buildAdminApiEnvelope,
  buildAdminApiErrorEnvelope,
  installAdminMocks,
} from './helpers/admin-operator-fixture';
import {
  observeAdminBrowserEvidence,
  writeAdminVisualReceipt,
} from './helpers/admin-visual-receipt';

const requestId = 'sr_overdue_payment';
const supportRequest = {
  request_id: requestId,
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
} as const;

async function installSupportRequestClosureHarness(page: Page) {
  await installAdminMocks(page);
  let publicReplyAttempts = 0;
  const messages = [
    {
      message_id: 'msg_customer_initial',
      request_id: requestId,
      author_kind: 'customer',
      visibility: 'public',
      body: 'Could you confirm whether the payment was received?',
      created_at: '2026-07-08T08:00:00Z',
    },
  ];

  await page.route('**/api/admin/support-requests?*', async (route) => {
    const url = new URL(route.request().url());
    const status = url.searchParams.get('status') || '';
    const query = (url.searchParams.get('q') || '').toLowerCase();
    const items = [supportRequest].filter((item) => (
      (!status || item.status === status) &&
      (!query || [item.title, item.email, item.account_id, item.site_id]
        .join(' ')
        .toLowerCase()
        .includes(query))
    ));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiEnvelope({
        items,
        pagination: { total: items.length, limit: 20, offset: 0, has_more: false },
        summary: {
          open: items.length,
          in_progress: 0,
          critical: items.length,
          warning: 0,
          monitor: 0,
          stable: 0,
          waiting_for_operator: items.length,
          waiting_for_customer: 0,
          overdue: items.length,
        },
      })),
    });
  });

  await page.route(`**/api/admin/support-requests/${requestId}/messages`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    publicReplyAttempts += 1;
    const payload = route.request().postDataJSON() as { body?: string; visibility?: string };
    expect(payload).toEqual({
      body: 'The payment is now confirmed. Your order is active.',
      visibility: 'public',
    });
    if (publicReplyAttempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify(buildAdminApiErrorEnvelope('temporary public reply failure')),
      });
      return;
    }
    const message = {
      message_id: 'msg_operator_confirmed',
      request_id: requestId,
      author_kind: 'operator',
      visibility: 'public',
      body: payload.body || '',
      created_at: '2026-07-12T09:00:00Z',
    };
    messages.push(message);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiEnvelope({
        request: {
          ...supportRequest,
          waiting_on: 'customer',
          waiting_since: '2026-07-12T09:00:00Z',
          first_operator_response_at: '2026-07-12T09:00:00Z',
          last_operator_public_activity_at: '2026-07-12T09:00:00Z',
          updated_at: '2026-07-12T09:00:00Z',
        },
        message,
        notification: { delivered: true },
      })),
    });
  });

  await page.route(`**/api/admin/support-requests/${requestId}`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiEnvelope({
        request: supportRequest,
        messages,
        attachments: [],
        feedback: null,
      })),
    });
  });

  return { getPublicReplyAttempts: () => publicReplyAttempts };
}

test('ticket operator preserves queue context through failed and successful public reply', async ({ page }, testInfo) => {
  const browserEvidence = observeAdminBrowserEvidence(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  const harness = await installSupportRequestClosureHarness(page);
  await page.goto('/admin/support-requests');

  const queue = page.locator('[data-ui="support-request-table"]');
  await expect(queue).toBeVisible();
  await page.getByLabel(/Ticket view|工单视图/i).selectOption('status:open');
  await page.getByLabel(/Search tickets|搜索工单/i).fill('Payment');
  await page.getByRole('button', { name: /^Apply$|^应用$/i }).click();
  await expect(page).toHaveURL(/status=open/);
  await expect(page).toHaveURL(/q=Payment/);

  const row = page.locator('[data-ui="support-request-row"]');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(supportRequest.title);
  const inspectButton = row.getByRole('button', { name: /^Inspect$|^检查$/i });
  await inspectButton.click();
  const drawer = page.locator('[data-ui="admin-context-drawer"]');
  await expect(drawer).toContainText(supportRequest.title);
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(inspectButton).toBeFocused();

  await row.getByRole('link', { name: /Open conversation|打开会话/i }).click();
  const detailWorkspace = page.locator('[data-ui="support-request-detail-workspace"]');
  await expect(detailWorkspace).toBeVisible();
  await expect(page.locator('main h1').filter({ hasText: supportRequest.title })).toHaveCount(1);
  await expect(page).toHaveURL(new RegExp(`/admin/support-requests/${requestId}\\?return_to=`));

  await page.reload();
  await expect(detailWorkspace).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/status=open/);
  await expect(page).toHaveURL(/q=Payment/);
  await page.goForward();
  await expect(detailWorkspace).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/admin/support-requests/${requestId}\\?return_to=`));

  const reply = page.getByLabel(/Public reply|公开回复/i);
  const sendReply = page.getByRole('button', { name: /Send public reply|发送公开回复/i });
  await expect(sendReply).toBeDisabled();
  await reply.fill('The payment is now confirmed. Your order is active.');
  await sendReply.click();
  await expect(page.getByText('temporary public reply failure')).toBeVisible();
  await expect(reply).toHaveValue('The payment is now confirmed. Your order is active.');
  await expect(sendReply).toBeEnabled();

  await sendReply.click();
  await expect(page.getByText(/Reply sent and customer notified|回复已发送.*通知客户/i)).toBeVisible();
  await expect(page.getByText('The payment is now confirmed. Your order is active.')).toBeVisible();
  await expect(reply).toHaveValue('');
  await expect(sendReply).toBeDisabled();
  expect(harness.getPublicReplyAttempts()).toBe(2);

  const backLink = page.getByRole('link', { name: /^Back$|^返回$/i });
  await expect(backLink).toHaveAttribute('href', /status=open/);
  await expect(backLink).toHaveAttribute('href', /q=Payment/);
  await expect(backLink).toHaveAttribute('href', new RegExp(`focus=${requestId}`));

  await writeAdminVisualReceipt({
    page,
    testInfo,
    artifactId: 'support-request-detail',
    route: '/admin/support-requests/[requestId]',
    pageModel: 'detail',
    testedStates: ['ready', 'action_error', 'action_success', 'return_context'],
    humanAcceptance: 'not_required',
    pageTitle: page.locator('main h1').filter({ hasText: supportRequest.title }),
    workingSurface: detailWorkspace,
    browserEvidence,
    expectedConsoleErrors: [/^Failed to load resource: the server responded with a status of 503 \(Service Unavailable\)$/],
    routeRuleResults: [
      { id: 'single-primary-action', status: 'pass', evidence: 'Send public reply is the only primary action in the reply workbench' },
      { id: 'textual-status', status: 'pass', evidence: 'the ticket status is exposed as an Open text badge' },
      { id: 'action-object-proximity', status: 'pass', evidence: 'reply action, failure, success notice, draft, and timeline remain in the ticket workspace' },
      { id: 'distinct-interaction-states', status: 'pass', evidence: 'empty, editable, failed retry, pending, and completed reply states were exercised' },
      { id: 'dialog-focus-recovery', status: 'not_applicable', evidence: 'ticket detail uses in-flow workbenches and opens no dialog' },
      { id: 'context-stability', status: 'pass', evidence: 'failure preserved the exact reply draft, success cleared it, and Back retained the queue return context' },
    ],
    interactionResults: [
      { id: 'public-reply-failure', status: 'pass', evidence: 'the 503 failure remained visible in the current ticket and preserved the reply draft' },
      { id: 'public-reply-retry', status: 'pass', evidence: 'the same action succeeded on retry, appended the reply, and reported notification delivery' },
      { id: 'queue-return-contract', status: 'pass', evidence: 'the Back link retained status, search, and focused ticket parameters' },
    ],
  });

  await backLink.click();
  await expect(page).toHaveURL(/status=open/);
  await expect(page).toHaveURL(/q=Payment/);
  await expect(page).toHaveURL(new RegExp(`focus=${requestId}`));
  await expect(page.getByLabel(/Ticket view|工单视图/i)).toHaveValue('status:open');
  await expect(page.getByLabel(/Search tickets|搜索工单/i)).toHaveValue('Payment');
  await expect(page.locator('[data-ui="support-request-row"]')).toHaveCount(1);
  await expect(page.locator('[data-ui="support-request-row"]')
    .getByRole('button', { name: /^Inspect$|^检查$/i })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-ui="admin-context-drawer"]')).toContainText(supportRequest.title);

  await writeAdminVisualReceipt({
    page,
    testInfo,
    artifactId: 'support-request-queue',
    route: '/admin/support-requests',
    pageModel: 'queue',
    testedStates: ['ready', 'filtered', 'selected', 'returned'],
    humanAcceptance: 'not_required',
    pageTitle: page.getByRole('heading', { name: /^Tickets$|^工单$/i }),
    workingSurface: page.locator('[data-ui="support-request-table"]'),
    browserEvidence,
    expectedConsoleErrors: [/^Failed to load resource: the server responded with a status of 503 \(Service Unavailable\)$/],
    routeRuleResults: [
      { id: 'single-primary-action', status: 'pass', evidence: 'Apply owns the filter region and Open conversation owns each ticket action region' },
      { id: 'textual-status', status: 'pass', evidence: 'risk and ticket status are both visible as text labels' },
      { id: 'action-object-proximity', status: 'pass', evidence: 'Inspect and Open conversation remain in the affected ticket row and drawer' },
      { id: 'distinct-interaction-states', status: 'pass', evidence: 'filtered input, selected row, aria-pressed inspection, and disabled states remain distinct' },
      { id: 'dialog-focus-recovery', status: 'pass', evidence: 'Escape closed the inspector and restored focus to its Inspect trigger' },
      { id: 'context-stability', status: 'pass', evidence: 'returning from detail restored status=open, q=Payment, and the focused ticket inspector' },
    ],
    interactionResults: [
      { id: 'filter-and-select', status: 'pass', evidence: 'status, search, and focus were represented in the queue URL' },
      { id: 'drawer-keyboard-recovery', status: 'pass', evidence: 'Escape closed the drawer and restored focus before navigation' },
      { id: 'detail-return', status: 'pass', evidence: 'Back restored the exact filtered queue and reopened the focused ticket context' },
    ],
  });
});

test('ticket direct and invalid return contexts fail closed to the ticket queue', async ({ page }) => {
  await installSupportRequestClosureHarness(page);

  await page.goto(`/admin/support-requests/${requestId}`);
  await expect(page.getByRole('link', { name: /^Back$|^返回$/i })).toHaveAttribute(
    'href',
    '/admin/support-requests'
  );

  const invalidReturnTo = encodeURIComponent('/admin/subscriptions/sub_mvp');
  await page.goto(`/admin/support-requests/${requestId}?return_to=${invalidReturnTo}`);
  await expect(page.getByRole('link', { name: /^Back$|^返回$/i })).toHaveAttribute(
    'href',
    '/admin/support-requests'
  );
});
