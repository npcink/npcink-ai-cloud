import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadProductionEnv(publicBaseUrl: string) {
  vi.stubEnv('NEXT_PUBLIC_ENV', 'production');
  vi.stubEnv('CLOUD_API_BASE_URL', 'http://api:8000');
  vi.stubEnv('CLOUD_PUBLIC_BASE_URL', publicBaseUrl);
  vi.stubEnv('NPCINK_CLOUD_INTERNAL_AUTH_TOKEN', '');
  vi.stubEnv('NPCINK_CLOUD_DEV_ADMIN_KEY', '');
  vi.resetModules();
  return import('@/lib/env');
}

describe('production frontend public URL', () => {
  it('rejects an HTTP public origin', async () => {
    const { validateEnv } = await loadProductionEnv('http://cloud.example.com');
    expect(() => validateEnv()).toThrow('CLOUD_PUBLIC_BASE_URL must use HTTPS');
  });

  it('accepts an HTTPS public origin while keeping the internal API on HTTP', async () => {
    const { validateEnv } = await loadProductionEnv('https://cloud.example.com');
    expect(validateEnv()).toMatchObject({
      CLOUD_API_BASE_URL: 'http://api:8000',
      CLOUD_PUBLIC_BASE_URL: 'https://cloud.example.com',
    });
  });
});
