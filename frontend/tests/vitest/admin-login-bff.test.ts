import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/env', () => ({
  getApiBaseUrl: () => 'http://api:8000',
  getPublicBaseUrl: () => 'https://cloud.example.com',
}));

import { GET, POST } from '@/app/admin/auth/login/route';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('admin login BFF origin', () => {
  it.each([
    ['http://127.0.0.1:18010', '/admin/vector-settings', '/admin/vector-settings'],
    ['http://localhost:18010', '//attacker.example/admin', '/admin'],
    ['https://cloud.example.com', '/administrator', '/admin'],
  ])('keeps successful form login on %s with a safe admin path', async (origin, redirect, expected) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      status: 'ok', data: {},
    }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'set-cookie': 'npcink_admin_session_token=session; Path=/; HttpOnly; Secure; SameSite=Lax',
      },
    })));
    const response = await POST(new NextRequest(`${origin}/admin/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin },
      body: new URLSearchParams({ admin_key: 'test', redirect }),
    }));
    const location = response.headers.get('location')!;
    expect(response.status).toBe(303);
    expect(location).toBe(expected);
    expect(new URL(location, origin).origin).toBe(origin);
    expect(response.headers.get('set-cookie')).toContain('npcink_admin_session_token=session');
  });

  it('shows invalid-key errors on the loopback form origin instead of violating form-action self', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      status: 'error', error_code: 'auth.admin_key_invalid', data: {}, meta: {},
    }), { status: 401, headers: { 'content-type': 'application/json' } })));
    const origin = 'http://127.0.0.1:18010';
    const response = await POST(new NextRequest(`${origin}/admin/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin },
      body: 'admin_key=wrong&redirect=%2Fadmin',
    }));
    const location = new URL(response.headers.get('location')!, origin);
    expect(location.origin).toBe(origin);
    expect(location.searchParams.get('error')).toBe('auth.admin_key_invalid');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('keeps an upstream redirect local and preserves its cookie', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, {
      status: 303,
      headers: {
        location: 'https://cloud.example.com/admin/vector-settings',
        'set-cookie': 'npcink_admin_session_token=session; Path=/; HttpOnly',
      },
    })));
    const response = await POST(new NextRequest('http://127.0.0.1:18010/admin/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'admin_key=test',
    }));
    expect(response.headers.get('location')).toBe('/admin/vector-settings');
    expect(response.headers.get('set-cookie')).toContain('npcink_admin_session_token=session');
  });

  it('does not use Origin or Referer as a redirect destination', async () => {
    vi.stubEnv('NEXT_PUBLIC_ENV', 'test');
    const request = new NextRequest(
      'https://cloud.example.com/admin/auth/login?redirect=/admin',
      {
        headers: {
          host: 'attacker.example',
          origin: 'https://attacker.example',
          referer: 'https://attacker.example/phish',
        },
      }
    );

    const response = await GET(request);
    expect(response.headers.get('location')).toBe(
      '/admin/login?redirect=%2Fadmin'
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('uses a relative redirect even behind an internal request URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_ENV', 'production');
    const request = new NextRequest(
      'http://frontend:3000/admin/auth/login?redirect=/admin',
      { headers: { referer: 'https://attacker.example/phish' } }
    );

    const response = await GET(request);
    expect(response.headers.get('location')).toBe(
      '/admin/login?redirect=%2Fadmin'
    );
  });

  it('forwards the trusted request origin as backend host evidence', async () => {
    vi.stubEnv('NEXT_PUBLIC_ENV', 'test');
    let forwardedHeaders: Headers | null = null;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      forwardedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        status: 'error',
        error_code: 'auth.origin_not_allowed',
        message: 'origin is not allowed',
        data: {},
        meta: { trace_id: '', revision: 'm8' },
      }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('https://cloud.example.com/admin/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        host: 'attacker.example',
        origin: 'https://attacker.example',
      },
      body: 'admin_key=wrong&redirect=%2Fadmin',
    });

    const response = await POST(request);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      '/admin/login?error=auth.origin_not_allowed&redirect=%2Fadmin'
    );
    expect(forwardedHeaders?.get('host')).toBe('cloud.example.com');
    expect(forwardedHeaders?.get('x-forwarded-host')).toBe('cloud.example.com');
    expect(forwardedHeaders?.get('x-forwarded-proto')).toBe('https');
    expect(forwardedHeaders?.get('origin')).toBe('https://attacker.example');
  });

  it('marks JSON login responses no-store while preserving the admin cookie', async () => {
    vi.stubEnv('NEXT_PUBLIC_ENV', 'production');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      status: 'ok',
      error_code: '',
      message: 'admin session created',
      data: { principal_id: 'platform:internal_root' },
      meta: { trace_id: '', revision: 'm8' },
    }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'set-cookie': 'npcink_admin_session_token=session; Path=/; HttpOnly; Secure; SameSite=Lax',
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('https://cloud.example.com/admin/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ admin_key: 'nca_admin_test', redirect: '/admin' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('set-cookie')).toContain('npcink_admin_session_token=session');
  });

  it('reports a non-JSON backend rejection as an internal proxy failure', async () => {
    vi.stubEnv('NEXT_PUBLIC_ENV', 'production');
    const fetchMock = vi.fn(async () => new Response('Invalid host header', {
      status: 400,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest('https://cloud.example.com/admin/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: 'https://cloud.example.com',
      },
      body: 'admin_key=nca_admin_test&redirect=%2Fadmin',
    });

    const response = await POST(request);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      '/admin/login?error=proxy.admin_login_invalid_response&redirect=%2Fadmin'
    );
    expect(response.headers.get('location')).not.toContain('auth.admin_login_failed');
  });

  it('returns a sanitized JSON proxy error for a non-JSON backend rejection', async () => {
    vi.stubEnv('NEXT_PUBLIC_ENV', 'production');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('sensitive upstream detail', {
      status: 400,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })));

    const request = new NextRequest('https://cloud.example.com/admin/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://cloud.example.com',
      },
      body: JSON.stringify({ admin_key: 'nca_admin_test', redirect: '/admin' }),
    });

    const response = await POST(request);
    const body = await response.json();
    expect(response.status).toBe(502);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body.error_code).toBe('proxy.admin_login_invalid_response');
    expect(JSON.stringify(body)).not.toContain('sensitive upstream detail');
  });
});
