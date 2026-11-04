import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/env', () => ({ getApiBaseUrl: () => 'http://api:8000' }));
vi.mock('@/lib/server-env', () => ({ getInternalAuthToken: () => 'test-internal-token' }));
import { POST, PATCH } from '@/app/api/admin/[...path]/route';

afterEach(() => vi.unstubAllGlobals());
function backend(canManage: boolean) {
  const mock = vi.fn(async (url: string) => new Response(JSON.stringify({
    status: 'ok', data: url.endsWith('/admin/session') ? {
      principal_id: 'admin', identity_type: 'platform_admin', role: 'platform_admin',
      auth_mode: 'session', capabilities: { can_manage_catalog: canManage },
    } : { test_id: 'model_test_1' }, meta: {},
  }), { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', mock);
  return mock;
}
const context = { params: Promise.resolve({ path: ['provider-connections', 'local', 'model-tests'] }) };
function request(method = 'POST') {
  return new NextRequest('https://cloud.test/api/admin/provider-connections/local/model-tests', {
    method, headers: { cookie: 'npcink_admin_session_token=test', 'content-type': 'application/json' },
    body: JSON.stringify({ model_id: 'model', prompt: 'hello' }),
  });
}
it('requires catalog-management permission for model tests', async () => {
  const mock = backend(false);
  expect((await POST(request(), context)).status).toBe(403);
  expect(mock).toHaveBeenCalledOnce();
});
it('forwards only the declared POST and attaches the internal credential', async () => {
  const mock = backend(true);
  expect((await POST(request(), context)).status).toBe(200);
  expect(mock).toHaveBeenLastCalledWith(
    'http://api:8000/internal/service/admin/provider-connections/local/model-tests',
    expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'X-Npcink-Internal-Token': 'test-internal-token' }) }),
  );
  expect((await PATCH(request('PATCH'), context)).status).toBe(404);
});
