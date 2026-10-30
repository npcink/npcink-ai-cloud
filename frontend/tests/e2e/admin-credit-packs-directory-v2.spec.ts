import { expect, test, type Page } from '@playwright/test';
import {
  buildAdminApiEnvelope,
  buildAdminApiErrorEnvelope,
  installAdminMocks,
} from './helpers/admin-operator-fixture';

type Pack = {
  pack_id: string;
  label: string;
  ai_credits: number;
  amount: number;
  currency: string;
  recommended_for_tiers: string[];
  validity_days: number;
  active: boolean;
};

const initialPacks: Pack[] = [
  { pack_id: 'pack_small', label: 'Small credit pack', ai_credits: 10000, amount: 9.9, currency: 'CNY', recommended_for_tiers: ['free', 'plus'], validity_days: 365, active: true },
  { pack_id: 'pack_medium', label: 'Medium credit pack', ai_credits: 35000, amount: 19.9, currency: 'CNY', recommended_for_tiers: ['pro', 'agency'], validity_days: 365, active: true },
  { pack_id: 'pack_large', label: 'Large credit pack', ai_credits: 150000, amount: 99, currency: 'CNY', recommended_for_tiers: ['agency'], validity_days: 365, active: false },
];

async function installCreditPackHarness(page: Page) {
  await installAdminMocks(page);
  let items = initialPacks.map((item) => ({ ...item, recommended_for_tiers: [...item.recommended_for_tiers] }));
  let revision = 'catalog-1';
  let omitRevision = false;
  let getCount = 0;
  let patchCount = 0;
  let lastPatch: Pack[] = [];
  let failNextGet = false;
  await page.route('**/api/admin/credit-packs', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      getCount += 1;
      if (failNextGet) {
        failNextGet = false;
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify(buildAdminApiErrorEnvelope('temporary catalog failure')) });
        return;
      }
    } else if (method === 'PATCH') {
      patchCount += 1;
      const body = route.request().postDataJSON() as { items?: Pack[]; expected_revision?: string };
      if (body.expected_revision !== revision) {
        await route.fulfill({ status: 409, json: {
          ...buildAdminApiErrorEnvelope('catalog changed'),
          error_code: 'service.credit_pack_catalog_revision_conflict',
        } });
        return;
      }
      revision = `catalog-${patchCount + 1}`;
      lastPatch = Array.isArray(body.items) ? body.items : [];
      items = lastPatch.map((item) => ({ ...item, currency: 'CNY' }));
    } else {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiEnvelope({
          revision: omitRevision ? undefined : revision,
          catalog_version: 'credit_pack_catalog_v1',
          period_policy: 'payment_order_grant',
          expiry_policy: 'paid_at_plus_validity_days',
          default_validity_days: 365,
          updated_at: '2026-07-12T08:00:00Z',
          items,
      })),
    });
  });
  return {
    changeRemote: () => { revision = 'remote-change'; items[0] = { ...items[0], amount: 88 }; },
    omitRevision: () => { omitRevision = true; },
    getGetCount: () => getCount,
    getPatchCount: () => patchCount,
    getLastPatch: () => lastPatch,
    failNextRequest: () => { failNextGet = true; },
  };
}

test('credit pack directory is read-first, URL-backed, retained on refresh failure, and mobile safe', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const harness = await installCreditPackHarness(page);
  await page.goto('/admin/credit-packs');

  const primaryNav = page.locator('[data-ui="admin-primary-nav"]');
  const workspaceTabs = page.locator('[data-ui="admin-workspace-navigation"]');
  await expect(primaryNav.locator('a[href="/admin/subscriptions"]')).toHaveAttribute('aria-current', 'page');
  await expect(workspaceTabs.locator('a[href="/admin/credit-packs"]')).toHaveAttribute('aria-current', 'page');
  await expect(workspaceTabs.locator('a[href="/admin/plans"]')).not.toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('link', { name: /Open package catalog|打开套餐目录/i })).toHaveCount(0);
  await expect(page.locator('[data-ui="credit-pack-directory-row"]')).toHaveCount(3);
  await expect(page.locator('main input')).toHaveCount(0);
  await expect(page.locator('[data-pack-id="pack_small"]')).toHaveAttribute('data-selected', 'true');
  expect(harness.getGetCount()).toBe(1);

  await page.locator('[data-pack-id="pack_medium"]').getByRole('button', { name: /Edit|编辑/i }).click();
  await expect(page).toHaveURL(/focus=pack_medium/);
  await expect(page.getByRole('dialog', { name: /Edit Medium credit pack|编辑 Medium credit pack/i })).toBeVisible();
  await page.getByRole('dialog', { name: /Edit Medium credit pack|编辑 Medium credit pack/i }).getByRole('button', { name: /^Cancel$|^取消$/i }).click();
  await page.reload();
  await expect(page.locator('[data-pack-id="pack_medium"]')).toHaveAttribute('data-selected', 'true');

  await page.getByRole('button', { name: /^Inactive$|^未启用$|^未啟用$/i }).click();
  await expect(page).toHaveURL(/status=inactive/);
  await expect(page.locator('[data-ui="credit-pack-directory-row"]')).toHaveCount(1);
  await expect(page.locator('[data-pack-id="pack_large"]')).toHaveAttribute('data-selected', 'true');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(await page.locator('[data-ui="credit-pack-directory-row"]').evaluate((element) => element.getBoundingClientRect().top)).toBeLessThan(650);

  harness.failNextRequest();
  await page.getByRole('button', { name: /^Refresh$|^刷新$/i }).click();
  await expect(page.getByText(/last successfully loaded credit pack catalog|最近一次成功加载的(?:AI )?积分包目录/i)).toBeVisible();
  await expect(page.locator('[data-pack-id="pack_large"]')).toBeVisible();
});

test('credit pack editor changes one selected pack while preserving the atomic catalog payload', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const harness = await installCreditPackHarness(page);
  await page.goto('/admin/credit-packs?focus=pack_medium');

  await page.locator('[data-pack-id="pack_medium"]').getByRole('button', { name: /Edit|编辑/i }).click();
  let editor = page.getByRole('dialog', { name: /Edit Medium credit pack|编辑 Medium credit pack/i });
  await expect(editor.getByRole('button', { name: /Save pack|保存(?: AI )?积分包/i })).toBeDisabled();
  await editor.getByRole('button', { name: /^Cancel$|^取消$/i }).click();
  expect(harness.getPatchCount()).toBe(0);

  await page.locator('[data-pack-id="pack_medium"]').getByRole('button', { name: /Edit|编辑/i }).click();
  editor = page.getByRole('dialog', { name: /Edit Medium credit pack|编辑 Medium credit pack/i });
  await editor.getByLabel(/^Amount|^价格/i).fill('29.9');
  await editor.getByRole('button', { name: /Save pack|保存(?: AI )?积分包/i }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByText(/Credit pack catalog saved|积分包目录已保存/i)).toBeVisible();
  expect(harness.getPatchCount()).toBe(1);
  expect(harness.getLastPatch()).toHaveLength(3);
  expect(harness.getLastPatch().find((item) => item.pack_id === 'pack_medium')?.amount).toBe(29.9);
  expect(harness.getLastPatch().find((item) => item.pack_id === 'pack_small')?.amount).toBe(9.9);
  await expect(page.locator('[data-pack-id="pack_medium"]')).toContainText('29.90');
});

test('credit packs retain missing focus, block stale edits, and isolate modal shortcuts', async ({ page }) => {
  const harness = await installCreditPackHarness(page);
  await page.goto('/admin/credit-packs?focus=absent');
  await expect(page.locator('[data-ui="credit-pack-directory-row"][data-selected="true"]')).toHaveCount(0);
  await expect(page.getByText(/requested pack is absent|当前结果中没有指定的积分包/)).toBeVisible();
  await page.locator('[data-pack-id="pack_medium"]').getByRole('button', { name: /Edit|编辑/ }).click();
  const editor = page.getByRole('dialog');
  await editor.getByLabel(/^Pack$|^(?:AI )?积分包$/).fill('Retained draft');
  await editor.locator('[data-ui="admin-workbench-close"]').focus();
  await page.keyboard.press('Meta+k');
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(editor.getByLabel(/^Pack$|^(?:AI )?积分包$/)).toHaveValue('Retained draft');
  await editor.getByRole('button', { name: /^Cancel$|^取消$/ }).click();
  harness.failNextRequest();
  await page.getByRole('button', { name: /^Refresh$|^刷新$/ }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('[data-pack-id="pack_medium"]').getByRole('button', { name: /Edit|编辑/ })).toBeDisabled();
  expect(harness.getPatchCount()).toBe(0);
  await page.getByRole('button', { name: /^Retry$|^重试$/ }).click();
  await expect(page.locator('[data-pack-id="pack_medium"]').getByRole('button', { name: /Edit|编辑/ })).toBeEnabled();
});

test('credit pack save locks every input until its delayed response completes', async ({ page }) => {
  await installCreditPackHarness(page);
  let release!: () => void;
  const pendingSave = new Promise<void>((resolve) => { release = resolve; });
  let writes = 0;
  await page.route('**/api/admin/credit-packs', async (route) => {
    if (route.request().method() !== 'PATCH') { await route.fallback(); return; }
    writes += 1;
    await pendingSave;
    await route.fallback();
  });
  await page.goto('/admin/credit-packs');
  await page.locator('[data-pack-id="pack_small"]').getByRole('button', { name: /Edit|编辑/ }).click();
  const editor = page.getByRole('dialog');
  await editor.getByLabel(/^Pack$|^(?:AI )?积分包$/).fill('Saved draft');
  await editor.getByRole('button', { name: /Save pack|保存(?: AI )?积分包/ }).click();
  await expect.poll(() => writes).toBe(1);
  for (const input of await editor.locator('input').all()) await expect(input).toBeDisabled();
  await page.keyboard.press('Enter');
  expect(writes).toBe(1);
  release();
  await expect(editor).toBeHidden();
  await expect(page.locator('[data-pack-id="pack_small"]')).toContainText('Saved draft');
});


test('credit pack rejects concurrent replacement, retains draft, and reloads explicitly', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 900, height: 800 });
  const harness = await installCreditPackHarness(page);
  await page.goto('/admin/credit-packs');
  await page.locator('[data-pack-id="pack_medium"]').getByRole('button', { name: /Edit|编辑/ }).click();
  const editor = page.getByRole('dialog');
  await editor.getByLabel(/^Amount|^价格/).fill('29.9');
  harness.changeRemote();
  await editor.getByRole('button', { name: /Save pack|保存(?: AI )?积分包/ }).click();
  await expect(editor).toContainText(/Another operator|其他操作者/);
  await expect(editor.getByLabel(/^Amount|^价格/)).toHaveValue('29.9');
  await expect(editor.getByRole('button', { name: /Save pack|保存(?: AI )?积分包/ })).toBeDisabled();
  expect(harness.getPatchCount()).toBe(1);
  const reload = editor.getByRole('button', { name: /Discard draft and reload|丢弃草稿并加载/ });
  await expect(reload).toBeVisible();
  const screenshotPath = testInfo.outputPath('credit-pack-conflict-pc-900.png');
  await editor.screenshot({ path: screenshotPath });
  await testInfo.attach('credit-pack-conflict-pc-900', { path: screenshotPath, contentType: 'image/png' });
  await reload.click();
  await expect(editor).toBeHidden();
  await expect(page.locator('[data-pack-id="pack_small"]')).toContainText('88.00');
  await page.locator('[data-pack-id="pack_medium"]').getByRole('button', { name: /Edit|编辑/ }).click();
  await editor.getByLabel(/^Amount|^价格/).fill('39.9');
  await editor.getByRole('button', { name: /Save pack|保存(?: AI )?积分包/ }).click();
  await expect(editor).toBeHidden();
  expect(harness.getLastPatch().find(item => item.pack_id === 'pack_small')?.amount).toBe(88);
  expect(harness.getLastPatch().find(item => item.pack_id === 'pack_medium')?.amount).toBe(39.9);
});

test('credit pack reads without a revision cannot enable editing', async ({ page }) => {
  const harness = await installCreditPackHarness(page);
  harness.omitRevision();
  await page.goto('/admin/credit-packs');
  await expect(page.getByRole('alert').filter({ hasText: /version could not be confirmed|无法确认目录版本/ })).toBeVisible();
  for (const button of await page.locator('[data-pack-id]').getByRole('button', { name: /Edit|编辑/ }).all()) {
    await expect(button).toBeDisabled();
  }
  expect(harness.getPatchCount()).toBe(0);
});


test('canceling a catalog conflict keeps the blocking reason visible until refresh', async ({ page }) => {
  const harness = await installCreditPackHarness(page);
  await page.goto('/admin/credit-packs');
  await page.locator('[data-pack-id="pack_small"]').getByRole('button', { name: /Edit|编辑/ }).click();
  const editor = page.getByRole('dialog');
  await editor.getByLabel(/^Amount|^价格/).fill('29.9');
  harness.changeRemote();
  await editor.getByRole('button', { name: /Save pack|保存(?: AI )?积分包/ }).click();
  await expect(editor).toContainText(/Another operator|其他操作者/);
  await editor.getByRole('button', { name: /^Cancel$|^取消$/ }).click();
  await expect(page.getByRole('alert').filter({ hasText: /Another operator|其他操作者/ })).toBeVisible();
  await expect(page.locator('[data-pack-id="pack_small"]').getByRole('button', { name: /Edit|编辑/ })).toBeDisabled();
  await page.getByRole('button', { name: /^Refresh$|^刷新$/ }).click();
  await expect(page.getByRole('alert').filter({ hasText: /Another operator|其他操作者/ })).toBeHidden();
  await expect(page.locator('[data-pack-id="pack_small"]').getByRole('button', { name: /Edit|编辑/ })).toBeEnabled();
});
