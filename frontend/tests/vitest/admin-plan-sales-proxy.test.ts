import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/env', () => ({ getApiBaseUrl: () => 'http://api:8000' }));
vi.mock('@/lib/server-env', () => ({ getInternalAuthToken: () => 'test-internal-token' }));
import { PATCH, POST } from '@/app/api/admin/[...path]/route';

afterEach(() => vi.unstubAllGlobals());

function backend(canManage: boolean) {
  const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify({
    status: 'ok', data: url.endsWith('/admin/session') ? {
      principal_id: 'admin-sale', identity_type: 'platform_admin', role: 'platform_admin',
      auth_mode: 'session', capabilities: { can_manage_catalog: canManage },
    } : { offer_id: 'plus_monthly_v1', status: 'retired' }, meta: {},
  }), { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const context = { params: Promise.resolve({ path: ['plans', 'plus', 'sales'] }) };
function request(method = 'PATCH') {
  return new NextRequest('https://cloud.test/api/admin/plans/plus/sales', {
    method, headers: { cookie: 'npcink_admin_session_token=admin-test', 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'retired' }),
  });
}

it('requires catalog management before forwarding a sales change', async () => {
  const fetchMock = backend(false);
  expect((await PATCH(request(), context)).status).toBe(403);
  expect(fetchMock).toHaveBeenCalledOnce();
});

it('forwards an authorized sales change to the exact internal Admin route', async () => {
  const fetchMock = backend(true);
  expect((await PATCH(request(), context)).status).toBe(200);
  expect(fetchMock).toHaveBeenLastCalledWith(
    'http://api:8000/internal/service/admin/plans/plus/sales',
    expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'retired' }) }),
  );
});

it('does not open other methods or nested sales routes', async () => {
  const fetchMock = backend(true);
  expect((await POST(request('POST'), context)).status).toBe(404);
  expect((await PATCH(request(), {
    params: Promise.resolve({ path: ['plans', 'plus', 'sales', 'raw'] }),
  })).status).toBe(404);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});


it('requires catalog management before forwarding parameter writes and preserves revision/key', async () => {
  const planContext = { params: Promise.resolve({ path: ['plans', 'plus'] }) };
  const body = JSON.stringify({ revision: `plan-v1:${'a'.repeat(64)}`, sales_price_cny: 88.88 });
  const planRequest = () => new NextRequest('https://cloud.test/api/admin/plans/plus', {
    method: 'PATCH', headers: {
      cookie: 'npcink_admin_session_token=admin-test', 'content-type': 'application/json',
      'idempotency-key': 'plan-original-key',
    }, body,
  });
  const denied = backend(false);
  expect((await PATCH(planRequest(), planContext)).status).toBe(403);
  expect(denied).toHaveBeenCalledOnce();
  const allowed = backend(true);
  expect((await PATCH(planRequest(), planContext)).status).toBe(200);
  expect(allowed).toHaveBeenLastCalledWith(
    'http://api:8000/internal/service/admin/plans/plus', expect.objectContaining({
      method: 'PATCH', body, headers: expect.objectContaining({ 'Idempotency-Key': 'plan-original-key' }),
    })
  );
});
