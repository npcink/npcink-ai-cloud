import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/env', () => ({ getApiBaseUrl: () => 'http://api:8000', getPublicBaseUrl: () => 'https://cloud.test' }));
vi.mock('@/lib/server-env', () => ({ getInternalAuthToken: () => 'test-only' }));

import { GET as session } from '@/app/admin/session/route';
import { GET as logout } from '@/app/admin/logout/route';
import { GET as directory } from '@/app/api/admin/[...path]/route';
import { GET as history } from '@/app/api/admin/advisor/ops-summary-history/route';
import { GET as value } from '@/app/api/admin/advisor/ops-summary-value/route';
import { GET as preview } from '@/app/api/admin/advisor/ops-summary-preview/route';
import { POST as review } from '@/app/api/admin/advisor/ops-summary-review/route';
import { requireAdminSessionData } from '@/app/api/admin/_shared';
import { proxySetupPath } from '@/app/api/setup/_shared';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const request = (path: string, method = 'GET') => new NextRequest(`https://cloud.test${path}`, { method });
const principal = () => new Response(JSON.stringify({ data: {
  principal_id: 'test-admin', identity_type: 'platform_admin', role: 'platform_admin', auth_mode: 'session',
  capabilities: { can_review_diagnostics: true },
} }), { headers: { 'content-type': 'application/json' } });

it.each([
  ['session discovery', () => session(request('/admin/session')), false],
  ['session authorization', () => requireAdminSessionData(request('/api/admin/overview')), false],
  ['logout confirmation', () => logout(request('/admin/logout')), false],
  ['Admin directory', () => directory(request('/api/admin/runtime-telemetry'), { params: Promise.resolve({ path: ['runtime-telemetry'] }) }), true],
  ['advisor history', () => history(request('/api/admin/advisor/ops-summary-history')), true],
  ['advisor value', () => value(request('/api/admin/advisor/ops-summary-value')), true],
  ['advisor preview', () => preview(request('/api/admin/advisor/ops-summary-preview')), true],
  ['advisor review', () => review(request('/api/admin/advisor/ops-summary-review', 'POST')), true],
] as const)('%s ends a stalled backend wait without issuing a success cookie', async (_name, call, authorizeFirst) => {
  const deadline = new AbortController();
  vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
  let waiting = false;
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    if (authorizeFirst && url.endsWith('/admin/session')) return Promise.resolve(principal());
    waiting = true;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    });
  }));
  const pending = call();
  await vi.waitFor(() => expect(waiting).toBe(true));
  deadline.abort(new DOMException('deadline', 'TimeoutError'));
  const response = await pending as Response;
  expect(response.status).toBe(502);
  expect(response.headers.get('set-cookie')).toBeNull();
  expect(await response.json()).toMatchObject({ status: 'error' });
});

it('session discovery also ends a stalled response body', async () => {
  const deadline = new AbortController();
  vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
  vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => Promise.resolve(new Response(new ReadableStream({
    start(controller) { init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason), { once: true }); },
  }), { headers: { 'content-type': 'application/json' } }))));
  const pending = session(request('/admin/session'));
  deadline.abort(new DOMException('deadline', 'TimeoutError'));
  expect((await pending).status).toBe(502);
});

it('installation forwarding bounds a stalled write and preserves its idempotency key', async () => {
  vi.useFakeTimers();
  const backend = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
  }));
  vi.stubGlobal('fetch', backend);
  const pending = proxySetupPath(new NextRequest('https://cloud.test/api/setup/install', {
    method: 'POST', body: '{}', headers: { 'content-type': 'application/json', 'idempotency-key': 'same-install-attempt' },
  }), ['install']);
  await vi.advanceTimersByTimeAsync(12_000);
  expect((await pending).status).toBe(502);
  expect(new Headers(backend.mock.calls[0][1]?.headers).get('idempotency-key')).toBe('same-install-attempt');
});
