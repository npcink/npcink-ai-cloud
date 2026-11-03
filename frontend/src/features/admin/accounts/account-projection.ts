// Validate required customer projections before presentation defaults or writes.
export function isAccountRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function requireAccount(value: unknown, expectedId?: string): Record<string, unknown> {
  if (!isAccountRecord(value) || typeof value.account_id !== 'string' || !value.account_id.trim()
    || (expectedId !== undefined && value.account_id !== expectedId)
    || typeof value.status !== 'string' || !value.status.trim()
    || typeof value.name !== 'string'
    || !isAccountRecord(value.metadata)) {
    throw new Error('Invalid customer projection');
  }
  return value;
}

export function validateAccountDirectory(value: unknown): void {
  if (!isAccountRecord(value) || !Array.isArray(value.items)
    || typeof value.total !== 'number' || !Number.isSafeInteger(value.total) || value.total < 0
    || value.total < value.items.length) throw new Error('Invalid customer directory');
  for (const item of value.items) {
    if (!isAccountRecord(item)) throw new Error('Invalid customer row');
    requireAccount(item.account);
  }
}

export function requireAccountDetail(value: unknown, accountId: string): Record<string, unknown> {
  if (!isAccountRecord(value)) throw new Error('Invalid customer detail');
  return requireAccount(value.account, accountId);
}

export type AccountSiteProjection = {
  site_id: string;
  account_id: string;
  status: string;
  name: string;
};

/**
 * Sites are a bounded evidence projection. Keep an invalid collection
 * unavailable instead of filtering bad rows into a misleading empty state.
 */
export function normalizeAccountSites(
  value: unknown,
  accountId: string
): AccountSiteProjection[] {
  if (!Array.isArray(value)) throw new Error('Customer site evidence is unavailable');
  return value.map((item) => {
    if (!isAccountRecord(item)
      || typeof item.site_id !== 'string'
      || !item.site_id.trim()
      || item.account_id !== accountId
      || typeof item.status !== 'string' || !item.status.trim()
      || typeof item.name !== 'string') {
      throw new Error('Invalid customer site evidence');
    }
    return {
      site_id: item.site_id,
      account_id: accountId,
      status: item.status || 'unknown',
      name: item.name || '',
    };
  });
}
