'use client';

import React, { Suspense, useEffect, useState } from 'react';
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
import { useLocale } from '@/contexts/LocaleContext';
import { usePortalSiteSelection } from '@/hooks/usePortalSiteSelection';
import { useSession } from '@/hooks/useSession';
import {
  getPortalSiteDisplayName,
  getPortalSiteSecondaryLabel,
  getPortalSiteWordPressUrl,
} from '@/lib/portal-site-display';
import {
  portalClient,
  type Entitlements,
  type PortalUsageSummaryPayload,
} from '@/lib/portal-client';
import { resolveCustomerPackageDisplay } from '@/lib/customer-package-display';
import {
  DEFAULT_PORTAL_CURRENCY,
  formatPortalCurrency,
} from '@/lib/currency';
import { formatPortalErrorMessage } from '@/lib/portal-error';
import { formatCompactNumber, formatDate, formatNumber } from '@/lib/utils';
import {
  BackofficePageStack,
  BackofficeSectionPanel,
  BackofficeStackCard,
} from '@/components/backoffice/BackofficeScaffold';

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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const toFinite = (value: unknown): number => {
    const numeric = Number(value || 0);
    return Number.isFinite(numeric) ? numeric : 0;
  };

  useEffect(() => {
    const loadData = async () => {
      if (!session || !isAuthenticated || !selectedSiteId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const bundle = await portalClient.getUsageBundle(selectedSiteId);
        setUsage(bundle.usage);
        setEntitlements(bundle.entitlements);
      } catch (err) {
        setError(formatPortalErrorMessage(err, t, t('error.failed_load')));
      } finally {
        setIsLoading(false);
      }
    };

    void loadData();
  }, [isAuthenticated, selectedSiteId, session, t]);

  const handleSiteChange = async (siteId: string) => {
    await setSelectedSiteId(siteId);
    setIsLoading(true);
    setError(null);

    try {
      const bundle = await portalClient.getUsageBundle(siteId);
      setUsage(bundle.usage);
      setEntitlements(bundle.entitlements);
    } catch (err) {
      setError(formatPortalErrorMessage(err, t, t('error.failed_load')));
    } finally {
      setIsLoading(false);
    }
  };

  if (sessionLoading || isLoading) {
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

  if (error) {
    return (
      <PortalErrorState
        title={t('common.error')}
        description={error}
        retryLabel={t('common.retry')}
        onRetry={() => void handleSiteChange(selectedSiteId)}
      />
    );
  }

  const usageWindow = usage?.windows?.rolling_24h || usage?.windows?.today || null;
  const tokenTotal = usageWindow ? usageWindow.tokens_in_total + usageWindow.tokens_out_total : 0;
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
          'Token usage is already above the frozen package limit for this period.'
        )
      : '',
    costBudgetState.over_limit
      ? t(
          'portal.usage.cost_over_limit_explainer',
          {},
          'Estimated provider cost is already above the package cost budget for this period.'
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

  const headroomMetrics = [
    {
      label: t('portal.usage.remaining_requests', {}, 'Requests left'),
      value: formatNumber(remainingRequests),
      detail: `${formatNumber(toFinite(runBudgetState.current_total))} / ${formatNumber(toFinite(runBudgetState.limit || runsLimit))}`,
    },
    {
      label: t('portal.usage.remaining_tokens', {}, 'Tokens left'),
      value: formatCompactNumber(remainingTokens),
      detail: `${formatCompactNumber(toFinite(tokenBudgetState.current_total))} / ${formatCompactNumber(toFinite(tokenBudgetState.limit || tokensLimit))}`,
    },
    {
      label: t('portal.usage.remaining_cost', {}, 'Cost headroom'),
      value: formatPreferredCurrency(remainingCost),
      detail: `${formatPreferredCurrency(toFinite(costBudgetState.current_total))} / ${formatPreferredCurrency(toFinite(costBudgetState.limit || costLimit))}`,
    },
    {
      label: t('common.status'),
      value: headroomTone,
      detail: usageWindow ? `${t('common.period')}: ${formatDate(usageWindow.start_at)} - ${formatDate(usageWindow.end_at)}` : undefined,
    },
  ];

  const primarySummaryItems = [
    {
      label: t('common.site'),
      value: getPortalSiteDisplayName(selectedSite) || selectedSiteId || t('common.not_found'),
      detail:
        getPortalSiteWordPressUrl(selectedSite) ||
        getPortalSiteSecondaryLabel(selectedSite) ||
        selectedSiteId,
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
        eyebrow={t('usage.summary')}
        title={t('portal.usage.primary_title')}
        eyebrowInfo={t(
          'portal.usage.primary_desc',
          {},
          'Review usage for this site and see how much headroom remains under the current package.'
        )}
        currentPage="usage"
        selectedSiteId={selectedSiteId}
        selectedSiteName={selectedSite?.site_name}
        sites={sites}
        onSiteChange={handleSiteChange}
        metrics={headroomMetrics.length > 0 ? headroomMetrics : primarySummaryItems}
        metricsColumnsClassName={headroomMetrics.length > 0 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}
      />

      {isSwitchingSite ? (
        <PortalSiteSwitchingNotice
          message={t(
            'portal.site_switching_notice_with_target',
            { site: switchingSiteName || selectedSite?.site_name || selectedSiteId },
            `正在切换到 ${switchingSiteName || selectedSite?.site_name || selectedSiteId}，页面数据会自动更新。`
          )}
        />
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
                    {getPortalSiteSecondaryLabel(selectedSite) || entitlements.site_id}
                  </p>
                </div>
                <div className="grid gap-2 text-sm text-slate-700 dark:text-slate-200 sm:grid-cols-3 lg:min-w-[34rem]">
                  <span className="rounded-2xl border border-slate-200/80 px-3 py-2 dark:border-slate-800">
                    {t('usage.requests_month')}: <strong>{formatNumber(runsLimit)}</strong>
                  </span>
                  <span className="rounded-2xl border border-slate-200/80 px-3 py-2 dark:border-slate-800">
                    {t('usage.tokens_month')}: <strong>{formatCompactNumber(tokensLimit)}</strong>
                  </span>
                  <span className="rounded-2xl border border-slate-200/80 px-3 py-2 dark:border-slate-800">
                    {t('common.cost')}: <strong>{formatPreferredCurrency(costLimit)}</strong>
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
