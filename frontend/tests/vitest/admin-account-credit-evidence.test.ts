import { describe, expect, it } from 'vitest';
import {
  accountCreditEvidenceKeys,
  normalizeAccountCreditLedger,
  normalizeAccountQuotaSummary,
} from '@/features/admin/accounts/account-credit-evidence';

describe('account credit evidence query identity', () => {
  it('scopes quota and ledger evidence to the exact account', () => {
    expect(accountCreditEvidenceKeys.quota('acct_primary')).toEqual([
      'admin',
      'accounts',
      'credit-evidence',
      'acct_primary',
      'quota-summary',
    ]);
    expect(accountCreditEvidenceKeys.ledger('acct_primary')).toEqual([
      'admin',
      'accounts',
      'credit-evidence',
      'acct_primary',
      'credit-ledger',
    ]);
    expect(accountCreditEvidenceKeys.quota('acct_other')).not.toEqual(
      accountCreditEvidenceKeys.quota('acct_primary')
    );
  });
});

describe('account credit evidence normalization', () => {
  it('keeps quota evidence bounded and rejects an incomplete result', () => {
    expect(() =>
      normalizeAccountQuotaSummary({ status: 'partial' })
    ).toThrowError('Account quota evidence is incomplete.');
    expect(
      normalizeAccountQuotaSummary({
        status: 'ok',
        generated_at: '2026-07-30T05:00:00Z',
        ai_credits: {
          key: 'ai_credits',
          used: 125,
          limit: 1000,
          remaining: 875,
          usage_ratio: 0.125,
          unlimited: false,
          status: 'ok',
          unit: 'credits',
        },
        breakdown: [
          {
            key: 'runs',
            quantity: 5,
            unit: 'runs',
            rate: 25,
            ai_credits: 125,
          },
        ],
      })
    ).toMatchObject({
      status: 'ok',
      generated_at: '2026-07-30T05:00:00Z',
      resource_limits: [],
      internal_limits: [],
      totals: {},
      breakdown: [{ key: 'runs', ai_credits: 125 }],
    });
  });

  it('normalizes ledger defaults without inventing entries', () => {
    expect(
      normalizeAccountCreditLedger('acct_primary', {
        rate_version: 'credits.v1',
        pagination: { total: 0, has_more: false },
        items: [],
      })
    ).toEqual({
      account_id: 'acct_primary',
      generated_at: '',
      period_start_at: '',
      period_end_at: '',
      rate_version: 'credits.v1',
      pagination: { total: 0, has_more: false },
      summary: {},
      items: [],
    });
  });

  it('rejects a ledger conclusion when item evidence is absent', () => {
    expect(() =>
      normalizeAccountCreditLedger('acct_primary', {
        account_id: 'acct_primary',
        summary: {},
      })
    ).toThrowError('Account credit ledger evidence is incomplete.');
  });
});
