import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxyPortalBackendPath } from '@/app/api/portal/_shared';
import { GET, POST } from '@/app/api/portal/[...path]/route';
import { proxy } from '@/proxy';
import { readInstallationState } from '@/lib/installation-state';

vi.mock('@/lib/installation-state', () => ({ readInstallationState: vi.fn() }));
const options = { unreachableCode: 'proxy.portal_get_unreachable', unreachableMessage: 'Portal unavailable' };
const envelope = { status: 'ok', error_code: '', message: 'ok', data: { revoked_count: 1 }, meta: { trace_id: 'backend-ref', revision: 'm7' } };
const request = (path = 'sessions', method = 'GET') => new NextRequest(`http://localhost/api/portal/${path}`, {
  method, headers: { cookie: 'npcink_portal_session_token=fixture', authorization: 'Bearer fixture', origin: 'http://localhost', 'idempotency-key': 'actual_intent_key' },
});
function privateResponse(response: Response) {
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('pragma')).toBe('no-cache');
  expect(response.headers.get('vary')?.toLowerCase()).toContain('cookie');
  expect(response.headers.get('vary')?.toLowerCase()).toContain('authorization');
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('own sessions BFF boundary', () => {
  it('forwards the query, credentials and original key and preserves multiple clearing cookies', async () => {
    const headers = new Headers({ 'content-type': 'application/json', vary: 'Accept-Language', 'cache-control': 'private, no-store', pragma: 'no-cache' });
    headers.append('set-cookie', 'npcink_portal_session_token=; Path=/; Max-Age=0');
    headers.append('set-cookie', 'npcink_portal_site=; Path=/; Max-Age=0');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(envelope), { headers }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(request('sessions?limit=10&offset=20'), { params: Promise.resolve({ path: ['sessions'] }) });
    expect(String(fetchMock.mock.calls[0][0])).toContain('/portal/v1/sessions?limit=10&offset=20');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const forwarded = new Headers(init.headers);
    expect(init.cache).toBe('no-store');
    expect(forwarded.get('cookie')).toBe('npcink_portal_session_token=fixture');
    expect(forwarded.get('authorization')).toBe('Bearer fixture');
    expect(forwarded.get('origin')).toBe('http://localhost');
    expect(forwarded.get('idempotency-key')).toBe('actual_intent_key');
    privateResponse(response);
    expect(response.headers.get('vary')).toContain('Accept-Language');
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(await response.json()).toEqual(envelope);
  });

  it('encodes target segments and does not generate a missing write key', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json(envelope))); vi.stubGlobal('fetch', fetchMock);
    const req = request('sessions/sid/revoke', 'POST'); req.headers.delete('idempotency-key');
    await POST(req, { params: Promise.resolve({ path: ['sessions', 'sid/with?#', 'revoke'] }) });
    expect(String(fetchMock.mock.calls[0][0])).toContain('/portal/v1/sessions/sid%2Fwith%3F%23/revoke');
    expect(new Headers(fetchMock.mock.calls[0][1].headers).has('idempotency-key')).toBe(false);
  });

  it('preserves HEAD status without trying to parse an intentionally empty body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200, headers: { 'content-type': 'application/json', vary: 'Accept-Language' } })));
    const response = await proxyPortalBackendPath(request('sessions', 'HEAD'), '/portal/v1/sessions', options);
    expect(response.status).toBe(200); expect(await response.text()).toBe(''); privateResponse(response);
    expect(response.headers.get('vary')).toContain('Accept-Language');
  });

  it.each([200, 400, 401, 403, 404, 405, 503])('preserves backend %s and envelope while making the final response private', async (status) => {
    const body = status === 200 ? envelope : { ...envelope, status: 'error', error_code: 'portal.sessions_unavailable' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body, { status })));
    const response = await proxyPortalBackendPath(request(), '/portal/v1/sessions', options);
    expect(response.status).toBe(status); privateResponse(response); expect(await response.json()).toEqual(body);
  });

  it.each([
    ['network', () => Promise.reject(new Error('PRIVATE connection detail')), 502],
    ['timeout', () => Promise.reject(new DOMException('PRIVATE timeout', 'TimeoutError')), 504],
    ['JSON', () => Promise.resolve(new Response('{PRIVATE', { headers: { 'content-type': 'application/json', 'set-cookie': 'npcink_portal_session_token=; Max-Age=0' } })), 502],
    ['HTML', () => Promise.resolve(new Response('<html>PRIVATE</html>')), 502],
  ])('keeps %s failures private and bounded without losing a received clearing cookie', async (kind, value, status) => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(value));
    const response = await proxyPortalBackendPath(request(), '/portal/v1/sessions/revoke-others', options);
    expect(response.status).toBe(status); privateResponse(response);
    expect(JSON.stringify(await response.json())).not.toContain('PRIVATE');
    if (kind === 'JSON') expect(response.headers.getSetCookie()).toHaveLength(1);
  });

  it.each(['HEAD', 'OPTIONS', 'PATCH'])('sets private headers on %s proxy pass-through for generated framework responses', async (method) => {
    vi.mocked(readInstallationState).mockResolvedValue({ ok: true, installationState: 'complete', setupRevision: 'v1', retryAllowed: false });
    privateResponse(await proxy(request('sessions', method)));
  });

  it('covers an installation early rejection and leaves adjacent routes untouched', async () => {
    vi.mocked(readInstallationState).mockResolvedValue({ ok: false });
    const response = await proxy(request()); expect(response.status).toBe(503); privateResponse(response);
    vi.mocked(readInstallationState).mockResolvedValue({ ok: true, installationState: 'complete', setupRevision: 'v1', retryAllowed: false });
    expect((await proxy(request('sessions-other'))).headers.has('pragma')).toBe(false);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(Response.json(envelope))));
    expect((await proxyPortalBackendPath(request(), '/portal/v1/session', options)).headers.has('pragma')).toBe(false);
    expect((await proxyPortalBackendPath(request(), '/portal/v1/sessions-other', options)).headers.has('pragma')).toBe(false);
  });
});
