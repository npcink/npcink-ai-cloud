import type { PortalAddonConnectionAccount } from '@/lib/portal-client';

/**
 * Pick the account the WordPress addon binding dialog should preselect.
 *
 * - Exactly one eligible account: preselect it.
 * - Several accounts: preselect the current account only when it is known
 *   and present in the eligible list; otherwise require an explicit choice.
 */
export function resolveDefaultAddonAccountId(
  accounts: readonly PortalAddonConnectionAccount[],
  currentAccountId?: string | null
): string {
  if (accounts.length === 1) {
    return accounts[0]?.account_id ?? '';
  }
  const current = (currentAccountId ?? '').trim();
  if (current && accounts.some((account) => account.account_id === current)) {
    return current;
  }
  return '';
}
