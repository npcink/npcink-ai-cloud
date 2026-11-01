import { describe, expect, it } from 'vitest';
import { normalizeAccountSites } from '@/features/admin/accounts/account-projection';
import {
  normalizeAccountCreditLedger,
  normalizeAccountQuotaSummary,
} from '@/features/admin/accounts/account-credit-evidence';

const accountId = 'acct_test';

function quota(overrides: Record<string, unknown> = {}) {
  return {
    status: 'ok',
    ai_credits: {
      key: 'ai_credits', used: 10, limit: 100, remaining: 90,
      usage_ratio: 0.1, unlimited: false, status: 'ok', unit: 'ai_credits',
      ...overrides,
    },
    resource_limits: [],
    internal_limits: [],
    breakdown: [],
  };
}

describe('account evidence projections', () => {
  it('keeps a valid empty site collection distinct from unavailable evidence', () => {
    expect(normalizeAccountSites([], accountId)).toEqual([]);
    expect(() => normalizeAccountSites(null, accountId)).toThrow();
    expect(() => normalizeAccountSites([{ site_id: 'site_other', account_id: 'acct_other' }], accountId)).toThrow();
    expect(() => normalizeAccountSites([{ site_id: 'site_missing' }, null], accountId)).toThrow();
  });

  it('accepts unlimited quota metrics and rejects incomplete or non-finite metrics', () => {
    expect(normalizeAccountQuotaSummary(quota())).toMatchObject({ status: 'ok' });
    expect(normalizeAccountQuotaSummary({
      ...quota(),
      ai_credits: { ...quota().ai_credits, limit: 0, remaining: 0, usage_ratio: 0, unlimited: true },
    }).ai_credits.unlimited).toBe(true);
    expect(() => normalizeAccountQuotaSummary(quota({ used: Number.NaN }))).toThrow();
    expect(() => normalizeAccountQuotaSummary({ ...quota(), resource_limits: null })).toThrow();
    expect(() => normalizeAccountQuotaSummary({ ...quota(), breakdown: [{ key: 'runs', quantity: 1, unit: 'run', rate: Number.POSITIVE_INFINITY, ai_credits: 1 }] })).toThrow();
  });

  it('keeps negative ledger adjustments valid while rejecting wrong targets and malformed rows', () => {
    const valid = {
      account_id: accountId,
      pagination: { limit: 12, offset: 0, total: 1, has_more: false },
      summary: { entry_count: 1, net_ai_credit_delta: -10 },
      items: [{
        ledger_entry_id: 'ledger_1', source_type: 'operator_credit_adjustment',
        ai_credit_delta: -10, consumed_ai_credits: 0, quantity: 10, unit: 'credit',
      }],
    };
    expect(normalizeAccountCreditLedger(accountId, valid).items[0].ai_credit_delta).toBe(-10);
    expect(() => normalizeAccountCreditLedger(accountId, { ...valid, account_id: 'acct_other' })).toThrow();
    expect(() => normalizeAccountCreditLedger(accountId, { ...valid, items: [{ ...valid.items[0], quantity: Number.NaN }] })).toThrow();
    expect(() => normalizeAccountCreditLedger(accountId, { ...valid, items: [{ ...valid.items[0], ledger_entry_id: '' }] })).toThrow();
  });
});
