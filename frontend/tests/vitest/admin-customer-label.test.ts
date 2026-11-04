import { describe, expect, it } from 'vitest';
import { customerLabel } from '@/features/admin/accounts/customer-label';
import { quotaMetricNeedsAttention } from '@/features/admin/accounts/account-credit-presentation';
import type { AccountQuotaMetric } from '@/features/admin/accounts/account-credit-evidence';

describe('Customer operations evidence', () => {
  it('uses the operator label consistently without exposing generated identifiers as names', () => {
    expect(customerLabel({ account_id: 'acct_a02', name: 'A02 commercial preview', metadata: { operator_display_name: '主要用户' } }, '未命名客户')).toBe('主要用户');
    for (const name of ['acct_test', '4e69f61f9f104ba7b01555e92f66a68e', 'Fatal error: test']) {
      expect(customerLabel({ account_id: 'acct_test', name }, '未命名客户')).toBe('未命名客户');
    }
    expect(customerLabel({ name: 'Site owner', metadata: { operator_display_name: '  ' } }, 'Unknown')).toBe('Site owner');
  });

  it('distinguishes low credits from resource capacity pressure', () => {
    const credit: AccountQuotaMetric = { key: 'ai_credits', used: 2338, limit: 20300, remaining: 17962, usage_ratio: 0.12, unlimited: false, status: 'ok', unit: 'credits' };
    expect(quotaMetricNeedsAttention(credit)).toBe(false);
    expect(quotaMetricNeedsAttention({ ...credit, key: 'vector_documents', used: 164, limit: 100, usage_ratio: 1.64, status: 'limited' })).toBe(true);
    expect(quotaMetricNeedsAttention({ ...credit, usage_ratio: 0.8 })).toBe(true);
    expect(quotaMetricNeedsAttention({ ...credit, unlimited: true, limit: 0, usage_ratio: 1 })).toBe(false);
  });
});
