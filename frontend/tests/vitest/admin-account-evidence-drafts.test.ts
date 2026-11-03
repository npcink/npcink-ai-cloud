import { describe, expect, it } from 'vitest';
import { normalizeAccountSites } from '@/features/admin/accounts/account-projection';
import { normalizeAccountCreditLedger, normalizeAccountQuotaSummary } from '@/features/admin/accounts/account-credit-evidence';
import { ledgerFixture, ledgerEntryFixture, quotaFixture } from '../fixtures/admin-account-evidence';

const accountId = 'acct_test';
const site = { site_id: 'site_1', account_id: accountId, name: '', status: 'active' };

describe('serializer-shaped account evidence', () => {
  it('preserves valid empty sites and required site identity', () => {
    expect(normalizeAccountSites([], accountId)).toEqual([]);
    expect(normalizeAccountSites([site], accountId)).toEqual([site]);
  });
  it.each([null, {}, [null], [{ ...site, account_id: undefined }], [{ ...site, account_id: null }], [{ ...site, account_id: 'other' }], [{ ...site, status: null }], [{ ...site, name: undefined }]])('rejects malformed site collection %j', value => {
    expect(() => normalizeAccountSites(value, accountId)).toThrow();
  });
  it('preserves finite all-zero, unlimited, negative limits, and optional null', () => {
    for (const limit of [0, -1]) {
      const payload = quotaFixture(accountId);
      payload.ai_credits = { ...payload.ai_credits, limit, remaining: 0, usage_ratio: 0, unlimited: true };
      expect(normalizeAccountQuotaSummary(accountId, payload).ai_credits).toMatchObject({ limit, remaining: 0, usage_ratio: 0, unlimited: true });
    }
    expect(normalizeAccountCreditLedger(accountId, { ...ledgerFixture(accountId), generated_at: null }).items).toEqual([]);
  });
  it.each([
    { account_id: 'other' }, { account_id: undefined }, { ai_credits: {} },
    { ai_credits: { ...quotaFixture(accountId).ai_credits, key: 'bound_sites', unit: 'site' } },
    { ai_credits: { ...quotaFixture(accountId).ai_credits, used: NaN } },
    { ai_credits: { ...quotaFixture(accountId).ai_credits, remaining: Infinity } },
    { ai_credits: { ...quotaFixture(accountId).ai_credits, unlimited: true } },
    { ai_credit_ledger_summary: {} }, { resource_limits: null }, { breakdown: [null] },
  ])('rejects malformed quota %j', patch => {
    expect(() => normalizeAccountQuotaSummary(accountId, { ...quotaFixture(accountId), ...patch } as never)).toThrow();
  });
  it('accepts real empty/nonempty ledger summaries, maps, negative adjustments and extensions', () => {
    const empty = ledgerFixture(accountId);
    expect(normalizeAccountCreditLedger(accountId, empty)).toEqual(empty);
    const payload = {
      ...empty, items: [ledgerEntryFixture(accountId)],
      pagination: { ...empty.pagination, total: 1 },
      summary: { ...empty.summary, entry_count: 1, net_ai_credit_delta: -10, net_used_ai_credits: 10,
        breakdown: [{ key: 'runs', quantity: 1, unit: 'run', rate: 10, ai_credits: 10 }],
        event_type_totals: { adjustment: -10 }, category_totals: { operator_adjustment: { label: 'Operator adjustment', net_ai_credit_delta: -10 } },
        optional_extension: { future: true },
      },
    };
    const normalized = normalizeAccountCreditLedger(accountId, payload);
    expect(normalized.items[0]).toMatchObject({ account_id: accountId, ai_credit_delta: -10, rate_unit: undefined });
    expect(normalized.summary).toEqual(payload.summary);
  });
  it.each([
    { pagination: undefined }, { summary: undefined }, { summary: {} }, { items: null }, { items: [null] },
    { items: [{ ...ledgerEntryFixture(accountId), account_id: 'other' }] },
    { items: [{ ...ledgerEntryFixture(accountId), account_id: undefined }] },
    { items: [{ ...ledgerEntryFixture(accountId), ledger_entry_id: '' }] },
    { items: [{ ...ledgerEntryFixture(accountId), quantity: NaN }] },
    { items: [{ ...ledgerEntryFixture(accountId), rate: undefined }] },
    { items: [{ ...ledgerEntryFixture(accountId), net_ai_credit_delta: undefined }] },
    { items: [{ ...ledgerEntryFixture(accountId), granted_ai_credits: Infinity }] },
    { summary: { ...ledgerFixture(accountId).summary, breakdown: [null] } },
    { summary: { ...ledgerFixture(accountId).summary, net_used_ai_credits: undefined } },
    { pagination: { total: 0 } },
  ])('rejects incomplete ledger evidence %j', patch => {
    expect(() => normalizeAccountCreditLedger(accountId, { ...ledgerFixture(accountId), ...patch } as never)).toThrow();
  });
});
