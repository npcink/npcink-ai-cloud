import { afterEach, expect, it, vi } from 'vitest';
import { portalTotpClient, parseManagementSession } from '@/lib/portal-totp-client';
import { ApiError } from '@/lib/errors';

const session = () => ({ email: 'fixture@example.test', sites: [], selected_context: null, auth_mode: 'jwt',
  session: { state: 'active', transport: 'cookie', issued_at: new Date(Date.now() - 10000).toISOString(),
    expires_at: new Date(Date.now() + 3600000).toISOString(), revocable: true } });
const seed = 'A'.repeat(32);
const start = () => ({ status: 'second_factor_required', expires_at: new Date(Date.now() + 300000).toISOString(),
  setup_id: 'synthetic-setup', secret: seed, otpauth_uri: `otpauth://totp/Fixture?secret=${seed}` });
const complete = () => ({ ...session(), status: 'authenticated', recovery_codes: Array.from({ length: 8 }, (_, i) => `synthetic-${i}`) });
function reply(data: unknown, status = 200, headers = {}) {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ status: status === 200 ? 'ok' : 'error', data }, { status, headers }));
  vi.stubGlobal('fetch', fetcher); return fetcher;
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('uses a single private fetch without write receipts or idempotency; separates secrets from Session', async () => {
  const fetcher = reply(complete());
  const result = await portalTotpClient.confirmSetup({ setup_id: 'fixture', code: '123456' });
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, options] = fetcher.mock.calls[0];
  expect(url).toBe('/api/portal/totp/setup/confirm');
  expect(options.credentials).toBe('include'); expect(options.cache).toBe('no-store');
  expect(options.headers['Idempotency-Key']).toBeUndefined();
  expect(JSON.parse(options.body)).toEqual({ setup_id: 'fixture', code: '123456', method: 'totp' });
  expect(result.recoveryCodes).toHaveLength(8);
  expect(Object.keys(result.session).sort()).toEqual(['auth_mode', 'email', 'selected_context', 'session', 'sites']);
  expect('recovery_codes' in result.session).toBe(false);
});
it('allows only the bounded otpauth configuration and status projection', async () => {
  reply(start()); expect((await portalTotpClient.startSetup()).purpose).toBe('setup');
  reply({ enabled: true, recovery_codes_remaining: 8, secret: 'discard' });
  expect(await portalTotpClient.getStatus()).toEqual({ enabled: true, recovery_codes_remaining: 8 });
});
it.each([
  { methods: ['totp', 'bad'] }, { challenge_id: {} }, { primary_method: 3 }, { expires_in_seconds: 301 },
  { otpauth_uri: `otpauth://totp/Fixture?secret=${seed}&digits=6&digits=8` },
  { secret: 'bad' }, { setup_id: '' }, { setup_id: 'x'.repeat(65) },
  { otpauth_uri: `https://example.test/?secret=${seed}` },
  { otpauth_uri: `otpauth://totp/Fixture?secret=${seed}&digits=8` },
  { otpauth_uri: `otpauth://totp/Fixture?secret=${seed}&algorithm=SHA256` },
  { otpauth_uri: `otpauth://totp/Fixture?secret=${seed}&period=60` },
  { otpauth_uri: `otpauth://totp/Fixture?secret=${'B'.repeat(32)}` },
  { expires_at: 'invalid' }, { expires_at: '2000-01-01T00:00:00Z' },
])('rejects malformed setup without partial secret output (case %#)', async (patch) => {
  reply({ ...start(), ...patch }); await expect(portalTotpClient.startSetup()).rejects.toMatchObject({ errorCode: 'client.totp_unknown' });
});
it.each([
  { status: 'second_factor_required' }, { recovery_codes: [] }, { recovery_codes: Array(8).fill('duplicate') },
  { recovery_codes: Array(8).fill(123) }, { email: 123 }, { sites: 'invalid' }, { selected_context: {} },
  { session: { state: 'active', revocable: 'true' } },
])('rejects a malformed completion before accepting either payload (case %#)', async (patch) => {
  reply({ ...complete(), ...patch }); await expect(portalTotpClient.confirmRecoveryReset({ method: 'totp', code: '123456' })).rejects.toBeInstanceOf(ApiError);
});
it('enforces empty disable codes and reconstructs site/context objects', async () => {
  reply(complete()); await expect(portalTotpClient.confirmDisable({ method: 'totp', code: '123456' })).rejects.toBeInstanceOf(ApiError);
  const site = { site_id: 's', name: '', site_url: '', platform_kind: 'wordpress', status: 'active', secret: 'drop' };
  const result = parseManagementSession({ ...session(), sites: [site], selected_context: { site, allowed_actions: [], current_subscription: null }, secret: 'drop' });
  expect('secret' in result.sites[0]).toBe(false); expect('secret' in result).toBe(false);
});
it.each(['network', 'parse', 'server'])('keeps %s failure bounded with no raw body/cause or automatic retry', async (kind) => {
  const fetcher = kind === 'network' ? vi.fn().mockRejectedValue(new Error('SENSITIVE'))
    : vi.fn().mockResolvedValue(kind === 'parse' ? new Response('{SENSITIVE') : Response.json({
      status: 'error', error_code: 'auth.portal_factor_invalid', message: 'SENSITIVE',
      data: { secret: 'SENSITIVE', challenge_status: 'retryable', attempts_remaining: 4 },
    }, { status: 401, headers: { 'Retry-After': '5' } }));
  vi.stubGlobal('fetch', fetcher);
  const error = await portalTotpClient.confirmSetup({ setup_id: 'fixture', code: '123456' }).catch((e) => e);
  expect(error).toBeInstanceOf(ApiError); expect(fetcher).toHaveBeenCalledTimes(1);
  expect(error.rawBody === undefined && error.cause === undefined && !JSON.stringify(error).includes('SENSITIVE')).toBe(true);
  if (kind === 'server') expect(error.details).toEqual({ challenge_status: 'retryable', attempts_remaining: 4 });
});
