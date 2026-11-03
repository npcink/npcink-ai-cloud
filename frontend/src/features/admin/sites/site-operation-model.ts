export const isSiteRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const statuses = new Set(['provisioning', 'active', 'inactive', 'suspended', 'archived']);

export function requireSite(value: unknown, siteId: string, accountId?: string): Record<string, unknown> {
  if (!isSiteRecord(value) || value.site_id !== siteId || typeof value.status !== 'string' || !statuses.has(value.status)
    || (value.account_id !== undefined && value.account_id !== null && typeof value.account_id !== 'string')
    || (accountId !== undefined && String(value.account_id || '') !== accountId)) throw new Error('Invalid site projection');
  return value;
}

export function requireSiteDetail(value: unknown, siteId: string): Record<string, unknown> {
  if (!isSiteRecord(value)) throw new Error('Invalid site detail');
  const site = requireSite(value.site, siteId);
  if (value.account !== undefined && value.account !== null
    && (!isSiteRecord(value.account) || typeof value.account.account_id !== 'string'
      || !value.account.account_id.trim() || value.account.account_id !== site.account_id)) throw new Error('Invalid site account association');
  return site;
}

// Compare instants, preserving the server's microseconds; Z and +00:00 are equivalent.
export function normalizeSiteUtc(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(value)) throw new Error('Invalid site UTC');
  const calendar = new Date(`${value.slice(0, 19)}Z`);
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 19) !== value.slice(0, 19)) throw new Error('Invalid site calendar time');
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error('Invalid site UTC');
  const fraction = /\.(\d+)(?:Z|[+-]\d\d:\d\d)$/.exec(value)?.[1] || '';
  return `${new Date(time).toISOString().slice(0, 19)}.${fraction.padEnd(6, '0')}Z`;
}

export type SiteAction = 'activate' | 'set' | 'clear' | 'reset';
export type SiteIntent = {
  site_id: string;
  account_id: string;
  operation_id: string;
  action: SiteAction;
  cooldown_until: string | null;
  input_utc: string | null;
  ownership_released_at: string | null;
};
export type SiteOperationResult = {
  site: Record<string, unknown>;
  policy?: {
    enabled: boolean;
    default_cooldown_days: number;
    ownership_released_at: string;
    cooldown_until: string;
    cross_account_relink_ready: boolean;
  };
};

function cooldownSite(value: unknown, intent: SiteIntent): Record<string, unknown> {
  const site = requireSite(value, intent.site_id);
  if (site.status !== 'archived' || !intent.ownership_released_at
    || normalizeSiteUtc(site.ownership_released_at) !== normalizeSiteUtc(intent.ownership_released_at)) throw new Error('Invalid released site');
  const until = normalizeSiteUtc(site.relink_cooldown_until);
  if (intent.action === 'set' && until !== normalizeSiteUtc(intent.cooldown_until)) throw new Error('Wrong cooldown result');
  return site;
}

function requirePolicy(value: unknown, site: Record<string, unknown>): NonNullable<SiteOperationResult['policy']> {
  if (!isSiteRecord(value) || typeof value.enabled !== 'boolean' || typeof value.cross_account_relink_ready !== 'boolean'
    || typeof value.default_cooldown_days !== 'number' || !Number.isSafeInteger(value.default_cooldown_days) || value.default_cooldown_days <= 0
    || normalizeSiteUtc(value.cooldown_until) !== normalizeSiteUtc(site.relink_cooldown_until)
    || normalizeSiteUtc(value.ownership_released_at) !== normalizeSiteUtc(site.ownership_released_at)) throw new Error('Invalid cooldown policy projection');
  return value as NonNullable<SiteOperationResult['policy']>;
}

export function readSiteWrite(value: unknown, intent: SiteIntent): SiteOperationResult {
  if (intent.action === 'activate') {
    const site = requireSite(value, intent.site_id, intent.account_id);
    if (site.status !== 'active') throw new Error('Site is not active');
    return { site };
  }
  const site = cooldownSite(value, intent);
  if (site.action !== intent.action) throw new Error('Wrong cooldown action');
  return { site, policy: requirePolicy({
    enabled: site.policy_enabled, default_cooldown_days: site.default_cooldown_days,
    cooldown_until: site.relink_cooldown_until, ownership_released_at: site.ownership_released_at,
    cross_account_relink_ready: site.cross_account_relink_ready,
  }, site) };
}

export function readSiteConfirmation(value: unknown, intent: SiteIntent): SiteOperationResult | null {
  if (!isSiteRecord(value) || value.site_id !== intent.site_id || value.operation_id !== intent.operation_id || value.action !== intent.action) throw new Error('Wrong site operation');
  if (value.state === 'unconfirmed' && value.site === null && value.receipt === null) return null;
  if (value.state !== 'confirmed') throw new Error('Invalid site confirmation');
  const site = requireSite(value.site, intent.site_id, intent.account_id);
  if (intent.action === 'activate') {
    if (site.status !== 'active' || value.receipt !== null) throw new Error('Site is not currently active');
    return { site };
  }
  cooldownSite(site, intent);
  const receipt = value.receipt;
  if (!isSiteRecord(receipt) || receipt.site_id !== intent.site_id || receipt.operation_id !== intent.operation_id || receipt.action !== intent.action
    || typeof receipt.audit_event_id !== 'number' || !Number.isSafeInteger(receipt.audit_event_id) || receipt.audit_event_id <= 0
    || normalizeSiteUtc(receipt.resolved_cooldown_until) !== normalizeSiteUtc(site.relink_cooldown_until)) throw new Error('Invalid site audit receipt');
  return { site, policy: requirePolicy(value.site_relink_policy, site) };
}
