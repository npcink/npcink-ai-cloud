import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('@/lib/env', () => ({ getApiBaseUrl: () => 'http://api:8000' }));
vi.mock('@/lib/server-env', () => ({ getInternalAuthToken: () => 'test-internal-token' }));
import { GET, PATCH, POST } from '@/app/api/admin/[...path]/route';
afterEach(() => vi.unstubAllGlobals());
it('requires existing site management capability, preserves the exact GET and blocks writes', async () => {
  for (const allowed of [false, true]) {
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify({ status: 'ok', data: url.endsWith('/admin/session') ? {
      principal_id: 'admin', identity_type: 'platform_admin', role: 'platform_admin', auth_mode: 'session', capabilities: { can_manage_accounts: allowed, can_review_diagnostics: true },
    } : {} }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const path = ['sites', 'site_a', 'operations', 'op_a'];
    const url = 'https://cloud.test/api/admin/sites/site_a/operations/op_a?action=reset';
    const response = await GET(new NextRequest(url, { headers: { cookie: 'npcink_admin_session_token=test' } }), { params: Promise.resolve({ path }) });
    expect(response.status).toBe(allowed ? 200 : 403);
    expect(fetchMock).toHaveBeenCalledTimes(allowed ? 2 : 1);
    if (allowed) expect(fetchMock).toHaveBeenLastCalledWith('http://api:8000/internal/service/admin/sites/site_a/operations/op_a?action=reset', expect.objectContaining({ method: 'GET' }));
    for (const handler of [POST, PATCH]) {
      const write = await handler(new NextRequest(url, { method: handler === POST ? 'POST' : 'PATCH', headers: { cookie: 'npcink_admin_session_token=test' }, body: '{}' }), { params: Promise.resolve({ path }) });
      expect(write.status).toBe(404);
    }
  }
});
