import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createApiClient } from '@/lib/api-client';

export type BudgetStateMetric = {
  current_total?: number;
  limit?: number;
  over_limit?: boolean;
};

export type SiteRuntimeData = {
  totalRuns: number;
  failedRuns: number;
  lastRunAt: string | null;
  costEstimate: number;
  tokensTotal: number;
  providerCalls: number;
  budgetState: Record<string, BudgetStateMetric>;
  siteLimit: number;
  activeKeyCount: number;
  subscriptionStatus: string;
  coverageState: string;
  packageLabel: string;
};

export type SiteRuntimeApiPayload = {
  usage_summary?: {
    cost_estimate?: number;
    tokens_total?: number;
  };
  runtime_summary?: {
    total_runs?: number;
    failed_runs?: number;
    last_run_at?: string | null;
  };
  commercial_policy?: {
    usage_totals?: {
      cost_usd?: number;
      cost_cny?: number;
      tokens_total?: number;
      provider_calls?: number;
    };
    budget_state?: Record<string, BudgetStateMetric>;
    entitlement_snapshot?: { site_limit?: number };
  };
  coverage?: {
    site_limit?: number;
    subscription_status?: string;
    coverage_state?: string;
    display_package_label?: string;
  };
  site_keys?: Array<{ status?: string }>;
  subscription?: { status?: string };
};

export type AccountSiteRuntimeResult = {
  items: Record<string, SiteRuntimeData>;
  failedSiteIds: string[];
  loadedAt: number;
};

export type SiteRuntimeRequest = (
  siteId: string,
  signal: AbortSignal
) => Promise<SiteRuntimeApiPayload>;

const accountSiteRuntimeClient = createApiClient({
  idempotencyPrefix: 'admin_account_site_runtime',
});

export function normalizeAccountSiteIds(siteIds: string[]): string[] {
  return [...new Set(siteIds.map((siteId) => siteId.trim()).filter(Boolean))].sort();
}

export const accountSiteRuntimeKeys = {
  all: ['admin', 'accounts', 'site-runtime'] as const,
  account: (accountId: string) =>
    [...accountSiteRuntimeKeys.all, accountId] as const,
  detail: (accountId: string, siteIds: string[]) =>
    [
      ...accountSiteRuntimeKeys.account(accountId),
      normalizeAccountSiteIds(siteIds),
    ] as const,
};

export function normalizeSiteRuntimeData(
  siteData: SiteRuntimeApiPayload
): SiteRuntimeData {
  const usageSummary = siteData.usage_summary || {};
  const runtimeSummary = siteData.runtime_summary || {};
  const commercialPolicy = siteData.commercial_policy || {};
  const policyUsageTotals = commercialPolicy.usage_totals || {};
  const budgetState =
    commercialPolicy.budget_state &&
    typeof commercialPolicy.budget_state === 'object'
      ? commercialPolicy.budget_state
      : {};
  const entitlementSnapshot = commercialPolicy.entitlement_snapshot || {};
  const coverage = siteData.coverage || {};
  const siteKeys = Array.isArray(siteData.site_keys) ? siteData.site_keys : [];

  return {
    totalRuns: Number(runtimeSummary.total_runs ?? 0),
    failedRuns: Number(runtimeSummary.failed_runs ?? 0),
    lastRunAt: runtimeSummary.last_run_at || null,
    costEstimate: Number(
      budgetState.cost?.current_total ??
        usageSummary.cost_estimate ??
        policyUsageTotals.cost_cny ??
        0
    ),
    tokensTotal: Number(
      budgetState.tokens?.current_total ??
        usageSummary.tokens_total ??
        policyUsageTotals.tokens_total ??
        0
    ),
    providerCalls: Number(policyUsageTotals.provider_calls ?? 0),
    budgetState,
    siteLimit: Number(
      entitlementSnapshot.site_limit ?? coverage.site_limit ?? 0
    ),
    activeKeyCount: siteKeys.filter((key) => key.status === 'active').length,
    subscriptionStatus: String(
      siteData.subscription?.status ||
        coverage.subscription_status ||
        'unknown'
    ),
    coverageState: String(coverage.coverage_state || 'unknown'),
    packageLabel: String(coverage.display_package_label || ''),
  };
}

async function requestSiteRuntime(
  siteId: string,
  signal: AbortSignal
): Promise<SiteRuntimeApiPayload> {
  return (
    await accountSiteRuntimeClient.request<SiteRuntimeApiPayload>(
      `/api/admin/sites/${encodeURIComponent(siteId)}`,
      { signal }
    )
  ).data;
}

export async function fetchAccountSiteRuntime(
  siteIds: string[],
  signal: AbortSignal,
  request: SiteRuntimeRequest = requestSiteRuntime
): Promise<AccountSiteRuntimeResult> {
  const normalizedSiteIds = normalizeAccountSiteIds(siteIds);
  const settled = await Promise.allSettled(
    normalizedSiteIds.map(async (siteId) => ({
      siteId,
      runtime: normalizeSiteRuntimeData(await request(siteId, signal)),
    }))
  );

  if (signal.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new Error('Account site runtime request was cancelled.');
  }

  const items: Record<string, SiteRuntimeData> = {};
  const failedSiteIds: string[] = [];
  let firstFailure: unknown;

  settled.forEach((result, index) => {
    const siteId = normalizedSiteIds[index];
    if (result.status === 'fulfilled') {
      items[result.value.siteId] = result.value.runtime;
      return;
    }
    failedSiteIds.push(siteId);
    firstFailure ??= result.reason;
  });

  if (
    normalizedSiteIds.length > 0 &&
    failedSiteIds.length === normalizedSiteIds.length
  ) {
    throw firstFailure instanceof Error
      ? firstFailure
      : new Error('Account site runtime data is unavailable.');
  }

  return {
    items,
    failedSiteIds,
    loadedAt: Date.now(),
  };
}

export function useAccountSiteRuntime(
  accountId: string,
  siteIds: string[],
  enabled: boolean
) {
  const queryClient = useQueryClient();
  const normalizedSiteIds = normalizeAccountSiteIds(siteIds);
  const query = useQuery({
    queryKey: accountSiteRuntimeKeys.detail(accountId, normalizedSiteIds),
    queryFn: ({ signal }) =>
      fetchAccountSiteRuntime(normalizedSiteIds, signal),
    enabled: enabled && normalizedSiteIds.length > 0,
  });
  const invalidate = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: accountSiteRuntimeKeys.account(accountId),
      }),
    [accountId, queryClient]
  );

  return { ...query, invalidate };
}
