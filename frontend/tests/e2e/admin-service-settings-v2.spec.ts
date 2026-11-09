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
      portal_registration: setting('portal_registration', 'ready', { public_registration_enabled: true, email_allowlist: [] as string[] }),
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
      if (path.endsWith('/portal-registration')) {
        state.settings.portal_registration.config = payload;
        await route.fulfill({ json: buildAdminApiEnvelope(state.settings.portal_registration) });
        return;
      }
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

test('registration access saves a restricted policy and protects unsaved changes', async ({ page }, testInfo) => {
  const state = await installSettingsRecoveryHarness(page);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto('/admin/service-settings?tab=registration');
  const toggle = page.getByRole('switch', { name: /Open public registration|开放公开注册/ });
  const emails = page.getByRole('textbox', { name: /Registration email allowlist|注册邮箱白名单/ });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  expect((await emails.boundingBox())?.height).toBeGreaterThanOrEqual(144);
  await toggle.click();
  await emails.fill('invalid-email');
  await expect(page.getByRole('tabpanel').getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: /Save registration policy|保存注册策略/ }).click();
  await expect(page.getByRole('tabpanel').getByRole('alert')).toBeVisible();
  expect(state.writes).toBe(0);
  await emails.fill('tester@example.com\nsecond@example.com');
  await page.getByRole('tab', { name: /QQ/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: /Cancel|取消/ }).click();
  await expect(emails).toHaveValue('tester@example.com\nsecond@example.com');
  await page.getByRole('button', { name: /Save registration policy|保存注册策略/ }).click();
  await expect.poll(() => state.writes).toBe(1);
  await expect(toggle).toBeEnabled();
  expect(state.settings.portal_registration.config).toEqual({
    public_registration_enabled: false, email_allowlist: ['tester@example.com', 'second@example.com'],
  });
  await expect(page.getByRole('tab', { name: /Registration access|注册准入/ })).toContainText(/allowlist|白名单/);
  await page.screenshot({ path: testInfo.outputPath('registration-access-1440.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: /Save registration policy|保存注册策略/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('registration-access-1280.png'), fullPage: true });
});

test('registration access keeps saved policy awaiting confirmation after a failed readback', async ({ page }) => {
  const state = await installSettingsRecoveryHarness(page);
  await page.goto('/admin/service-settings?tab=registration');
  const toggle = page.getByRole('switch', { name: /Open public registration|开放公开注册/ });
  await toggle.click();
  state.failReads = true;
  await page.getByRole('button', { name: /Save registration policy|保存注册策略/ }).click();
  await expect(page.getByRole('status').filter({ hasText: /saved.*latest|已保存.*最新/i })).toBeVisible();
  await expect(toggle).toBeDisabled();
  state.failReads = false;
  await page.getByRole('button', { name: /^Retry$|^重试$/i }).click();
  await expect(toggle).toBeEnabled();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect(state.writes).toBe(1);
});

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
  await expect(page.getByRole('tab').first()).toContainText(/Awaiting confirmation|待确认/);
  await expect(page.getByRole('tab').first()).not.toContainText(/Unsaved|未保存/);
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

test('all nine setting groups keep URL, keyboard, history and PC panel context', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installSettingsRecoveryHarness(page);
  await page.goto('/admin/service-settings?tab=portal');
  const tabs = page.getByRole('tab');
  const ids = ['portal', 'registration', 'qq', 'email', 'payment', 'accounting', 'provider-budget', 'site-relink', 'system'];
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
  await expect(page).toHaveURL(/tab=registration$/);
  await page.goBack();
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  await tabs.nth(3).click();
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
  await expect(page.locator('main').getByRole('alert')).toBeVisible();
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
  await expect(page.getByRole('tab')).toHaveCount(9);
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
  await expect(page.getByText(/valid HTTP or HTTPS|有效的 HTTP 或 HTTPS/i)).toHaveCount(0);
  await saveBaseUrl.click();
  await expect(page.getByText(/valid HTTP or HTTPS|有效的 HTTP 或 HTTPS/i)).toBeVisible();
  await expect(saveBaseUrl).toBeEnabled();

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
  await expect(page.locator('[data-ui="service-settings-write-recovered"]')).toBeVisible();
  expect(settingsReadCount).toBe(2);
  await expect(baseUrlInput).toHaveValue('https://saved.example.test');
  await expect(saveBaseUrl).toBeEnabled();

  await saveBaseUrl.click();
  await expect(page.getByText(/Service setting updated|服务配置已更新/i)).toBeVisible();
  await expect(baseUrlInput).toHaveValue('https://saved.example.test');
  await expect(saveBaseUrl).toBeDisabled();
  expect(settingsReadCount).toBe(3);
  await page.getByRole('button', { name: 'Close notification' }).click();

  await page.getByRole('tab', { name: /QQ login|QQ 登录/i }).click();
  await page.getByRole('switch', { name: /Enable QQ quick login|启用 QQ 快捷登录/i }).click();
  await page.getByRole('textbox', { name: 'App ID' }).fill('qq-app-e2e');
  await expect(page.getByRole('button', { name: /Check QQ settings|检查 QQ 配置/i })).toBeDisabled();
  await expect(page.getByText(/Enter the QQ App Secret|请输入 QQ App Secret/i)).toHaveCount(0);
  await page.locator('#service-settings-qq button[type=submit]').click();
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
  await page.getByRole('button', { name: /Save Alipay configuration|保存支付宝配置/i }).click();
  await expect(page.getByRole('tabpanel').getByRole('alert')).toBeVisible();
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
  await page.getByRole('tab', { name: /AI budget|AI 估算预算/i }).click();
  const first = page.getByRole('combobox', {name: /^(Supplier|服务商) 1$/, exact: true});
  await expect(first).toHaveValue('retired-provider');
  await expect(first.locator('option[value="retired-provider"]')).toContainText(/unavailable|不可用/);
  await first.selectOption('openai');
  await expect(first).toHaveValue('openai');
  await expect(first.locator('option[value="openai"]')).toHaveCount(1);
  await expect(first.locator('option[value="openai"]')).toContainText('Npcink Cloud / Backup (openai)');
  await page.getByRole('button', {name: /Add supplier|添加服务商/i}).click();
  let addDialog = page.getByRole('dialog', { name: /Add supplier budget|添加服务商预算/i });
  await expect(addDialog).toBeVisible();
  await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
  await addDialog.getByRole('button', { name: /Cancel|取消/i, exact: true }).click();
  await expect(addDialog).toHaveCount(0);
  await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', {name: /Add supplier|添加服务商/i}).click();
  addDialog = page.getByRole('dialog', { name: /Add supplier budget|添加服务商预算/i });
  await expect(addDialog).toBeVisible();
  await addDialog.getByRole('button', { name: /Add supplier|添加服务商/i, exact: true }).click();
  await expect(addDialog.getByRole('alert')).toContainText(/Select a supplier|请先选择服务商/);
  await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
  await addDialog.getByRole('combobox', {name: /^(Supplier|服务商)$/i}).selectOption('deepseek');
  await addDialog.getByRole('button', { name: /Add supplier|添加服务商/i, exact: true }).click();
  const second = page.getByRole('combobox', {name: /^(Supplier|服务商) 2$/, exact: true});
  await expect(second).toHaveValue('deepseek');
  await expect(addDialog).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('browser back preserves service settings draft until discard is confirmed', async ({ page }) => {
  await installSettingsRecoveryHarness(page);
  await page.goto('/admin');
  await page.locator('a[href="/admin/service-settings"]').first().click();
  const base = page.getByRole('textbox', { name: /^Base URL$|^基础 URL$/ });
  await base.fill('https://retained.example.test');
  await page.evaluate(() => window.history.back());
  const confirm = page.getByRole('dialog', { name: /Leave with unsaved changes|放弃更改/ });
  await expect(confirm).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/service-settings/);
  await confirm.getByRole('button', { name: /Cancel|取消/ }).click();
  await expect(base).toHaveValue('https://retained.example.test');
  await page.evaluate(() => window.history.back());
  await confirm.getByRole('button', { name: /Discard and leave|放弃并离开/ }).click();
  await expect(page).toHaveURL(/\/admin$/);
});

for (const failure of ['network', 'timeout', 'malformed'] as const) {
  test(`service recovery reads without replay after ${failure} save and retains draft`, async ({ page }, testInfo) => {
    const state = await installSettingsRecoveryHarness(page);
    await page.setViewportSize({ width: failure === 'network' ? 1056 : 1440, height: 900 });
    await page.route('**/api/admin/service-settings/portal-public', async (route) => {
      state.writes += 1;
      state.settings.portal_public.config.public_base_url = route.request().postDataJSON().public_base_url;
      state.failReads = true;
      if (failure === 'network') await route.abort('failed');
      if (failure === 'malformed') await route.fulfill({ json: buildAdminApiEnvelope({}) });
    });
    await page.goto('/admin/service-settings');
    const base = page.getByRole('textbox', { name: /^Base URL$|^基础 URL$/i });
    await base.fill('https://uncertain.example.test');
    const save = page.getByRole('button', { name: /Save base URL|保存基础地址/i });
    await save.click();
    const retry = page.getByRole('button', { name: /^Retry$|^重试$/i });
    await expect(retry).toBeEnabled({ timeout: 18000 });
    await expect(page.getByRole('status').filter({ hasText: /save result is unknown|保存结果待确认/ })).toBeVisible();
    await expect(base).toHaveValue('https://uncertain.example.test');
    await expect(base).toBeDisabled();
    await retry.click();
    await expect.poll(() => state.reads).toBe(3);
    expect(state.writes).toBe(1);
    await page.screenshot({ path: testInfo.outputPath(`service-recovery-${failure}.png`), fullPage: true });
    state.failReads = false;
    await retry.click();
    await expect(base).toBeEnabled();
    await expect(base).toHaveValue('https://uncertain.example.test');
    await expect(save).toBeDisabled();
    await expect(page.locator('[data-ui="service-settings-write-recovered"]')).toBeVisible();
    expect(state.writes).toBe(1);
  });
}

for (const group of ['qq', 'email', 'payment'] as const) {
  test(`credential whitespace is rejected for ${group} even with a saved secret`, async ({ page }) => {
    const state = await installSettingsRecoveryHarness(page);
    state.settings.qq_login.config.client_id = 'fixture-qq';
    state.settings.qq_login.secrets.client_secret = { configured: true, display: 'configured' };
    state.settings.portal_email.secrets.smtp_password = { configured: true, display: 'configured' };
    state.settings.portal_email.config.smtp_username = 'mail@example.test';
    state.settings.alipay_payment.secrets.private_key = { configured: true, display: 'configured' };
    state.settings.alipay_payment.secrets.public_key = { configured: true, display: 'configured' };
    await page.goto(`/admin/service-settings?tab=${group}`);
    if (group === 'email') await page.getByRole('button', { name: /Edit SMTP|编辑 SMTP/ }).click();
    const panel = page.getByRole('tabpanel');
    await panel.getByRole('button', { name: /Replace credential|替换凭据/ }).first().click();
    const credential = panel.locator('[data-ui="admin-credential-field"] input, [data-ui="admin-credential-field"] textarea').first();
    await credential.fill('   ');
    await expect(panel).not.toContainText(/cannot contain only whitespace|不能只有空白字符/);
    await panel.locator('button[type="submit"]').click();
    await expect(panel).toContainText(/cannot contain only whitespace|不能只有空白字符/);
    await expect(panel.locator('button[type="submit"]')).toBeEnabled();
    expect(state.writes).toBe(0);
    if (group === 'email') {
      await credential.fill('fixture-replacement');
      await page.route('**/api/admin/service-settings/email', async (route) => {
        state.writes += 1;
        expect(route.request().postDataJSON().smtp_password).toBe('fixture-replacement');
        await route.abort('failed');
      });
      await panel.locator('button[type="submit"]').click();
      await expect(page.locator('[data-ui="service-settings-write-recovered"]')).toBeVisible();
      await expect(credential).toHaveValue('fixture-replacement');
      expect(state.writes).toBe(1);
    }
  });
}

for (const invalid of ['connections', 'items'] as const) {
  test(`budget ${invalid} corruption stays local and read recovery retains budget draft`, async ({ page }, testInfo) => {
    const state = await installSettingsRecoveryHarness(page);
    const budget = { ...setting('provider_account_spend_budget', 'ready', {
      warning_ratio: 0.8, conservative_unpriced_cost_usd: 0.05, require_provider_configuration: true,
      providers: [{ provider_id: 'openai', account_class: 'paid', daily_usd: 1, monthly_usd: 10 }],
    }), runtime: { status: 'ok', warning_ratio: 0.8, configured_provider_count: 1,
      missing_provider_ids: [], items: [], connections: [{ provider_id: 'openai', display_name: 'Fixture', enabled: true }],
      generated_at: '', period_timezone: 'UTC' } };
    let malformed = true;
    let failRead = false;
    await page.route('**/api/admin/service-settings', (route) => route.fulfill(failRead
      ? { status: 503, json: buildAdminApiErrorEnvelope('read unavailable') }
      : { json: buildAdminApiEnvelope({ settings: {
        ...state.settings, provider_budget: { ...budget, runtime: malformed ? { ...budget.runtime, [invalid]: [null] } : budget.runtime },
      } }) }));
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/admin/service-settings');
    await expect(page.getByRole('textbox', { name: /^Base URL$|^基础 URL$/i })).toBeEnabled();
    await page.getByRole('tab', { name: /AI budget|AI 估算预算/i }).click();
    const warning = page.locator('[data-ui="provider-budget-runtime-unavailable"]');
    await expect(warning).toBeVisible();
    const threshold = page.getByRole('spinbutton').first();
    await threshold.fill('75');
    failRead = true;
    await warning.getByRole('button', { name: /^Retry$|^重试$/i }).click();
    await expect(warning.getByRole('button')).toBeEnabled();
    await expect(threshold).toBeEnabled();
    await expect(threshold).toHaveValue('75');
    failRead = false;
    await page.screenshot({ path: testInfo.outputPath(`budget-${invalid}-unknown.png`), fullPage: true });
    malformed = false;
    await warning.getByRole('button', { name: /^Retry$|^重试$/i }).click();
    await expect(warning).toHaveCount(0);
    await expect(threshold).toHaveValue('75');
    expect(errors).toEqual([]);
    expect(state.writes).toBe(0);
  });
}

test('malformed timezone is unknown and recovers through GET without writable defaults', async ({ page }) => {
  const state = await installSettingsRecoveryHarness(page);
  let malformed = true;
  await page.route('**/api/admin/service-settings', (route) => route.fulfill({ json: buildAdminApiEnvelope({ settings: {
    ...state.settings, platform_preferences: { ...state.settings.platform_preferences,
      config: { timezone: malformed ? {} : 'Pacific/Chatham' } },
  } }) }));
  await page.goto('/admin/service-settings?tab=system');
  await expect(page.locator('main').getByRole('alert')).toBeVisible();
  await expect(page.locator('form')).toHaveCount(0);
  malformed = false;
  await page.getByRole('button', { name: /^Retry$|^重试$/i }).click();
  await expect(page.locator('[data-configuration-row="platform-timezone"] select')).toHaveValue('Pacific/Chatham');
  expect(state.writes).toBe(0);
});

test('service explicit rejection retains an editable draft without reconciliation', async ({ page }) => {
  const state = await installSettingsRecoveryHarness(page);
  await page.route('**/api/admin/service-settings/portal-public', async (route) => {
    state.writes += 1;
    await route.fulfill({ status: 400, json: buildAdminApiErrorEnvelope('invalid URL', 'service_settings.public_url_invalid') });
  });
  await page.goto('/admin/service-settings');
  const base = page.getByRole('textbox', { name: /^Base URL$|^基础 URL$/i });
  await base.fill('https://rejected.example.test');
  await page.getByRole('button', { name: /Save base URL|保存基础地址/i }).click();
  await expect(page.locator('main').getByRole('alert')).toBeVisible();
  await expect(base).toBeEnabled();
  await expect(base).toHaveValue('https://rejected.example.test');
  expect(state.reads).toBe(1);
  expect(state.writes).toBe(1);
});

for (const locale of ['zh-CN', 'en'] as const) {
  test(`estimated budget keeps limits visible and saves collapsed advanced settings in ${locale}`, async ({ page }, testInfo) => {
    const evidence = observeAdminBrowserEvidence(page);
    await page.addInitScript((value) => {
      localStorage.setItem('locale', value);
      localStorage.setItem('theme', value === 'en' ? 'dark' : 'light');
    }, locale);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const state = await installSettingsRecoveryHarness(page);
    const budget = {
      ...setting('provider_account_spend_budget', 'ready', {
        warning_ratio: 0.8, conservative_unpriced_cost_usd: 0.05, require_provider_configuration: false,
        providers: [{ provider_id: 'siliconflow', account_class: 'paid', daily_usd: 0.5, monthly_usd: 2.5 }],
      }),
      runtime: { status: 'ok', warning_ratio: 0.8, configured_provider_count: 1, missing_provider_ids: [],
        generated_at: '', period_timezone: 'UTC',
        connections: [
          { provider_id: 'siliconflow', connection_id: 'siliconflow', display_name: 'SiliconFlow', enabled: true },
          { provider_id: 'deepseek', connection_id: 'deepseek', display_name: 'DeepSeek', enabled: true },
        ],
        items: ['day', 'month'].map((period_kind) => ({ provider_id: 'siliconflow', account_class: 'paid', period_kind,
          period_start_at: '', period_end_at: '', limit_cost_usd: period_kind === 'day' ? 0.5 : 2.5,
          reserved_cost_usd: 0.12, remaining_cost_usd: period_kind === 'day' ? 0.38 : 2.38,
          utilization_ratio: period_kind === 'day' ? 0.24 : 0.048, warning: false, exceeded: false })),
      },
    };
    let submitted: unknown;
    let rejectSave = true;
    await page.route('**/api/admin/service-settings**', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: buildAdminApiEnvelope({ settings: { ...state.settings, provider_budget: budget } }) });
      } else if (rejectSave) {
        await route.fulfill({ status: 400, json: buildAdminApiErrorEnvelope('Budget configuration rejected', 'service_settings.provider_budget_invalid') });
      } else {
        submitted = route.request().postDataJSON();
        budget.config = route.request().postDataJSON();
        await route.fulfill({ json: buildAdminApiEnvelope(budget) });
      }
    });
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.goto('/admin/service-settings?tab=provider-budget');
    const panel = page.getByRole('tabpanel');
    const daily = page.getByRole('spinbutton', { name: /^(Daily estimate limit \(USD\)|每日估算上限（USD）) 1$/ });
    const advanced = page.locator('[data-ui="provider-budget-advanced"]');
    const help = page.locator('[data-ui="provider-budget-help"]');
    await expect(daily).toBeVisible();
    await expect(page.getByRole('cell', { name: '$0.1200 / $0.5000', exact: true })).toBeVisible();
    await expect(panel).toContainText(/Actual charges follow your API supplier bill|实际扣费以 API 厂商账单为准/);
    await expect(advanced).not.toHaveAttribute('open', '');
    await expect(advanced.locator('summary')).toContainText(/may call without this limit|允许调用，不受此预算限制/);
    const addProviderButton = page.getByRole('button', { name: /Add supplier|添加服务商/i });
    await addProviderButton.click();
    const addProviderDialog = page.getByRole('dialog', { name: /Add supplier budget|添加服务商预算/i });
    await expect(addProviderDialog).toBeVisible();
    await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
    const addSupplier = addProviderDialog.getByRole('combobox', { name: /^(Supplier|服务商)$/ });
    const confirmAdd = addProviderDialog.getByRole('button', { name: /Add supplier|添加服务商/i, exact: true });
    await expect(addProviderDialog.getByRole('alert')).toHaveCount(0);
    await expect(addSupplier.locator('option[value="siliconflow"]')).toHaveJSProperty('disabled', true);
    await expect(page.getByRole('button', { name: /Save estimated budget|保存估算预算/ })).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath(`estimated-budget-add-dialog-${locale}.png`), fullPage: true });
    await confirmAdd.click();
    await expect(addProviderDialog.getByRole('alert')).toContainText(/Select a supplier before adding|请先选择服务商/);
    await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
    await addSupplier.selectOption('deepseek');
    await addProviderDialog.getByRole('spinbutton', { name: /Daily estimate limit|每日估算上限/ }).fill('0');
    await confirmAdd.click();
    await expect(addProviderDialog.getByRole('alert')).toContainText(/positive daily and monthly|每日和每月估算上限必须大于 0/);
    await page.keyboard.press('Escape');
    await expect(addProviderDialog).toHaveCount(0);
    await expect(addProviderButton).toBeFocused();
    await expect(page.getByRole('button', { name: /Save estimated budget|保存估算预算/ })).toBeDisabled();
    await expect(panel.getByRole('combobox', { name: /^(Supplier|服务商) 2$/ })).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: testInfo.outputPath(`estimated-budget-${locale}-1440.png`), fullPage: true });
    await panel.screenshot({ path: testInfo.outputPath(`estimated-budget-panel-${locale}.png`) });
    await help.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(help).toHaveAttribute('open', '');
    await expect(help).toContainText('$0.40');
    await expect(help).toContainText(/08:00/);
    await page.screenshot({ path: testInfo.outputPath(`estimated-budget-help-${locale}.png`), fullPage: true });
    await help.locator('summary').click();
    await advanced.locator('summary').focus();
    await page.keyboard.press('Enter');
    const reserve = page.getByRole('spinbutton', { name: /Reserve per call without a price|无参考价格时，每次预留/ });
    await reserve.fill('0');
    await expect(page.locator('[data-ui="service-settings-active-state"]')).not.toHaveAttribute('role', 'alert');
    const save = page.getByRole('button', { name: /Save estimated budget|保存估算预算/ });
    await expect(save).toBeEnabled();
    await advanced.locator('summary').click();
    await expect(page.locator('main').getByRole('alert')).toBeVisible();
    await advanced.locator('summary').click();
    await reserve.fill('0.08');
    await page.getByRole('switch', { name: /Block suppliers without a budget|未设置预算的服务商禁止调用/ }).click();
    await advanced.locator('summary').click();
    await expect(advanced.locator('summary')).toContainText(/are blocked|禁止调用/);
    await daily.fill('0.6');
    await addProviderButton.click();
    await expect(addSupplier).toHaveValue('');
    await expect(addProviderDialog.getByRole('alert')).toHaveCount(0);
    await addSupplier.selectOption('deepseek');
    await addProviderDialog.getByRole('spinbutton', { name: /Daily estimate limit|每日估算上限/ }).fill('0.7');
    await addProviderDialog.getByRole('spinbutton', { name: /Monthly estimate limit|每月估算上限/ }).fill('3.5');
    await page.setViewportSize({ width: 1056, height: 800 });
    expect(await addProviderDialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`estimated-budget-add-filled-${locale}-1056.png`), fullPage: true });
    await addProviderDialog.getByRole('button', { name: /Cancel|取消/, exact: true }).click();
    await expect(daily).toHaveValue('0.6');
    await expect(panel.getByRole('combobox', { name: /^(Supplier|服务商) 2$/ })).toHaveCount(0);
    await page.setViewportSize({ width: 1440, height: 1050 });
    await addProviderButton.click();
    await addSupplier.selectOption('deepseek');
    await addProviderDialog.getByRole('spinbutton', { name: /Daily estimate limit|每日估算上限/ }).fill('0.7');
    await addProviderDialog.getByRole('spinbutton', { name: /Monthly estimate limit|每月估算上限/ }).fill('3.5');
    await addProviderDialog.getByRole('button', { name: /Close|关闭/, exact: true }).focus();
    await page.keyboard.press('Shift+Tab');
    await expect(confirmAdd).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(addProviderDialog.getByRole('button', { name: /Close|关闭/, exact: true })).toBeFocused();
    await confirmAdd.click();
    await expect(addProviderDialog).toHaveCount(0);
    await expect(panel.getByRole('combobox', { name: /^(Supplier|服务商) 2$/ })).toHaveValue('deepseek');
    expect(submitted).toBeUndefined();
    await page.getByRole('tab', { name: /QQ/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: /Cancel|取消/, exact: true }).click();
    await expect(daily).toHaveValue('0.6');
    await save.click();
    await expect(page.locator('main').getByRole('alert')).toBeVisible();
    await expect(daily).toBeEnabled();
    await expect(daily).toHaveValue('0.6');
    await expect(advanced).not.toHaveAttribute('open', '');
    await page.screenshot({ path: testInfo.outputPath(`estimated-budget-save-error-${locale}.png`), fullPage: true });
    rejectSave = false;
    await save.click();
    await expect(save).toBeDisabled();
    expect(submitted).toEqual({ enabled: true, warning_ratio: 0.8, conservative_unpriced_cost_usd: 0.08,
      require_provider_configuration: true,
      providers: [
        { provider_id: 'siliconflow', account_class: 'paid', daily_usd: 0.6, monthly_usd: 2.5 },
        { provider_id: 'deepseek', account_class: 'paid', daily_usd: 0.7, monthly_usd: 3.5 },
      ] });
    await expect(daily).toBeEnabled();
    await page.getByRole('button', { name: 'Close notification' }).click();
    await page.setViewportSize({ width: 1056, height: 800 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(daily).toBeVisible();
    await advanced.locator('summary').click();
    await expect(reserve).toHaveValue('0.08');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await page.screenshot({ path: testInfo.outputPath(`estimated-budget-advanced-${locale}-1056.png`), fullPage: true });
    await advanced.locator('summary').click();
    await writeAdminVisualReceipt({ page, testInfo, route: '/admin/service-settings', pageModel: 'configuration',
      testedStates: ['ready', 'invalid', 'dirty', 'save_error', 'saved', 'dialog'], pageTitle: page.getByRole('heading', { name: /Service Settings|服务设置/, level: 1 }),
      workingSurface: page.locator('[data-ui="admin-settings-workbench"]'), browserEvidence: evidence,
      environment: 'local', dataMode: 'mocked', expectedConsoleErrors: [/400 \(Bad Request\)/], artifactId: `estimated-budget-${locale.toLowerCase()}`,
      routeRuleResults: [
        { id: 'single-primary-action', status: 'pass', evidence: 'One save action; supplier add/remove are secondary.' },
        { id: 'textual-status', status: 'pass', evidence: 'Budget state and unconfigured-supplier policy remain visible while details are closed.' },
        { id: 'action-object-proximity', status: 'pass', evidence: 'Supplier limits and controls are visible together without disclosure.' },
        { id: 'distinct-interaction-states', status: 'pass', evidence: 'Saved button disabled; keyboard opens named disclosures; dirty state survives cancellation.' },
        { id: 'dialog-focus-recovery', status: 'pass', evidence: 'Add dialog contains Tab focus; Escape restores trigger focus; cancelling keeps the original page draft.' },
        { id: 'context-stability', status: 'pass', evidence: 'Collapsed advanced edits reach the unchanged PATCH payload and survive readback.' },
      ],
      interactionResults: [{ id: 'budget-save', status: 'pass', evidence: 'Exact budget payload, advanced disclosure, keyboard help, supplier add dialog Escape recovery and 1056px overflow verified.' }],
    });
    expect(evidence.consoleErrors.filter((error) => !/400 \(Bad Request\)/.test(error))).toEqual([]);
  });
}


test('field validation waits for blur or submit without exposing untouched sibling errors', async ({ page }, info) => {
  const state = await installSettingsRecoveryHarness(page);
  state.settings.qq_login.enabled = true;
  state.settings.qq_login.status = 'missing_config';
  await page.setViewportSize({ width: 1056, height: 800 });
  await page.goto('/admin/service-settings?tab=qq');
  const panel = page.getByRole('tabpanel');
  const appId = page.getByRole('textbox', { name: 'App ID', exact: true });
  const save = panel.locator('button[type=submit]');
  await expect(page.getByRole('tab', { name: /QQ.*Not configured|QQ.*未配置/ })).toBeVisible();
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await appId.fill('draft');
  await appId.clear();
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await panel.getByRole('heading').click();
  await expect(panel.getByRole('alert')).toContainText(/Enter the QQ App ID|请输入 QQ App ID/);
  await expect(panel).not.toContainText(/Enter the QQ App Secret|请输入 QQ App Secret/);
  await appId.fill('draft');
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await save.click();
  await expect(panel.getByRole('alert')).toContainText(/Enter the QQ App Secret|请输入 QQ App Secret/);
  expect(state.writes).toBe(0);
  await panel.screenshot({ path: info.outputPath('qq-validation-on-submit-1056.png') });
  await page.getByRole('button', { name: /Restore saved values|恢复已保存值/ }).click();
  await expect(panel.getByRole('alert')).toHaveCount(0);
});

test('test-account limits distinguish blank from zero and hidden reserve limits block writes', async ({ page }) => {
  const state = await installSettingsRecoveryHarness(page);
  Object.assign(state.settings, { provider_budget: {
    ...setting('provider_account_spend_budget', 'disabled', {
      warning_ratio: 0.8, conservative_unpriced_cost_usd: 0.05,
      require_provider_configuration: true, providers: [],
    }),
    runtime: { status: 'disabled', warning_ratio: 0.8, configured_provider_count: 0,
      missing_provider_ids: [], generated_at: '', period_timezone: 'UTC', items: [],
      connections: [{ provider_id: 'test-supplier', display_name: 'Test supplier', provider_type: 'openai', enabled: true }],
    },
  } });
  await page.goto('/admin/service-settings?tab=provider-budget');
  await page.getByRole('button', { name: /Add supplier|添加服务商/, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: /^(Supplier|服务商)$/ }).selectOption('test-supplier');
  await dialog.getByRole('combobox', { name: /Account type|账户类型/ }).selectOption('test');
  const draftDaily = dialog.getByRole('spinbutton', { name: /Daily estimate limit|每日估算上限/ });
  await draftDaily.clear();
  await dialog.getByRole('button', { name: /Add supplier|添加服务商/, exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await draftDaily.fill('0');
  await dialog.getByRole('spinbutton', { name: /Monthly estimate limit|每月估算上限/ }).fill('0');
  await dialog.getByRole('button', { name: /Add supplier|添加服务商/, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const daily = page.getByRole('spinbutton', { name: /^(Daily estimate limit.*|每日估算上限.*) 1$/ });
  await expect(daily).toHaveValue('0');
  await daily.clear();
  await expect(page.getByRole('tabpanel').getByRole('alert')).toHaveCount(0);
  const save = page.getByRole('button', { name: /Save estimated budget|保存估算预算/ });
  await save.click();
  await expect(page.getByRole('tabpanel').getByRole('alert')).toBeVisible();
  expect(state.writes).toBe(0);
  await daily.fill('0');
  const advanced = page.locator('[data-ui="provider-budget-advanced"]');
  await advanced.locator('summary').click();
  await page.getByRole('spinbutton', { name: /Reserve per call without a price|无参考价格时，每次预留/ }).fill('1001');
  await advanced.locator('summary').click();
  await save.click();
  await expect(page.getByRole('tabpanel').getByRole('alert')).toContainText(/1000/);
  expect(state.writes).toBe(0);
});
