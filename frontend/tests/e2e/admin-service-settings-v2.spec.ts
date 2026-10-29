import { test } from './helpers/critical-network-fixture';
import { expect, type Page } from '@playwright/test';
import {
  buildAdminApiEnvelope,
  buildAdminApiErrorEnvelope,
  installAdminMocks,
} from './helpers/admin-operator-fixture';
import {
  observeAdminBrowserEvidence,
  writeAdminVisualReceipt,
} from './helpers/admin-visual-receipt';

const BASE_URL =
  process.env.NPCINK_CLOUD_FRONTEND_BASE_URL ||
  `http://127.0.0.1:${process.env.NPCINK_CLOUD_FRONTEND_PORT || '3301'}`;

function setting(
  settingId: string,
  status: 'ready' | 'disabled' | 'missing_config' | 'error',
  config: Record<string, unknown>,
  secrets: Record<string, { configured: boolean; display: string }> = {}
) {
  return {
    setting_id: settingId,
    enabled: status !== 'disabled',
    configured: status === 'ready',
    status,
    config,
    secrets,
    last_tested_at: status === 'ready' ? '2026-07-12T06:00:00Z' : '',
    last_error_code: '',
    last_error_message: '',
  };
}

async function installSettingsRecoveryHarness(page: Page) {
  await installAdminMocks(page);
  const state = {
    failReads: false, reads: 0, writes: 0, tests: 0,
    releaseSave: undefined as (() => void) | undefined,
    delaySave: false,
    settings: {
      portal_public: setting('portal_public', 'ready', { public_base_url: 'https://saved.example.test' }),
      qq_login: setting('portal_qq_login', 'disabled', { client_id: '' }),
      portal_email: setting('portal_email', 'ready', {
        smtp_host: 'smtp.example.test', smtp_port: 465, smtp_username: '',
        smtp_use_ssl: true, smtp_use_starttls: false, smtp_timeout_seconds: 20,
        from_email: 'mail@example.test', from_name: 'Saved sender', reply_to: '',
      }),
      alipay_payment: setting('payment_alipay', 'disabled', {}),
      site_relink_policy: setting('site_relink_policy', 'ready', { cooldown_days: 90 }),
      platform_preferences: setting('platform_preferences', 'ready', { timezone: 'Asia/Shanghai' }),
    },
  };
  await page.route('**/api/admin/service-settings**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'GET') {
      state.reads += 1;
      await route.fulfill({ status: state.failReads ? 503 : 200, json: state.failReads
        ? buildAdminApiErrorEnvelope('read unavailable') : buildAdminApiEnvelope({ settings: state.settings }) });
    } else if (route.request().method() === 'PATCH') {
      state.writes += 1;
      const payload = route.request().postDataJSON();
      if (state.delaySave) await new Promise<void>((resolve) => { state.releaseSave = resolve; });
      if (path.endsWith('/portal-public')) state.settings.portal_public.config = { public_base_url: payload.public_base_url };
      await route.fulfill({ json: buildAdminApiEnvelope(state.settings.portal_public) });
    } else if (path.endsWith('/email/preview')) {
      const payload = route.request().postDataJSON();
      await route.fulfill({ json: buildAdminApiEnvelope({
        preview_type: payload.preview_type, subject: `${payload.locale}: ${payload.from_name}`,
        html: '<p>Preview only</p>', text: 'Preview only', from_name: payload.from_name,
        from_email: payload.from_email, recommended_from_name: 'Npcink AI Cloud',
      }) });
    } else {
      state.tests += 1;
      await route.fulfill({ json: buildAdminApiEnvelope(state.settings.portal_email) });
    }
  });
  return state;
}

test('service writes lock the submitted draft and category until the readback completes', async ({ page }) => {
  const state = await installSettingsRecoveryHarness(page);
  state.delaySave = true;
  await page.goto('/admin/service-settings');
  const base = page.getByRole('textbox', { name: /^Base URL$|^基础 URL$/i });
  await base.fill('https://submitted.example.test');
  await page.getByRole('button', { name: /Save base URL|保存基础地址/i }).click();
  await expect.poll(() => state.writes).toBe(1);
  try {
    await expect(base).toBeDisabled();
    await expect(page.getByRole('tab', { name: /Email|邮件配置/i })).toBeDisabled();
  } finally { state.releaseSave?.(); }
  await expect(base).toHaveValue('https://submitted.example.test');
  await expect(base).toBeEnabled();
});

for (const theme of ['light', 'dark'] as const) {
test(`saved settings with failed readback freeze stale state and retry only the read in ${theme}`, async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript((value) => localStorage.setItem('theme', value), theme);
  const state = await installSettingsRecoveryHarness(page);
  await page.goto('/admin/service-settings');
  const base = page.getByRole('textbox', { name: /^Base URL$|^基础 URL$/i });
  await base.fill('https://submitted.example.test');
  state.failReads = true;
  await page.getByRole('button', { name: /Save base URL|保存基础地址/i }).click();
  await expect(page.getByRole('status').filter({ hasText: /saved.*latest|已保存.*最新/i })).toBeVisible();
  await expect(page.locator('main')).not.toContainText(/This configuration action failed|本次配置操作失败/);
  await expect(base).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath(`saved-read-failure-${theme}.png`), fullPage: true, animations: 'disabled' });
  state.failReads = false;
  await page.getByRole('button', { name: /^Retry$|^重试$/i }).click();
  await expect(base).toBeEnabled();
  await expect(base).toHaveValue('https://submitted.example.test');
  expect(state.writes).toBe(1);
});
}

test('email preview reopens with current sender and current locale', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('locale', 'en'));
  await installSettingsRecoveryHarness(page);
  await page.goto('/admin/service-settings?tab=email');
  await page.getByRole('button', { name: /Preview email template|预览邮件模板/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('en: Saved sender');
  await dialog.getByRole('button', { name: /Close preview|关闭预览/i }).click();
  await page.getByRole('button', { name: /Edit SMTP|编辑 SMTP/i }).click();
  await page.getByRole('textbox', { name: /Sender name|发件人名称/i }).fill('Draft sender');
  await page.getByRole('button', { name: /Preview email template|预览邮件模板/i }).click();
  await expect(dialog).toContainText('en: Draft sender');
});

test('email preview failure stays inside its dialog and can recover without changing settings', async ({ page }) => {
  const state = await installSettingsRecoveryHarness(page);
  let fail = true;
  await page.route('**/api/admin/service-settings/email/preview', async (route) => {
    if (!fail) { await route.fallback(); return; }
    await route.fulfill({ status: 503, json: buildAdminApiErrorEnvelope('preview unavailable') });
  });
  await page.goto('/admin/service-settings?tab=email');
  await page.getByRole('button', { name: /Preview email template|预览邮件模板/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
  fail = false;
  await dialog.getByRole('button', { name: /Generate preview|生成预览/i }).click();
  await expect(dialog).toContainText('Saved sender');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  expect(state.writes).toBe(0);
});

test('all eight setting groups keep URL, keyboard, history and PC panel context', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installSettingsRecoveryHarness(page);
  await page.goto('/admin/service-settings?tab=portal');
  const tabs = page.getByRole('tab');
  const ids = ['portal', 'qq', 'email', 'payment', 'accounting', 'provider-budget', 'site-relink', 'system'];
  for (let index = 0; index < ids.length; index += 1) {
    await tabs.nth(index).click();
    await expect(page).toHaveURL(new RegExp(`tab=${ids[index]}$`));
    if (ids[index] === 'email') await page.getByRole('button', { name: /Edit SMTP|编辑 SMTP/i }).click();
    await expect(page.locator('form:visible')).toHaveCount(1);
    await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', `service-settings-tab-${ids[index]}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await tabs.last().focus();
  await page.keyboard.press('Home');
  await expect(tabs.first()).toBeFocused();
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/tab=qq$/);
  await page.goBack();
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  await tabs.nth(2).click();
  await page.setViewportSize({ width: 900, height: 1050 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('service-settings-email-900.png'), fullPage: true, animations: 'disabled' });
});

test('malformed setting fields fail closed and recover without rendering writable defaults', async ({ page }) => {
  const state = await installSettingsRecoveryHarness(page);
  let malformed = true;
  await page.route('**/api/admin/service-settings', async (route) => {
    await route.fulfill({ json: buildAdminApiEnvelope(malformed
      ? { settings: { ...state.settings, portal_email: { ...state.settings.portal_email, secrets: null } } }
      : { settings: state.settings }) });
  });
  await page.goto('/admin/service-settings');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('form')).toHaveCount(0);
  malformed = false;
  await page.getByRole('button', { name: /^Retry$|^重试$/i }).click();
  await expect(page.getByRole('textbox', { name: /^Base URL$|^基础 URL$/i })).toHaveValue('https://saved.example.test');
  expect(state.writes).toBe(0);
});

test('upstream outage gives retry guidance without claiming a migration failure', async ({ page }) => {
  await installSettingsRecoveryHarness(page);
  await page.route('**/api/admin/service-settings', async (route) => {
    await route.fulfill({ status: 502, json: buildAdminApiErrorEnvelope('upstream unavailable', 'proxy.admin_session_unreachable') });
  });
  await page.goto('/admin/service-settings');
  await expect(page.locator('main').getByRole('alert')).toContainText(/upstream|上游/);
  await expect(page.locator('main').getByRole('alert')).not.toContainText(/migration|数据库迁移/i);
});

test('a failed email test reloads persisted verification state and keeps retry contextual', async ({ page }) => {
  const state = await installSettingsRecoveryHarness(page);
  await page.route('**/api/admin/service-settings/email/test', async (route) => {
    state.settings.portal_email.status = 'error';
    await route.fulfill({ status: 502, json: buildAdminApiErrorEnvelope('test failed', 'service_settings.email_delivery_failed') });
  });
  await page.goto('/admin/service-settings?tab=email');
  await page.getByRole('textbox', { name: /Test recipient|测试收件人/i }).fill('operator@example.test');
  await page.getByRole('button', { name: /Send test email|发送测试邮件/i }).click();
  await expect.poll(() => state.reads).toBe(2);
  await expect(page.getByRole('tab', { name: /Email|邮件配置/i })).toContainText(/Error|异常/i);
  await expect(page.getByRole('alert').first()).toContainText(/failed|失败/i);
});

test('a saved timezone outside the common choices remains visible and unchanged', async ({ page }) => {
  const state = await installSettingsRecoveryHarness(page);
  state.settings.platform_preferences.config.timezone = 'Australia/Sydney';
  await page.goto('/admin/service-settings?tab=system');
  await expect(page.getByRole('combobox')).toHaveValue('Australia/Sydney');
  await expect(page.getByRole('combobox').locator('option:checked')).toHaveText('Australia/Sydney');
});

test('changing the display language preserves the active draft without reloading configuration', async ({ page }) => {
  const state = await installSettingsRecoveryHarness(page);
  await page.goto('/admin/service-settings');
  const base = page.getByRole('textbox', { name: /^Base URL$|^基础 URL$/i });
  await base.fill('https://draft.example.test');
  await page.getByRole('button', { name: /^Language$|^语言$/i }).click();
  await page.getByRole('option', { name: /English/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Service Settings');
  await expect(base).toHaveValue('https://draft.example.test');
  expect(state.reads).toBe(1);
});

async function hideNextDevelopmentPortal(page: Page) {
  await page.locator('nextjs-portal').evaluateAll((portals) => {
    portals.forEach((portal) => {
      (portal as HTMLElement).style.display = 'none';
    });
  });
}

test('service settings v2 preserves dirty input, guards navigation, validates, saves, and keeps one active form', async ({ page }, testInfo) => {
  const browserEvidence = observeAdminBrowserEvidence(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let publicBaseUrl = 'https://cloud.example.test';
  let settingsReadCount = 0;
  let failNextPortalSave = false;
  let platformTimezone = 'Asia/Shanghai';
  let mediaRecognitionConfig = {
    window_start: '01:00',
    window_end: '06:00',
    daily_limit: 100,
  };

  await page.context().addCookies([
    { name: 'npcink_admin_session_token', value: 'e2e-admin-session', url: BASE_URL },
  ]);
  await page.route('**/admin/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiEnvelope({
        principal_id: 'platform:operator-e2e',
        identity_type: 'platform_admin',
      })),
    });
  });
  await page.route('**/api/admin/service-settings**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/admin/service-settings' && route.request().method() === 'GET') {
      settingsReadCount += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildAdminApiEnvelope({
          settings: {
            portal_public: setting('portal_public', 'ready', { public_base_url: publicBaseUrl }),
            qq_login: setting('portal_qq_login', 'disabled', { client_id: '', redirect_uri: '' }, {
              client_secret: { configured: false, display: '' },
            }),
            portal_email: setting('portal_email', 'ready', {
              smtp_host: 'smtp.example.test',
              smtp_port: 465,
              smtp_username: 'mail@example.test',
              smtp_use_ssl: true,
              smtp_use_starttls: false,
              smtp_timeout_seconds: 20,
              from_email: 'mail@example.test',
              from_name: 'Npcink AI Cloud',
              reply_to: '',
            }, { smtp_password: { configured: true, display: '••••••••' } }),
            alipay_payment: setting('payment_alipay', 'disabled', {
              app_id: '', notify_url: '', return_url: '',
            }, {
              private_key: { configured: false, display: '' },
              public_key: { configured: false, display: '' },
            }),
            accounting_fx: setting('commercial_accounting_fx', 'ready', {
              usd_cny_rate: '7.200000',
              effective_at: '2026-07-01T00:00:00Z',
              source: 'operator-approved test rate',
              note: '',
              rate_version: 'usd-cny-20260701T000000Z-7_200000',
              is_fallback: false,
            }),
            site_relink_policy: setting('site_relink_policy', 'ready', {
              cooldown_days: 90,
            }),
            platform_preferences: setting('platform_preferences', 'ready', {
              timezone: platformTimezone,
            }),
            media_recognition_policy: setting(
              'media_recognition_policy',
              'disabled',
              mediaRecognitionConfig
            ),
            provider_budget: {
              ...setting('provider_account_spend_budget', 'disabled', {
                warning_ratio: 0.8,
                conservative_unpriced_cost_usd: 0.05,
                require_provider_configuration: true,
                providers: [],
              }),
              setting_kind: 'runtime',
              runtime: {
                status: 'disabled',
                warning_ratio: 0.8,
                configured_provider_count: 0,
                missing_provider_ids: [],
                items: [],
                connections: [],
                generated_at: '2026-07-12T06:00:00Z',
                period_timezone: 'UTC',
              },
            },
          },
        })),
      });
      return;
    }
    if (url.pathname === '/api/admin/service-settings/portal-public' && route.request().method() === 'PATCH') {
      if (failNextPortalSave) {
        failNextPortalSave = false;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify(buildAdminApiErrorEnvelope('temporary service settings failure')),
        });
        return;
      }
      const payload = route.request().postDataJSON() as { public_base_url?: string };
      publicBaseUrl = String(payload.public_base_url || publicBaseUrl);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildAdminApiEnvelope(setting('portal_public', 'ready', { public_base_url: publicBaseUrl }))),
      });
      return;
    }
    if (url.pathname === '/api/admin/service-settings/platform-preferences' && route.request().method() === 'PATCH') {
      const payload = route.request().postDataJSON() as { timezone?: string };
      platformTimezone = String(payload.timezone || platformTimezone);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildAdminApiEnvelope(setting(
          'platform_preferences',
          'ready',
          { timezone: platformTimezone }
        ))),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildAdminApiEnvelope({})) });
  });

  await page.goto('/admin/service-settings');
  await expect(page.getByRole('heading', { name: /^Service Settings$|^服务设置$/i })).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(8);
  await expect(page.locator('form:visible')).toHaveCount(1);
  expect(settingsReadCount).toBe(1);
  const compactGeometry = await page.evaluate(() => {
    const workbench = document.querySelector<HTMLElement>('[data-ui="admin-settings-workbench"]');
    const directory = workbench?.querySelector<HTMLElement>('[role="tablist"]');
    const input = workbench?.querySelector<HTMLElement>('.input');
    const firstRow = workbench?.querySelector<HTMLElement>('[data-configuration-row]');
    return {
      workbenchDensity: workbench?.dataset.density,
      directoryWidth: Math.round(directory?.getBoundingClientRect().width || 0),
      inputHeight: Math.round(input?.getBoundingClientRect().height || 0),
      rowHeight: Math.round(firstRow?.getBoundingClientRect().height || 0),
    };
  });
  expect(compactGeometry).toEqual({
    workbenchDensity: 'compact',
    directoryWidth: 192,
    inputHeight: 32,
    rowHeight: 49,
  });
  await hideNextDevelopmentPortal(page);
  await expect(page).toHaveScreenshot('admin-service-settings-workbench-pc.png', {
    animations: 'disabled',
    fullPage: true,
  });

  const baseUrlInput = page.getByRole('textbox', { name: /Base URL|基础 URL/i });
  const saveBaseUrl = page.getByRole('button', { name: /Save base URL|保存基础地址/i });
  await baseUrlInput.fill('not-a-url');
  await expect(page.getByText(/valid HTTP or HTTPS|有效的 HTTP 或 HTTPS/i)).toBeVisible();
  await expect(saveBaseUrl).toBeDisabled();

  await baseUrlInput.fill('https://new.example.test');
  await expect(page.getByText(/Unsaved changes|存在未保存更改/i)).toBeVisible();
  const portalPanel = page.locator('#service-settings-portal');
  await expect(portalPanel.locator('[data-ui="service-settings-active-state"]')).toBeVisible();
  await expect(page.getByRole('tab', { name: /Portal URL.*Unsaved|门户地址.*未保存/i })).toBeVisible();
  await expect(saveBaseUrl).toBeEnabled();

  await page.getByRole('tab', { name: /QQ login|QQ 登录/i }).click();
  const discardDialog = page.getByRole('dialog');
  await expect(discardDialog).toContainText(/Discard unsaved changes|放弃未保存更改/i);
  await discardDialog.getByRole('button', { name: /^Cancel$|^取消$/i }).click();
  await expect(baseUrlInput).toHaveValue('https://new.example.test');
  await expect(page.getByRole('tab', { name: /Portal URL|门户地址/i })).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('link', { name: /^Customers$|^客户$/i }).click();
  const leaveDialog = page.getByRole('dialog');
  await expect(leaveDialog).toContainText(/Leave with unsaved changes|放弃更改并离开/i);
  await leaveDialog.getByRole('button', { name: /^Cancel$|^取消$/i }).click();
  await expect(page).toHaveURL(/\/admin\/service-settings$/);

  await page.getByRole('tab', { name: /QQ login|QQ 登录/i }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Discard and switch|放弃并切换/i }).click();
  await expect(page.getByRole('tab', { name: /QQ login|QQ 登录/i })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('form:visible')).toHaveCount(1);
  await page.getByRole('tab', { name: /Portal URL|门户地址/i }).click();
  await expect(baseUrlInput).toHaveValue('https://cloud.example.test');

  await baseUrlInput.fill('https://saved.example.test');
  failNextPortalSave = true;
  await saveBaseUrl.click();
  await expect(page.getByText(/configuration action failed|配置操作失败/i)).toBeVisible();
  await expect(baseUrlInput).toHaveValue('https://saved.example.test');
  await expect(saveBaseUrl).toBeEnabled();

  await saveBaseUrl.click();
  await expect(page.getByText(/Service setting updated|服务配置已更新/i)).toBeVisible();
  await expect(baseUrlInput).toHaveValue('https://saved.example.test');
  await expect(saveBaseUrl).toBeDisabled();
  expect(settingsReadCount).toBe(2);
  await page.getByRole('button', { name: 'Close notification' }).click();

  await page.getByRole('tab', { name: /QQ login|QQ 登录/i }).click();
  await page.getByRole('switch', { name: /Enable QQ quick login|启用 QQ 快捷登录/i }).click();
  await page.getByRole('textbox', { name: 'App ID' }).fill('qq-app-e2e');
  await expect(page.getByRole('button', { name: /Check QQ settings|检查 QQ 配置/i })).toBeDisabled();
  await expect(page.getByText(/Enter the QQ App Secret|请输入 QQ App Secret/i)).toBeVisible();
  await page.getByRole('button', { name: /Restore saved values|恢复已保存值/i }).click();

  await page.getByRole('tab', { name: /Payment settings|支付配置/i }).click();
  await expect(page.locator('#service-settings-payment [data-ui="service-settings-high-risk"]')).toContainText(/High-risk payment configuration|高风险支付配置/i);
  await page.getByRole('tab', { name: /QQ login|QQ 登录/i }).click();

  await page.getByRole('tab', { name: /System settings|系统设置/i }).click();
  const timezoneSelect = page.locator('[data-configuration-row="platform-timezone"] select');
  await expect(timezoneSelect).toHaveValue('Asia/Shanghai');
  await timezoneSelect.selectOption('UTC');
  const saveSystemSettings = page.getByRole('button', { name: /Save system settings|保存系统设置/i });
  await expect(saveSystemSettings).toBeEnabled();
  await saveSystemSettings.click();
  await expect(page.getByText(/Service setting updated|服务配置已更新/i)).toBeVisible();
  await expect(timezoneSelect).toHaveValue('UTC');
  await page.getByRole('button', { name: 'Close notification' }).click();

  await page.getByRole('tab', { name: /Email settings|邮件配置/i }).click();
  const previewButton = page.getByRole('button', { name: /Preview email templates|预览邮件模板/i });
  await previewButton.click();
  const previewDialog = page.getByRole('dialog', { name: /Preview email|预览邮件效果/i });
  await expect(previewDialog).toBeVisible();
  await expect(previewDialog).toHaveCSS('overflow-y', 'hidden');
  await expect(previewDialog.locator('[data-content-mode="contained"]')).toBeVisible();
  const previewScrollOwners = await previewDialog.evaluate((element) => [element, ...Array.from(element.querySelectorAll<HTMLElement>('*'))]
    .filter((candidate) => {
      const style = window.getComputedStyle(candidate);
      return /(auto|scroll)/.test(style.overflowY) && candidate.scrollHeight > candidate.clientHeight + 1;
    })
    .map((candidate) => candidate.dataset.ui || candidate.tagName.toLowerCase()));
  expect(previewScrollOwners.every((owner) => owner === 'email-preview-settings-scroll' || owner === 'email-preview-content-scroll')).toBe(true);
  expect(previewScrollOwners.length).toBeLessThanOrEqual(1);
  const emailPreviewScreenshotPath = testInfo.outputPath('admin-email-preview-contained-pc.png');
  await previewDialog.locator('.admin-workbench-dialog').screenshot({
    path: emailPreviewScreenshotPath,
    animations: 'disabled',
  });
  await testInfo.attach('admin-email-preview-contained-pc', {
    path: emailPreviewScreenshotPath,
    contentType: 'image/png',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobilePreviewScrollOwners = await previewDialog.evaluate((element) => [element, ...Array.from(element.querySelectorAll<HTMLElement>('*'))]
    .filter((candidate) => {
      const style = window.getComputedStyle(candidate);
      return /(auto|scroll)/.test(style.overflowY) && candidate.scrollHeight > candidate.clientHeight + 1;
    })
    .map((candidate) => candidate.dataset.ui || candidate.tagName.toLowerCase()));
  expect(mobilePreviewScrollOwners).toEqual(['email-preview-workspace-scroll']);
  const mobilePreviewLayout = await previewDialog.evaluate((dialogElement) => ({
    dialogWidth: dialogElement.clientWidth,
    scrollWidth: dialogElement.scrollWidth,
    offenders: [...dialogElement.querySelectorAll<HTMLElement>('*')]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          ui: element.dataset.ui || element.tagName,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      })
      .filter((item) => item.left < -1 || item.right > dialogElement.clientWidth + 1)
      .slice(0, 8),
  }));
  expect(mobilePreviewLayout).toEqual({ dialogWidth: 390, scrollWidth: 390, offenders: [] });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.keyboard.press('Escape');
  await expect(previewDialog).toHaveCount(0);
  await expect(previewButton).toBeFocused();

  mediaRecognitionConfig = {
    window_start: '01:00',
    window_end: '06:00',
    daily_limit: 100,
  };
  platformTimezone = 'Asia/Shanghai';
  await page.reload();
  await page.getByRole('tab', { name: /System settings|系统设置/i }).click();
  await expect(page).toHaveURL(/\/admin\/service-settings\?tab=system$/);
  await page.reload();
  await expect(page.getByRole('tab', { name: /System settings|系统设置/i })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-configuration-row="platform-timezone"]')).toContainText(/UTC/i);
  await expect(page.locator('[data-configuration-row="platform-timezone"] select')).toHaveValue('Asia/Shanghai');
  const systemSettingsScreenshotPath = testInfo.outputPath('admin-system-settings-pc.png');
  await page.locator('#service-settings-system').screenshot({
    path: systemSettingsScreenshotPath,
    animations: 'disabled',
  });
  await testInfo.attach('admin-system-settings-pc', {
    path: systemSettingsScreenshotPath,
    contentType: 'image/png',
  });

  await writeAdminVisualReceipt({
    page,
    testInfo,
    route: '/admin/service-settings',
    pageModel: 'configuration',
    testedStates: ['ready', 'invalid', 'dirty', 'save_error', 'saved', 'dialog', 'empty'],
    humanAcceptance: 'not_required',
    pageTitle: page.getByRole('heading', { name: /^Service Settings$|^服务设置$/i }),
    workingSurface: page.locator('[data-ui="admin-settings-workbench"]'),
    browserEvidence,
    expectedConsoleErrors: [/^Failed to load resource: the server responded with a status of 503 \(Service Unavailable\)$/],
    routeRuleResults: [
      { id: 'single-primary-action', status: 'pass', evidence: 'only one active form and its save action are visible' },
      { id: 'textual-status', status: 'pass', evidence: 'settings directory exposes Ready, Disabled, and dirty text states' },
      { id: 'action-object-proximity', status: 'pass', evidence: 'save and validation feedback remain in the active settings panel' },
      { id: 'distinct-interaction-states', status: 'pass', evidence: 'selected tab, dirty tab, enabled save, and disabled save states were exercised' },
      { id: 'dialog-focus-recovery', status: 'pass', evidence: 'email preview closes with Escape and restores focus to its trigger' },
      { id: 'context-stability', status: 'pass', evidence: 'failed save preserves the draft and guarded navigation preserves the active form' },
    ],
    interactionResults: [
      { id: 'validation-and-dirty-state', status: 'pass', evidence: 'invalid and dirty values produce distinct feedback and action state' },
      { id: 'save-failure-recovery', status: 'pass', evidence: 'failed save retains the draft before a successful retry' },
      { id: 'preview-dialog-keyboard-recovery', status: 'pass', evidence: 'Escape closes preview and restores focus' },
      { id: 'platform-timezone-ownership', status: 'pass', evidence: 'system settings owns the global timezone and explains that timestamps remain in UTC' },
    ],
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('form:visible')).toHaveCount(1);
  // Let responsive transitions settle before measuring the final mobile layout.
  await page.waitForTimeout(250);
  const mobileLayout = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    return {
      viewportWidth,
      scrollWidth: document.documentElement.scrollWidth,
      offenders: [...document.querySelectorAll<HTMLElement>('body *')]
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            text: String(element.textContent || '').trim().slice(0, 50),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
          };
        })
        .filter((item) => item.left < -1 || item.right > viewportWidth + 1)
        .slice(0, 8),
    };
  });
  expect(mobileLayout).toEqual({ viewportWidth: 390, scrollWidth: 390, offenders: [] });
});

test('service settings initial failure preserves the PC shell and bounded retry', async ({ page }) => {
  let attempts = 0;
  await page.context().addCookies([
    { name: 'npcink_admin_session_token', value: 'e2e-admin-session', url: BASE_URL },
  ]);
  await page.route('**/admin/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiEnvelope({
        principal_id: 'platform:operator-e2e',
        identity_type: 'platform_admin',
      })),
    });
  });
  await page.route('**/api/admin/service-settings', async (route) => {
    attempts += 1;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiErrorEnvelope('service settings unavailable')),
    });
  });

  await page.goto('/admin/service-settings');
  await expect(page.getByRole('heading', { name: /^Service Settings$|^服务设置$/i })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: /service settings unavailable|upstream|服务配置|上游/i })).toBeVisible();
  await page.getByRole('button', { name: /^Retry$|^重试$/i }).click();
  await expect.poll(() => attempts).toBe(2);
  await expect(page).toHaveURL(/\/admin\/service-settings$/);
});

test('payment configuration stays disabled until the operator saves a public base URL', async ({ page }) => {
  await page.context().addCookies([
    { name: 'npcink_admin_session_token', value: 'e2e-admin-session', url: BASE_URL },
  ]);
  await page.route('**/admin/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiEnvelope({
        principal_id: 'platform:operator-e2e',
        identity_type: 'platform_admin',
      })),
    });
  });
  await page.route('**/api/admin/service-settings', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiEnvelope({
        settings: {
          portal_public: setting('portal_public', 'disabled', { public_base_url: '' }),
          qq_login: setting('portal_qq_login', 'disabled', { client_id: '', redirect_uri: '' }),
          portal_email: setting('portal_email', 'disabled', {}),
          alipay_payment: setting('payment_alipay', 'disabled', {
            app_id: '', notify_url: '', return_url: '',
          }),
          accounting_fx: setting('commercial_accounting_fx', 'disabled', {}),
          site_relink_policy: setting('site_relink_policy', 'disabled', { cooldown_days: 90 }),
          platform_preferences: setting('platform_preferences', 'disabled', { timezone: 'Asia/Shanghai' }),
          media_recognition_policy: setting('media_recognition_policy', 'disabled', {}),
          provider_budget: {
            ...setting('provider_account_spend_budget', 'disabled', {
              warning_ratio: 0.8,
              conservative_unpriced_cost_usd: 0.05,
              require_provider_configuration: true,
              providers: [],
            }),
            setting_kind: 'runtime',
            runtime: {
              status: 'disabled',
              warning_ratio: 0.8,
              configured_provider_count: 0,
              missing_provider_ids: [],
              items: [],
              connections: [],
              generated_at: '2026-07-12T06:00:00Z',
              period_timezone: 'UTC',
            },
          },
        },
      })),
    });
  });

  await page.goto('/admin/service-settings');
  await page.getByRole('tab', { name: /Payment settings|支付配置/i }).click();
  await expect(page).toHaveURL(/\/admin\/service-settings\?tab=payment$/);
  await expect(page.locator('#service-settings-payment')).toContainText(
    /will not use the current browser address|不会使用当前浏览器地址/i
  );
  await page.getByRole('switch', { name: /Enable Alipay payment|启用支付宝支付/i }).click();
  await expect(page.getByRole('button', { name: /Save Alipay configuration|保存支付宝配置/i })).toBeDisabled();
  await expect(page.locator('#service-settings-payment input[readonly]').first()).toHaveValue('');
});


test('SMTP test hides untranslated upstream details behind localized guidance', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('locale', 'zh-CN'));
  await installAdminMocks(page);
  await page.route('**/api/admin/service-settings', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildAdminApiEnvelope({ settings: {
      portal_public: setting('portal_public', 'ready', { public_base_url: 'https://cloud.example.test' }),
      qq_login: setting('portal_qq_login', 'disabled', {}),
      alipay_payment: setting('payment_alipay', 'disabled', {}),
      site_relink_policy: setting('site_relink_policy', 'ready', { cooldown_days: 90 }),
      platform_preferences: setting('platform_preferences', 'ready', { timezone: 'Asia/Shanghai' }),
      portal_email: setting('portal_email', 'ready', {
        smtp_host: 'smtp.example.test', smtp_port: 465, smtp_username: 'mail@example.test',
        smtp_use_ssl: true, smtp_use_starttls: false, smtp_timeout_seconds: 20,
        from_email: 'mail@example.test', from_name: 'Npcink AI Cloud', reply_to: '',
      }, { smtp_password: { configured: true, display: '••••••••' } }),
    } })) });
  });
  await page.route('**/api/admin/service-settings/email/test', async (route) => {
    await route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify(
      buildAdminApiErrorEnvelope('SMTP upstream closed connection unexpectedly', 'service_settings.email_delivery_failed')
    ) });
  });
  await page.goto('/admin/service-settings?tab=email');
  await page.getByRole('textbox', { name: '测试收件人' }).fill('smoke@example.test');
  await page.getByRole('button', { name: '发送测试邮件', exact: true }).click();
  await expect(page.getByRole('alert').first()).toContainText(/测试邮件发送失败|测试邮件失败/);
  await expect(page.getByText('SMTP upstream closed connection unexpectedly', { exact: false })).toHaveCount(0);
});


test('Provider budget dropdown uses runtime IDs and retains unavailable saved entries', async ({ page }) => {
  await installAdminMocks(page);
  await page.route('**/api/admin/service-settings', async (route) => {
    const base = setting('provider_account_spend_budget', 'ready', {
      warning_ratio: 0.8, conservative_unpriced_cost_usd: 0.05, require_provider_configuration: true,
      providers: [{ provider_id: 'retired-provider', account_class: 'paid', daily_usd: 0.1, monthly_usd: 0.1 }],
    });
    await route.fulfill({ json: buildAdminApiEnvelope({settings: {
      portal_public: setting('portal_public', 'ready', {public_base_url: 'https://cloud.example.test'}),
      qq_login: setting('portal_qq_login', 'disabled', {}),
      portal_email: setting('portal_email', 'disabled', {}),
      alipay_payment: setting('payment_alipay', 'disabled', {}),
      accounting_fx: setting('commercial_accounting_fx', 'disabled', {}),
      site_relink_policy: setting('site_relink_policy', 'disabled', {cooldown_days: 90}),
      platform_preferences: setting('platform_preferences', 'ready', {timezone: 'Asia/Shanghai'}),
      media_recognition_policy: setting('media_recognition_policy', 'disabled', {}),
      provider_budget: {...base, runtime: {status: 'ok', warning_ratio: 0.8, configured_provider_count: 1,
        missing_provider_ids: [], items: [], period_timezone: 'UTC', generated_at: '', connections: [
          {provider_id: 'openai', connection_id: 'mqzj', display_name: 'Npcink Cloud', enabled: true},
          {provider_id: 'openai', connection_id: 'alias', display_name: 'Backup', enabled: true},
          {provider_id: 'deepseek', connection_id: 'deepseek', display_name: 'DeepSeek', enabled: true},
        ]}},
    }})});
  });
  await page.goto('/admin/service-settings?tab=provider-budget');
  await page.getByRole('tab', { name: /Provider.*budget|Provider.*预算/i }).click();
  await page.locator('[data-ui="provider-budget-provider-list"] > summary').click();
  const first = page.getByRole('combobox', {name: 'Provider ID 1', exact: true});
  await expect(first).toHaveValue('retired-provider');
  await expect(first.locator('option[value="retired-provider"]')).toContainText(/unavailable|不可用/);
  await first.selectOption('openai');
  await expect(first).toHaveValue('openai');
  await expect(first.locator('option[value="openai"]')).toHaveCount(1);
  await expect(first.locator('option[value="openai"]')).toContainText('Npcink Cloud / Backup (openai)');
  await page.getByRole('button', {name: /Add Provider|添加 Provider/i}).click();
  const second = page.getByRole('combobox', {name: 'Provider ID 2', exact: true});
  await expect(second.locator('option[value="openai"]')).toHaveJSProperty('disabled', true);
  await second.selectOption('deepseek');
  await expect(second).toHaveValue('deepseek');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
