import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxyPortalBackendPath } from '@/app/api/portal/_shared';

const options = { unreachableCode: 'proxy.portal_backend_unreachable', unreachableMessage: 'Portal backend is unavailable' };
const envelope = { status: 'ok', error_code: '', message: 'loaded', data: {}, meta: { trace_id: '', revision: 'm6' } };

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Portal activity request evidence', () => {
  it.each(['audit-summary', 'audit-events'])('binds %s response and backend trace headers with a new reference per read', async (endpoint) => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json(envelope)));
    vi.stubGlobal('fetch', fetchMock);
    const request = new NextRequest(`http://localhost/api/portal/account/${endpoint}?site_id=site-a`, {
      headers: { cookie: 'npcink_portal_session=fixture', traceparent: `00-${'f'.repeat(32)}-${'f'.repeat(16)}-01` },
    });
    const first = await proxyPortalBackendPath(request, `/portal/v1/account/${endpoint}`, options);
    const second = await proxyPortalBackendPath(request, `/portal/v1/account/${endpoint}`, options);
    const reference = first.headers.get('x-request-id');
    expect(reference).toMatch(/^[0-9a-f]{32}$/);
    expect(second.headers.get('x-request-id')).not.toBe(reference);
    const sent = new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers);
    expect(sent.get('traceparent')).toMatch(new RegExp(`^00-${reference}-[0-9a-f]{16}-00$`));
    expect(sent.get('cookie')).toBe('npcink_portal_session=fixture');
    expect(String(fetchMock.mock.calls[0][0])).toContain('?site_id=site-a');
    expect(await first.json()).toEqual(envelope);
  });

  it.each([
    ['unreachable', () => Promise.reject(new Error('private connection detail')), 502],
    ['timeout', () => Promise.reject(new DOMException('private timeout detail', 'TimeoutError')), 504],
    ['invalid JSON', () => Promise.resolve(new Response('{private', { headers: { 'content-type': 'application/json' } })), 502],
  ])('keeps a reference and redacts %s failures', async (_name, result, status) => {
    const fetchMock = vi.fn().mockImplementation(result);
    vi.stubGlobal('fetch', fetchMock);
    const log = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const response = await proxyPortalBackendPath(new NextRequest('http://localhost/api/portal/account/audit-summary'), '/portal/v1/account/audit-summary', options);
    expect(response.status).toBe(status);
    const reference = response.headers.get('x-request-id');
    expect(reference).toMatch(/^[0-9a-f]{32}$/);
    expect(new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers).get('traceparent')).toContain(`-${reference}-`);
    const body = await response.json();
    expect(body.status).toBe('error');
    expect(JSON.stringify(body)).not.toContain('private');
    expect(log).toHaveBeenCalledWith('[portal-activity-read]', expect.objectContaining({ request_reference: reference }));
    expect(JSON.stringify(log.mock.calls)).not.toContain('private');
  });

  it('preserves a real backend authorization rejection and its envelope evidence', async () => {
    const denied = { ...envelope, status: 'error', error_code: 'auth.site_not_found', meta: { trace_id: 'backend-trace', revision: 'm6' } };
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(denied, { status: 403 })));
    const response = await proxyPortalBackendPath(new NextRequest('http://localhost/api/portal/account/audit-events'), '/portal/v1/account/audit-events', options);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(denied);
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f]{32}$/);
  });

  it.each([['GET', '/portal/v1/session'], ['POST', '/portal/v1/account/audit-events']])('leaves unrelated %s %s requests unchanged', async (method, path) => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(envelope));
    vi.stubGlobal('fetch', fetchMock);
    const response = await proxyPortalBackendPath(new NextRequest(`http://localhost${path}`, { method }), path, options);
    expect(response.headers.has('x-request-id')).toBe(false);
    expect(new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers).has('traceparent')).toBe(false);
  });
});
