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
  status: string;
  generated_at?: string;
  period_start_at?: string;
  period_end_at?: string;
  ai_credits: AccountQuotaMetric;
  ai_credit_ledger_summary?: {
    consumed_ai_credits?: number;
    granted_ai_credits?: number;
    adjustment_ai_credits?: number;
    refund_ai_credits?: number;
    net_ai_credit_delta?: number;
    net_used_ai_credits?: number;
  };
  resource_limits: AccountQuotaMetric[];
  internal_limits: AccountQuotaMetric[];
  breakdown: AccountCreditBreakdownItem[];
  totals?: Record<string, number>;
};

export type AccountCreditLedgerEntry = {
  ledger_entry_id: string;
  site_id?: string;
  event_type?: string;
  source_type: string;
  source_id?: string;
  run_id?: string;
  ai_credit_delta: number;
  consumed_ai_credits: number;
  granted_ai_credits?: number;
  net_ai_credit_delta?: number;
  quantity: number;
  unit: string;
  rate?: number;
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
  pagination?: {
    limit?: number;
    offset?: number;
    total?: number;
    has_more?: boolean;
  };
  summary?: {
    total_ai_credits?: number;
    consumed_ai_credits?: number;
    granted_ai_credits?: number;
    adjustment_ai_credits?: number;
    refund_ai_credits?: number;
    net_ai_credit_delta?: number;
    net_used_ai_credits?: number;
    entry_count?: number;
    breakdown?: AccountCreditBreakdownItem[];
  };
  items: AccountCreditLedgerEntry[];
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

export function normalizeAccountQuotaSummary(
  payload: AccountQuotaSummaryPayload
): AccountQuotaSummary {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Account quota evidence is incomplete.');
  if (typeof payload.status !== 'string' || !QUOTA_STATUSES.has(payload.status)) throw new Error('Invalid account quota status');
  if (!Array.isArray(payload.resource_limits) || !Array.isArray(payload.internal_limits)) throw new Error('Account quota limits are unavailable');
  if (!payload.ai_credits || typeof payload.ai_credits !== 'object') throw new Error('Account quota evidence is incomplete.');
  return {
    status: payload.status,
    generated_at: String(payload.generated_at || ''),
    period_start_at: String(payload.period_start_at || ''),
    period_end_at: String(payload.period_end_at || ''),
    ai_credits: normalizeQuotaMetric(payload.ai_credits),
    ai_credit_ledger_summary:
      payload.ai_credit_ledger_summary &&
      typeof payload.ai_credit_ledger_summary === 'object'
        ? Object.fromEntries(Object.entries(payload.ai_credit_ledger_summary).map(([key, value]) => [key, finiteNumber(value, `ai_credit_ledger_summary.${key}`)]))
        : undefined,
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
    || payload.account_id !== accountId || !Array.isArray(payload.items)) throw new Error('Account credit ledger evidence is incomplete.');
  const pagination = payload.pagination || {};
  const summary = payload.summary || {};
  if (typeof pagination !== 'object' || Array.isArray(pagination) || typeof summary !== 'object' || Array.isArray(summary)) {
    throw new Error('Invalid account credit ledger envelope');
  }
  const normalizeInteger = (value: unknown, field: string) => {
    const number = finiteNumber(value, field);
    if (!Number.isSafeInteger(number) || number < 0) throw new Error(`Invalid account credit ledger field: ${field}`);
    return number;
  };
  const normalizedItems = payload.items.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid account credit ledger item');
    const row = item as Record<string, unknown>;
    const optionalNumber = (key: string) => row[key] === undefined ? undefined : finiteNumber(row[key], `ledger.${key}`);
    return {
      ledger_entry_id: nonEmptyString(row.ledger_entry_id, 'ledger_entry_id'),
      site_id: optionalString(row.site_id, 'ledger.site_id'),
      event_type: optionalString(row.event_type, 'ledger.event_type'),
      source_type: nonEmptyString(row.source_type, 'source_type'),
      source_id: optionalString(row.source_id, 'ledger.source_id'),
      run_id: optionalString(row.run_id, 'ledger.run_id'),
      ai_credit_delta: finiteNumber(row.ai_credit_delta, 'ai_credit_delta'),
      consumed_ai_credits: finiteNumber(row.consumed_ai_credits, 'consumed_ai_credits'),
      granted_ai_credits: optionalNumber('granted_ai_credits'),
      net_ai_credit_delta: optionalNumber('net_ai_credit_delta'),
      quantity: finiteNumber(row.quantity, 'quantity'),
      unit: nonEmptyString(row.unit, 'unit'),
      rate: optionalNumber('rate'),
      rate_unit: optionalString(row.rate_unit, 'ledger.rate_unit'),
      rate_version: optionalString(row.rate_version, 'ledger.rate_version'),
      created_at: optionalString(row.created_at, 'ledger.created_at'),
    };
  });
  return {
    account_id: payload.account_id,
    generated_at: String(payload.generated_at || ''),
    period_start_at: String(payload.period_start_at || ''),
    period_end_at: String(payload.period_end_at || ''),
    rate_version: String(payload.rate_version || ''),
    pagination: {
      limit: pagination.limit === undefined ? undefined : normalizeInteger(pagination.limit, 'pagination.limit'),
      offset: pagination.offset === undefined ? undefined : normalizeInteger(pagination.offset, 'pagination.offset'),
      total: pagination.total === undefined ? undefined : normalizeInteger(pagination.total, 'pagination.total'),
      has_more: optionalBoolean(pagination.has_more, 'pagination.has_more'),
    },
    summary: Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, key === 'entry_count' ? normalizeInteger(value, `summary.${key}`) : finiteNumber(value, `summary.${key}`)])),
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
