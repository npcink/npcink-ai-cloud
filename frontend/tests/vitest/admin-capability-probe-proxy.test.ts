import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/env', () => ({ getApiBaseUrl: () => 'http://api:8000' }));
vi.mock('@/lib/server-env', () => ({ getInternalAuthToken: () => 'test-internal-token' }));
import { POST } from '@/app/api/admin/[...path]/route';

const probePath = ['runtime-profiles', 'capability-probe'];
const payload = { capability: 'image_generation', instance_id: 'image-edits' };

beforeEach(() => {
  vi.useFakeTimers();
  // Native AbortSignal.timeout uses Node's internal clock. Drive the deadline
  // through the test clock while still exercising fetch's real abort signal.
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((milliseconds) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), milliseconds);
    return controller.signal;
  });
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function backend(delayMs = 22_000, canManage = true) {
  const mock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/admin/session')) {
      return Response.json({ status: 'ok', data: {
        principal_id: 'admin', identity_type: 'platform_admin', role: 'platform_admin',
        auth_mode: 'session', capabilities: { can_manage_catalog: canManage },
      }, meta: {} });
    }
    return new Promise<Response>((resolve, reject) => {
      const signal = init?.signal;
      const timer = setTimeout(() => resolve(Response.json({ status: 'ok', data: { state: 'verified' }, meta: {} })), delayMs);
      const abort = () => { clearTimeout(timer); reject(signal?.reason); };
      if (signal?.aborted) abort();
      else signal?.addEventListener('abort', abort, { once: true });
    });
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

function dispatch(body: string, path = probePath, signal?: AbortSignal) {
  return POST(new NextRequest(`https://cloud.test/api/admin/${path.join('/')}`, {
    method: 'POST', signal,
    headers: { cookie: 'npcink_admin_session_token=test', 'content-type': 'application/json' },
    body,
  }), { params: Promise.resolve({ path }) });
}

it('delivers a successful provider probe taking longer than the ordinary admin deadline', async () => {
  const mock = backend();
  const result = dispatch(JSON.stringify({ ...payload, timeout_ms: 90_000 }));
  await vi.advanceTimersByTimeAsync(22_000);
  const response = await result;
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ data: { state: 'verified' } });
  expect(mock).toHaveBeenCalledTimes(2);
  expect(mock).toHaveBeenLastCalledWith(
    'http://api:8000/internal/service/admin/runtime-profiles/capability-probe',
    expect.objectContaining({ cache: 'no-store', headers: expect.objectContaining({
      'X-Npcink-Internal-Token': 'test-internal-token', 'Idempotency-Key': expect.any(String),
    }) }),
  );
});

it.each([
  [JSON.stringify(payload), 35_000],
  [JSON.stringify({ ...payload, timeout_ms: 120_000 }), 125_000],
  [JSON.stringify({ ...payload, timeout_ms: 1_000 }), 12_000],
  [JSON.stringify({ ...payload, timeout_ms: 120_001 }), 12_000],
  [JSON.stringify({ ...payload, timeout_ms: '90000' }), 12_000],
  [JSON.stringify({ ...payload, timeout_ms: null }), 12_000],
  [JSON.stringify({ ...payload, timeout_ms: 90_000.5 }), 12_000],
  ['{invalid', 12_000],
  ['[]', 12_000],
])('keeps the probe deadline bounded for body %s', async (body, deadline) => {
  backend(150_000);
  let completed = false;
  const result = dispatch(body).then((response) => { completed = true; return response; });
  await vi.advanceTimersByTimeAsync(deadline - 1);
  expect(completed).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect((await result).status).toBe(502);
});

it('does not extend the deadline for another allowed admin route', async () => {
  backend();
  const result = dispatch(JSON.stringify({ timeout_ms: 120_000 }), ['provider-connections', 'local', 'model-tests']);
  await vi.advanceTimersByTimeAsync(12_000);
  expect((await result).status).toBe(502);
});

it('still cancels the backend when the browser disconnects', async () => {
  const mock = backend();
  const controller = new AbortController();
  const result = dispatch(JSON.stringify({ ...payload, timeout_ms: 90_000 }), probePath, controller.signal);
  await vi.advanceTimersByTimeAsync(1_000);
  controller.abort();
  expect((await result).status).toBe(502);
  expect(mock.mock.calls[1][1]?.signal?.aborted).toBe(true);
});

it('rejects an unauthorized probe before provider dispatch', async () => {
  const mock = backend(22_000, false);
  expect((await dispatch(JSON.stringify({ ...payload, timeout_ms: 90_000 }))).status).toBe(403);
  expect(mock).toHaveBeenCalledOnce();
});
