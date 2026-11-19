import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/lib/env', () => ({ getApiBaseUrl: () => 'http://api:8000' }));
vi.mock('@/lib/server-env', () => ({ getInternalAuthToken: () => 'test-internal-token' }));
import { GET, POST } from '@/app/api/admin/[...path]/route';

const path = ['runtime-profiles', 'capability-probe'];
const context = { params: Promise.resolve({ path }) };
function request(body = JSON.stringify({ capability: 'image_generation', instance_id: 'image.test', timeout_ms: 90_000 }), signal?: AbortSignal) {
  return new NextRequest(`https://cloud.test/api/admin/${path.join('/')}`, {
    method: 'POST', signal,
    headers: { cookie: 'npcink_admin_session_token=test', 'content-type': 'application/json' }, body,
  });
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}
function backend(handler: (init: RequestInit) => Promise<Response>, allowed = true) {
  const mock = vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith('/admin/session')) return json({ status: 'ok', data: {
      principal_id: 'admin', identity_type: 'platform_admin', role: 'platform_admin',
      auth_mode: 'session', capabilities: { can_manage_catalog: allowed },
    } });
    return handler(init);
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}
function fakeDeadlines() {
  vi.useFakeTimers();
  return vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('deadline', 'TimeoutError')), ms);
    return controller.signal;
  });
}
function delayed(init: RequestInit, ms: number) {
  return new Promise<Response>((accept, reject) => {
    setTimeout(() => accept(json({ status: 'ok', data: { state: 'verified' } })), ms);
    init.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
  });
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Admin capability probe deadline', () => {
  it('returns verified evidence for a probe taking longer than the ordinary 12-second deadline', async () => {
    fakeDeadlines();
    backend(init => delayed(init, 16_000));
    const pending = POST(request(), context);
    await vi.advanceTimersByTimeAsync(16_000);
    const response = await pending;
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { state: 'verified' } });
  });

  it.each([[undefined, 33_000], [1_000, 4_000], [90_000, 93_000], [120_000, 123_000], [120_001, 12_000], ['90000', 12_000], [null, 12_000], [1.5, 12_000]])(
    'bounds a timeout budget of %s without rewriting the backend input', async (timeout, expected) => {
      const deadlines = vi.spyOn(AbortSignal, 'timeout');
      const mock = backend(async () => json({ status: 'ok' }));
      const body = JSON.stringify({ capability: 'image_generation', instance_id: 'image.test', timeout_ms: timeout });
      expect((await POST(request(body), context)).status).toBe(200);
      expect(deadlines).toHaveBeenLastCalledWith(expected);
      expect(mock).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ body }));
    }
  );

  it.each(['{', '[]', 'null', '42'] )('forwards invalid input %s unchanged for backend validation', async (body) => {
    const deadlines = vi.spyOn(AbortSignal, 'timeout');
    const mock = backend(async () => json({ error_code: 'validation_error' }, 422));
    expect((await POST(request(body), context)).status).toBe(422);
    expect(deadlines).toHaveBeenLastCalledWith(12_000);
    expect(mock).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ body }));
  });

  it('reports an unconfirmed result when the probe deadline expires', async () => {
    fakeDeadlines();
    backend(init => delayed(init, 100_000));
    const pending = POST(request(), context);
    await vi.advanceTimersByTimeAsync(93_000);
    const response = await pending;
    expect(response.status).toBe(504);
    expect(await response.json()).toMatchObject({ error_code: 'proxy.admin_capability_probe_timeout' });
  });

  it('keeps its deadline active while reading the response body', async () => {
    fakeDeadlines();
    backend(async init => new Response(new ReadableStream({
      start(controller) {
        init.signal?.addEventListener('abort', () => controller.error(init.signal?.reason), { once: true });
      },
    }), { headers: { 'content-type': 'application/json' } }));
    const pending = POST(request(), context);
    await vi.advanceTimersByTimeAsync(93_000);
    expect((await pending).status).toBe(504);
  });

  it('keeps connection failures bounded and does not retry a billable probe', async () => {
    const mock = backend(async () => { throw new Error('private upstream detail'); });
    const response = await POST(request(), context);
    expect(response.status).toBe(502);
    const payload = await response.json();
    expect(payload.error_code).toBe('proxy.admin_post_unreachable');
    expect(JSON.stringify(payload)).not.toContain('private upstream');
    expect(mock).toHaveBeenCalledTimes(2); // One session read and one probe.
    expect(mock).toHaveBeenLastCalledWith(
      'http://api:8000/internal/service/admin/runtime-profiles/capability-probe',
      expect.objectContaining({ cache: 'no-store', headers: expect.objectContaining({
        'X-Npcink-Internal-Token': 'test-internal-token', 'Idempotency-Key': expect.any(String),
      }) }),
    );
  });

  it('preserves caller cancellation', async () => {
    fakeDeadlines();
    const caller = new AbortController();
    const mock = backend(init => delayed(init, 90_000));
    const pending = POST(request(undefined, caller.signal), context);
    await vi.advanceTimersByTimeAsync(1);
    caller.abort();
    expect((await pending).status).toBe(502);
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it('keeps ordinary Admin reads on their 12-second deadline', async () => {
    fakeDeadlines();
    backend(init => delayed(init, 16_000));
    const pending = GET(new NextRequest('https://cloud.test/api/admin/runtime-profiles', {
      headers: { cookie: 'npcink_admin_session_token=test' },
    }), { params: Promise.resolve({ path: ['runtime-profiles'] }) });
    await vi.advanceTimersByTimeAsync(12_000);
    expect((await pending).status).toBe(502);
  });

  it('does not extend another allowed Admin POST deadline', async () => {
    fakeDeadlines();
    backend(init => delayed(init, 16_000));
    const otherPath = ['provider-connections', 'local', 'model-tests'];
    const pending = POST(new NextRequest(`https://cloud.test/api/admin/${otherPath.join('/')}`, {
      method: 'POST', headers: { cookie: 'npcink_admin_session_token=test', 'content-type': 'application/json' },
      body: JSON.stringify({ timeout_ms: 120_000 }),
    }), { params: Promise.resolve({ path: otherPath }) });
    await vi.advanceTimersByTimeAsync(12_000);
    expect((await pending).status).toBe(502);
  });

  it('still requires catalog-management authority before executing the probe', async () => {
    const mock = backend(async () => json({}), false);
    expect((await POST(request(), context)).status).toBe(403);
    expect(mock).toHaveBeenCalledOnce();
  });

  it.each(['dev', 'm4-preview', 'prod'])('keeps the %s edge deadline scoped to the exact probe path', target => {
    const source = readFileSync(resolve(process.cwd(), `../deploy/nginx.${target}.conf`), 'utf8');
    const probe = source.split('location = /api/admin/runtime-profiles/capability-probe {')[1]?.split('\n    }')[0];
    expect(probe).toContain('proxy_read_timeout 130s;');
    expect(probe).toContain('proxy_pass http://$npcink_ai_cloud_frontend;');
    const ordinary = source.split('location /api/ {')[1]?.split('\n    }')[0];
    expect(ordinary).not.toContain('proxy_read_timeout');
  });
});
