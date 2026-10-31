import { expect, type Page, type Route } from '@playwright/test';
import { test } from './helpers/critical-network-fixture';
import { buildAdminApiEnvelope as ok, buildAdminApiErrorEnvelope as failure, installAdminMocks } from './helpers/admin-operator-fixture';

const installedPages = new WeakSet<Page>();
async function installOnce(page: Page) {
  if (installedPages.has(page)) return;
  await installAdminMocks(page);
  installedPages.add(page);
}

function vectorProfile() {
  return {
    profile_id: 'site-knowledge.zh.v1', model_id: 'BAAI/bge-m3', dimensions: 1024, metric: 'COSINE',
    production_backend: 'zilliz_cloud', local_test_backend: 'postgres_json', active_backend: 'postgres_json',
    status: 'reindex_required', editable_fields: ['credential', 'zilliz_endpoint', 'zilliz_token'], reindex_policy: 'profile_change_requires_reindex',
    provider: { provider_id: 'siliconflow', display_name: 'SiliconFlow', connection_id: 'embedding', configured: true, verified: true, status: 'ready', last_tested_at: '2026-10-31T10:00:00Z' },
    vector_store: { provider_id: 'zilliz', display_name: 'Zilliz', connection_id: 'store', configured: true, verified: true, status: 'ready', settings_owner: 'cloud_admin', endpoint: 'https://saved.example.zilliz.com', token_configured: true, collection: 'site_knowledge_zh_v1', last_tested_at: '2026-10-31T10:00:00Z' },
    validation: {
      connection: { status: 'ready', provider_verified: true, vector_store_verified: true },
      index: { status: 'reindex_required', reason: 'embedding_provider_changed', embedding_space_id: 'test', source_document_count: 2, source_chunk_count: 6, indexed_chunk_count: 0, roundtrip_status: 'pending', last_reindexed_at: '', last_error_code: '' },
      retrieval: { status: 'pending', last_verified_at: '', result_count: 0, top1_score: 0, evidence_source: 'site_knowledge_search_metric' },
    },
  };
}
function connection(provider = 'tavily') {
  return { connection_id: `external_${provider}`, provider_id: provider, provider_type: 'web_search_provider', kind: 'web_search_provider', display_name: provider, enabled: true, configured: true, status: 'ready', base_url: 'https://example.test', source_role: 'execution_source', capability_ids: ['web_search'], runtime_profile_ids: ['web-search.managed'], config: {}, metadata: {} };
}
async function capture(page: Page, path: string, fullPage = true) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path, fullPage });
}
const save = (page: Page) => page.getByRole('button', { name: /^(Save configuration|保存配置)$/ }).click();
const receipt = (page: Page) => page.locator('[data-ui="vector-configuration-save-receipt"]');
const configure = async (page: Page, provider = 'tavily') => {
  await page.locator(`[data-external-service-id="${provider}"]`).getByRole('button', { name: /^(Configure|配置)$/ }).click();
  return page.getByRole('dialog');
};
async function vectorHarness(page: Page, fault?: (route: Route, state: VectorState) => Promise<boolean>) {
  await installOnce(page);
  const state = { profile: vectorProfile(), reads: 0, writes: [] as { path: string; body: Record<string, unknown> }[], failRead: false };
  await page.route('**/api/admin/site-knowledge-vector-profile**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET') {
      state.reads++;
      await route.fulfill({ status: state.failRead ? 503 : 200, json: state.failRead ? failure('Read unavailable', 'test.read_failed') : ok(state.profile) });
      return;
    }
    state.writes.push({ path, body: request.postDataJSON() });
    if (await fault?.(route, state)) return;
    if (path.endsWith('/vector-store')) state.profile.vector_store.endpoint = String(request.postDataJSON().endpoint);
    if (path.endsWith('/index-rebuilds')) state.profile.validation.index.status = 'awaiting_site_sync';
    await route.fulfill({ json: ok(state.profile) });
  });
  return state;
}
type VectorState = { profile: ReturnType<typeof vectorProfile>; reads: number; writes: { path: string; body: Record<string, unknown> }[]; failRead: boolean };

async function externalHarness(page: Page) {
  await installOnce(page);
  const state = { connections: [connection()] as unknown, writes: [] as Record<string, unknown>[] };
  await page.route('**/api/admin/provider-connections**', async route => {
    if (route.request().method() === 'GET') { await route.fulfill({ json: ok({ connections: state.connections }) }); return; }
    const body = route.request().postDataJSON();
    state.writes.push(body);
    state.connections = [connection(), { ...connection(String(body.provider_id)), ...body, configured: true }];
    await route.fulfill({ json: ok({}) });
  });
  return state;
}

test('S01 Reader submits a legal connection role and retains its independent enhancement contract', async ({ page }) => {
  const state = await externalHarness(page);
  await page.goto('/admin/external-services');
  let dialog = await configure(page, 'jina_reader');
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: /^(Save|保存)$/ }).click();
  await expect(dialog).toHaveCount(0);
  dialog = await configure(page, 'jina_reader');
  await dialog.getByRole('checkbox').uncheck();
  await dialog.getByRole('button', { name: /^(Save|保存)$/ }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.writes.map(body => body.enabled)).toEqual([true, false]);
  for (const body of state.writes) expect(body).toMatchObject({ source_role: 'execution_source', capability_ids: ['web_search'], runtime_profile_ids: ['web-search.reader'], secretless: true, metadata: { service_role: 'enhancer' } });
});

test('S02 service draft survives cancelled refresh, history and link navigation', async ({ page }, testInfo) => {
  await vectorHarness(page);
  const state = await externalHarness(page);
  await page.goto('/admin/vector-settings');
  await page.getByRole('link', { name: /^(Search & images|搜索与图片)$/ }).click();
  const dialog = await configure(page);
  await dialog.getByRole('button', { name: /^(Replace credential|替换凭据)$/ }).click();
  await dialog.getByLabel(/API [Kk]ey \/ [Tt]oken/).fill('test-unsaved-key');
  let native = 0;
  page.on('dialog', async item => { native++; await item.dismiss(); });
  await page.reload({ waitUntil: 'commit', timeout: 3000 }).catch(() => {});
  expect(native).toBe(1);
  await expect(dialog.getByLabel(/API [Kk]ey \/ [Tt]oken/)).toHaveValue('test-unsaved-key');
  await page.goBack({ waitUntil: 'commit' });
  const confirmation = page.getByRole('dialog', { name: /Discard unsaved changes|放弃未保存的修改/ });
  await expect(confirmation).toBeVisible();
  await capture(page, testInfo.outputPath('external-draft-navigation-confirmation.png'), false);
  await confirmation.getByRole('button', { name: /Keep editing|继续编辑/ }).click();
  await expect(dialog.getByLabel(/API [Kk]ey \/ [Tt]oken/)).toHaveValue('test-unsaved-key');
  await page.keyboard.press('Escape');
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: /Keep editing|继续编辑/ }).click();
  await dialog.getByRole('button', { name: /^(Cancel replacement|取消替换)$/ }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.getByRole('link', { name: /^(Site vector|站点向量)$/ }).click();
  await expect(page).toHaveURL(/vector-settings/);
  expect(state.writes).toEqual([]);
});

for (const provider of ['bocha', 'tavily']) test(`S03 ${provider} rejects blank new or replacement credentials before any write`, async ({ page }) => {
  const state = await externalHarness(page);
  await page.goto('/admin/external-services');
  const dialog = await configure(page, provider);
  if (provider === 'tavily') await dialog.getByRole('button', { name: /Replace credential|替换凭据/ }).click();
  await dialog.getByLabel(/API [Kk]ey \/ [Tt]oken/).fill('   ');
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: /^(Save|保存)$/ }).click();
  await expect(dialog.getByRole('alert')).toContainText(/whitespace|空白/);
  expect(state.writes).toEqual([]);
});

for (const record of [null, { ...connection(), configured: undefined }]) test(`S04 malformed directory ${record ? 'missing field' : 'null entry'} stays recoverable`, async ({ page }) => {
  const state = await externalHarness(page);
  state.connections = [record];
  await page.goto('/admin/external-services');
  await expect(page.getByRole('heading', { name: /Search & images|搜索与图片/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Retry|重试/ })).toBeVisible();
  await expect(page.locator('[data-ui="external-service-table"]')).toHaveCount(0);
  state.connections = [connection()];
  await page.getByRole('button', { name: /Retry|重试/ }).click();
  await expect(page.locator('[data-external-service-id="tavily"]')).toBeVisible();
  expect(state.writes).toEqual([]);
});

test('V01 real vector drafts protect links, history and refresh, while cancel/discard stay explicit', async ({ page }, testInfo) => {
  const state = await vectorHarness(page);
  await externalHarness(page);
  await page.goto('/admin/external-services');
  await page.getByRole('link', { name: /^(Site vector|站点向量)$/ }).click();
  const endpoint = page.getByLabel('Zilliz Endpoint', { exact: true });
  await endpoint.fill('https://draft.example.zilliz.com');
  await page.getByRole('link', { name: /Open vector diagnostics|查看向量诊断/ }).click();
  const confirmation = page.getByRole('dialog', { name: /Discard unsaved changes|放弃未保存的修改/ });
  await expect(confirmation).toBeVisible();
  await capture(page, testInfo.outputPath('vector-draft-navigation-confirmation.png'), false);
  await page.keyboard.press('Escape');
  await expect(endpoint).toHaveValue('https://draft.example.zilliz.com');
  await page.goBack({ waitUntil: 'commit' });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: /Keep editing|继续编辑/ }).click();
  let native = 0;
  page.on('dialog', async item => { native++; await item.dismiss(); });
  await page.reload({ waitUntil: 'commit', timeout: 3000 }).catch(() => {});
  expect(native).toBe(1);
  await expect(endpoint).toHaveValue('https://draft.example.zilliz.com');
  await page.getByRole('link', { name: /^(Search & images|搜索与图片)$/ }).click();
  await confirmation.getByRole('button', { name: /Discard and leave|放弃修改并离开/ }).click();
  await expect(page).toHaveURL(/external-services/);
  expect(state.writes).toEqual([]);
});

for (const editAgain of [false, true]) test(`V02 partial save ${editAgain ? 'submits a later key before claiming completion' : 'retries only the unchanged failed store'}`, async ({ page }) => {
  let failStore = true;
  const state = await vectorHarness(page, async route => {
    if (route.request().url().endsWith('/vector-store') && failStore) {
      failStore = false;
      await route.fulfill({ status: 400, json: failure('Probe failed', 'site_knowledge_vector_profile.zilliz_probe_failed') });
      return true;
    }
    return false;
  });
  await page.goto('/admin/vector-settings');
  await page.getByRole('button', { name: /^(Replace key|替换密钥)$/ }).click();
  await page.getByLabel('SiliconFlow API Key', { exact: true }).fill('test-key-A');
  await save(page);
  await expect(page.getByRole('button', { name: /Retry vector store only|仅重试 Vector store/ })).toBeVisible();
  if (editAgain) {
    await page.getByRole('button', { name: /^(Replace key|替换密钥)$/ }).click();
    await page.getByLabel('SiliconFlow API Key', { exact: true }).fill('test-key-B');
    await expect(receipt(page)).not.toContainText(/Configuration saved|配置已保存/);
    await page.getByRole('button', { name: /Retry embedding and continue|重试 Embedding 并继续/ }).click();
  } else await page.getByRole('button', { name: /Retry vector store only|仅重试 Vector store/ }).click();
  await expect(receipt(page)).toContainText(/Configuration saved|配置已保存/);
  expect(state.writes.filter(write => !write.path.endsWith('/vector-store')).map(write => write.body.credential)).toEqual(editAgain ? ['test-key-A', 'test-key-B'] : ['test-key-A']);
  expect(state.writes.filter(write => write.path.endsWith('/vector-store'))).toHaveLength(2);
  await page.getByLabel('Zilliz Endpoint', { exact: true }).fill('https://later.example.zilliz.com');
  await expect(receipt(page)).not.toContainText(/Configuration saved|配置已保存/);
  await expect(page.locator('[data-ui="vector-unsaved-draft"]')).toBeVisible();
});

for (const operation of ['store', 'embedding', 'rebuild'] as const) test(`V03 lost ${operation} response confirms with GET only and blocks writes after read failure`, async ({ page }, testInfo) => {
  const state = await vectorHarness(page, async (route, current) => {
    const path = new URL(route.request().url()).pathname;
    if (operation === 'rebuild' && path.endsWith('/index-rebuilds')) current.profile.validation.index.status = 'awaiting_site_sync';
    else if (operation === 'store' && path.endsWith('/vector-store')) current.profile.vector_store.endpoint = String(route.request().postDataJSON().endpoint);
    else if (operation !== 'embedding' || path.endsWith('/vector-store')) return false;
    current.failRead = true;
    await route.abort('failed');
    return true;
  });
  await page.goto('/admin/vector-settings');
  if (operation === 'rebuild') await page.getByRole('button', { name: /Rebuild vector index|重建向量索引/ }).click();
  else {
    await page.getByLabel('Zilliz Endpoint', { exact: true }).fill('https://draft.example.zilliz.com');
    if (operation === 'embedding') {
      await page.getByRole('button', { name: /Replace key|替换密钥/ }).click();
      await page.getByLabel('SiliconFlow API Key', { exact: true }).fill('test-pending-key');
    }
    await save(page);
  }
  await expect.poll(() => state.reads).toBe(2);
  await expect(page.getByText(/The last read snapshot|以下为上次读取的快照/)).toBeVisible();
  await expect(page.getByRole('button', { name: /^(Save configuration|保存配置)$/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /^(Rebuild vector index|重建向量索引)$/ })).toBeDisabled();
  const writes = state.writes.length;
  await page.getByRole('button', { name: /Retry reading state|重试读取状态/ }).click();
  await expect.poll(() => state.reads).toBe(3);
  expect(state.writes).toHaveLength(writes);
  state.failRead = false;
  await page.getByRole('button', { name: /Retry reading state|重试读取状态/ }).click();
  await expect(page.getByText(/The last read snapshot|以下为上次读取的快照/)).toHaveCount(0);
  expect(state.writes).toHaveLength(writes);
  if (operation === 'rebuild') await expect(page.getByRole('button', { name: /Start automatic refresh|启动自动更新/ })).toBeDisabled();
  else await expect(receipt(page)).not.toContainText(/Configuration saved|配置已保存/);
  if (operation === 'embedding') await expect(page.getByLabel('SiliconFlow API Key', { exact: true })).toHaveValue('test-pending-key');
  await capture(page, testInfo.outputPath(`vector-${operation}-read-recovery.png`));
});

test('V04 a rebuild failure owns its retry even after a failed configuration save', async ({ page }) => {
  const state = await vectorHarness(page, async route => {
    const path = route.request().url();
    if (path.endsWith('/vector-store') || path.endsWith('/index-rebuilds')) {
      await route.fulfill({ status: 400, json: failure('Operation rejected', 'test.rejected') });
      return true;
    }
    return false;
  });
  await page.goto('/admin/vector-settings');
  await save(page);
  await expect(page.getByRole('button', { name: /Retry vector store only|仅重试 Vector store/ })).toBeVisible();
  await page.getByRole('button', { name: /^(Rebuild vector index|重建向量索引)$/ }).click();
  await page.getByRole('button', { name: /Retry index rebuild|重试索引重建/ }).click();
  await expect.poll(() => state.writes.length).toBe(4);
  expect(state.writes.map(write => write.path.split('/').at(-1))).toEqual(['site-knowledge-vector-profile', 'vector-store', 'index-rebuilds', 'index-rebuilds']);
});

for (const target of ['embedding', 'store', 'rebuild'] as const) test(`V05 malformed ${target} success retains the page and draft with GET-only recovery`, async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const state = await vectorHarness(page, async (route, current) => {
    const path = route.request().url();
    const matches = target === 'store' ? path.endsWith('/vector-store') : target === 'rebuild' ? path.endsWith('/index-rebuilds') : path.endsWith('/site-knowledge-vector-profile');
    if (!matches) return false;
    current.failRead = true;
    await route.fulfill({ json: ok({}) });
    return true;
  });
  await page.goto('/admin/vector-settings');
  await page.getByLabel('Zilliz Endpoint', { exact: true }).fill('https://draft.example.zilliz.com');
  if (target === 'embedding') {
    await page.getByRole('button', { name: /Replace key|替换密钥/ }).click();
    await page.getByLabel('SiliconFlow API Key', { exact: true }).fill('test-retained-key');
  }
  if (target === 'rebuild') await page.getByRole('button', { name: /Rebuild vector index|重建向量索引/ }).click();
  else await save(page);
  await expect.poll(() => state.reads).toBe(2);
  await expect(page.getByLabel('Zilliz Endpoint', { exact: true })).toHaveValue('https://draft.example.zilliz.com');
  if (target === 'embedding') await expect(page.getByLabel('SiliconFlow API Key', { exact: true })).toHaveValue('test-retained-key');
  await expect(page.locator('[data-vector-section="configuration"]')).toBeVisible();
  const count = state.writes.length;
  state.failRead = false;
  await page.getByRole('button', { name: /Retry reading state|重试读取状态/ }).click();
  await expect.poll(() => state.reads).toBe(3);
  expect(state.writes).toHaveLength(count);
  expect(errors).toEqual([]);
});

for (const width of [1440, 1056]) test(`V06 cancelling untouched replacements follows the latest endpoint at ${width}px PC`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 1050 });
  await page.clock.install();
  const state = await vectorHarness(page);
  state.profile.status = 'awaiting_site_sync';
  state.profile.validation.index.status = 'awaiting_site_sync';
  await page.goto('/admin/vector-settings');
  for (const replace of [/^(Replace key|替换密钥)$/, /^(Replace token|替换 Token)$/]) {
    await page.getByRole('button', { name: replace }).click();
    await page.getByRole('button', { name: /^(Cancel replacement|取消替换)$/ }).click();
  }
  await expect(page.locator('[data-ui="vector-unsaved-draft"]')).toHaveCount(0);
  state.profile.vector_store.endpoint = 'https://updated.example.zilliz.com';
  state.profile.status = 'reindex_required';
  state.profile.validation.index.status = 'reindex_required';
  await page.clock.runFor(15050);
  await expect(page.getByLabel('Zilliz Endpoint', { exact: true })).toHaveValue('https://updated.example.zilliz.com');
  await save(page);
  await expect(receipt(page)).toContainText(/Configuration saved|配置已保存/);
  expect(state.writes.find(write => write.path.endsWith('/vector-store'))?.body.endpoint).toBe('https://updated.example.zilliz.com');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await capture(page, testInfo.outputPath(`vector-pc-${width}.png`));
});

for (const field of ['key', 'token'] as const) test(`V01 ${field}-only draft protects navigation without inventing an endpoint change`, async ({ page }) => {
  const state = await vectorHarness(page);
  await page.goto('/admin/vector-settings');
  await page.getByRole('button', { name: field === 'key' ? /^(Replace key|替换密钥)$/ : /^(Replace token|替换 Token)$/ }).click();
  const input = page.getByLabel(field === 'key' ? 'SiliconFlow API Key' : 'Zilliz Token', { exact: true });
  await input.fill('test-real-draft');
  await page.getByRole('link', { name: /Open vector diagnostics|查看向量诊断/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Keep editing|继续编辑/ }).click();
  await expect(input).toHaveValue('test-real-draft');
  await expect(page.locator('[data-ui="vector-unsaved-draft"]')).toBeVisible();
  await page.getByRole('button', { name: /^(Cancel replacement|取消替换)$/ }).click();
  await expect(page.locator('[data-ui="vector-unsaved-draft"]')).toHaveCount(0);
  expect(state.writes).toEqual([]);
});

test('V03 a write deadline releases busy state into GET-only confirmation', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const state = await vectorHarness(page, async (route, current) => {
    if (!route.request().url().endsWith('/vector-store')) return false;
    current.failRead = true;
    await held;
    await route.abort('failed');
    return true;
  });
  try {
    await page.goto('/admin/vector-settings');
    await page.getByLabel('Zilliz Endpoint', { exact: true }).fill('https://pending.example.zilliz.com');
    await save(page);
    await expect(page.getByText(/The last read snapshot|以下为上次读取的快照/)).toBeVisible({ timeout: 17000 });
    await expect.poll(() => state.reads).toBe(2);
    await expect(receipt(page)).toContainText(/Result unconfirmed|结果待确认/);
    await expect(page.getByLabel('Zilliz Endpoint', { exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: /^(Save configuration|保存配置)$/ })).toBeDisabled();
    await page.getByRole('button', { name: /Retry reading state|重试读取状态/ }).click();
    await expect.poll(() => state.reads).toBe(3);
    expect(state.writes).toHaveLength(2);
  } finally { release(); }
});
