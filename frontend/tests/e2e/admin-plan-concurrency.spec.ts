import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { buildAdminApiEnvelope, buildAdminApiErrorEnvelope, installAdminMocks } from './helpers/admin-operator-fixture';

const evidenceRoot = process.env.NPCINK_PLAN_CONCURRENCY_EVIDENCE;
const revision = (letter: string) => `plan-v1:${letter.repeat(64)}`;

for (const { width, colorScheme } of [
  { width: 1440, colorScheme: 'light' as const },
  { width: 1056, colorScheme: 'light' as const },
  { width: 1440, colorScheme: 'dark' as const },
]) {
  test(`plan conflict retains draft and requires explicit fresh start at PC ${width} ${colorScheme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1050 });
    await page.emulateMedia({ colorScheme });
    await page.addInitScript((scheme) => { localStorage.setItem('theme', scheme); }, colorScheme);
    await installAdminMocks(page);
    let points = 10000;
    let price = 99;
    let currentRevision = revision('a');
    let reads = 0;
    let writes = 0;
    let readFails = false;
    const submitted: Record<string, unknown>[] = [];
    await page.route('**/api/admin/plans/pro', async (route) => {
      const method = route.request().method();
      if (method === 'PATCH') {
        writes += 1;
        const body = route.request().postDataJSON();
        submitted.push(body);
        if (body.revision !== currentRevision) {
          await route.fulfill({ status: 409, json: buildAdminApiErrorEnvelope('changed', 'service.admin_plan_revision_conflict') });
        } else {
          price = body.sales_price_cny;
          points = body.monthly_included_points;
          currentRevision = revision('c');
          await route.fulfill({ json: buildAdminApiEnvelope({ plan_version_id: 'pro_v1' }) });
        }
        return;
      }
      reads += 1;
      if (readFails) {
        await route.fulfill({ status: 503, json: buildAdminApiErrorEnvelope('read unavailable', 'service.unavailable') });
        return;
      }
      await route.fulfill({ json: buildAdminApiEnvelope({
        revision: currentRevision,
        plan: { plan_id: 'pro', name: 'Pro', status: 'active', description: 'Existing package' },
        latest_version: {
          plan_version_id: 'pro_v1', version_label: 'v1', status: 'published',
          budgets: { max_ai_credits_per_period: points, max_cost_cny_per_period: 0 },
          concurrency: { max_active_runs: 0 }, policy: { subscription: { grace_period_days: 0 } },
          metadata: { site_limit: 5, max_vector_documents: 0, max_media_images: 0, max_batch_items: 0 },
        },
        sales_offer: { amount: price, currency: 'CNY', status: 'active' },
        tier_summary: {
          tier_id: 'pro', package_alias: 'Pro', monthly_included_points: points, site_limit: 5,
          max_vector_documents: 0, max_media_images: 0, max_batch_items: 0, feature_groups: [],
          canonical_shell: { budgets: {}, concurrency: {}, policy: {}, metadata: {} },
        }, package_fit_cues: [], subscriptions: [],
      }) });
    });
    await page.goto('/admin/plans?focus=pro');
    const dialog = page.locator('[data-ui="admin-workbench-dialog"]');
    const inputs = dialog.locator('input[type="number"]');
    const save = dialog.getByRole('button', { name: /^Save$|^保存$/ });
    const screenshot = async (state: string) => {
      const themeSuffix = colorScheme === 'dark' ? '-dark' : '';
      const path = evidenceRoot ? `${evidenceRoot}/pc-${width}${themeSuffix}-${state}.png` : testInfo.outputPath(`${state}.png`);
      if (evidenceRoot) await mkdir(evidenceRoot, { recursive: true });
      await page.screenshot({ path, fullPage: true });
      await testInfo.attach(state, { path, contentType: 'image/png' });
    };
    if (colorScheme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/);
    else await expect(page.locator('html')).not.toHaveClass(/dark/);
    await expect(inputs.nth(0)).toHaveValue('99');
    await expect(inputs.nth(1)).toHaveValue('10000');
    await screenshot('normal');
    await inputs.nth(0).fill('88');
    points = 20000; currentRevision = revision('b');
    await save.click();
    const conflict = dialog.locator('[data-ui="plan-revision-conflict"]');
    await expect(conflict).toBeVisible();
    await expect(inputs.nth(0)).toHaveValue('88');
    await expect(inputs.nth(1)).toHaveValue('10000');
    await expect(save).toBeDisabled();
    expect(submitted[0].revision).toBe(revision('a'));
    expect(writes).toBe(1);
    await screenshot('conflict');
    const readLatest = conflict.getByRole('button', { name: /Read latest|读取最新值/ });
    readFails = true;
    await readLatest.click();
    await expect(dialog.getByRole('alert').filter({ hasText: /Failed to load|加载数据失败/ })).toBeVisible();
    await expect(inputs.nth(0)).toHaveValue('88');
    await expect(save).toBeDisabled();
    readFails = false;
    const beforeRead = reads;
    await readLatest.click();
    await expect(conflict).toContainText('20000');
    await expect(inputs.nth(0)).toHaveValue('88');
    await expect(inputs.nth(1)).toHaveValue('10000');
    await expect(save).toBeDisabled();
    expect(reads).toBe(beforeRead + 1);
    expect(writes).toBe(1);
    await screenshot('read-retains-draft');
    await conflict.getByRole('button', { name: /Discard draft|放弃草稿/ }).click();
    await expect(inputs.nth(1)).toHaveValue('20000');
    await expect(inputs.nth(0)).toHaveValue('99');
    await inputs.nth(0).fill('88.88');
    await save.click();
    await expect(inputs.nth(0)).toHaveValue('88.88');
    await expect(save).toBeEnabled();
    expect(submitted[1].revision).toBe(revision('b'));
    expect(submitted[1].monthly_included_points).toBe(20000);
    expect(writes).toBe(2);
    expect(points).toBe(20000);
    await expect(conflict).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await screenshot('saved');
  });
}
