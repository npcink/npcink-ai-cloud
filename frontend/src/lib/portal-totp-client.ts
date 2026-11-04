import { ApiError } from './errors';
import type { PortalSession, Site, PortalCurrentSubscription } from './portal-client';
import { parsePortalSecondFactorRequired, type PortalSecondFactorRequired, type PortalSecondFactorSubmission } from './portal-auth-wire';

export type TotpPurpose = 'setup' | 'disable' | 'recovery_reset';
export type TotpStatus = { enabled: boolean; recovery_codes_remaining: number };
export type TotpStart = { purpose: TotpPurpose; challenge: PortalSecondFactorRequired; expiresAt: string }
  & ({ purpose: 'setup'; setupId: string; secret: string; uri: string } | { purpose: 'disable' | 'recovery_reset' });
export type TotpCompletion = { session: PortalSession; recoveryCodes: string[] };

function unknown(): never {
  throw new ApiError({ statusCode: 0, errorCode: 'client.totp_unknown', message: 'Authentication result unavailable' });
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return unknown();
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 2048, empty = true): string {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.length)) return unknown();
  return value;
}
function timestamp(value: unknown): string {
  const result = text(value, 64, false);
  if (!Number.isFinite(Date.parse(result))) return unknown();
  return result;
}
function strings(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 1000) return unknown();
  return value.map((item) => text(item));
}
function site(value: unknown): Site {
  const r = record(value);
  const result: Site = { site_id: text(r.site_id), name: text(r.name), site_url: text(r.site_url),
    platform_kind: text(r.platform_kind), status: text(r.status) };
  if (r.allowed_actions !== undefined) result.allowed_actions = strings(r.allowed_actions);
  for (const key of ['capacity_scope', 'ownership_released_at', 'relink_cooldown_until'] as const) {
    if (r[key] !== undefined) result[key] = text(r[key]);
  }
  if (r.capacity !== undefined) {
    const capacity = record(r.capacity);
    const number = (key: string) => {
      if (!Number.isSafeInteger(capacity[key]) || Number(capacity[key]) < 0) return unknown();
      return Number(capacity[key]);
    };
    result.capacity = { active_count: number('active_count'), active_limit: number('active_limit'),
      active_remaining: number('active_remaining'), bound_count: number('bound_count'),
      bound_limit: number('bound_limit'), bound_remaining: number('bound_remaining') };
  }
  return result;
}
function subscription(value: unknown): PortalCurrentSubscription | null {
  if (value === null) return null;
  const r = record(value);
  return Object.fromEntries(['subscription_id', 'plan_id', 'plan_version_id', 'status', 'tier_id', 'plan_kind',
    'package_kind', 'package_alias', 'display_package_label', 'coverage_state', 'current_period_start_at',
    'current_period_end_at', 'scheduled_plan_id', 'scheduled_plan_version_id', 'scheduled_change_at']
    .map((key) => [key, text(r[key])])) as unknown as PortalCurrentSubscription;
}

/** Only the public Session fields may cross into Session Context. */
export function parseManagementSession(value: unknown): PortalSession {
  const r = record(value), metadata = record(r.session);
  if (!Array.isArray(r.sites) || r.sites.length > 10000 || metadata.state !== 'active'
    || typeof metadata.revocable !== 'boolean') return unknown();
  const issued = timestamp(metadata.issued_at), expires = timestamp(metadata.expires_at);
  if (Date.parse(expires) <= Date.parse(issued) || Date.parse(expires) <= Date.now()) return unknown();
  const context = r.selected_context === null ? null : record(r.selected_context);
  return { email: text(r.email, 320), sites: r.sites.map(site), auth_mode: text(r.auth_mode, 64, false),
    selected_context: context ? { site: site(context.site), allowed_actions: strings(context.allowed_actions),
      current_subscription: subscription(context.current_subscription) } : null,
    session: { state: 'active', transport: text(metadata.transport, 64, false), issued_at: issued,
      expires_at: expires, revocable: metadata.revocable } };
}

function safeFailure(response: Response, body: unknown): ApiError {
  const r = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const data = r.data && typeof r.data === 'object' && !Array.isArray(r.data) ? r.data as Record<string, unknown> : {};
  const code = typeof r.error_code === 'string' && /^[a-zA-Z0-9_.-]{1,120}$/.test(r.error_code)
    ? r.error_code : 'client.totp_unknown';
  const details: Record<string, string | number> = {};
  if (['active', 'retryable', 'expired', 'consumed', 'attempt_limit', 'missing', 'terminal'].includes(String(data.challenge_status))) {
    details.challenge_status = String(data.challenge_status);
  }
  if (Number.isSafeInteger(data.attempts_remaining) && Number(data.attempts_remaining) >= 0 && Number(data.attempts_remaining) <= 5) {
    details.attempts_remaining = Number(data.attempts_remaining);
  }
  const retry = response.headers.get('retry-after') || '';
  return new ApiError({ statusCode: response.status, errorCode: code, message: 'Authentication request unavailable',
    details, retryAfterSeconds: /^\d{1,5}$/.test(retry) ? Math.min(900, Number(retry)) : undefined });
}
async function request(path: string, payload?: object, method = 'POST'): Promise<Record<string, unknown>> {
  try {
    const response = await fetch(`/api/portal/${path}`, { method, credentials: 'include', cache: 'no-store',
      signal: AbortSignal.timeout(12000), headers: { Accept: 'application/json', ...(payload ? { 'Content-Type': 'application/json' } : {}) },
      ...(payload ? { body: JSON.stringify(payload) } : {}) });
    let body: unknown;
    try { body = await response.json(); } catch { return unknown(); }
    if (!response.ok) throw safeFailure(response, body);
    const envelope = record(body);
    if (envelope.status !== 'ok') return unknown();
    return record(envelope.data);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    return unknown();
  }
}
async function start(purpose: TotpPurpose): Promise<TotpStart> {
  const data = await request(`totp/${purpose === 'recovery_reset' ? 'recovery-reset' : purpose}/start`);
  const challenge = parsePortalSecondFactorRequired(data);
  const expiresAt = timestamp(data.expires_at);
  if (!challenge || Date.parse(expiresAt) <= Date.now()) return unknown();
  if (data.methods !== undefined && (!Array.isArray(data.methods) || data.methods.length === 0
    || data.methods.some((method) => !['totp', 'recovery_code'].includes(String(method))))) return unknown();
  for (const key of ['challenge_id', 'primary_method'] as const) {
    if (data[key] !== undefined && data[key] !== null) text(data[key], 160, false);
  }
  if (data.expires_in_seconds !== undefined && data.expires_in_seconds !== null
    && (!Number.isSafeInteger(data.expires_in_seconds) || Number(data.expires_in_seconds) <= 0
      || Number(data.expires_in_seconds) > 300)) return unknown();
  if (purpose !== 'setup') return { purpose, challenge, expiresAt };
  const secret = text(data.secret, 32, false), uri = text(data.otpauth_uri, 2048, false);
  if (!/^[A-Z2-7]{32}$/.test(secret)) return unknown();
  let parsed: URL;
  try { parsed = new URL(uri); } catch { return unknown(); }
  if (parsed.protocol !== 'otpauth:' || parsed.hostname !== 'totp' || parsed.username || parsed.password
    || parsed.hash || ['algorithm', 'digits', 'period', 'issuer'].some((key) => parsed.searchParams.getAll(key).length > 1)
    || !parsed.pathname.slice(1) || parsed.searchParams.getAll('secret').length !== 1
    || parsed.searchParams.get('secret') !== secret
    || (parsed.searchParams.get('algorithm') || 'SHA1').toUpperCase() !== 'SHA1'
    || (parsed.searchParams.get('digits') || '6') !== '6'
    || (parsed.searchParams.get('period') || '30') !== '30') return unknown();
  return { purpose, challenge, expiresAt, setupId: text(data.setup_id, 64, false), secret, uri };
}
async function confirm(purpose: TotpPurpose, proof: PortalSecondFactorSubmission, setupId?: string): Promise<TotpCompletion> {
  const code = text(proof.code.trim(), 160, false);
  if (!['totp', 'recovery_code'].includes(proof.method) || (purpose === 'setup' && proof.method !== 'totp')) return unknown();
  const data = await request(`totp/${purpose === 'recovery_reset' ? 'recovery-reset' : purpose}/confirm`,
    { code, method: proof.method, ...(purpose === 'setup' ? { setup_id: text(setupId, 64, false) } : {}) });
  if (data.status !== 'authenticated' || !Array.isArray(data.recovery_codes)) return unknown();
  const recoveryCodes = data.recovery_codes.map((item) => text(item, 160, false));
  if (recoveryCodes.length !== (purpose === 'disable' ? 0 : 8) || new Set(recoveryCodes).size !== recoveryCodes.length) return unknown();
  return { session: parseManagementSession(data), recoveryCodes };
}
export const portalTotpClient = {
  async getStatus(): Promise<TotpStatus> {
    const data = await request('totp/status', undefined, 'GET');
    if (typeof data.enabled !== 'boolean' || !Number.isSafeInteger(data.recovery_codes_remaining)
      || Number(data.recovery_codes_remaining) < 0 || Number(data.recovery_codes_remaining) > 8) return unknown();
    return { enabled: data.enabled, recovery_codes_remaining: Number(data.recovery_codes_remaining) };
  },
  async getSession(): Promise<PortalSession> { return parseManagementSession(await request('session', undefined, 'GET')); },
  startSetup: () => start('setup'), startDisable: () => start('disable'), startRecoveryReset: () => start('recovery_reset'),
  confirmSetup: (payload: { setup_id: string; code: string }) => confirm('setup', { method: 'totp', code: payload.code }, payload.setup_id),
  confirmDisable: (proof: PortalSecondFactorSubmission) => confirm('disable', proof),
  confirmRecoveryReset: (proof: PortalSecondFactorSubmission) => confirm('recovery_reset', proof),
};
