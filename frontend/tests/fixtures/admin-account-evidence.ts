// Shapes follow _admin_mixin.py quota/ledger serializers, including nested maps.
export function ledgerSummaryFixture() {
  return {
    consumed_ai_credits: 0, granted_ai_credits: 0, adjustment_ai_credits: 0,
    refund_ai_credits: 0, net_ai_credit_delta: 0, net_used_ai_credits: 0,
    entry_count: 0, event_type_totals: {}, category_totals: {},
  };
}
export function quotaFixture(accountId: string) {
  return {
    account_id: accountId, status: 'ok', generated_at: '2026-11-01T00:00:00Z',
    period_start_at: '2026-11-01T00:00:00Z', period_end_at: '2026-12-01T00:00:00Z',
    ai_credits: { key: 'ai_credits', used: 0, limit: 100, remaining: 100, usage_ratio: 0, unlimited: false, status: 'ok', unit: 'ai_credits' },
    ai_credit_ledger_summary: ledgerSummaryFixture(),
    resource_limits: [], internal_limits: [], breakdown: [], totals: {},
  };
}
export function ledgerFixture(accountId: string) {
  return {
    account_id: accountId, generated_at: '2026-11-01T00:00:00Z',
    period_start_at: '2026-11-01T00:00:00Z', period_end_at: '2026-12-01T00:00:00Z', rate_version: 'ai-credit-ledger-v2',
    pagination: { limit: 12, offset: 0, total: 0, has_more: false },
    summary: { ...ledgerSummaryFixture(), total_ai_credits: 0, breakdown: [] },
    items: [],
  };
}
export function ledgerEntryFixture(accountId: string) {
  return {
    ledger_entry_id: 'cle_negative', account_id: accountId, site_id: '',
    event_type: 'adjustment', source_type: 'operator_credit_adjustment', source_id: 'operation_1', run_id: '',
    ai_credit_delta: -10, consumed_ai_credits: 10, granted_ai_credits: 0, net_ai_credit_delta: -10,
    quantity: 10, unit: 'ai_credits', rate: 1, rate_unit: null, rate_version: 'ai-credit-ledger-v2',
    created_at: '2026-11-01T00:00:00Z', provider_call_id: null, metadata: {},
  };
}
