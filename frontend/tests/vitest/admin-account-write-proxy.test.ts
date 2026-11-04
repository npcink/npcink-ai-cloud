import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/env', () => ({ getApiBaseUrl: () => 'http://api:8000' }));
vi.mock('@/lib/server-env', () => ({ getInternalAuthToken: () => 'test-internal-token' }));
import { GET, PATCH, POST } from '@/app/api/admin/[...path]/route';

afterEach(() => vi.unstubAllGlobals());

it.each([
  ['PATCH', 'operator-profile', 'can_manage_accounts'],
  ['GET', 'credit-ledger/adjustments/op_123', 'can_manage_billing'],
] as const)('requires the existing capability for %s %s', async (method, suffix, capability) => {
  for (const allowed of [false, true]) {
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify({
      status: 'ok', data: url.endsWith('/admin/session') ? {
        principal_id: 'admin-credit', identity_type: 'platform_admin', role: 'platform_admin',
        auth_mode: 'session', capabilities: { [capability]: allowed },
      } : {}, meta: {},
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const path = ['accounts', 'acct_test', ...suffix.split('/')];
    const response = await (method === 'GET' ? GET : PATCH)(new NextRequest(`https://cloud.test/api/admin/${path.join('/')}`, {
      method, headers: { cookie: 'npcink_admin_session_token=admin-test', 'Idempotency-Key': 'op_123' },
      ...(method === 'PATCH' ? { body: JSON.stringify({ operator_note: 'x' }) } : {}),
    }), { params: Promise.resolve({ path }) });
    expect(response.status).toBe(allowed ? 200 : 403);
    expect(fetchMock).toHaveBeenCalledTimes(allowed ? 2 : 1);
    if (allowed) expect(fetchMock).toHaveBeenLastCalledWith(
      `http://api:8000/internal/service/admin/${path.join('/')}`,
      expect.objectContaining({ method }),
    );
  }
});

it('does not expose a write to the confirmation resource', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: 'ok', data: {
    principal_id: 'admin-credit', identity_type: 'platform_admin', role: 'platform_admin', auth_mode: 'session',
    capabilities: { can_manage_billing: true },
  } }), { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  const path = ['accounts', 'acct_test', 'credit-ledger', 'adjustments', 'op_123'];
  const response = await POST(new NextRequest(`https://cloud.test/api/admin/${path.join('/')}`, {
    method: 'POST', headers: { cookie: 'npcink_admin_session_token=admin-test' }, body: '{}',
  }), { params: Promise.resolve({ path }) });
  expect(response.status).toBe(404);
  expect(fetchMock).toHaveBeenCalledOnce();
});
