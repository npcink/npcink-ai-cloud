'use client';

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { LoadingFallback } from '@/components/ui/LoadingFallback';
import { ListPagination } from '@/components/ui/ListPagination';
import { PortalWorkspaceHeader } from '@/components/portal/PortalWorkspaceHeader';
import {
  PortalErrorState,
  PortalLoadingState,
  PortalSignedOutState,
} from '@/components/portal/PortalPageState';
import { PortalCreditTrendPanel } from '@/components/portal/PortalCreditTrendPanel';
import { useLocale } from '@/contexts/LocaleContext';
import { useRetry } from '@/hooks/useRetry';
import { useSession } from '@/hooks/useSession';
import {
  portalClient,
  type Entitlements,
  type PortalCreditLedgerPayload,
  type PortalCreditTrendPayload,
  type PortalCreditTrendWindow,
  type PortalUsageSummaryPayload,
} from '@/lib/portal-client';
import { formatPortalErrorMessage } from '@/lib/portal-error';
import type { Locale } from '@/lib/i18n';
import { formatDate, formatNumber } from '@/lib/utils';
import {
  getPortalSiteDisplayName,
  getPortalSiteSecondaryLabel,
  getVisiblePortalSites,
} from '@/lib/portal-site-display';
import {
  PortalPageStack,
  PortalSection,
  PortalCard,
  PortalMetricStrip,
} from '@/components/portal/PortalScaffold';

function formatQuotaValue(value: unknown, unlimited = false, unlimitedLabel = 'Unlimited'): string {
  if (unlimited) return unlimitedLabel;
  return formatNumber(Math.round(Number(value || 0)));
}

function getCreditDeltaValue(entry: PortalCreditLedgerPayload['items'][number]): number {
  return Number(entry.net_credit_delta ?? entry.credit_delta ?? 0);
}

function quotaStatusTone(status: string | undefined): 'ok' | 'warning' | 'error' {
  if (status === 'limited') return 'error';
  if (status === 'near_limit') return 'warning';
  return 'ok';
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

type PortalUsageView = 'trend' | 'records';
const PORTAL_USAGE_VIEWS: PortalUsageView[] = ['trend', 'records'];

function resolvePortalUsageView(value: string | null): PortalUsageView {
  return value === 'records' ? value : 'trend';
}

function parseUsageDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatUsagePeriodRange(startValue: string, endValue: string, locale: Locale): string {
  const start = parseUsageDate(startValue);
  const end = parseUsageDate(endValue);
  if (!start || !end) return '';
  const currentYear = new Date().getFullYear();
  const includeYear = start.getFullYear() !== end.getFullYear()
    || start.getFullYear() !== currentYear
    || end.getFullYear() !== currentYear;
  const formatter = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'zh-CN', {
    ...(includeYear ? { year: 'numeric' as const } : {}),
    month: locale === 'en' ? 'short' : 'numeric',
    day: 'numeric',
  });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

function formatUsagePeriodEnd(value: string, locale: Locale): string {
  const date = parseUsageDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'zh-CN', {
    year: 'numeric',
    month: locale === 'en' ? 'short' : 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatUsageUpdatedAt(value: string, locale: Locale): string {
  const date = parseUsageDate(value);
  if (!date) return '';
  const now = new Date();
  const sameDay = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'zh-CN', sameDay
    ? { hour: '2-digit', minute: '2-digit' }
    : {
        ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' as const } : {}),
        month: locale === 'en' ? 'short' : 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
}

function PortalUsageContent() {
  const { locale, t } = useLocale();
  const searchParams = useSearchParams();
  const { session, isLoading: sessionLoading, isAuthenticated } = useSession();
  const [usage, setUsage] = useState<PortalUsageSummaryPayload | null>(null);
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [creditLedger, setCreditLedger] = useState<PortalCreditLedgerPayload | null>(null);
  const [creditLedgerOffset, setCreditLedgerOffset] = useState(0);
  const [creditLedgerLoading, setCreditLedgerLoading] = useState(false);
  const [creditLedgerError, setCreditLedgerError] = useState('');
  const [creditLedgerSiteId, setCreditLedgerSiteId] = useState(
    () => searchParams.get('site') || ''
  );
  const [creditTrendWindow, setCreditTrendWindow] = useState<PortalCreditTrendWindow>('24h');
  const [creditTrend, setCreditTrend] = useState<PortalCreditTrendPayload | null>(null);
  const [creditTrendLoading, setCreditTrendLoading] = useState(true);
  const [creditTrendError, setCreditTrendError] = useState('');
  const creditTrendRequestId = useRef(0);
  const [activeUsageView, setActiveUsageView] = useState<PortalUsageView>(
    () => resolvePortalUsageView(searchParams.get('view'))
  );
  const creditLedgerPageSize = 10;

  const loadBundle = useCallback(async () => {
    const bundle = await portalClient.getUsageBundle();
    setUsage(bundle.usage);
    setEntitlements(bundle.entitlements);
  }, []);

  const { execute, isLoading: retryLoading, error: retryError, retry } = useRetry(loadBundle, {
    maxRetries: 2,
    initialDelay: 800,
    backoffMultiplier: 2,
  });

  const loadCreditLedgerPage = useCallback(async (nextOffset: number) => {
    setCreditLedgerLoading(true);
    setCreditLedgerError('');
    try {
      const response = creditLedgerSiteId
        ? await portalClient.getCreditLedger(creditLedgerSiteId, {
            limit: creditLedgerPageSize,
            offset: nextOffset,
          })
        : await portalClient.getAccountCreditLedger({
            limit: creditLedgerPageSize,
            offset: nextOffset,
          });
      setCreditLedger(response.data);
      setCreditLedgerOffset(nextOffset);
    } catch (err) {
      setCreditLedgerError(formatPortalErrorMessage(err, t, t('error.failed_load')));
    } finally {
      setCreditLedgerLoading(false);
    }
  }, [creditLedgerSiteId, t]);

  const loadCreditTrend = useCallback(async () => {
    const requestId = creditTrendRequestId.current + 1;
    creditTrendRequestId.current = requestId;
    setCreditTrendLoading(true);
    setCreditTrendError('');
    try {
      const response = await portalClient.getAccountCreditTrend({
        window: creditTrendWindow,
        siteId: creditLedgerSiteId || undefined,
      });
      if (creditTrendRequestId.current !== requestId) return;
      setCreditTrend(response.data);
    } catch (err) {
      if (creditTrendRequestId.current !== requestId) return;
      setCreditTrendError(formatPortalErrorMessage(err, t, t('error.failed_load')));
    } finally {
      if (creditTrendRequestId.current === requestId) setCreditTrendLoading(false);
    }
  }, [creditLedgerSiteId, creditTrendWindow, t]);

  useEffect(() => {
    const requestedView = searchParams.get('view');
    setActiveUsageView(resolvePortalUsageView(requestedView));
    if (requestedView && requestedView !== 'records') {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.delete('view');
      const query = nextParams.toString();
      window.history.replaceState(
        window.history.state,
        '',
        `/portal/usage${query ? `?${query}` : ''}`,
      );
    }
  }, [searchParams]);

  useEffect(() => {
    if (!session || !isAuthenticated) {
      return;
    }
    void execute();
  }, [isAuthenticated, session, execute]);

  useEffect(() => {
    if (!session || !isAuthenticated) {
      return;
    }
    if (activeUsageView !== 'records') return;
    const selectableSiteIds = new Set(getVisiblePortalSites(session.sites).map((site) => site.site_id));
    if (creditLedgerSiteId && !selectableSiteIds.has(creditLedgerSiteId)) {
      setCreditLedgerSiteId('');
      return;
    }
    void loadCreditLedgerPage(0);
  }, [activeUsageView, creditLedgerSiteId, isAuthenticated, loadCreditLedgerPage, session]);

  useEffect(() => {
    if (!session || !isAuthenticated) return;
    if (activeUsageView !== 'trend') return;
    void loadCreditTrend();
  }, [activeUsageView, isAuthenticated, loadCreditTrend, session]);

  const handleUsageViewChange = (nextView: PortalUsageView) => {
    setActiveUsageView(nextView);
    const nextParams = new URLSearchParams(searchParams.toString());
    if (nextView === 'trend') nextParams.delete('view');
    else nextParams.set('view', nextView);
    const query = nextParams.toString();
    window.history.replaceState(
      window.history.state,
      '',
      `/portal/usage${query ? `?${query}` : ''}`,
    );
  };

  const handleUsageViewKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    currentView: PortalUsageView,
  ) => {
    const currentIndex = PORTAL_USAGE_VIEWS.indexOf(currentView);
    const nextIndex = event.key === 'ArrowRight'
      ? (currentIndex + 1) % PORTAL_USAGE_VIEWS.length
      : event.key === 'ArrowLeft'
        ? (currentIndex - 1 + PORTAL_USAGE_VIEWS.length) % PORTAL_USAGE_VIEWS.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? PORTAL_USAGE_VIEWS.length - 1
            : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const nextView = PORTAL_USAGE_VIEWS[nextIndex];
    handleUsageViewChange(nextView);
    requestAnimationFrame(() => document.getElementById(`portal-usage-tab-${nextView}`)?.focus());
  };

  const errorMessage = retryError
    ? formatPortalErrorMessage(retryError, t, t('error.failed_load'))
    : null;

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

  const budgetState = entitlements?.budget_state || {};
  const overBudget = Object.values(budgetState).some((entry) => Boolean(entry?.over_limit));
  const subscription = entitlements?.subscription || null;
  const quotaSummary = entitlements?.quota_summary || null;
  const creditLedgerItems = creditLedger?.items || [];
  const visibleSites = getVisiblePortalSites(session.sites);
  const availableCredits = Number(quotaSummary?.credit?.total_remaining ?? 0);
  const creditLedgerCount = Number(creditLedger?.pagination?.total ?? creditLedger?.summary?.entry_count ?? 0);
  const usedCredits = Number(quotaSummary?.credit?.used ?? 0);
  const paidCredits = Number(quotaSummary?.credit?.paid_remaining ?? 0);
  const nextPaidCreditExpiry = String(quotaSummary?.credit?.paid_next_expires_at || '');
  const currentPeriodStart =
    entitlements?.period_start_at ||
    subscription?.current_period_start_at ||
    subscription?.current_period_start ||
    session.current_subscription?.current_period_start ||
    '';
  const currentPeriodEnd =
    entitlements?.period_end_at ||
    subscription?.current_period_end_at ||
    subscription?.current_period_end ||
    session.current_subscription?.current_period_end ||
    '';
  const currentPeriodRange = currentPeriodStart && currentPeriodEnd
    ? formatUsagePeriodRange(currentPeriodStart, currentPeriodEnd, locale)
    : '';
  const currentPeriodEndDetail = currentPeriodEnd
    ? formatUsagePeriodEnd(currentPeriodEnd, locale)
    : '';
  const updatedAt = usage?.generated_at ? formatUsageUpdatedAt(usage.generated_at, locale) : '';
  const formatCreditPoints = (value: number) =>
    t('portal.usage.credit_points_value', { count: formatNumber(Math.abs(Math.round(value))) }, '{{count}} points');
  const isCustomerServiceLedgerEntry = (entry: PortalCreditLedgerPayload['items'][number]) =>
    ['runs', 'tokens_total', 'tokens'].includes(String(entry.source_type || '')) ||
    String(entry.category_label || '').toLowerCase() === 'ai usage';
  const formatLedgerFeatureText = (
    entry: PortalCreditLedgerPayload['items'][number],
    field: 'title' | 'detail'
  ) => {
    const featureKey = String(entry.feature_key || '').trim();
    const fallback =
      field === 'title'
        ? String(entry.feature_label || '').trim()
        : String(entry.feature_detail || '').trim();
    if (!featureKey) {
      return fallback;
    }
    return t(`portal.usage.credit_ledger_feature_${featureKey}_${field}`, {}, fallback);
  };
  const formatLedgerTitle = (entry: PortalCreditLedgerPayload['items'][number]) => {
    const featureTitle = formatLedgerFeatureText(entry, 'title');
    if (featureTitle) {
      return featureTitle;
    }
    if (isCustomerServiceLedgerEntry(entry)) {
      return t('portal.usage.credit_ledger_ai_service_title', {}, 'AI service usage');
    }
    const creditDelta = getCreditDeltaValue(entry);
    if (creditDelta > 0) {
      return t('portal.usage.credit_ledger_credit_added_title', {}, 'Points added');
    }
    return entry.category_label || portalCreditBreakdownLabel(entry.source_type, '', t);
  };
  const formatLedgerDescription = (entry: PortalCreditLedgerPayload['items'][number]) => {
    const creditDelta = getCreditDeltaValue(entry);
    if (creditDelta < 0) {
      const featureDetail = formatLedgerFeatureText(entry, 'detail');
      if (featureDetail) {
        return `${featureDetail} ${t(
          'portal.usage.credit_ledger_service_used_suffix',
          { credits: formatCreditPoints(creditDelta) },
          'This time used {{credits}}.'
        )}`;
      }
      return t(
        'portal.usage.credit_ledger_service_used_desc',
        { credits: formatCreditPoints(creditDelta) },
        'This service used {{credits}}.'
      );
    }
    if (creditDelta > 0) {
      return t(
        'portal.usage.credit_ledger_credit_added_desc',
        { credits: formatCreditPoints(creditDelta) },
        '{{credits}} were added to this package.'
      );
    }
    return t('portal.usage.credit_ledger_default_event', {}, 'Usage event');
  };
  const formatLedgerCreditDelta = (entry: PortalCreditLedgerPayload['items'][number]) => {
    const creditDelta = getCreditDeltaValue(entry);
    if (creditDelta < 0) {
      return t(
        'portal.usage.credit_ledger_credit_deducted',
        { credits: formatCreditPoints(creditDelta) },
        'Deducted {{credits}}'
      );
    }
    if (creditDelta > 0) {
      return t(
        'portal.usage.credit_ledger_credit_added',
        { credits: formatCreditPoints(creditDelta) },
        'Added {{credits}}'
      );
    }
    return formatCreditPoints(0);
  };

  const creditStatus = quotaSummary?.credit?.status;
  const usageStatusLabel = quotaStatusTone(creditStatus) === 'error' || overBudget
    ? t('portal.home.service_status_attention', {}, 'Needs attention')
    : quotaStatusTone(creditStatus) === 'warning'
      ? t('portal.usage.headroom_watch', {}, 'Close to limit')
      : t('portal.home.risk_level_normal', {}, 'Normal');
  const usageHeaderDescription = t(
    'portal.usage.summary_desc',
    {},
    "Review this period's account point use, records, and trends."
  );
  const usageHeaderInfo = updatedAt
    ? `${usageHeaderDescription} · ${t(
        'portal.usage.updated_at_inline',
        { time: updatedAt },
        'Updated {{time}}'
      )}`
    : usageHeaderDescription;
  const usageHeaderMetrics = [
    {
      label: t('common.status'),
      value: usageStatusLabel,
      detail: t('portal.usage.status_plain_detail', {}, 'Use the numbers below to decide whether you need more points.'),
    },
    {
      label: t('portal.usage.period_label', {}, 'Period'),
      value: currentPeriodRange || t('common.not_found'),
      detail: currentPeriodEndDetail
        ? t(
            'portal.usage.period_end_detail',
            { time: currentPeriodEndDetail },
            'Ends {{time}}'
          )
        : t('portal.usage.header_period_detail', {}, 'Current package period.'),
      size: 'compact' as const,
    },
  ];
  const usageOverviewMetrics = [
    {
      label: t('portal.usage.total_remaining_label', {}, 'Total available'),
      value: formatQuotaValue(availableCredits),
      detail: t('portal.usage.overview_available_detail', {}, 'Package and paid points available now.'),
    },
    {
      label: t('portal.usage.period_used_label', {}, 'Used this period'),
      value: formatQuotaValue(usedCredits),
      detail: t('portal.usage.trend_points_detail', {}, 'Points used by service requests in this view.'),
    },
    {
      label: t('portal.usage.paid_remaining_label', {}, 'Paid credits'),
      value: formatQuotaValue(paidCredits),
      detail: t('portal.usage.overview_paid_detail', {}, 'Purchased points that remain available.'),
    },
    {
      label: t('portal.usage.next_expiry_label', {}, 'Next expiry'),
      value: nextPaidCreditExpiry ? formatDate(nextPaidCreditExpiry) : t('common.not_available', {}, 'Not available'),
      detail: nextPaidCreditExpiry
        ? t('portal.usage.paid_credit_expiry_hint', { date: formatDate(nextPaidCreditExpiry) }, `The next paid credit grant expires on ${formatDate(nextPaidCreditExpiry)}.`)
        : t('portal.usage.overview_no_expiry_detail', {}, 'No paid-credit expiry is currently recorded.'),
      size: 'compact' as const,
    },
  ];

  return (
    <PortalPageStack>
      <PortalWorkspaceHeader
        eyebrow={t('portal.usage.summary_label', {}, 'Usage')}
        title={t('portal.nav_usage', {}, 'Usage')}
        eyebrowInfo={usageHeaderInfo}
        currentPage="usage"
        metrics={usageHeaderMetrics}
        metricsColumnsClassName="lg:grid-cols-2"
      />

      {entitlements ? (
        <PortalSection className="space-y-5" data-portal-usage="current-summary">
          <div>
            <h2 className="text-xl font-semibold text-gray-950 dark:text-white">
              {t('portal.usage.overview_title', {}, 'This period')}
            </h2>
            <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-400">
              {t('portal.usage.overview_desc', {}, 'See what is available, what was used, and whether paid points are nearing expiry.')}
            </p>
          </div>
          <PortalMetricStrip items={usageOverviewMetrics} columnsClassName="md:grid-cols-2 xl:grid-cols-4" />
        </PortalSection>
      ) : null}

      <PortalSection className="p-2" data-portal-usage="view-tabs">
        <div
          role="tablist"
          aria-label={t('portal.usage.view_tabs_label', {}, 'Usage views')}
          className="grid gap-1 sm:grid-cols-2"
        >
          {([
            { value: 'trend', label: t('portal.usage.view_tab_trend', {}, 'Trend') },
            { value: 'records', label: t('portal.usage.view_tab_records', {}, 'Point records') },
          ] as Array<{ value: PortalUsageView; label: string }>).map((view) => (
            <button
              key={view.value}
              id={`portal-usage-tab-${view.value}`}
              type="button"
              role="tab"
              aria-selected={activeUsageView === view.value}
              aria-controls={`portal-usage-panel-${view.value}`}
              tabIndex={activeUsageView === view.value ? 0 : -1}
              className={`min-h-11 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                activeUsageView === view.value
                  ? 'bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white'
              }`}
              onClick={() => handleUsageViewChange(view.value)}
              onKeyDown={(event) => handleUsageViewKeyDown(event, view.value)}
            >
              {view.label}
            </button>
          ))}
        </div>
      </PortalSection>

      <div
        id="portal-usage-panel-trend"
        role="tabpanel"
        aria-labelledby="portal-usage-tab-trend"
        hidden={activeUsageView !== 'trend'}
      >
        {activeUsageView === 'trend' ? (
          <PortalCreditTrendPanel
            payload={creditTrend}
            window={creditTrendWindow}
            isLoading={creditTrendLoading}
            error={creditTrendError}
            onWindowChange={setCreditTrendWindow}
            onRetry={() => void loadCreditTrend()}
          />
        ) : null}
      </div>

      <PortalSection
        id="portal-usage-panel-records"
        role="tabpanel"
        aria-labelledby="portal-usage-tab-records"
        hidden={activeUsageView !== 'records'}
        className="space-y-5"
        data-portal-usage="ledger-detail"
      >
          {activeUsageView === 'records' && entitlements ? (
            <div className="space-y-5" data-portal-usage="usage-records">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                {t('portal.usage.summary_label', {}, 'Usage')}
              </p>
              <h2 className="mt-2 text-xl font-semibold text-gray-950 dark:text-white">
                {t('portal.usage.credit_ledger_title', {}, 'Point record details')}
              </h2>
              <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-400">
                {t(
                  'portal.usage.credit_ledger_desc',
                  {},
                  'Current-period package point records for this account.'
                )}
              </p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-lg font-semibold text-gray-950 dark:text-white">
                {formatQuotaValue(availableCredits)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('portal.usage.total_available_label', {}, 'Available now')}
                {' · '}
                {t(
                  'portal.usage.credit_ledger_record_count',
                  { count: formatQuotaValue(creditLedgerCount) },
                  `${formatQuotaValue(creditLedgerCount)} records`
                )}
              </p>
            </div>
          </div>
          <div className="max-w-md">
            <label htmlFor="portal-usage-site" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
              {t('portal.usage.site_filter_label', {}, 'Usage scope')}
            </label>
            <select
              id="portal-usage-site"
              className="input"
              value={creditLedgerSiteId}
              disabled={creditLedgerLoading}
              onChange={(event) => {
                setCreditLedgerSiteId(event.target.value);
                setCreditLedgerOffset(0);
              }}
            >
              <option value="">{t('portal.usage.all_sites_option', {}, 'All sites')}</option>
              {visibleSites.map((site) => (
                <option key={site.site_id} value={site.site_id}>
                  {getPortalSiteDisplayName(site)} ({getPortalSiteSecondaryLabel(site)}, {formatDate(site.created_at)})
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
              {t('portal.usage.site_filter_desc', {}, 'Choose a site to view only the point records created by that site.')}
            </p>
          </div>
          {creditLedgerItems.length > 0 ? (
            <div className="overflow-hidden rounded-[1rem] border border-slate-200 dark:border-slate-800">
              <div className="hidden grid-cols-[1.4fr_0.6fr_0.9fr] gap-3 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-950/45 dark:text-slate-400 sm:grid">
                <span>{t('portal.usage.credit_ledger_source', {}, 'Source')}</span>
                <span className="text-right">{t('portal.usage.credit_ledger_credits', {}, 'Credits')}</span>
                <span className="text-right">{t('portal.usage.credit_ledger_time', {}, 'Time')}</span>
              </div>
              <div className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
                {creditLedgerItems.map((entry) => (
                  <div
                    key={entry.ledger_entry_id || `${entry.source_type}-${entry.created_at}`}
                    className="grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-[1.4fr_0.6fr_0.9fr] sm:gap-3"
                  >
                    <div>
                      <p className="font-medium text-slate-950 dark:text-white">
                        {formatLedgerTitle(entry)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {formatLedgerDescription(entry)}
                      </p>
                    </div>
                    <p className="font-semibold text-slate-950 dark:text-white sm:text-right">
                      {formatLedgerCreditDelta(entry)}
                    </p>
                    <p className="text-slate-500 dark:text-slate-400 sm:text-right">
                      {entry.created_at ? formatDate(entry.created_at) : '-'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-[1rem] border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              {t(
                'portal.usage.credit_ledger_empty',
                {},
                'No package point records are available for the current period.'
              )}
            </div>
          )}
          {creditLedgerError ? (
            <p className="text-sm text-red-700 dark:text-red-300">{creditLedgerError}</p>
          ) : null}
          <ListPagination
            offset={creditLedgerOffset}
            limit={creditLedgerPageSize}
            total={creditLedgerCount}
            isLoading={creditLedgerLoading}
            onOffsetChange={(nextOffset) => void loadCreditLedgerPage(nextOffset)}
            className="px-0 pb-0"
          />
            </div>
          ) : null}
      </PortalSection>

    </PortalPageStack>
  );
}

export default function PortalUsagePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <PortalUsageContent />
    </Suspense>
  );
}
