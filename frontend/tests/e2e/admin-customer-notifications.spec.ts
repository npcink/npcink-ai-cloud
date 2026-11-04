import { expect, test } from '@playwright/test';
import { buildAdminApiEnvelope, installAdminMocks } from './helpers/admin-operator-fixture';
import {
  observeAdminBrowserEvidence,
  writeAdminVisualReceipt,
} from './helpers/admin-visual-receipt';

const path = '/admin/customer-notifications';
const states = [
  'ready',
  'invalid',
  'dirty',
  'save_error',
  'saved',
  'preview',
  'action_error',
  'action_success',
];
test('service notice preview, retained draft and lost-send recovery on PC', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.addInitScript(() => localStorage.setItem('locale', 'en'));
  const evidence = observeAdminBrowserEvidence(page);
  await installAdminMocks(page);
  let detail: Record<string, unknown> | null = null,
    previews = 0,
    sends = 0;
  await page.route('**/api/admin/customer-notifications**', async (route) => {
    const url = new URL(route.request().url()),
      method = route.request().method();
    if (url.pathname === '/api/admin/customer-notifications' && method === 'GET') {
      const items = detail ? [{ ...detail, recipients: undefined }] : [];
      return route.fulfill({
        json: buildAdminApiEnvelope({ items, total_count: items.length, limit: 20, offset: 0 }),
      });
    }
    if (method === 'POST' && url.pathname.endsWith('/send')) {
      sends += 1;
      const row = detail!;
      detail = {
        ...row,
        status: 'sent',
        sent_at: '2026-11-03T06:00:00Z',
        ready_count: 0,
        sent_count: 2,
        recipients: (row.recipients as Record<string, unknown>[]).map((item) =>
          item.status === 'ready'
            ? { ...item, status: 'sent', notification_id: `pnotif_${item.account_id}` }
            : item,
        ),
      };
      // The business operation committed, but its response is unusable.
      return route.fulfill({ json: buildAdminApiEnvelope({ invalid_receipt: true }) });
    }
    if (method === 'POST') {
      previews += 1;
      const payload = route.request().postDataJSON();
      detail = {
        ...payload,
        status: 'preview',
        actor_kind: 'platform_admin',
        actor_ref: 'platform:operator-e2e',
        created_at: '2026-11-03T05:55:00Z',
        sent_at: null,
        target_count: 3,
        ready_count: 2,
        sent_count: 0,
        skipped_count: 1,
        read_count: 0,
        failed_count: 0,
        recipients: [
          {
            account_id: 'acct_one',
            account_name: 'First customer',
            principal_id: 'owner_one',
            email: 'first@example.test',
            status: 'ready',
            reason: '',
            is_read: false,
          },
          {
            account_id: 'acct_two',
            account_name: 'Second customer',
            principal_id: 'owner_two',
            email: 'second@example.test',
            status: 'ready',
            reason: '',
            is_read: false,
          },
          {
            account_id: 'acct_missing',
            account_name: 'Account without owner',
            principal_id: '',
            email: '',
            status: 'skipped',
            reason: 'owner_ambiguous',
            is_read: false,
          },
        ],
      };
      return route.fulfill({
        json: buildAdminApiEnvelope(previews === 1 ? { invalid_receipt: true } : detail),
      });
    }
    return route.fulfill({ json: buildAdminApiEnvelope(detail) });
  });
  await page.goto(path);
  await expect(page.getByRole('heading', { name: 'Notices', exact: true })).toBeVisible();
  await expect(page.locator('[data-ui="notices-two-column"]')).toBeVisible();
  await page.getByRole('button', { name: 'New notice', exact: true }).click();
  const compose = page.locator('[data-ui="notice-compose-modal"]');
  await expect(compose.getByRole('button', { name: 'Preview recipients', exact: true })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('notices-ready.png'), fullPage: true });
  await compose.getByLabel('Recipients', { exact: true }).selectOption('all');
  await compose.getByLabel('Title', { exact: true }).fill('Tonight’s maintenance');
  await compose
    .getByLabel('Message (plain text)', { exact: true })
    .fill('Service maintenance 22:00–22:30. <script> is plain text.');
  await compose.getByLabel('Destination', { exact: true }).selectOption('/portal/usage');
  await page.reload();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Tonight’s maintenance');
  await page.getByRole('button', { name: 'Preview recipients', exact: true }).click();
  await expect(page.getByText(/The result is unconfirmed/)).toBeVisible();
  await page.getByRole('button', { name: 'Read batch result', exact: true }).click();
  await expect(page.locator('[data-ui="notice-preview"]')).toContainText(/Ready\s*2/);
  await expect(page.getByText('No unique active owner', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send notice', exact: true })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('notices-preview.png'), fullPage: true });
  await page.getByRole('button', { name: 'Send notice', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('2 account owners');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(sends).toBe(0);
  await expect(page.getByRole('button', { name: 'Send notice', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Send notice', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Send notice', exact: true }).click();
  await expect(page.getByText(/The result is unconfirmed/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'New notice', exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByText(/The result is unconfirmed/)).toBeVisible();
  await page.getByRole('button', { name: 'Read batch result', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Delivery result', exact: true })).toBeVisible();
  await expect(page.locator('[data-ui="notice-preview"]')).toContainText(/Inbox\s*2/);
  expect(previews).toBe(1);
  expect(sends).toBe(1);
  await page.setViewportSize({ width: 1056, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath('notices-result-narrow.png'), fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
  });
  await page.screenshot({ path: testInfo.outputPath('notices-result-dark.png'), fullPage: true });
  await page.evaluate(() => {
    document.documentElement.classList.remove('dark');
  });
  await writeAdminVisualReceipt({
    page,
    testInfo,
    route: path,
    pageModel: 'configuration',
    testedStates: states,
    pageTitle: page.getByRole('heading', { name: 'Notices', exact: true }),
    workingSurface: page.locator('[data-ui="customer-notifications-workspace"]'),
    browserEvidence: evidence,
    dataMode: 'mocked',
    artifactId: 'customer-notifications',
    routeRuleResults: [
      {
        id: 'single-primary-action',
        status: 'pass',
        evidence: 'Preview and send are separate task regions; sending is confirmed in a dialog.',
      },
      {
        id: 'textual-status',
        status: 'pass',
        evidence: 'Ready, skipped, inbox and read counts remain visible.',
      },
      {
        id: 'action-object-proximity',
        status: 'pass',
        evidence: 'Send follows the fixed notice and audience preview.',
      },
      {
        id: 'distinct-interaction-states',
        status: 'pass',
        evidence: 'Invalid, draft, immutable preview, unknown and sent were exercised.',
      },
      {
        id: 'dialog-focus-recovery',
        status: 'pass',
        evidence: 'Cancel closes confirmation without a send; confirmation sends once.',
      },
      {
        id: 'context-stability',
        status: 'pass',
        evidence: 'Draft and pending operation survive reload; only one send POST occurred.',
      },
    ],
    interactionResults: [
      {
        id: 'lost-response-recovery',
        status: 'pass',
        evidence: 'Unusable committed response recovered by GET after reload; no duplicate POST.',
      },
    ],
  });
  expect(evidence.consoleErrors).toEqual([]);
});

test('customer detail shortcut and recipient search preserve explicit scope', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('locale', 'en'));
  await installAdminMocks(page);
  await page.goto('/admin/accounts/acct_mvp_enterprise_primary');
  await page.getByRole('link', { name: 'Send notice', exact: true }).click();
  await expect(page.getByLabel('Recipients', { exact: true })).toHaveValue('selected');
  await expect(
    page.getByRole('button', { name: /^Remove .*acct_mvp_ent…_primary$/ }),
  ).toBeVisible();
  await page.getByLabel('Find customers by name or email').fill('Enterprise');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add', exact: true }).first()).toBeVisible();
});

test('expired preview preserves Chinese draft and permits a fresh preview', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.addInitScript(() => localStorage.setItem('locale', 'zh'));
  await installAdminMocks(page);
  const previewIds: string[] = [];
  let sendCount = 0;
  await page.route('**/api/admin/customer-notifications**', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: buildAdminApiEnvelope({ items: [], total_count: 0, limit: 20, offset: 0 }) });
    if (new URL(route.request().url()).pathname.endsWith('/send')) {
      sendCount += 1;
      return route.fulfill({ status: 409, json: {
        status: 'error', error_code: 'service.notification_preview_expired',
        message: 'Preview expired. Create a new preview before sending.', data: null,
        meta: { trace_id: 'expiry-test', revision: 'test' },
      } });
    }
    const payload = route.request().postDataJSON();
    previewIds.push(payload.dispatch_id);
    return route.fulfill({ json: buildAdminApiEnvelope({
      ...payload, status: 'preview', actor_kind: 'platform_admin', actor_ref: 'platform:operator-e2e',
      created_at: '2026-11-03T05:00:00Z', sent_at: null, target_count: 1, ready_count: 1,
      sent_count: 0, skipped_count: 0, read_count: 0, failed_count: 0,
      recipients: [{ account_id: 'acct_one', account_name: '示例客户', principal_id: 'owner_one',
        email: 'one@example.test', status: 'ready', reason: '', is_read: false }],
    }) });
  });
  await page.goto(path);
  await page.getByRole('button', { name: '新建通知', exact: true }).click();
  const composeZh = page.locator('[data-ui="notice-compose-modal"]');
  await composeZh.getByLabel('发送范围', { exact: true }).selectOption('all');
  await composeZh.getByLabel('通知标题', { exact: true }).fill('今晚维护通知');
  await composeZh.getByLabel('通知正文（纯文本）', { exact: true }).fill('维护时间为今晚22点至22点30分，结束后恢复服务。');
  await composeZh.getByRole('button', { name: '预览收件人', exact: true }).click();
  await page.getByRole('button', { name: '发送通知', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '发送通知', exact: true }).click();
  await expect(page.getByLabel('通知标题', { exact: true })).toBeEnabled();
  await expect(page.getByLabel('通知标题', { exact: true })).toHaveValue('今晚维护通知');
  await expect(page.getByRole('button', { name: '新建通知', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '预览收件人', exact: true }).click();
  await expect(page.locator('[data-ui="notice-preview"]')).toContainText('今晚维护通知');
  expect(previewIds).toHaveLength(2);
  expect(previewIds[1]).not.toBe(previewIds[0]);
  expect(sendCount).toBe(1);
  await expect(page.getByRole('button', { name: '发送通知', exact: true })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('notices-preview-zh.png'), fullPage: true });
});

test('storage failure retains the latest text and blocks writes', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('locale', 'en'));
  await installAdminMocks(page);
  let writes = 0;
  await page.route('**/api/admin/customer-notifications**', async (route) => {
    if (route.request().method() === 'POST') writes += 1;
    return route.fulfill({ json: buildAdminApiEnvelope({ items: [], total_count: 0, limit: 20, offset: 0 }) });
  });
  await page.goto(path);
  await page.getByRole('button', { name: 'New notice', exact: true }).click();
  await expect(page.getByLabel('Title', { exact: true })).toBeEnabled();
  await page.evaluate(() => {
    Storage.prototype.setItem = () => { throw new DOMException('Simulated unavailable storage', 'QuotaExceededError'); };
  });
  await page.getByLabel('Title', { exact: true }).fill('Preserve this unsaved message');
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Preserve this unsaved message');
  await expect(page.getByText(/The local draft could not be read or retained/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Preview recipients', exact: true })).toBeDisabled();
  expect(writes).toBe(0);
});

test('retry after rolled-back send keeps the batch and renews the consumed request key', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('locale', 'en'));
  await installAdminMocks(page);
  let detail: Record<string, unknown> | null = null;
  const keys = new Set<string>(), sentIds: string[] = [];
  let sends = 0;
  await page.route('**/api/admin/customer-notifications**', async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'GET') return route.fulfill({ json: buildAdminApiEnvelope(
      url.pathname === '/api/admin/customer-notifications'
        ? { items: detail ? [{ ...detail, recipients: undefined }] : [], total_count: detail ? 1 : 0, limit: 20, offset: 0 }
        : detail,
    ) });
    const key = route.request().headers()['idempotency-key'];
    expect(key).toBeTruthy();
    if (keys.has(key)) return route.fulfill({ status: 409, json: {
      status: 'error', error_code: 'auth.replay_blocked', message: 'request replay marker consumed', data: {}, meta: {},
    } });
    keys.add(key);
    if (!url.pathname.endsWith('/send')) {
      detail = {
        ...route.request().postDataJSON(), status: 'preview', actor_kind: 'platform_admin', actor_ref: 'platform:operator-e2e',
        created_at: '2026-11-03T05:00:00Z', sent_at: null, target_count: 1, ready_count: 1,
        sent_count: 0, skipped_count: 0, read_count: 0, failed_count: 0,
        recipients: [{ account_id: 'acct_one', account_name: 'Customer', principal_id: 'owner_one',
          email: 'one@example.test', status: 'ready', reason: '', is_read: false }],
      };
    } else {
      sends += 1;
      sentIds.push(url.pathname.split('/').at(-2)!);
      if (sends === 1) return route.fulfill({ status: 500, json: {
        status: 'error', error_code: 'service.storage_failed', message: 'transaction rolled back', data: {}, meta: {},
      } });
      detail = { ...detail, status: 'sent', sent_at: '2026-11-03T05:10:00Z', ready_count: 0, sent_count: 1,
        recipients: [{ ...(detail!.recipients as Record<string, unknown>[])[0], status: 'sent', notification_id: 'pnotif_retry' }],
      };
    }
    return route.fulfill({ json: buildAdminApiEnvelope(detail) });
  });
  await page.goto(path);
  await page.getByRole('button', { name: 'New notice', exact: true }).click();
  const composeRetry = page.locator('[data-ui="notice-compose-modal"]');
  await composeRetry.getByLabel('Recipients', { exact: true }).selectOption('all');
  await composeRetry.getByLabel('Title', { exact: true }).fill('Retried notice');
  await composeRetry.getByLabel('Message (plain text)', { exact: true }).fill('No duplicate inbox deliveries.');
  await composeRetry.getByRole('button', { name: 'Preview recipients', exact: true }).click();
  const send = async () => {
    await page.getByRole('button', { name: 'Send notice', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Send notice', exact: true }).click();
  };
  await send();
  await expect(page.getByRole('status')).toContainText('The result is unconfirmed');
  await page.getByRole('button', { name: 'Read batch result', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Send notice', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'New notice', exact: true })).toBeDisabled();
  await send();
  await expect(page.getByRole('heading', { name: 'Delivery result', exact: true })).toBeVisible();
  expect(sends).toBe(2);
  expect(new Set(sentIds).size).toBe(1);
  expect(keys.size).toBe(3);
});

test('an unreadable draft permits history inspection without clearing unknown intent', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'en');
    sessionStorage.setItem('admin.customer-notice.v1:platform:operator-e2e:', '{unreadable');
  });
  await installAdminMocks(page);
  let writes = 0;
  const detail = {
    dispatch_id: `notice_${'a'.repeat(32)}`, title: 'Previously sent notice', body: 'Inspect before recreating.',
    link_href: '', audience: 'all', status: 'sent', actor_kind: 'platform_admin', actor_ref: 'platform:operator-e2e',
    created_at: '2026-11-03T05:00:00Z', sent_at: '2026-11-03T05:10:00Z', target_count: 1, ready_count: 0,
    sent_count: 1, skipped_count: 0, read_count: 0, failed_count: 0,
    recipients: [{ account_id: 'acct_one', account_name: 'Customer', principal_id: 'owner_one',
      email: 'one@example.test', status: 'sent', reason: '', is_read: false, notification_id: 'pnotif_existing' }],
  };
  await page.route('**/api/admin/customer-notifications**', async (route) => {
    if (route.request().method() === 'POST') writes += 1;
    return route.fulfill({ json: buildAdminApiEnvelope(
      new URL(route.request().url()).pathname === '/api/admin/customer-notifications'
        ? { items: [{ ...detail, recipients: undefined }], total_count: 1, limit: 20, offset: 0 }
        : detail,
    ) });
  });
  await page.goto(path);
  await expect(page.getByText(/The local draft could not be read or retained/)).toBeVisible();
  await page.locator('[data-ui="notice-history-panel"]').getByRole('button', { name: /Previously sent notice/ }).click();
  await expect(page.getByRole('heading', { name: 'Delivery result', exact: true })).toBeVisible();
  await expect(page.locator('[data-ui="notice-preview"]')).toContainText('Inspect before recreating.');
  await expect(page.getByRole('button', { name: 'Send notice', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('admin.customer-notice.v1:platform:operator-e2e:'))).toBe('{unreadable');
  expect(writes).toBe(0);
});

test('Chinese notice detail stays readable with long identities, selection and server paging', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.addInitScript(() => localStorage.setItem('locale', 'zh'));
  await installAdminMocks(page);
  const evidence = observeAdminBrowserEvidence(page);
  let paged = false;
  let writes = 0;
  const accountId = `acct_${'a'.repeat(32)}`;
  const notice = {
    dispatch_id: `notice_${'c'.repeat(32)}`, title: '服务维护通知',
    body: '您好，服务将于今晚 22:00 至 22:30 进行维护。维护结束后恢复使用。\n如有疑问，请通过门户工单联系我们。',
    link_href: '/portal/account', audience: 'all', status: 'sent', actor_kind: 'platform_admin',
    actor_ref: 'platform:operator-e2e', created_at: '2026-11-03T07:00:00Z', sent_at: '2026-11-03T07:01:00Z',
    target_count: 2, ready_count: 0, sent_count: 1, skipped_count: 1, read_count: 1, failed_count: 0,
    recipients: [
      { account_id: accountId, account_name: accountId, principal_id: 'owner_one',
        email: 'long-recipient-address-for-layout@example.test', status: 'sent', reason: '',
        is_read: true, notification_id: 'pnotif_layout' },
      { account_id: 'acct_long_customer', account_name: '用于验证较窄桌面窗口中长客户名称完整显示的示例客户',
        principal_id: '', email: '', status: 'skipped', reason: 'owner_ambiguous', is_read: false },
    ],
  };
  const offsets: number[] = [];
  await page.route('**/api/admin/customer-notifications**', async (route) => {
    if (route.request().method() !== 'GET') writes += 1;
    const url = new URL(route.request().url());
    if (url.pathname !== '/api/admin/customer-notifications') {
      return route.fulfill({ json: buildAdminApiEnvelope({ ...notice, dispatch_id: url.pathname.split('/').at(-1) }) });
    }
    const offset = Number(url.searchParams.get('offset') || 0);
    offsets.push(offset);
    const all = Array.from({ length: paged ? 21 : 1 }, (_, index) => ({
      ...notice, recipients: undefined,
      dispatch_id: index === 0 ? notice.dispatch_id : `notice_${String(index).padStart(32, '0')}`,
      title: index === 0 ? notice.title : `历史通知 ${index + 1}`,
    }));
    return route.fulfill({ json: buildAdminApiEnvelope({ items: all.slice(offset, offset + 20), total_count: all.length, limit: 20, offset }) });
  });
  await page.goto(path);
  const history = page.locator('[data-ui="notice-history-panel"]');
  const detail = page.locator('[data-ui="notice-detail-panel"]');
  const row = history.getByRole('button', { name: /服务维护通知/ });
  await row.click();
  await expect(row).toHaveAttribute('aria-pressed', 'true');
  await expect(detail.getByRole('heading', { name: '服务维护通知' })).toBeVisible();
  await expect(detail.locator('[data-ui="notice-result-metrics"]')).not.toContainText('可发送');
  await expect(detail.locator('[data-ui="notice-sender"]')).toHaveText('发送人: 平台管理员');
  await expect(detail.getByRole('cell', { name: '未命名客户 1', exact: true })).toBeVisible();
  await expect(detail.getByRole('cell', { name: 'long-recipient-address-for-layout@example.test', exact: true })).toBeVisible();
  await expect(detail.getByText(accountId, { exact: true })).toBeHidden();
  await expect(detail.getByText(notice.actor_ref, { exact: true })).toBeHidden();
  await expect(detail.getByText('没有唯一有效负责人', { exact: true })).toBeVisible();
  await expect(history.getByRole('button', { name: '上一页', exact: true })).toHaveCount(0);
  await expect(history.getByRole('button', { name: '下一页', exact: true })).toHaveCount(0);
  await expect(detail.locator('details')).not.toHaveAttribute('open', '');
  await page.screenshot({ path: testInfo.outputPath('notices-layout-zh-1440.png'), fullPage: true });
  const boxes = await page.evaluate(() => {
    const history = document.querySelector('[data-ui="notice-history-panel"]')!.getBoundingClientRect();
    const detail = document.querySelector('[data-ui="notice-detail-panel"]')!.getBoundingClientRect();
    return { history: { x: history.x, y: history.y, width: history.width }, detail: { x: detail.x, y: detail.y, width: detail.width } };
  });
  expect(boxes.detail.width).toBeGreaterThan(boxes.history.width);
  expect(Math.abs(boxes.detail.y - boxes.history.y)).toBeLessThan(2);
  await detail.getByText('操作详情', { exact: true }).click();
  await expect(detail.getByText('创建时间', { exact: true })).toBeVisible();
  await expect(detail.getByText('发送时间', { exact: true })).toBeVisible();
  await expect(detail.getByText('通知编号', { exact: true })).toBeVisible();
  await expect(detail.getByText(notice.dispatch_id, { exact: true })).toBeVisible();
  await expect(detail.getByText('发送人标识', { exact: true })).toBeVisible();
  await expect(detail.getByText(notice.actor_ref, { exact: true })).toBeVisible();
  await expect(detail.getByText(accountId, { exact: true })).toBeVisible();
  await expect(detail.getByText('acct_long_customer', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('notices-identity-details.png'), fullPage: true });
  await detail.getByText('操作详情', { exact: true }).click();
  for (const width of [1280, 1056]) {
    await page.setViewportSize({ width, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`notices-layout-zh-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.screenshot({ path: testInfo.outputPath('notices-layout-zh-dark.png'), fullPage: true });
  await page.evaluate(() => document.documentElement.classList.remove('dark'));
  paged = true;
  await page.reload();
  await expect(history.getByRole('button', { name: '下一页', exact: true })).toBeEnabled();
  await history.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(history.getByText('历史通知 21', { exact: true })).toBeVisible();
  await expect(history.getByRole('button', { name: '下一页', exact: true })).toBeDisabled();
  await history.getByRole('button', { name: '上一页', exact: true }).click();
  await expect(history.getByRole('button', { name: /服务维护通知/ })).toBeVisible();
  expect(offsets).toContain(20);
  notice.actor_kind = 'unknown_identity';
  await page.reload();
  await history.getByRole('button', { name: /服务维护通知/ }).click();
  await expect(detail.locator('[data-ui="notice-sender"]')).toHaveText('发送人: 身份类型待确认');
  await detail.getByText('操作详情', { exact: true }).click();
  await expect(detail.getByText('unknown_identity', { exact: true })).toBeVisible();
  expect(writes).toBe(0);
  expect(evidence.consoleErrors).toEqual([]);
});

test('selected customer labels survive searches and draft reload without trusting mismatched identities', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('locale', 'en'));
  await page.setViewportSize({ width: 1440, height: 1050 });
  await installAdminMocks(page);
  let mismatch = false;
  await page.route('**/api/admin/accounts/acct_readable', route => route.fulfill({
    json: buildAdminApiEnvelope({ account: { account_id: mismatch ? 'acct_other' : 'acct_readable', name: mismatch ? 'Wrong customer' : 'Editorial team', metadata: {} }, primary_identity: { email: 'editor@example.test' } }),
  }));
  await page.route('**/api/admin/accounts?*', route => route.fulfill({
    json: buildAdminApiEnvelope({ items: [{ account: { account_id: 'acct_other', name: 'Another customer' } }] }),
  }));
  await page.goto(`${path}?account=acct_readable`);
  const remove = page.getByRole('button', { name: 'Remove Editorial team · acct_readable', exact: true });
  await expect(remove).toBeVisible();
  await page.getByLabel('Find customers by name or email').fill('Another');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('Another customer · acct_other', { exact: true })).toBeVisible();
  await expect(remove).toBeVisible();
  await page.getByLabel('Title', { exact: true }).fill('Retained draft');
  await page.reload();
  await expect(remove).toBeVisible();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Retained draft');
  await page.screenshot({ path: testInfo.outputPath('selected-customer-readable-1440.png'), fullPage: true });
  mismatch = true;
  await page.reload();
  await expect(page.getByRole('button', { name: 'Remove Customer name unverified · acct_readable', exact: true })).toBeVisible();
  await expect(page.getByText('Wrong customer', { exact: true })).toHaveCount(0);
});
