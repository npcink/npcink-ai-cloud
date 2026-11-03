import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/env', () => ({ getApiBaseUrl: () => 'http://api:8000' }));
vi.mock('@/lib/server-env', () => ({ getInternalAuthToken: () => 'test-internal-token' }));
import { GET, POST } from '@/app/api/admin/[...path]/route';
afterEach(() => vi.unstubAllGlobals());
const id = `notice_${'a'.repeat(32)}`;

it.each([
  ['GET', 'customer-notifications'], ['POST', 'customer-notifications'],
  ['GET', `customer-notifications/${id}`], ['POST', `customer-notifications/${id}/send`],
] as const)('gates %s %s by account-management capability', async (method, suffix) => {
  for (const allowed of [false, true]) {
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify({
      status: 'ok', data: url.endsWith('/admin/session') ? {
        principal_id: 'admin-test', identity_type: 'platform_admin', role: 'platform_admin',
        auth_mode: 'session', capabilities: { can_manage_accounts: allowed },
      } : {}, meta: {},
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const path = suffix.split('/');
    const response = await (method === 'GET' ? GET : POST)(new NextRequest(`https://cloud.test/api/admin/${suffix}`, {
      method, headers: { cookie: 'npcink_admin_session_token=test', 'Idempotency-Key': id },
      ...(method === 'POST' ? { body: '{}' } : {}),
    }), { params: Promise.resolve({ path }) });
    expect(response.status).toBe(allowed ? 200 : 403);
    expect(fetchMock).toHaveBeenCalledTimes(allowed ? 2 : 1);
    if (allowed) expect(fetchMock).toHaveBeenLastCalledWith(
      `http://api:8000/internal/service/admin/${suffix}`, expect.objectContaining({ method }),
    );
  }
});
