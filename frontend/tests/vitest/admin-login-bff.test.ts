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
      'https://cloud.example.com/admin/login?redirect=%2Fadmin'
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('binds redirects to the configured public origin even behind an internal request URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_ENV', 'production');
    const request = new NextRequest(
      'http://frontend:3000/admin/auth/login?redirect=/admin',
      { headers: { referer: 'https://attacker.example/phish' } }
    );

    const response = await GET(request);
    expect(response.headers.get('location')).toBe(
      'https://cloud.example.com/admin/login?redirect=%2Fadmin'
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
      'https://cloud.example.com/admin/login?error=auth.origin_not_allowed&redirect=%2Fadmin'
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
});
