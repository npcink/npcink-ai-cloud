import { expect, test } from '@playwright/test';

test('completed installation permanently closes setup writes and page', async ({ request }) => {
  const setupPage = await request.get('/setup', { maxRedirects: 0 });
  expect(setupPage.status()).toBe(404);
  expect(setupPage.headers()['cache-control']).toContain('no-store');

  const setupSession = await request.post('/api/setup/session', {
    data: { setup_code: 'nca_setup_must_not_be_forwarded' },
  });
  expect(setupSession.status()).toBe(404);
  expect((await setupSession.json()).error_code).toBe('setup.already_complete');
});
