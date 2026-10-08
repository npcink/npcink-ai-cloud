'use client';

import React, { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { LoadingFallback } from '@/components/ui/LoadingFallback';
import { ListPagination } from '@/components/ui/ListPagination';
import { PortalWorkspaceHeader } from '@/components/portal/PortalWorkspaceHeader';
import { PortalStatusBadge } from '@/components/portal/PortalStatusBadge';
import {
  PortalEmptyState,
  PortalErrorState,
  PortalLoadingState,
  PortalSignedOutState,
} from '@/components/portal/PortalPageState';
import { PortalCreditTrendPanel } from '@/components/portal/PortalCreditTrendPanel';
import { useLocale } from '@/contexts/LocaleContext';
import { useSession } from '@/hooks/useSession';
import { useDialogFocusManagement } from '@/hooks/useDialogFocusManagement';
import {
  portalClient,
  type Entitlements,
  type PortalCreditEvent,
  type PortalCreditEventFeature,
  type PortalCreditEventsPayload,
  type PortalCreditEventWindow,
  type PortalCreditTrendPayload,
  type PortalCreditTrendWindow,
} from '@/lib/portal-client';
import { formatPortalErrorMessage } from '@/lib/portal-error';
import type { Locale } from '@/lib/i18n';
import { formatDateTime, formatNumber } from '@/lib/utils';
import { getPortalSiteDisplayName } from '@/lib/portal-site-display';
import {
  PortalPageStack,
  PortalSection,
  PortalMetricStrip,
} from '@/components/portal/PortalScaffold';

function formatQuotaValue(value: unknown, unlimited = false, unlimitedLabel = 'Unlimited'): string {
  if (unlimited) return unlimitedLabel;
  return formatNumber(Math.round(Number(value || 0)));
}

function quotaStatusTone(status: string | undefined): 'ok' | 'warning' | 'error' {
  if (status === 'limited') return 'error';
  if (status === 'near_limit') return 'warning';
  return 'ok';
}

type PortalUsageView = 'trend' | 'records';
const PORTAL_USAGE_VIEWS: PortalUsageView[] = ['trend', 'records'];

function resolvePortalUsageView(value: string | null): PortalUsageView {
  return value === 'records' ? value : 'trend';
}

function parseUsageDate(value: string): Date | null {
  const normalizedValue = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)
    ? value
    : `${value.replace(' ', 'T')}Z`;
  const date = new Date(normalizedValue);
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

function formatCreditEventTime(value: string, locale: Locale): string {
  const date = parseUsageDate(value);
  if (!date) return '-';
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
  if (sameDay) return locale === 'en' ? `Today ${time}` : `今天 ${time}`;
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'zh-CN', {
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' as const } : {}),
    month: locale === 'en' ? 'short' : 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function PortalUsageContent() {
  const { locale, t } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, isLoading: sessionLoading, isAuthenticated, selectSite } = useSession();
  const siteFilterId = searchParams.get('site') || session?.selected_context?.site.site_id || '';
  const siteContextReady = Boolean(siteFilterId && session?.selected_context?.site.site_id === siteFilterId);
  const [siteContextError, setSiteContextError] = useState('');
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [bundleError, setBundleError] = useState('');
  const [creditEvents, setCreditEvents] = useState<PortalCreditEventsPayload | null>(null);
  const [creditEventOffset, setCreditEventOffset] = useState(0);
  const [creditEventLoading, setCreditEventLoading] = useState(false);
  const [creditEventError, setCreditEventError] = useState('');
  const [creditEventWindow, setCreditEventWindow] = useState<PortalCreditEventWindow>('7d');
  const [creditEventFeature, setCreditEventFeature] = useState<PortalCreditEventFeature>('');
  const [selectedCreditEvent, setSelectedCreditEvent] = useState<PortalCreditEvent | null>(null);
  const [creditTrendWindow, setCreditTrendWindow] = useState<PortalCreditTrendWindow>('24h');
  const [creditTrend, setCreditTrend] = useState<PortalCreditTrendPayload | null>(null);
  const [creditTrendLoading, setCreditTrendLoading] = useState(true);
  const [creditTrendError, setCreditTrendError] = useState('');
  const siteFilterIdRef = useRef(siteFilterId);
  const bundleRequestVersionRef = useRef(0);
  const creditEventRequestVersionRef = useRef(0);
  const creditTrendRequestVersionRef = useRef(0);
  const [activeUsageView, setActiveUsageView] = useState<PortalUsageView>(
    () => resolvePortalUsageView(searchParams.get('view'))
  );
  const creditEventPageSize = 20;

  const loadBundle = useCallback(async () => {
    const requestSiteFilterId = siteFilterIdRef.current;
    if (!isAuthenticated || (requestSiteFilterId && !siteContextReady)) return;
    const requestVersion = ++bundleRequestVersionRef.current;
    setBundleLoading(true);
    setBundleError('');
    try {
      const response = await portalClient.getAccountEntitlements();
      if (
        requestVersion !== bundleRequestVersionRef.current
        || requestSiteFilterId !== siteFilterIdRef.current
      ) return;
      setEntitlements(response.data);
    } catch (err) {
      if (
        requestVersion !== bundleRequestVersionRef.current
        || requestSiteFilterId !== siteFilterIdRef.current
      ) return;
      setEntitlements(null);
      setBundleError(formatPortalErrorMessage(err, t, t('error.failed_load')));
    } finally {
      if (
        requestVersion === bundleRequestVersionRef.current
        && requestSiteFilterId === siteFilterIdRef.current
      ) setBundleLoading(false);
    }
  }, [isAuthenticated, siteContextReady, t]);

  const loadCreditEventPage = useCallback(async (nextOffset: number) => {
    const requestSiteFilterId = siteFilterIdRef.current;
    if (!isAuthenticated || !siteContextReady) return;
    const requestVersion = ++creditEventRequestVersionRef.current;
    setCreditEventLoading(true);
    setCreditEventError('');
    setCreditEvents(null);
    try {
      const response = await portalClient.getAccountCreditEvents({
        window: creditEventWindow, feature: creditEventFeature,
        siteId: requestSiteFilterId, limit: creditEventPageSize, offset: nextOffset,
      });
      if (requestVersion !== creditEventRequestVersionRef.current || requestSiteFilterId !== siteFilterIdRef.current) return;
      setCreditEvents(response.data);
      setCreditEventOffset(nextOffset);
    } catch (err) {
      if (requestVersion !== creditEventRequestVersionRef.current || requestSiteFilterId !== siteFilterIdRef.current) return;
      setCreditEventError(formatPortalErrorMessage(err, t, t('error.failed_load')));
    } finally {
      if (requestVersion === creditEventRequestVersionRef.current && requestSiteFilterId === siteFilterIdRef.current) setCreditEventLoading(false);
    }
  }, [creditEventFeature, creditEventWindow, isAuthenticated, siteContextReady, t]);

  const loadCreditTrend = useCallback(async () => {
    const requestSiteFilterId = siteFilterIdRef.current;
    if (!isAuthenticated || !siteContextReady) return;
    const requestVersion = ++creditTrendRequestVersionRef.current;
    setCreditTrendLoading(true);
    setCreditTrendError('');
    try {
      const response = await portalClient.getAccountCreditTrend({
        window: creditTrendWindow,
        siteId: requestSiteFilterId || undefined,
      });
      if (
        requestVersion !== creditTrendRequestVersionRef.current
        || requestSiteFilterId !== siteFilterIdRef.current
      ) return;
      setCreditTrend(response.data);
    } catch (err) {
      if (
        requestVersion !== creditTrendRequestVersionRef.current
        || requestSiteFilterId !== siteFilterIdRef.current
      ) return;
      setCreditTrendError(formatPortalErrorMessage(err, t, t('error.failed_load')));
    } finally {
      if (
        requestVersion === creditTrendRequestVersionRef.current
        && requestSiteFilterId === siteFilterIdRef.current
      ) setCreditTrendLoading(false);
    }
  }, [creditTrendWindow, isAuthenticated, siteContextReady, t]);

  useLayoutEffect(() => {
    siteFilterIdRef.current = siteFilterId;
    bundleRequestVersionRef.current += 1;
    creditEventRequestVersionRef.current += 1;
    creditTrendRequestVersionRef.current += 1;
    setEntitlements(null);
    setCreditEvents(null);
    setCreditEventOffset(0);
    setCreditEventLoading(false);
    setCreditEventError('');
    setSelectedCreditEvent(null);
    setCreditTrend(null);
    setCreditTrendLoading(false);
    setCreditTrendError('');
    setBundleError('');
    setBundleLoading(Boolean(isAuthenticated));
  }, [siteFilterId, isAuthenticated]);

  useEffect(() => {
    const requestedView = searchParams.get('view');
    setActiveUsageView(resolvePortalUsageView(requestedView));
    if (requestedView && requestedView !== 'records') {
      const nextParams = new URLSearchParams(searchParams.toString());
      if (requestedView !== 'records') nextParams.delete('view');
      const query = nextParams.toString();
      window.history.replaceState(
        window.history.state,
        '',
        `/portal/usage${query ? `?${query}` : ''}`,
      );
    }
  }, [searchParams]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    void loadBundle();
    return () => {
      bundleRequestVersionRef.current += 1;
    };
  }, [isAuthenticated, loadBundle, siteFilterId]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    if (activeUsageView !== 'records') return;
    void loadCreditEventPage(0);
    return () => {
      creditEventRequestVersionRef.current += 1;
    };
  }, [activeUsageView, creditEventFeature, creditEventWindow, isAuthenticated, loadCreditEventPage, siteFilterId]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (activeUsageView !== 'trend') return;
    void loadCreditTrend();
    return () => {
      creditTrendRequestVersionRef.current += 1;
    };
  }, [activeUsageView, isAuthenticated, loadCreditTrend, siteFilterId]);

  const closeCreditEvent = useCallback(() => setSelectedCreditEvent(null), []);
  const creditEventDrawerRef = useDialogFocusManagement<HTMLElement>(
    Boolean(selectedCreditEvent),
    closeCreditEvent
  );

  useEffect(() => {
    if (!isAuthenticated || !siteFilterId || siteContextReady) {
      setSiteContextError('');
      return;
    }
    let cancelled = false;
    setSiteContextError('');
    void selectSite(siteFilterId).catch((err) => {
      if (!cancelled) {
        setSiteContextError(formatPortalErrorMessage(err, t, t('error.failed_load')));
        setBundleLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [isAuthenticated, siteFilterId, siteContextReady, selectSite, t]);

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

  if (sessionLoading) {
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

  const budgetState = entitlements?.budget_state || {};
  const overBudget = Object.values(budgetState).some((entry) => Boolean(entry?.over_limit));
  const quotaSummary = entitlements?.quota_summary || null;
  const creditEventItems = creditEvents?.items || [];
  const currentSubscription = entitlements?.current_subscription;
  const availableCredits = Number(quotaSummary?.ai_credits?.total_remaining ?? 0);
  const creditEventCount = Number(creditEvents?.pagination?.total ?? 0);
  const filteredConsumedCredits = Number(creditEvents?.summary?.consumed_ai_credits ?? 0);
  const usedCredits = Number(
    quotaSummary?.ai_credit_ledger_summary?.consumed_ai_credits
    ?? quotaSummary?.ai_credits?.used
    ?? 0
  );
  const paidCredits = Number(quotaSummary?.ai_credits?.paid_remaining ?? 0);
  const nextPaidCreditExpiry = String(quotaSummary?.ai_credits?.paid_next_expires_at || '');
  const formattedNextPaidCreditExpiry = nextPaidCreditExpiry
    ? formatDateTime(nextPaidCreditExpiry, locale)
    : '';
  const currentPeriodStart =
    currentSubscription?.current_period_start_at ||
    entitlements?.period_start_at ||
    '';
  const currentPeriodEnd =
    currentSubscription?.current_period_end_at ||
    entitlements?.period_end_at ||
    '';
  const currentPeriodRange = currentPeriodStart && currentPeriodEnd
    ? formatUsagePeriodRange(currentPeriodStart, currentPeriodEnd, locale)
    : '';
  const currentPeriodEndDetail = currentPeriodEnd
    ? formatUsagePeriodEnd(currentPeriodEnd, locale)
    : '';
  const updatedAtValue = quotaSummary?.generated_at || '';
  const updatedAt = updatedAtValue ? formatUsageUpdatedAt(updatedAtValue, locale) : '';
  const creditRecordsUpdatedAt = creditEvents?.generated_at
    ? formatUsageUpdatedAt(creditEvents.generated_at, locale)
    : '';
  const formatCreditPoints = (value: number) =>
    t('portal.usage.credit_points_value', { count: formatNumber(Math.abs(Math.round(value))) }, '{{count}} AI credits');
  const eventFeatureText = (entry: PortalCreditEvent, field: 'title' | 'detail') =>
    t(
      `portal.usage.credit_ledger_feature_${entry.feature_key}_${field}`,
      {},
      field === 'title' ? entry.feature_label : entry.feature_detail
    );
  const eventSiteLabel = (entry: PortalCreditEvent) => {
    const site = session.sites.find((item) => item.site_id === entry.site_id);
    return site ? getPortalSiteDisplayName(site) : t('common.not_available', {}, 'Not available');
  };

  const creditStatus = quotaSummary?.ai_credits?.status;
  const usageStatusLabel = quotaStatusTone(creditStatus) === 'error' || overBudget
    ? t('portal.home.service_status_attention', {}, 'Needs attention')
    : quotaStatusTone(creditStatus) === 'warning'
      ? t('portal.usage.headroom_watch', {}, 'Close to limit')
      : t('portal.home.risk_level_normal', {}, 'Normal');
  const usageNeedsAttention = quotaStatusTone(creditStatus) !== 'ok' || overBudget;
  const usageHeaderDescription = t(
    'portal.usage.summary_desc',
    {},
    "Review this period's account AI credit usage, records, and trends."
  );
  const usageOverviewMetrics = [
    {
      label: t('portal.usage.total_remaining_label', {}, 'Total available'),
      value: formatQuotaValue(availableCredits),
      detail: t('portal.usage.overview_available_detail', {}, 'Package and paid AI credits available now.'),
    },
    {
      label: t('portal.usage.period_used_label', {}, 'AI credits deducted this period'),
      value: formatQuotaValue(usedCredits),
      detail: t('portal.usage.trend_points_detail', {}, 'Actual service deductions in the current package period.'),
    },
    ...(paidCredits > 0 ? [    {
      label: t('portal.usage.paid_remaining_label', {}, 'Paid credits'),
      value: formatQuotaValue(paidCredits),
      detail: t('portal.usage.overview_paid_detail', {}, 'Purchased AI credits that remain available.'),
    },
    {
      label: t('portal.usage.next_expiry_label', {}, 'Next expiry'),
      value: formattedNextPaidCreditExpiry || t('common.not_available', {}, 'Not available'),
      detail: formattedNextPaidCreditExpiry
        ? t('portal.usage.paid_credit_expiry_hint', { date: formattedNextPaidCreditExpiry }, `The next paid credit grant expires on ${formattedNextPaidCreditExpiry}.`)
        : t('portal.usage.overview_no_expiry_detail', {}, 'No paid-credit expiry is currently recorded.'),
      size: 'compact' as const,
    },] : []),
  ];
  const handleSiteFilterChange = (nextSiteId: string) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (nextSiteId) nextParams.set('site', nextSiteId);
    else nextParams.delete('site');
    const query = nextParams.toString();
    router.replace(`/portal/usage${query ? `?${query}` : ''}`);
  };

  return (
    <PortalPageStack>
      <PortalWorkspaceHeader
        title={t('portal.nav_usage', {}, 'Usage')}
        description={usageHeaderDescription}
        currentPage="usage"
        selectedSiteId={siteFilterId}
        sites={session.sites}
        onSiteChange={handleSiteFilterChange}
        siteSelectorMode="context"
        titleAccessory={!bundleLoading && !bundleError && quotaSummary && !usageNeedsAttention ? (
          <PortalStatusBadge status="active" label={usageStatusLabel} className="text-[0.68rem]" />
        ) : null}
        metadata={(
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
            <span>
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {t('portal.usage.period_label', {}, 'Period')}:
              </span>{' '}
              {currentPeriodRange || t('common.not_found')}
            </span>
            <span>
              {currentPeriodEndDetail
                ? t(
                    'portal.usage.period_end_detail',
                    { time: currentPeriodEndDetail },
                    'Ends {{time}}'
                  )
                : t('portal.usage.header_period_detail', {}, 'Current package period.')}
            </span>
            {updatedAt ? (
              <span>{t('portal.usage.updated_at_inline', { time: updatedAt }, 'Updated {{time}}')}</span>
            ) : null}
          </div>
        )}
        contextPanel={!bundleError && quotaSummary && usageNeedsAttention ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/75 px-4 py-3.5 dark:border-amber-900/70 dark:bg-amber-950/25">
            <p className="text-sm font-semibold text-gray-950 dark:text-white">{usageStatusLabel}</p>
            <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-300">
              {t('portal.usage.status_plain_detail', {}, 'Use the numbers below to decide whether you need more AI credits.')}
            </p>
            <Link
              href="/portal/billing#package-options"
              className="mt-2 inline-flex text-xs font-semibold text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
            >
              {t('portal.home.billing_action', {}, 'Review package')}
            </Link>
          </div>
        ) : null}
      />

      {bundleLoading ? <PortalLoadingState message={t('common.loading')} /> : bundleError ? (
        <PortalErrorState title={t('error.failed_load')} description={bundleError} retryLabel={t('common.retry')} onRetry={() => void loadBundle()} />
      ) : null}
      {siteContextError ? <PortalErrorState title={t('error.failed_load')} description={siteContextError} retryLabel={t('common.retry')} onRetry={() => void selectSite(siteFilterId).catch((err) => setSiteContextError(formatPortalErrorMessage(err, t, t('error.failed_load'))))} /> : null}
      {!siteFilterId ? <PortalEmptyState title={t('portal.usage.choose_site_title')} description={t('portal.usage.choose_site_desc')} /> : null}
      {!bundleLoading && !bundleError && entitlements ? (
        <PortalSection className="space-y-5" data-portal-usage="current-summary">
          <div>
            <h2 className="text-xl font-semibold text-gray-950 dark:text-white">
              {t('portal.usage.overview_title', {}, 'This period')}
            </h2>
            <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-400">
              {t('portal.usage.overview_desc', {}, 'See what is available, what was used, and whether paid AI credits are nearing expiry.')}
            </p>
          </div>
          <PortalMetricStrip items={usageOverviewMetrics} variant="header" columnsClassName={paidCredits > 0 ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-2"} />
        </PortalSection>
      ) : null}

      <div className="border-b border-slate-200 dark:border-slate-800" data-portal-usage="view-tabs">
        <div
          role="tablist"
          aria-label={t('portal.usage.view_tabs_label', {}, 'Usage views')}
          className="flex gap-2"
        >
          {([
            { value: 'trend', label: t('portal.usage.view_tab_trend', {}, 'Trend') },
            { value: 'records', label: t('portal.usage.view_tab_records', {}, 'AI credit records') },
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
      </div>

      <div
        id="portal-usage-panel-trend"
        role="tabpanel"
        aria-labelledby="portal-usage-tab-trend"
        hidden={activeUsageView !== 'trend'}
      >
        {activeUsageView === 'trend' && siteContextReady ? (
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
          {activeUsageView === 'records' && siteContextReady && entitlements ? (
            <div className="space-y-5" data-portal-usage="usage-records">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-950 dark:text-white">
                {t('portal.usage.credit_events_title', {}, 'AI credit records')}
              </h2>
              <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-400">
                {!creditEventLoading && !creditEventError && creditEvents ? t(
                  'portal.usage.credit_events_summary',
                  {
                    credits: formatQuotaValue(filteredConsumedCredits),
                    count: formatQuotaValue(creditEventCount),
                  },
                  '{{credits}} AI credits used across {{count}} services.'
                ) : t('portal.usage.credit_events_desc')}
                {creditRecordsUpdatedAt
                  ? ` · ${t('portal.usage.updated_at_inline', { time: creditRecordsUpdatedAt }, 'Updated {{time}}')}`
                  : ''}
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2" aria-label={t('portal.usage.credit_events_filters', {}, 'AI credit record filters')}>
            <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <span>{t('portal.usage.credit_events_window_label', {}, 'Time range')}</span>
              <select className="input" value={creditEventWindow} disabled={creditEventLoading} onChange={(event) => { setCreditEventWindow(event.target.value as PortalCreditEventWindow); setCreditEventOffset(0); }}>
                <option value="24h">{t('portal.usage.credit_events_window_24h', {}, 'Last 24 hours')}</option>
                <option value="7d">{t('portal.usage.credit_events_window_7d', {}, 'Last 7 days')}</option>
                <option value="30d">{t('portal.usage.credit_events_window_30d', {}, 'Last 30 days')}</option>
                <option value="period">{t('portal.usage.credit_events_window_period', {}, 'Current package period')}</option>
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <span>{t('portal.usage.credit_events_feature_label', {}, 'Service')}</span>
              <select className="input" value={creditEventFeature} disabled={creditEventLoading} onChange={(event) => { setCreditEventFeature(event.target.value as PortalCreditEventFeature); setCreditEventOffset(0); }}>
                <option value="">{t('portal.usage.credit_events_feature_all', {}, 'All services')}</option>
                {['content_generation', 'topic_research', 'web_search', 'site_knowledge', 'image_assistance', 'audio_generation'].map((feature) => (
                  <option key={feature} value={feature}>{t(`portal.usage.credit_ledger_feature_${feature}_title`)}</option>
                ))}
              </select>
            </label>
          </div>
          {creditEventError ? (
            <PortalErrorState title={t('error.failed_load')} description={creditEventError} retryLabel={t('common.retry')} onRetry={() => void loadCreditEventPage(creditEventOffset)} />
          ) : creditEventLoading && !creditEvents ? (
            <div className="space-y-2" aria-label={t('common.loading')}>
              {[0, 1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-900" />)}
            </div>
          ) : creditEventItems.length > 0 ? (
            <>
              <div className="hidden overflow-x-auto lg:block" data-portal-usage="records-table">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <caption className="sr-only">{t('portal.usage.credit_events_title')}</caption>
                  <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800"><tr>
                    <th scope="col" className="px-3 py-3 font-medium">{t('portal.usage.credit_ledger_time')}</th>
                    <th scope="col" className="px-3 py-3 font-medium">{t('common.site')}</th>
                    <th scope="col" className="px-3 py-3 font-medium">{t('portal.usage.credit_events_feature_label')}</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">{t('portal.usage.credit_events_points_column')}</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">{t('common.actions')}</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">{creditEventItems.map((entry) => (
                    <tr key={entry.event_id}>
                      <th scope="row" className="px-3 py-4 font-normal">{formatCreditEventTime(entry.created_at, locale)}</th>
                      <td className="px-3 py-4">{eventSiteLabel(entry)}</td>
                      <td className="px-3 py-4">{eventFeatureText(entry, 'title')}</td>
                      <td className="px-3 py-4 text-right font-semibold">{formatCreditPoints(entry.consumed_ai_credits)}</td>
                      <td className="px-3 py-4 text-right"><button type="button" className="btn btn-secondary btn-sm" onClick={() => setSelectedCreditEvent(entry)} aria-label={`${eventFeatureText(entry, 'title')} · ${t('common.view_details')}`}>{t('common.view_details')}</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-slate-800 lg:hidden">{creditEventItems.map((entry) => (
                <button key={entry.event_id} type="button" className="flex w-full items-center justify-between gap-4 py-4 text-left" onClick={() => setSelectedCreditEvent(entry)}>
                  <span><strong>{eventFeatureText(entry, 'title')}</strong><span className="mt-1 block text-xs text-slate-500">{eventSiteLabel(entry)} · {formatCreditEventTime(entry.created_at, locale)}</span></span>
                  <strong>{formatCreditPoints(entry.consumed_ai_credits)}</strong>
                </button>
              ))}</div>
            </>
          ) : <p className="py-6 text-sm text-slate-500">{t('portal.usage.credit_events_empty')}</p>}
          {!creditEventError && creditEvents ? <ListPagination
            offset={creditEventOffset}
            limit={creditEventPageSize}
            total={creditEventCount}
            isLoading={creditEventLoading}
            onOffsetChange={(nextOffset) => void loadCreditEventPage(nextOffset)}
            className="px-0 pb-0"
          /> : null}
            </div>
          ) : null}
      </PortalSection>

      {selectedCreditEvent ? (
        <div className="fixed inset-0 z-50">
          <button type="button" className="absolute inset-0 bg-slate-950/45" aria-label={t('common.close')} onClick={() => setSelectedCreditEvent(null)} />
          <aside ref={creditEventDrawerRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="credit-event-detail-title" className="absolute right-0 top-0 flex h-full w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 dark:border-slate-800">
              <div><h2 id="credit-event-detail-title" className="text-xl font-semibold text-slate-950 dark:text-white">{eventFeatureText(selectedCreditEvent, 'title')}</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{eventSiteLabel(selectedCreditEvent)}</p></div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSelectedCreditEvent(null)}>{t('common.close')}</button>
            </div>
            <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
              <dl className="grid gap-4 sm:grid-cols-2">
                <div><dt className="text-xs text-slate-500">{t('portal.usage.credit_events_points_column', {}, 'AI credits')}</dt><dd className="mt-1 text-lg font-semibold">{formatCreditPoints(selectedCreditEvent.consumed_ai_credits || selectedCreditEvent.net_ai_credit_delta)}</dd></div>
                <div><dt className="text-xs text-slate-500">{t('portal.usage.credit_ledger_time', {}, 'Time')}</dt><dd className="mt-1 font-medium">{formatUsagePeriodEnd(selectedCreditEvent.created_at, locale)}</dd></div>
              </dl>
              <section><h3 className="font-semibold">{t('portal.usage.credit_events_breakdown_title', {}, 'AI credit breakdown')}</h3><div className="mt-3 divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">{selectedCreditEvent.components.map((component) => <div key={component.key} className="flex justify-between gap-4 px-4 py-3 text-sm"><span>{t(`portal.usage.credit_events_component_${component.key}`)}</span><strong>{formatCreditPoints(component.ai_credits)}</strong></div>)}</div>{selectedCreditEvent.component_count > 1 ? <p className="mt-2 text-xs text-slate-500">{t('portal.usage.credit_events_grouped_hint', { count: String(selectedCreditEvent.component_count) }, '{{count}} billing entries were combined into this service event.')}</p> : null}</section>
              <details className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800"><summary className="cursor-pointer font-medium">{t('portal.support_information', {}, 'Support information')}</summary><p className="mt-3 break-all text-sm text-slate-500">{t('portal.usage.credit_events_support_reference', {}, 'Reference')}: {selectedCreditEvent.support_reference}</p></details>
            </div>
          </aside>
        </div>
      ) : null}

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
