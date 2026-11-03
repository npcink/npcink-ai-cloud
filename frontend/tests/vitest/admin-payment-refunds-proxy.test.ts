import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/env', () => ({ getApiBaseUrl: () => 'http://api:8000' }));
vi.mock('@/lib/server-env', () => ({ getInternalAuthToken: () => 'test-internal-token' }));
import { GET, POST } from '@/app/api/admin/[...path]/route';

afterEach(() => vi.unstubAllGlobals());

function backend(allowed: boolean) {
  const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify({
    status: 'ok', data: url.endsWith('/admin/session') ? {
      principal_id: 'admin-refund', identity_type: 'platform_admin', role: 'platform_admin',
      auth_mode: 'session', capabilities: { can_manage_billing: allowed },
    } : { items: [] }, meta: {},
  }), { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function call(path: string[], write: boolean) {
  const request = new NextRequest(`https://cloud.test/api/admin/${path.join('/')}`, {
    method: write ? 'POST' : 'GET',
    headers: { cookie: 'npcink_admin_session_token=admin-test', 'content-type': 'application/json', 'Idempotency-Key': 'operator-refund-test' },
    ...(write ? { body: JSON.stringify({ reason: 'test refund' }) } : {}),
  });
  return (write ? POST : GET)(request, { params: Promise.resolve({ path }) });
}

it.each([false, true])('checks billing capability before forwarding (write=%s)', async write => {
  const fetchMock = backend(false);
  const path = ['accounts', 'acct_test', 'payment-orders', ...(write ? ['order_test', 'refunds'] : [])];
  expect((await call(path, write)).status).toBe(403);
  expect(fetchMock).toHaveBeenCalledOnce();
});

it.each([false, true])('forwards only the exact account order contract (write=%s)', async write => {
  const fetchMock = backend(true);
  const path = ['accounts', 'acct_test', 'payment-orders', ...(write ? ['order_test', 'refunds'] : [])];
  expect((await call(path, write)).status).toBe(200);
  expect(fetchMock).toHaveBeenLastCalledWith(
    `http://api:8000/internal/service/admin/${path.join('/')}`,
    expect.objectContaining({ method: write ? 'POST' : 'GET' }),
  );
});

it.each([
  ['accounts', 'acct_test', 'payment-orders', 'order_test', 'mark-paid'],
  ['payments', 'refunds', 'refund_test', 'mark-succeeded'],
  ['accounts', 'acct_test', 'payment-orders', 'order_test', 'refunds', 'raw'],
])('keeps manual settlement and undeclared routes closed: %s', async (...path) => {
  const fetchMock = backend(true);
  expect((await call(path, true)).status).toBe(404);
  expect(fetchMock).toHaveBeenCalledOnce();
});
