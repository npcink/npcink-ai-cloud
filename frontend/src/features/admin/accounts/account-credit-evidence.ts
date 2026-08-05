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
  if (!payload.ai_credits || typeof payload.ai_credits !== 'object') {
    throw new Error('Account quota evidence is incomplete.');
  }
  return {
    status: String(payload.status || 'ok'),
    generated_at: String(payload.generated_at || ''),
    period_start_at: String(payload.period_start_at || ''),
    period_end_at: String(payload.period_end_at || ''),
    ai_credits: payload.ai_credits,
    ai_credit_ledger_summary:
      payload.ai_credit_ledger_summary &&
      typeof payload.ai_credit_ledger_summary === 'object'
        ? payload.ai_credit_ledger_summary
        : undefined,
    resource_limits: Array.isArray(payload.resource_limits)
      ? payload.resource_limits
      : [],
    internal_limits: Array.isArray(payload.internal_limits)
      ? payload.internal_limits
      : [],
    breakdown: Array.isArray(payload.breakdown) ? payload.breakdown : [],
    totals:
      payload.totals && typeof payload.totals === 'object'
        ? payload.totals
        : {},
  };
}

export function normalizeAccountCreditLedger(
  accountId: string,
  payload: AccountCreditLedgerPayload
): AccountCreditLedger {
  if (!Array.isArray(payload.items)) {
    throw new Error('Account credit ledger evidence is incomplete.');
  }
  return {
    account_id: String(payload.account_id || accountId),
    generated_at: String(payload.generated_at || ''),
    period_start_at: String(payload.period_start_at || ''),
    period_end_at: String(payload.period_end_at || ''),
    rate_version: String(payload.rate_version || ''),
    pagination: payload.pagination || {},
    summary: payload.summary || {},
    items: payload.items,
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
