'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { accountDetailClient } from './account-operator-profile';

export type AccountQuotaMetric = {
  key: string;
  label?: string;
  used: number;
  limit: number;
  remaining: number;
  usage_ratio: number;
  unlimited: boolean;
  status: string;
  unit: string;
  estimated?: boolean;
  rate_version?: string;
  source?: string;
  limit_source?: string;
};

export type AccountCreditBreakdownItem = {
  key: string;
  label?: string;
  quantity: number;
  unit: string;
  rate: number;
  rate_unit?: string;
  ai_credits: number;
};

export type AccountQuotaSummary = {
  account_id: string;
  status: string;
  generated_at?: string;
  period_start_at?: string;
  period_end_at?: string;
  ai_credits: AccountQuotaMetric;
  ai_credit_ledger_summary: AccountLedgerSummary;
  resource_limits: AccountQuotaMetric[];
  internal_limits: AccountQuotaMetric[];
  breakdown: AccountCreditBreakdownItem[];
  totals?: Record<string, number>;
};

export type AccountCreditLedgerEntry = {
  ledger_entry_id: string;
  account_id: string;
  site_id?: string;
  event_type?: string;
  source_type: string;
  source_id?: string;
  run_id?: string;
  ai_credit_delta: number;
  consumed_ai_credits: number;
  granted_ai_credits: number;
  net_ai_credit_delta: number;
  quantity: number;
  unit: string;
  rate: number;
  rate_unit?: string;
  rate_version?: string;
  created_at?: string;
};

export type AccountCreditLedger = {
  account_id: string;
  generated_at?: string;
  period_start_at?: string;
  period_end_at?: string;
  rate_version?: string;
  pagination: { limit: number; offset: number; total: number; has_more: boolean };
  summary: AccountLedgerSummary & { total_ai_credits: number; breakdown: AccountCreditBreakdownItem[] };
  items: AccountCreditLedgerEntry[];
};

type AccountLedgerSummary = {
  consumed_ai_credits: number;
  granted_ai_credits: number;
  adjustment_ai_credits: number;
  refund_ai_credits: number;
  net_ai_credit_delta: number;
  net_used_ai_credits: number;
  entry_count: number;
  event_type_totals?: Record<string, number>;
  category_totals?: Record<string, { label: string; net_ai_credit_delta: number }>;
};

export type AccountQuotaSummaryPayload = Partial<AccountQuotaSummary>;
export type AccountCreditLedgerPayload = Partial<AccountCreditLedger>;

const QUOTA_STATUSES = new Set(['ok', 'near_limit', 'limited']);

function finiteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid account credit evidence field: ${field}`);
  }
  return value;
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Invalid account credit evidence field: ${field}`);
  }
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new Error(`Invalid account credit evidence field: ${field}`);
  return value;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') throw new Error(`Invalid account credit evidence field: ${field}`);
  return value;
}

function normalizeQuotaMetric(value: unknown): AccountQuotaMetric {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid account quota metric');
  }
  const metric = value as Record<string, unknown>;
  const limit = finiteNumber(metric.limit, 'limit');
  const unlimited = metric.unlimited;
  const status = metric.status;
  if (typeof unlimited !== 'boolean'
    || (unlimited !== (limit <= 0))
    || typeof status !== 'string'
    || !QUOTA_STATUSES.has(status)) {
    throw new Error('Invalid account quota metric state');
  }
  return {
    key: nonEmptyString(metric.key, 'key'),
    label: optionalString(metric.label, 'label'),
    used: finiteNumber(metric.used, 'used'),
    limit,
    remaining: finiteNumber(metric.remaining, 'remaining'),
    usage_ratio: finiteNumber(metric.usage_ratio, 'usage_ratio'),
    unlimited,
    status,
    unit: nonEmptyString(metric.unit, 'unit'),
    estimated: optionalBoolean(metric.estimated, 'estimated'),
    rate_version: optionalString(metric.rate_version, 'rate_version'),
    source: optionalString(metric.source, 'source'),
    limit_source: optionalString(metric.limit_source, 'limit_source'),
  };
}

function normalizeBreakdown(value: unknown): AccountCreditBreakdownItem[] {
  if (!Array.isArray(value)) throw new Error('Account credit breakdown is unavailable');
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('Invalid account credit breakdown item');
    }
    const row = item as Record<string, unknown>;
    return {
      key: nonEmptyString(row.key, 'breakdown.key'),
      label: optionalString(row.label, 'breakdown.label'),
      quantity: finiteNumber(row.quantity, 'breakdown.quantity'),
      unit: nonEmptyString(row.unit, 'breakdown.unit'),
      rate: finiteNumber(row.rate, 'breakdown.rate'),
      rate_unit: optionalString(row.rate_unit, 'breakdown.rate_unit'),
      ai_credits: finiteNumber(row.ai_credits, 'breakdown.ai_credits'),
    };
  });
}

function normalizeOptionalNumbers(value: unknown, field: string): Record<string, number> | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${field}`);
  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) result[key] = finiteNumber(raw, `${field}.${key}`);
  return result;
}

export const accountCreditEvidenceKeys = {
  all: ['admin', 'accounts', 'credit-evidence'] as const,
  account: (accountId: string) =>
    [...accountCreditEvidenceKeys.all, accountId] as const,
  quota: (accountId: string) =>
    [...accountCreditEvidenceKeys.account(accountId), 'quota-summary'] as const,
  ledger: (accountId: string) =>
    [...accountCreditEvidenceKeys.account(accountId), 'credit-ledger'] as const,
};

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${field}`);
  return value as Record<string, unknown>;
}

function nonNegativeInteger(value: unknown, field: string): number {
  const number = finiteNumber(value, field);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`Invalid ${field}`);
  return number;
}

// Validate fields consumed by the UI. Other serializer extensions are retained,
// without treating every extension (such as breakdown/category maps) as a number.
function normalizeLedgerSummary(value: unknown): AccountLedgerSummary {
  const summary = record(value, 'ledger summary');
  const result = { ...summary } as AccountLedgerSummary;
  for (const key of ['consumed_ai_credits', 'granted_ai_credits', 'adjustment_ai_credits',
    'refund_ai_credits', 'net_ai_credit_delta', 'net_used_ai_credits'] as const) {
    result[key] = finiteNumber(summary[key], `summary.${key}`);
  }
  result.entry_count = nonNegativeInteger(summary.entry_count, 'summary.entry_count');
  if (summary.event_type_totals != null) result.event_type_totals = normalizeOptionalNumbers(summary.event_type_totals, 'summary.event_type_totals');
  if (summary.category_totals != null) {
    result.category_totals = Object.fromEntries(Object.entries(record(summary.category_totals, 'summary.category_totals')).map(([key, raw]) => {
      const category = record(raw, `summary.category_totals.${key}`);
      return [key, { ...category,
        label: nonEmptyString(category.label, `summary.category_totals.${key}.label`),
        net_ai_credit_delta: finiteNumber(category.net_ai_credit_delta, `summary.category_totals.${key}.net_ai_credit_delta`),
      }];
    }));
  }
  return result;
}

export function normalizeAccountQuotaSummary(
  accountId: string,
  payload: AccountQuotaSummaryPayload
): AccountQuotaSummary {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Account quota evidence is incomplete.');
  if (payload.account_id !== accountId) throw new Error('Account quota evidence belongs to another customer');
  if (typeof payload.status !== 'string' || !QUOTA_STATUSES.has(payload.status)) throw new Error('Invalid account quota status');
  if (!Array.isArray(payload.resource_limits) || !Array.isArray(payload.internal_limits)) throw new Error('Account quota limits are unavailable');
  if (!payload.ai_credits || typeof payload.ai_credits !== 'object') throw new Error('Account quota evidence is incomplete.');
  const aiCredits = record(payload.ai_credits, 'ai_credits');
  if (aiCredits.key !== 'ai_credits' || aiCredits.unit !== 'ai_credits') throw new Error('Invalid account credit metric identity');
  return {
    account_id: payload.account_id,
    status: payload.status,
    generated_at: optionalString(payload.generated_at, 'generated_at'),
    period_start_at: optionalString(payload.period_start_at, 'period_start_at'),
    period_end_at: optionalString(payload.period_end_at, 'period_end_at'),
    ai_credits: normalizeQuotaMetric(payload.ai_credits),
    ai_credit_ledger_summary: normalizeLedgerSummary(payload.ai_credit_ledger_summary),
    resource_limits: payload.resource_limits.map(normalizeQuotaMetric),
    internal_limits: payload.internal_limits.map(normalizeQuotaMetric),
    breakdown: normalizeBreakdown(payload.breakdown),
    totals:
      normalizeOptionalNumbers(payload.totals, 'Account quota totals') || {},
  };
}

export function normalizeAccountCreditLedger(
  accountId: string,
  payload: AccountCreditLedgerPayload
): AccountCreditLedger {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || payload.account_id !== accountId || !Array.isArray(payload.items)
    || !payload.pagination || !payload.summary) throw new Error('Account credit ledger evidence is incomplete.');
  const pagination = payload.pagination;
  const summary = payload.summary;
  if (typeof pagination !== 'object' || Array.isArray(pagination) || typeof summary !== 'object' || Array.isArray(summary)) {
    throw new Error('Invalid account credit ledger envelope');
  }
  const normalizedItems = payload.items.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid account credit ledger item');
    const row = item as Record<string, unknown>;
    if (row.account_id !== accountId) throw new Error('Account credit ledger row belongs to another customer');
    return {
      ledger_entry_id: nonEmptyString(row.ledger_entry_id, 'ledger_entry_id'),
      account_id: nonEmptyString(row.account_id, 'ledger.account_id'),
      site_id: optionalString(row.site_id, 'ledger.site_id'),
      event_type: optionalString(row.event_type, 'ledger.event_type'),
      source_type: nonEmptyString(row.source_type, 'source_type'),
      source_id: optionalString(row.source_id, 'ledger.source_id'),
      run_id: optionalString(row.run_id, 'ledger.run_id'),
      ai_credit_delta: finiteNumber(row.ai_credit_delta, 'ai_credit_delta'),
      consumed_ai_credits: finiteNumber(row.consumed_ai_credits, 'consumed_ai_credits'),
      granted_ai_credits: finiteNumber(row.granted_ai_credits, 'ledger.granted_ai_credits'),
      net_ai_credit_delta: finiteNumber(row.net_ai_credit_delta, 'ledger.net_ai_credit_delta'),
      quantity: finiteNumber(row.quantity, 'quantity'),
      unit: nonEmptyString(row.unit, 'unit'),
      rate: finiteNumber(row.rate, 'ledger.rate'),
      rate_unit: optionalString(row.rate_unit, 'ledger.rate_unit'),
      rate_version: optionalString(row.rate_version, 'ledger.rate_version'),
      created_at: optionalString(row.created_at, 'ledger.created_at'),
    };
  });
  return {
    account_id: payload.account_id,
    generated_at: optionalString(payload.generated_at, 'generated_at'),
    period_start_at: optionalString(payload.period_start_at, 'period_start_at'),
    period_end_at: optionalString(payload.period_end_at, 'period_end_at'),
    rate_version: optionalString(payload.rate_version, 'rate_version'),
    pagination: {
      limit: nonNegativeInteger(pagination.limit, 'pagination.limit'),
      offset: nonNegativeInteger(pagination.offset, 'pagination.offset'),
      total: nonNegativeInteger(pagination.total, 'pagination.total'),
      has_more: typeof pagination.has_more === 'boolean' ? pagination.has_more : (() => { throw new Error('Invalid pagination.has_more'); })(),
    },
    summary: {
      ...normalizeLedgerSummary(summary),
      total_ai_credits: finiteNumber(summary.total_ai_credits, 'summary.total_ai_credits'),
      breakdown: normalizeBreakdown(summary.breakdown),
    },
    items: normalizedItems,
  };
}

async function requestAccountQuotaSummary(
  accountId: string,
  signal: AbortSignal
): Promise<AccountQuotaSummaryPayload> {
  return (
    await accountDetailClient.request<AccountQuotaSummaryPayload>(
      `/api/admin/accounts/${encodeURIComponent(accountId)}/quota-summary`,
      { signal }
    )
  ).data;
}

async function requestAccountCreditLedger(
  accountId: string,
  signal: AbortSignal
): Promise<AccountCreditLedgerPayload> {
  return (
    await accountDetailClient.request<AccountCreditLedgerPayload>(
      `/api/admin/accounts/${encodeURIComponent(accountId)}/credit-ledger?limit=12`,
      { signal }
    )
  ).data;
}

export function useAccountCreditEvidence(
  accountId: string,
  enabled: boolean
) {
  const queryClient = useQueryClient();
  const quotaQuery = useQuery({
    queryKey: accountCreditEvidenceKeys.quota(accountId),
    queryFn: async ({ signal }) =>
      normalizeAccountQuotaSummary(
        accountId,
        await requestAccountQuotaSummary(accountId, signal)
      ),
    enabled: enabled && Boolean(accountId),
  });
  const ledgerQuery = useQuery({
    queryKey: accountCreditEvidenceKeys.ledger(accountId),
    queryFn: async ({ signal }) =>
      normalizeAccountCreditLedger(
        accountId,
        await requestAccountCreditLedger(accountId, signal)
      ),
    enabled: enabled && Boolean(accountId),
  });
  const invalidate = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: accountCreditEvidenceKeys.account(accountId),
      }),
    [accountId, queryClient]
  );

  return {
    quotaSummary: quotaQuery.isError ? null : quotaQuery.data ?? null,
    creditLedger: ledgerQuery.isError ? null : ledgerQuery.data ?? null,
    quotaQuery,
    ledgerQuery,
    invalidate,
  };
}
