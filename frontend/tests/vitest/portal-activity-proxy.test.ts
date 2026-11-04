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
    ['invalid JSON', () => Promise.resolve(new Response('{private', { status: 502, headers: { 'content-type': 'application/json' } })), 502],
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
    expect(log).toHaveBeenCalledOnce();
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

it.each([[429, ' 4 '], [503, 'Tue, 01 Jan 2030 00:00:10 GMT']] as const)('[F02-15] forwards actual upstream %s timing with a fresh reference', async (status, timing) => {
  const body = { ...envelope, status: 'error' };
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const fetchMock = vi.fn().mockImplementation(async () => Response.json(body, { status, headers: { 'Retry-After': timing } })); vi.stubGlobal('fetch', fetchMock);
  const request = new NextRequest('http://localhost/api/portal/account/audit-summary?site_id=a', { headers: { cookie: 'fixture' } });
  const first = await proxyPortalBackendPath(request, '/portal/v1/account/audit-summary', options);
  const second = await proxyPortalBackendPath(request, '/portal/v1/account/audit-summary', options);
  expect(first.status).toBe(status); expect(await first.json()).toEqual(body);
  expect(first.headers.get('retry-after')).toBe(timing.trim()); expect(second.headers.get('x-request-id')).not.toBe(first.headers.get('x-request-id'));
  expect(new Headers(fetchMock.mock.calls[0][1].headers).get('cookie')).toBe('fixture');
  expect(String(fetchMock.mock.calls[0][0])).toContain('?site_id=a');
});

it.each(['network', 'timeout', 'json', 'private-body', 'long', 'crlf', 'nul', 'request-only'])('[F02-18] never invents or replays unsafe timing for %s', async (kind) => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const isPrivate = kind === 'private-body';
  const response = new Response(kind === 'json' || isPrivate ? '{PRIVATE' : JSON.stringify(envelope), { headers: { 'content-type': 'application/json' } });
  if (kind === 'json' || isPrivate) response.headers.set('Retry-After', '4');
  if (['long', 'crlf', 'nul'].includes(kind)) {
    const original = response.headers.get.bind(response.headers);
    vi.spyOn(response.headers, 'get').mockImplementation((key) => key.toLowerCase() === 'retry-after' ? ({ long: '4'.repeat(129), crlf: '4\r\nInjected: true', nul: '4\0' }[kind] || '') : original(key));
  }
  const fetchMock = vi.fn().mockImplementation(async () => {
    if (kind === 'network') throw new Error('PRIVATE');
    if (kind === 'timeout') throw new DOMException('PRIVATE', 'TimeoutError');
    return response;
  }); vi.stubGlobal('fetch', fetchMock);
  const path = isPrivate ? '/portal/v1/sessions' : '/portal/v1/account/audit-summary';
  const result = await proxyPortalBackendPath(new NextRequest('http://localhost/api/portal/account/audit-summary', { headers: { 'Retry-After': '5' } }), path, options);
  expect(result.headers.has('retry-after')).toBe(false);
  expect(new Headers(fetchMock.mock.calls[0][1].headers).has('retry-after')).toBe(false);
  expect(result.status).toBe(kind === 'timeout' ? 504 : ['network', 'json', 'private-body'].includes(kind) ? 502 : 200);
});
