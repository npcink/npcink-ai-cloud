'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { LoadingFallback } from '@/components/ui/LoadingFallback';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';
import { PortalWorkspaceHeader } from '@/components/portal/PortalWorkspaceHeader';
import {
  PortalEmptyState,
  PortalErrorState,
  PortalLoadingState,
  PortalSiteSwitchingNotice,
  PortalSignedOutState,
} from '@/components/portal/PortalPageState';
import { UsageBarChart } from '@/components/ui/UsageChart';
import { useLocale } from '@/contexts/LocaleContext';
import { usePortalSiteSelection } from '@/hooks/usePortalSiteSelection';
import { useRetry } from '@/hooks/useRetry';
import { useSession } from '@/hooks/useSession';
import {
  getPortalSiteDisplayName,
  getPortalSiteSecondaryLabel,
  getPortalSiteWordPressUrl,
} from '@/lib/portal-site-display';
import {
  portalClient,
  type Entitlements,
  type PortalCreditPackCatalogPayload,
  type PortalCreditPackPaymentOrder,
  type PortalCreditLedgerPayload,
  type PortalPaymentOrderListPayload,
  type PortalUsageSummaryPayload,
  type PortalUsageWindow,
} from '@/lib/portal-client';
import { resolveCustomerPackageDisplay } from '@/lib/customer-package-display';
import {
  DEFAULT_PORTAL_CURRENCY,
  formatPortalCurrency,
  normalizePortalCurrency,
} from '@/lib/currency';
import { formatPortalErrorMessage } from '@/lib/portal-error';
import { cn, formatCompactNumber, formatDate, formatNumber } from '@/lib/utils';
import {
  BackofficePageStack,
  BackofficeSectionPanel,
  BackofficeStackCard,
} from '@/components/backoffice/BackofficeScaffold';

function toChartPoint(
  window: PortalUsageWindow | undefined,
  label: string,
): { date: string; requests: number; tokens: number; cost: number } | null {
  if (!window) return null;
  return {
    date: label,
    requests: Number(window.runs_total || 0),
    tokens: Number(window.tokens_in_total || 0) + Number(window.tokens_out_total || 0),
    cost: Number(window.cost_total || 0),
  };
}

function formatQuotaValue(value: unknown, unlimited = false, unlimitedLabel = 'Unlimited'): string {
  if (unlimited) return unlimitedLabel;
  return formatNumber(Math.round(Number(value || 0)));
}

function formatSignedCreditDelta(value: number): string {
  const rounded = Math.round(Number(value || 0));
  const formatted = formatNumber(Math.abs(rounded));
  if (rounded > 0) return `+${formatted}`;
  if (rounded < 0) return `-${formatted}`;
  return formatted;
}

function quotaStatusTone(status: string | undefined): 'ok' | 'warning' | 'error' {
  if (status === 'limited') return 'error';
  if (status === 'near_limit') return 'warning';
  return 'ok';
}

function portalQuotaResourceLabel(
  key: string,
  t: (key: string, vars?: Record<string, string>, fallback?: string) => string
): string {
  const labels: Record<string, string> = {
    bound_sites: t('portal.usage.resource_bound_sites', {}, 'Bound sites'),
    active_api_key_sites: t('portal.usage.resource_active_keys', {}, 'Active API keys'),
    concurrent_runs: t('portal.usage.resource_concurrent_runs', {}, 'Concurrent runs'),
    batch_items: t('portal.usage.resource_batch_items', {}, 'Batch items'),
    vector_documents: t('portal.usage.resource_vector_documents', {}, 'Knowledge articles'),
    vector_chunks: t('portal.usage.resource_vector_chunks', {}, 'Knowledge pieces'),
    vector_sync_documents_per_run: t('portal.usage.resource_sync_documents', {}, 'Sync articles/run'),
    vector_sync_chunks_per_run: t('portal.usage.resource_sync_chunks', {}, 'Sync chunks/run'),
  };
  return labels[key] || key;
}

function portalCreditBreakdownLabel(
  key: string,
  fallback: string,
  t: (key: string, vars?: Record<string, string>, fallback?: string) => string
): string {
  const labels: Record<string, string> = {
    runs: t('portal.usage.breakdown_runs', {}, 'Hosted runs'),
    tokens_total: t('portal.usage.breakdown_tokens', {}, 'Point usage'),
    web_search: t('portal.usage.breakdown_search', {}, 'Search'),
    image_recommendation: t('portal.usage.breakdown_image', {}, 'Image recommendation'),
    provider_calls_other: t('portal.usage.breakdown_provider_other', {}, 'Other service usage'),
    vector_documents: t('portal.usage.breakdown_vector_documents', {}, 'Knowledge articles'),
    vector_chunks: t('portal.usage.breakdown_vector_chunks', {}, 'Knowledge pieces'),
  };
  return labels[key] || fallback || key;
}

function PortalUsageContent() {
  const searchParams = useSearchParams();
  const { t } = useLocale();
  const { session, isLoading: sessionLoading, isAuthenticated, selectSite } = useSession();
  const { sites, selectedSiteId, selectedSite, isSwitchingSite, switchingSiteName, setSelectedSiteId } = usePortalSiteSelection({
    session,
    isAuthenticated,
    searchParams,
    selectSite,
  });
  const [usage, setUsage] = useState<PortalUsageSummaryPayload | null>(null);
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [creditLedger, setCreditLedger] = useState<PortalCreditLedgerPayload | null>(null);
  const [creditPacks, setCreditPacks] = useState<PortalCreditPackCatalogPayload | null>(null);
  const [paymentOrders, setPaymentOrders] = useState<PortalPaymentOrderListPayload | null>(null);
  const [creditPackOrder, setCreditPackOrder] = useState<PortalCreditPackPaymentOrder | null>(null);
  const [creditPackPending, setCreditPackPending] = useState<string | null>(null);
  const [creditPackError, setCreditPackError] = useState<string | null>(null);

  const loadBundle = useCallback(async () => {
    if (!selectedSiteId) return;
    const bundle = await portalClient.getUsageBundle(selectedSiteId);
    setUsage(bundle.usage);
    setEntitlements(bundle.entitlements);
    setCreditLedger(bundle.creditLedger);
    setCreditPacks(bundle.creditPacks);
    setPaymentOrders(bundle.paymentOrders);
  }, [selectedSiteId]);

  const { execute, isLoading: retryLoading, error: retryError, retry } = useRetry(loadBundle, {
    maxRetries: 2,
    initialDelay: 800,
    backoffMultiplier: 2,
  });

  useEffect(() => {
    if (!session || !isAuthenticated || !selectedSiteId) {
      return;
    }
    void execute();
  }, [isAuthenticated, selectedSiteId, session, execute]);

  const handleSiteChange = async (siteId: string) => {
    await setSelectedSiteId(siteId);
    setCreditPackOrder(null);
    setCreditPackError(null);
    setPaymentOrders(null);
  };

  const handleCreateCreditPackOrder = async (packId: string) => {
    if (!selectedSiteId) return;
    setCreditPackPending(packId);
    setCreditPackError(null);
    setCreditPackOrder(null);
    try {
      const response = await portalClient.createCreditPackOrder(selectedSiteId, packId);
      setCreditPackOrder(response.data.order);
      setPaymentOrders((current) => ({
        ...(current || { items: [] }),
        items: [
          response.data.order,
          ...(current?.items || []).filter((item) => item.order_id !== response.data.order.order_id),
        ].slice(0, 8),
      }));
      if (response.data.order.checkout_url) {
        window.location.assign(response.data.order.checkout_url);
      }
    } catch (err) {
      setCreditPackError(formatPortalErrorMessage(err, t, t('error.failed_save')));
    } finally {
      setCreditPackPending(null);
    }
  };

  const toFinite = (value: unknown): number => {
    const numeric = Number(value || 0);
    return Number.isFinite(numeric) ? numeric : 0;
  };

  const errorMessage = retryError
    ? formatPortalErrorMessage(retryError, t, t('error.failed_load'))
    : null;

  const chartData = useMemo(() => {
    const points = [
      toChartPoint(usage?.windows?.today, t('portal.usage.window_today', {}, 'Today')),
      toChartPoint(usage?.windows?.rolling_24h, t('portal.usage.window_rolling_24h', {}, '24h')),
    ].filter(Boolean) as { date: string; requests: number; tokens: number; cost: number }[];
    return points;
  }, [usage, t]);

  if (sessionLoading || retryLoading) {
    return <PortalLoadingState message={t('common.loading')} />;
  }

  if (!isAuthenticated || !session) {
    return (
      <PortalSignedOutState
        title={t('auth.not_signed_in')}
        description={t('auth.please_sign_in')}
        actionLabel={t('nav.sign_in')}
      />
    );
  }

  if (errorMessage) {
    return (
      <PortalErrorState
        title={t('common.error')}
        description={errorMessage}
        retryLabel={t('common.retry')}
        onRetry={() => void retry()}
      />
    );
  }

  const usageWindow = usage?.windows?.rolling_24h || usage?.windows?.today || null;
  const entitlementSnapshot = (entitlements?.entitlement_snapshot || {}) as {
    entitlements?: Record<string, unknown>;
    requests_limit?: number;
    tokens_limit?: number;
    budgets?: {
      max_runs_per_period?: number;
      max_tokens_per_period?: number;
      max_cost_per_period?: number;
    };
  };
  const planVersion = (entitlements?.plan_version || {}) as {
    plan_id?: string;
    plan_version_id?: string;
    version_label?: string;
    budgets?: {
      max_runs_per_period?: number;
      max_tokens_per_period?: number;
      max_cost_per_period?: number;
    };
  };
  const featureList = Array.from(
    new Set(
      Object.values(entitlementSnapshot.entitlements || {})
        .flatMap((entry) => (Array.isArray(entry) ? entry : []))
        .map((entry) => String(entry))
        .filter(Boolean)
    )
  );
  const runsLimit = planVersion.budgets?.max_runs_per_period || 0;
  const tokensLimit = planVersion.budgets?.max_tokens_per_period || 0;
  const costLimit =
    planVersion.budgets?.max_cost_per_period ||
    entitlementSnapshot.budgets?.max_cost_per_period ||
    0;
  const budgetState = entitlements?.budget_state || {};
  const runBudgetState = budgetState.runs || {};
  const tokenBudgetState = budgetState.tokens || {};
  const costBudgetState = budgetState.cost || {};
  const overBudget = Object.values(budgetState).some((entry) => Boolean(entry?.over_limit));
  const subscription = entitlements?.subscription || null;
  const planDisplay = resolveCustomerPackageDisplay(t, {
    planId: planVersion.plan_id || subscription?.plan_id || session.current_subscription?.plan_id,
    planVersionId:
      planVersion.plan_version_id ||
      subscription?.plan_version_id ||
      session.current_subscription?.plan_version_id,
    packageAlias: session.current_subscription?.package_alias,
    formalPlanName: selectedSite?.plan_name,
    planKind: session.current_subscription?.plan_kind,
    coverageState: subscription || session.current_subscription ? 'covered' : 'uncovered',
  });
  const planLabel = planDisplay.display_package_label || t('common.plan');
  const graceState = entitlements?.subscription_grace || {};
  const quotaSummary = entitlements?.quota_summary || null;
  const quotaCredit = quotaSummary?.credit || null;
  const quotaResources = Array.isArray(quotaSummary?.resource_limits)
    ? quotaSummary.resource_limits
    : [];
  const quotaBreakdown = Array.isArray(quotaSummary?.breakdown)
    ? quotaSummary.breakdown
    : [];
  const creditLedgerItems = creditLedger?.items || [];
  const creditLedgerTotal = Number(
    creditLedger?.summary?.net_used_credits ?? creditLedger?.summary?.total_credits ?? 0
  );
  const creditLedgerCount = Number(creditLedger?.pagination?.total ?? creditLedger?.summary?.entry_count ?? 0);
  const availableCreditPacks = creditPacks?.items || [];
  const recentPaymentOrders = paymentOrders?.items || [];
  const unlimitedLabel = t('common.unlimited', {}, 'Unlimited');
  const quotaResourceByKey = new Map(
    quotaResources.map((item) => [String(item.key || ''), item])
  );
  const boundSitesResource = quotaResourceByKey.get('bound_sites');
  const remainingRequests = Math.max(0, toFinite(runBudgetState.limit || runsLimit) - toFinite(runBudgetState.current_total));
  const remainingTokens = Math.max(0, toFinite(tokenBudgetState.limit || tokensLimit) - toFinite(tokenBudgetState.current_total));
  const remainingCost = Math.max(0, toFinite(costBudgetState.limit || costLimit) - toFinite(costBudgetState.current_total));
  const formatPreferredCurrency = (value: number) => formatPortalCurrency(value, { to: DEFAULT_PORTAL_CURRENCY });
  const headroomTone =
    overBudget
      ? t('status.over_budget')
      : remainingRequests === 0 || remainingTokens === 0 || remainingCost === 0
        ? t('portal.usage.headroom_low', {}, 'At limit')
        : remainingRequests < Math.max(1, Math.floor(toFinite(runBudgetState.limit || runsLimit) * 0.2)) ||
            remainingTokens < Math.max(1, Math.floor(toFinite(tokenBudgetState.limit || tokensLimit) * 0.2)) ||
            remainingCost < toFinite(costBudgetState.limit || costLimit) * 0.2
          ? t('portal.usage.headroom_watch', {}, 'Close to limit')
          : t('status.within_budget');
  const budgetExplanations = [
    runBudgetState.over_limit
      ? t(
          'portal.usage.runs_over_limit_explainer',
          {},
          'Run usage is already above the frozen package limit for this period.'
        )
      : '',
    tokenBudgetState.over_limit
      ? t(
          'portal.usage.tokens_over_limit_explainer',
          {},
          'Point usage is already above the package limit for this period.'
        )
      : '',
    costBudgetState.over_limit
      ? t(
          'portal.usage.cost_over_limit_explainer',
          {},
          'Detailed service cost is already above the package budget for this period.'
        )
      : '',
    graceState.active
      ? t(
          'portal.usage.subscription_grace_explainer',
          {},
          'A subscription grace rule is active. Operator review may keep service available until the listed grace deadline.'
        )
      : '',
  ].filter(Boolean);

  const runUtilizationPct = toFinite(runBudgetState.limit || runsLimit) > 0
    ? Math.min(100, Math.round((toFinite(runBudgetState.current_total) / toFinite(runBudgetState.limit || runsLimit)) * 100))
    : 0;
  const tokenUtilizationPct = toFinite(tokenBudgetState.limit || tokensLimit) > 0
    ? Math.min(100, Math.round((toFinite(tokenBudgetState.current_total) / toFinite(tokenBudgetState.limit || tokensLimit)) * 100))
    : 0;
  const costUtilizationPct = toFinite(costBudgetState.limit || costLimit) > 0
    ? Math.min(100, Math.round((toFinite(costBudgetState.current_total) / toFinite(costBudgetState.limit || costLimit)) * 100))
    : 0;

  const headroomMetrics = [
    quotaCredit
      ? {
          label: t('portal.usage.ai_credits_label', {}, 'Package points'),
          value: `${formatQuotaValue(quotaCredit.used)} / ${formatQuotaValue(quotaCredit.limit, Boolean(quotaCredit.unlimited), unlimitedLabel)}`,
          detail: t('portal.usage.ai_credits_metric_detail', {}, 'Points used in the current package.'),
        }
      : {
          label: t('portal.usage.remaining_requests_test_label', {}, 'Requests left'),
          value: formatNumber(remainingRequests),
          detail: `${formatNumber(toFinite(runBudgetState.current_total))} / ${formatNumber(toFinite(runBudgetState.limit || runsLimit))}`,
        },
    boundSitesResource
      ? {
          label: t('portal.usage.resource_bound_sites', {}, 'Bound sites'),
          value: `${formatQuotaValue(boundSitesResource.used)} / ${formatQuotaValue(boundSitesResource.limit, Boolean(boundSitesResource.unlimited), unlimitedLabel)}`,
          detail: t('portal.usage.resource_bound_sites_detail', {}, 'Sites attached to this account.'),
        }
      : {
          label: t('portal.usage.remaining_service_uses_label', {}, 'Service uses left'),
          value: formatNumber(remainingRequests),
          detail: t('portal.usage.remaining_service_uses_detail', {}, 'Included service usage left.'),
        },
    {
      label: t('common.status'),
      value: quotaStatusTone(quotaSummary?.status) === 'error' || overBudget
        ? t('portal.home.service_status_attention', {}, 'Needs attention')
        : quotaStatusTone(quotaSummary?.status) === 'warning'
          ? t('portal.usage.headroom_watch', {}, 'Close to limit')
          : t('portal.home.risk_level_normal', {}, 'Normal'),
      detail: t('portal.usage.status_plain_detail', {}, 'Use the numbers below to decide whether you need more points.'),
    },
  ];

  const primarySummaryItems = [
    {
      label: t('common.site'),
      value: getPortalSiteDisplayName(selectedSite) || t('portal.current_site', {}, 'Current site'),
      detail:
        getPortalSiteWordPressUrl(selectedSite) ||
        t('portal.site_url_missing', {}, 'WordPress URL not configured'),
    },
    {
      label: t('portal.usage.context_generated'),
      value: usage?.generated_at ? formatDate(usage.generated_at) : t('common.not_found'),
      detail: usage?.timezone || t('common.unknown'),
      size: 'compact',
    },
    {
      label: t('portal.usage.context_window'),
      value: usageWindow ? `${formatDate(usageWindow.start_at)} - ${formatDate(usageWindow.end_at)}` : t('common.not_found'),
      detail: t('backoffice.summary_window'),
      size: 'compact',
    },
  ];

  return (
    <BackofficePageStack>
      <PortalWorkspaceHeader
        eyebrow={t('portal.usage.plan_summary_label', {}, 'Package')}
        title={t('portal.nav_usage', {}, 'Plan and usage')}
        eyebrowInfo={t(
          'portal.usage.primary_desc',
          {},
          'Review the current package, remaining usage, and available credit packs for this site.'
        )}
        currentPage="usage"
        selectedSiteId={selectedSiteId}
        selectedSiteName={selectedSite?.site_name}
        sites={sites}
        onSiteChange={handleSiteChange}
        metrics={headroomMetrics.length > 0 ? headroomMetrics : primarySummaryItems}
        metricsColumnsClassName={headroomMetrics.length > 0 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}
      >
        <div className="max-w-sm">
          <label htmlFor="portal-usage-site-select" className="sr-only">
            {t('common.site')}
          </label>
          <select
            id="portal-usage-site-select"
            value={selectedSiteId}
            onChange={(event) => void handleSiteChange(event.target.value)}
            className="input"
          >
            {sites.map((site) => (
              <option key={site.site_id} value={site.site_id}>
                {getPortalSiteDisplayName(site) || site.site_id}
              </option>
            ))}
          </select>
        </div>
      </PortalWorkspaceHeader>

      {isSwitchingSite ? (
        <PortalSiteSwitchingNotice
          message={t(
            'portal.site_switching_notice_with_target',
            { site: switchingSiteName || selectedSite?.site_name || selectedSiteId },
            `Switching to ${switchingSiteName || selectedSite?.site_name || selectedSiteId}. Page data will update automatically.`
          )}
        />
      ) : null}

      {quotaSummary && quotaCredit ? (
        <div data-portal-usage="plan-summary">
          <BackofficeSectionPanel className="space-y-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                  {t('portal.usage.plan_summary_label', {}, 'Package')}
                </p>
                <h2 className="mt-2 text-xl font-semibold text-gray-950 dark:text-white">
                  {t('portal.usage.plan_summary_title', {}, 'Current package')}
                </h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-400">
                  {t(
                    'portal.usage.plan_summary_desc',
                    {},
                    'Start here to confirm the package, remaining credits, and whether this site needs more headroom.'
                  )}
                </p>
              </div>
              <BackofficeStatusBadge
                status={quotaStatusTone(quotaSummary.status)}
                label={
                  quotaStatusTone(quotaSummary.status) === 'ok'
                    ? t('portal.home.risk_level_normal', {}, 'Normal')
                    : t('portal.home.filter_attention_only', {}, 'Needs attention')
                }
              />
            </div>

            <BackofficeStackCard className="bg-white/80 dark:bg-slate-950/45" data-portal-usage="current-package">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                  {t('portal.current_subscription_label', {}, 'Current package')}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <p className="truncate text-lg font-semibold text-gray-950 dark:text-white">
                    {planLabel}
                  </p>
                  <BackofficeStatusBadge
                    status={overBudget ? 'over_budget' : 'within_budget'}
                    label={overBudget ? t('status.over_budget') : t('status.within_budget')}
                  />
                </div>
                <p className="mt-1 truncate text-sm text-gray-600 dark:text-gray-400">
                  {getPortalSiteWordPressUrl(selectedSite) ||
                    t('portal.site_url_missing', {}, 'WordPress URL not configured')}
                </p>
              </div>
              <div className="grid gap-2 text-sm text-slate-700 dark:text-slate-200 sm:grid-cols-3 lg:min-w-[34rem]">
                <span className="rounded-2xl border border-slate-200/80 px-3 py-2 dark:border-slate-800">
                  {t('portal.usage.package_credit_allowance_label', {}, 'Package credits')}:{' '}
                  <strong>
                    {quotaCredit
                      ? formatQuotaValue(quotaCredit.limit, Boolean(quotaCredit.unlimited), unlimitedLabel)
                      : formatNumber(runsLimit)}
                  </strong>
                </span>
                <span className="rounded-2xl border border-slate-200/80 px-3 py-2 dark:border-slate-800">
                  {t('portal.usage.site_allowance_label', {}, 'Sites')}:{' '}
                  <strong>
                    {boundSitesResource
                      ? `${formatQuotaValue(boundSitesResource.used)} / ${formatQuotaValue(boundSitesResource.limit, Boolean(boundSitesResource.unlimited), unlimitedLabel)}`
                      : t('common.not_found')}
                  </strong>
                </span>
                <span className="rounded-2xl border border-slate-200/80 px-3 py-2 dark:border-slate-800">
                  {t('common.status')}: <strong>{headroomTone}</strong>
                </span>
              </div>
            </div>
          </BackofficeStackCard>

          <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <BackofficeStackCard className="bg-white/80 dark:bg-slate-950/45">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-950 dark:text-white">
                    {t('portal.usage.ai_credits_label', {}, 'Package points')}
                  </p>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    {quotaCredit.estimated
                      ? t('portal.usage.ai_credits_estimated_desc', {}, 'Final records are still being prepared, so this is an estimate.')
                      : t('portal.usage.ai_credits_actual_desc', {}, 'Credits recorded for this package period.')}
                  </p>
                </div>
                <p className="text-right text-lg font-semibold text-gray-950 dark:text-white">
                  {formatQuotaValue(quotaCredit.used)} / {formatQuotaValue(quotaCredit.limit, Boolean(quotaCredit.unlimited), unlimitedLabel)}
                </p>
              </div>
              {!quotaCredit.unlimited ? (
                <div className="mt-4">
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        quotaCredit.status === 'limited'
                          ? 'bg-red-500'
                          : quotaCredit.status === 'near_limit'
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                      )}
                      style={{ width: `${Math.min(100, Math.max(0, Number(quotaCredit.usage_ratio || 0) * 100))}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    {t('portal.usage.remaining_credits', {}, 'Remaining')}: {formatQuotaValue(quotaCredit.remaining)}
                  </p>
                </div>
              ) : null}
              <details className="mt-4 overflow-hidden rounded-[1rem] border border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/35">
                <summary className="cursor-pointer px-3 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 hover:bg-white/70 dark:text-gray-400 dark:hover:bg-slate-900/60">
	                  {t('portal.usage.plan_detail_toggle', {}, 'Point rules and details')}
	                </summary>
	                <div className="grid gap-2 border-t border-slate-200 p-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
	                  <div className="flex items-center justify-between gap-3">
	                    <span>{t('portal.usage.credit_policy_renewal', {}, 'Renewal')}</span>
                    <span className="text-right font-medium text-slate-900 dark:text-slate-100">
                      {t('portal.usage.credit_policy_renewal_monthly', {}, 'Plan credits reset each package period')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>{t('portal.usage.credit_policy_topup', {}, 'Top-ups')}</span>
                    <span className="text-right font-medium text-slate-900 dark:text-slate-100">
                      {t('portal.usage.credit_policy_topup_current_period', {}, 'Credit packs apply to the selected period only')}
                    </span>
                  </div>
                  {quotaBreakdown.length > 0 ? (
                    <div className="mt-2 divide-y divide-slate-200 text-sm dark:divide-slate-800">
                      {quotaBreakdown.map((item) => (
                        <div key={item.key || item.label} className="flex items-start justify-between gap-4 py-2">
                          <div>
                            <p className="font-medium text-slate-900 dark:text-slate-100">
                              {portalCreditBreakdownLabel(String(item.key || ''), String(item.label || ''), t)}
                            </p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              {formatQuotaValue(item.quantity)} {item.unit}
                            </p>
                          </div>
                          <p className="text-right font-semibold text-slate-950 dark:text-white">
                            {formatQuotaValue(item.credits)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </details>
            </BackofficeStackCard>
            <details className="overflow-hidden rounded-[1.1rem] border border-slate-200/80 bg-white/80 dark:border-slate-800 dark:bg-slate-950/45">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-950 hover:bg-slate-50 dark:text-white dark:hover:bg-slate-900/60">
                {t('portal.usage.more_limits_title', {}, 'More package limits')}
              </summary>
              <div className="space-y-4 border-t border-slate-200 p-4 dark:border-slate-800">
                {quotaResources.map((resource) => {
                  const status = String(resource.status || 'ok');
                  const progress = resource.unlimited
                    ? 0
                    : Math.min(100, Math.max(0, Number(resource.usage_ratio || 0) * 100));
                  return (
                    <div key={resource.key} className="border-b border-slate-200 pb-4 last:border-b-0 dark:border-slate-800">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                            {portalQuotaResourceLabel(String(resource.key || ''), t)}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">
                            {formatQuotaValue(resource.used)} / {formatQuotaValue(resource.limit, Boolean(resource.unlimited), unlimitedLabel)}
                          </p>
                        </div>
                        <p className="text-right text-xs text-slate-500 dark:text-slate-400">
                          {resource.unlimited ? unlimitedLabel : `${Math.round(progress)}%`}
                        </p>
                      </div>
                      {!resource.unlimited ? (
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              status === 'limited'
                                ? 'bg-red-500'
                                : status === 'near_limit'
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                            )}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </details>
          </div>
          {availableCreditPacks.length > 0 ? (
            <BackofficeStackCard className="bg-white/80 dark:bg-slate-950/45">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-950 dark:text-white">
                    {t('portal.usage.credit_packs_title', {}, 'Credit packs')}
                  </p>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    {t(
                      'portal.usage.credit_packs_desc',
                      {},
	                      'Add points to the current package period without changing your plan.'
                    )}
                  </p>
                </div>
                <BackofficeStatusBadge
                  status="warning"
                  label={t('portal.usage.credit_packs_period_badge', {}, 'Current period')}
                />
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {availableCreditPacks.map((pack) => (
                  <div
                    key={pack.pack_id}
                    className="rounded-[1rem] border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/35"
                  >
                    <p className="text-sm font-semibold text-slate-950 dark:text-white">
                      {t(`portal.usage.credit_pack_${pack.pack_id}`, {}, pack.label)}
                    </p>
                    <p className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">
                      {formatQuotaValue(pack.ai_credits)}
                    </p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {formatPortalCurrency(Number(pack.amount || 0), {
                        from: normalizePortalCurrency(pack.currency),
                        to: DEFAULT_PORTAL_CURRENCY,
                      })}
                    </p>
                    <button
                      type="button"
                      className="btn btn-secondary mt-4 w-full"
                      disabled={creditPackPending !== null}
                      onClick={() => void handleCreateCreditPackOrder(pack.pack_id)}
                    >
                      {creditPackPending === pack.pack_id
                        ? t('common.saving', {}, 'Saving...')
                        : t('portal.usage.credit_pack_buy_action', {}, 'Buy credits')}
                    </button>
                  </div>
                ))}
              </div>
              {creditPackOrder ? (
                <div className="mt-4 rounded-[1rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-200">
                  {t(
                    'portal.usage.credit_pack_order_created',
                    { order: creditPackOrder.order_id },
                    `Payment order ${creditPackOrder.order_id} has been created.`
                  )}
                </div>
              ) : null}
              {creditPackError ? (
                <div className="mt-4 rounded-[1rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/25 dark:text-red-200">
                  {creditPackError}
                </div>
              ) : null}
            </BackofficeStackCard>
          ) : null}
          <BackofficeStackCard className="bg-white/80 dark:bg-slate-950/45">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-950 dark:text-white">
                  {t('portal.usage.payment_orders_title', {}, 'Recent payment orders')}
                </p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {t(
                    'portal.usage.payment_orders_desc',
                    {},
                    'Credit pack orders wait for Alipay or WeChat Pay confirmation before credits are granted.'
                  )}
                </p>
              </div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                {t('portal.usage.payment_orders_provider_note', {}, 'Alipay / WeChat Pay ready')}
              </p>
            </div>
            {recentPaymentOrders.length > 0 ? (
              <div className="mt-4 divide-y divide-slate-200 rounded-[1rem] border border-slate-200 text-sm dark:divide-slate-800 dark:border-slate-800">
                {recentPaymentOrders.map((order) => (
                  <div
                    key={order.order_id}
                    className="grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-[1fr_0.7fr_0.8fr]"
                  >
                    <div>
                      <p className="font-medium text-slate-950 dark:text-white">
                        {order.credit_pack?.label || order.subject || order.order_id}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {order.status_detail?.detail ||
                          t('portal.usage.payment_order_default_detail', {}, 'Payment status is recorded by Cloud.')}
                      </p>
                    </div>
                    <div>
                      <BackofficeStatusBadge
                        label={order.status_detail?.label || order.status || 'pending'}
                        status={order.status || 'pending'}
                      />
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        {order.status_detail?.label || order.status}
                      </p>
                    </div>
                    <div className="sm:text-right">
                      <p className="font-semibold text-slate-950 dark:text-white">
                        {formatPortalCurrency(Number(order.amount || 0), {
                          from: normalizePortalCurrency(order.currency),
                          to: DEFAULT_PORTAL_CURRENCY,
                        })}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {order.created_at ? formatDate(order.created_at) : order.order_id}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-[1rem] border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                {t('portal.usage.payment_orders_empty', {}, 'No payment orders for this site yet.')}
              </div>
            )}
          </BackofficeStackCard>
          <details
            className="overflow-hidden rounded-[1.1rem] border border-slate-200/80 bg-white/80 dark:border-slate-800 dark:bg-slate-950/45"
            data-portal-usage="ledger-detail"
          >
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-950 hover:bg-slate-50 dark:text-white dark:hover:bg-slate-900/60">
	              {t('portal.usage.credit_ledger_title', {}, 'Point record details')}
            </summary>
            <div className="border-t border-slate-200 p-4 dark:border-slate-800">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t(
                    'portal.usage.credit_ledger_desc',
                    {},
	                    'Current-period package point records for this account.'
                  )}
                </p>
                <div className="text-left sm:text-right">
                  <p className="text-lg font-semibold text-gray-950 dark:text-white">
                    {formatQuotaValue(creditLedgerTotal)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t(
                      'portal.usage.credit_ledger_record_count',
                      { count: formatQuotaValue(creditLedgerCount) },
                      `${formatQuotaValue(creditLedgerCount)} records`
                    )}
                  </p>
                </div>
              </div>
              {creditLedgerItems.length > 0 ? (
                <div className="mt-4 overflow-hidden rounded-[1rem] border border-slate-200 dark:border-slate-800">
                  <div className="hidden grid-cols-[1.1fr_0.8fr_0.6fr_0.9fr] gap-3 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-950/45 dark:text-slate-400 sm:grid">
                    <span>{t('portal.usage.credit_ledger_source', {}, 'Source')}</span>
                    <span>{t('portal.usage.credit_ledger_quantity', {}, 'Quantity')}</span>
                    <span className="text-right">{t('portal.usage.credit_ledger_credits', {}, 'Credits')}</span>
                    <span className="text-right">{t('portal.usage.credit_ledger_time', {}, 'Time')}</span>
                  </div>
                  <div className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
                    {creditLedgerItems.map((entry) => (
                      <div
                        key={entry.ledger_entry_id || `${entry.source_type}-${entry.created_at}`}
                        className="grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-[1.1fr_0.8fr_0.6fr_0.9fr] sm:gap-3"
                      >
                        <div>
                          <p className="font-medium text-slate-950 dark:text-white">
                            {entry.category_label || portalCreditBreakdownLabel(entry.source_type, '', t)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {entry.explanation ||
                              entry.event_type ||
                              t('portal.usage.credit_ledger_default_event', {}, 'Usage event')}
                          </p>
                        </div>
                        <p className="text-slate-700 dark:text-slate-300">
                          {formatQuotaValue(entry.quantity)} {entry.unit}
                        </p>
                        <p className="font-semibold text-slate-950 dark:text-white sm:text-right">
                          {formatSignedCreditDelta(Number(entry.net_credit_delta ?? entry.credit_delta ?? 0))}
                        </p>
                        <p className="text-slate-500 dark:text-slate-400 sm:text-right">
                          {entry.created_at ? formatDate(entry.created_at) : '-'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-[1rem] border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  {t(
                    'portal.usage.credit_ledger_empty',
                    {},
	                    'No package point records are available for the current period.'
                  )}
                </div>
              )}
            </div>
            </details>
          </BackofficeSectionPanel>
        </div>
      ) : null}

      <details
        className="overflow-hidden rounded-[1.35rem] border border-slate-200/80 bg-white/80 dark:border-slate-800 dark:bg-slate-950/45"
        data-portal-usage="usage-detail"
      >
        <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-gray-950 hover:bg-slate-50 dark:text-white dark:hover:bg-slate-900/60">
          {t('portal.usage.detail_toggle', {}, 'Usage details')}
        </summary>
        <div className="space-y-5 border-t border-slate-200 p-4 dark:border-slate-800">
          {chartData.length > 0 ? (
            <BackofficeSectionPanel className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
              {t('portal.usage.trends_label', {}, 'Usage trends')}
            </p>
            <h2 className="mt-2 text-xl font-semibold text-gray-950 dark:text-white">
	              {t('portal.usage.trends_title', {}, 'Service uses, points, and budget')}
            </h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <BackofficeStackCard>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
	                {t('portal.usage.package_service_uses_label', {}, 'Service uses')}
              </p>
              <div className="mt-3">
                <UsageBarChart data={chartData} type="requests" height={160} />
              </div>
            </BackofficeStackCard>
            <BackofficeStackCard>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
	                {t('portal.usage.breakdown_tokens', {}, 'Point usage')}
              </p>
              <div className="mt-3">
                <UsageBarChart data={chartData} type="tokens" height={160} />
              </div>
            </BackofficeStackCard>
            <BackofficeStackCard>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
	                {t('portal.usage.package_budget_label', {}, 'Budget')}
              </p>
              <div className="mt-3">
                <UsageBarChart data={chartData} type="cost" height={160} />
              </div>
            </BackofficeStackCard>
          </div>
        </BackofficeSectionPanel>
      ) : null}

      {entitlements ? (
        <BackofficeSectionPanel className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
              {t('portal.usage.quota_headroom_label', {}, 'Package use')}
            </p>
            <h2 className="mt-2 text-xl font-semibold text-gray-950 dark:text-white">
              {t('portal.usage.quota_headroom_title', {}, 'Current usage')}
            </h2>
          </div>
          <div className="space-y-4">
            <BackofficeStackCard className="bg-white/80 dark:bg-slate-950/45">
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between text-sm">
	                    <span className="font-medium text-gray-950 dark:text-white">{t('portal.usage.package_service_uses_label', {}, 'Service uses')}</span>
                    <span className="text-gray-600 dark:text-gray-400">{runUtilizationPct}%</span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        runUtilizationPct >= 100 ? 'bg-red-500' : runUtilizationPct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'
                      )}
                      style={{ width: `${runUtilizationPct}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {formatNumber(toFinite(runBudgetState.current_total))} / {formatNumber(toFinite(runBudgetState.limit || runsLimit))}
                  </p>
                </div>
                <div>
                  <div className="flex items-center justify-between text-sm">
	                    <span className="font-medium text-gray-950 dark:text-white">{t('portal.usage.breakdown_tokens', {}, 'Point usage')}</span>
                    <span className="text-gray-600 dark:text-gray-400">{tokenUtilizationPct}%</span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        tokenUtilizationPct >= 100 ? 'bg-red-500' : tokenUtilizationPct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'
                      )}
                      style={{ width: `${tokenUtilizationPct}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {formatCompactNumber(toFinite(tokenBudgetState.current_total))} / {formatCompactNumber(toFinite(tokenBudgetState.limit || tokensLimit))}
                  </p>
                </div>
                <div>
                  <div className="flex items-center justify-between text-sm">
	                    <span className="font-medium text-gray-950 dark:text-white">{t('portal.usage.package_budget_label', {}, 'Budget')}</span>
                    <span className="text-gray-600 dark:text-gray-400">{costUtilizationPct}%</span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        costUtilizationPct >= 100 ? 'bg-red-500' : costUtilizationPct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'
                      )}
                      style={{ width: `${costUtilizationPct}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {formatPreferredCurrency(toFinite(costBudgetState.current_total))} / {formatPreferredCurrency(toFinite(costBudgetState.limit || costLimit))}
                  </p>
                </div>
              </div>
            </BackofficeStackCard>
          </div>
        </BackofficeSectionPanel>
      ) : null}

      {usageWindow ? (
        <BackofficeSectionPanel className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
	              {t('portal.usage.cost_summary_label', {}, 'Budget summary')}
            </p>
            <h2 className="mt-2 text-xl font-semibold text-gray-950 dark:text-white">
	              {t('portal.usage.cost_summary_title', {}, 'Service usage details')}
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <BackofficeStackCard className="bg-white/80 dark:bg-slate-950/45">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
	                {t('portal.usage.estimated_total_cost', {}, 'Estimated service budget')}
              </p>
              <p className="mt-3 text-2xl font-semibold text-gray-950 dark:text-white">
                {formatPreferredCurrency(toFinite(usageWindow.cost_total))}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {usageWindow ? `${formatDate(usageWindow.start_at)} - ${formatDate(usageWindow.end_at)}` : t('common.not_found')}
              </p>
            </BackofficeStackCard>
            <BackofficeStackCard className="bg-white/80 dark:bg-slate-950/45">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
	                {t('portal.usage.input_tokens', {}, 'Input points')}
              </p>
              <p className="mt-3 text-2xl font-semibold text-gray-950 dark:text-white">
                {formatCompactNumber(toFinite(usageWindow.tokens_in_total))}
              </p>
            </BackofficeStackCard>
            <BackofficeStackCard className="bg-white/80 dark:bg-slate-950/45">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
	                {t('portal.usage.output_tokens', {}, 'Output points')}
              </p>
              <p className="mt-3 text-2xl font-semibold text-gray-950 dark:text-white">
                {formatCompactNumber(toFinite(usageWindow.tokens_out_total))}
              </p>
            </BackofficeStackCard>
          </div>
        </BackofficeSectionPanel>
      ) : null}

      {entitlements ? (
        <BackofficeSectionPanel className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
              {t('portal.usage.detail_label', {}, 'Details')}
            </p>
            <h2 className="mt-2 text-xl font-semibold text-gray-950 dark:text-white">
              {t('portal.usage.entitlement_title', {}, 'Usage detail')}
            </h2>
          </div>
          <div className="space-y-4">
            <BackofficeStackCard className="bg-white/80 dark:bg-slate-950/45">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                    {t('portal.current_subscription_label', {}, 'Current package')}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <p className="truncate text-lg font-semibold text-gray-950 dark:text-white">
                      {planLabel}
                    </p>
                    <BackofficeStatusBadge
                      status={overBudget ? 'over_budget' : 'within_budget'}
                      label={overBudget ? t('status.over_budget') : t('status.within_budget')}
                    />
                  </div>
                  <p className="mt-1 truncate text-sm text-gray-600 dark:text-gray-400">
                    {getPortalSiteWordPressUrl(selectedSite) ||
                      t('portal.site_url_missing', {}, 'WordPress URL not configured')}
                  </p>
                </div>
                <div className="grid gap-2 text-sm text-slate-700 dark:text-slate-200 sm:grid-cols-3 lg:min-w-[34rem]">
                  <span className="rounded-2xl border border-slate-200/80 px-3 py-2 dark:border-slate-800">
	                    {t('portal.usage.package_service_uses_label', {}, 'Service uses')}: <strong>{formatNumber(runsLimit)}</strong>
                  </span>
                  <span className="rounded-2xl border border-slate-200/80 px-3 py-2 dark:border-slate-800">
	                    {t('portal.usage.package_point_limit_label', {}, 'Point limit')}: <strong>{formatCompactNumber(tokensLimit)}</strong>
                  </span>
                  <span className="rounded-2xl border border-slate-200/80 px-3 py-2 dark:border-slate-800">
	                    {t('portal.usage.package_budget_label', {}, 'Budget')}: <strong>{formatPreferredCurrency(costLimit)}</strong>
                  </span>
                </div>
              </div>
            </BackofficeStackCard>
            <BackofficeStackCard>
              <p className="text-sm font-medium text-gray-950 dark:text-white">
                {t('portal.usage.behavior_title', {}, 'What happens when usage crosses the package limit?')}
              </p>
              <div className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-300">
                {budgetExplanations.length > 0 ? (
                  budgetExplanations.map((line) => <p key={line}>{line}</p>)
                ) : (
                  <p>
                    {t(
                      'portal.usage.behavior_clear',
                      {},
                      'This site is still within the current package envelope. If soft-limit, grace, or downgrade rules are introduced for this plan version, they will show here as read-only explanations.'
                    )}
                  </p>
                )}
                {graceState.grace_until_at ? (
                  <p>
                    {t('portal.usage.grace_until', {}, 'Grace until')}: {formatDate(graceState.grace_until_at)}
                  </p>
                ) : null}
                <p>
                  {t(
                    'portal.usage.operator_mediated_notice',
                    {},
                    'This portal explains the current package state but does not change package coverage directly. If something looks wrong, contact your operator.'
                  )}
                </p>
              </div>
            </BackofficeStackCard>
            <BackofficeStackCard>
              <p className="text-sm font-medium text-gray-950 dark:text-white">
                {t('portal.usage.help_understanding_limits_title', {}, 'Need help understanding limits')}
              </p>
              <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
                {t(
                  'portal.usage.help_understanding_limits_desc',
                  {},
                  'Use this read-only view to compare current usage, package headroom, and grace posture before asking the operator to review coverage.'
                )}
              </p>
            </BackofficeStackCard>
            <BackofficeStackCard>
              <p className="text-sm font-medium text-gray-950 dark:text-white">{t('usage.features')}</p>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{t('portal.usage.feature_list_desc')}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {featureList.map((feature) => (
                  <span
                    key={feature}
                    className="rounded-full bg-blue-100 px-3 py-1 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                  >
                    {feature}
                  </span>
                ))}
              </div>
            </BackofficeStackCard>
          </div>
        </BackofficeSectionPanel>
      ) : (
        <PortalEmptyState
          title={t('portal.usage.empty_title', {}, 'Usage details are not ready yet')}
          description={t(
            'portal.usage.empty_desc',
            {},
            'This site does not have a usage snapshot for the current period yet. Open Package to confirm coverage or return to the workspace.'
          )}
          actionLabel={t('portal.nav_package', {}, 'Open Package')}
          actionHref={selectedSiteId ? `/portal/billing?site=${selectedSiteId}` : '/portal/billing'}
          />
        )}
        </div>
      </details>
    </BackofficePageStack>
  );
}

export default function PortalUsagePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <PortalUsageContent />
    </Suspense>
  );
}
