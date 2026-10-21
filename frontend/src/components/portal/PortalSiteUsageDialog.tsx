'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { PortalCreditTrendPanel } from '@/components/portal/PortalCreditTrendPanel';
import { PortalInfoHint } from '@/components/portal/PortalScaffold';
import {
  PortalEmptyState,
  PortalErrorState,
} from '@/components/portal/PortalPageState';
import { useLocale } from '@/contexts/LocaleContext';
import { useSession } from '@/hooks/useSession';
import {
  portalClient,
  type PortalCreditEvent,
  type PortalCreditEventFeature,
  type PortalCreditEventsPayload,
  type PortalCreditTrendPayload,
  type PortalCreditTrendWindow,
  type Site,
} from '@/lib/portal-client';
import { PORTAL_USAGE_CREDIT_EVENT_FILTER_FEATURES } from '@/lib/portal-usage-credit-event-features';
import { formatPortalErrorMessage } from '@/lib/portal-error';
import type { Locale } from '@/lib/i18n';
import { formatNumber } from '@/lib/utils';
import { joinSummaryParts } from '@/lib/portal-summary-text';
import {
  getPortalSiteDisplayName,
  getPortalSiteUrlDisplay,
} from '@/lib/portal-site-display';

type SiteUsageView = 'trend' | 'records';
const SITE_USAGE_VIEWS: SiteUsageView[] = ['trend', 'records'];
/** One time range shared by the trend and the AI credit records tabs. */
const SITE_USAGE_RANGES: Array<{ value: PortalCreditTrendWindow; key: string; fallback: string }> = [
  { value: '1h', key: 'portal.usage.trend_window_1h', fallback: '1 hour' },
  { value: '24h', key: 'portal.usage.trend_window_24h', fallback: '24 hours' },
  { value: '7d', key: 'portal.usage.trend_window_7d', fallback: '7 days' },
  { value: '30d', key: 'portal.usage.trend_window_30d', fallback: '30 days' },
];

/** credit-events has no 1h window: ask for 24h clamped to an explicit last-hour range. */
function creditEventRangeParams(range: PortalCreditTrendWindow) {
  if (range !== '1h') return { window: range };
  const endAt = new Date();
  const startAt = new Date(endAt.getTime() - 60 * 60 * 1000);
  return { window: '24h' as const, startAt: startAt.toISOString(), endAt: endAt.toISOString() };
}

function parseUsageDate(value: string): Date | null {
  const normalizedValue = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)
    ? value
    : `${value.replace(' ', 'T')}Z`;
  const date = new Date(normalizedValue);
  return Number.isNaN(date.getTime()) ? null : date;
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

export type PortalSiteUsageDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  site: Site | null;
};

export function PortalSiteUsageDialog({
  isOpen,
  onClose,
  site,
}: PortalSiteUsageDialogProps) {
  const { locale, t } = useLocale();
  const siteId = site?.site_id || '';
  const { session, selectSite } = useSession();
  // Portal commercial history is scoped to the session-selected site (backend
  // answers 409 portal.site_selection_required otherwise), so switch first.
  const siteContextReady = Boolean(siteId && session?.selected_context?.site?.site_id === siteId);
  const [siteContextError, setSiteContextError] = useState('');
  const [siteContextAttempt, setSiteContextAttempt] = useState(0);
  const [activeView, setActiveView] = useState<SiteUsageView>('trend');
  const [usageRange, setUsageRange] = useState<PortalCreditTrendWindow>('24h');
  const [creditTrend, setCreditTrend] = useState<PortalCreditTrendPayload | null>(null);
  const [creditTrendLoading, setCreditTrendLoading] = useState(false);
  const [creditTrendError, setCreditTrendError] = useState('');
  const [creditEvents, setCreditEvents] = useState<PortalCreditEventsPayload | null>(null);
  const [creditEventOffset, setCreditEventOffset] = useState(0);
  const [creditEventLoading, setCreditEventLoading] = useState(false);
  const [creditEventError, setCreditEventError] = useState('');
  const [creditEventFeature, setCreditEventFeature] = useState<PortalCreditEventFeature>('');
  const [selectedCreditEvent, setSelectedCreditEvent] = useState<PortalCreditEvent | null>(null);
  const creditEventPageSize = 20;
  const siteIdRef = useRef(siteId);
  const trendRequestVersionRef = useRef(0);
  const eventRequestVersionRef = useRef(0);

  const closeCreditEvent = useCallback(() => setSelectedCreditEvent(null), []);
  const handleModalClose = useCallback(() => {
    if (selectedCreditEvent) {
      setSelectedCreditEvent(null);
      return;
    }
    onClose();
  }, [onClose, selectedCreditEvent]);

  const loadCreditTrend = useCallback(async () => {
    const requestSiteId = siteIdRef.current;
    if (!requestSiteId) return;
    const requestVersion = ++trendRequestVersionRef.current;
    setCreditTrendLoading(true);
    setCreditTrendError('');
    try {
      const response = await portalClient.getAccountCreditTrend({
        window: usageRange,
        siteId: requestSiteId,
      });
      if (requestVersion !== trendRequestVersionRef.current || requestSiteId !== siteIdRef.current) return;
      setCreditTrend(response.data);
    } catch (err) {
      if (requestVersion !== trendRequestVersionRef.current || requestSiteId !== siteIdRef.current) return;
      setCreditTrendError(formatPortalErrorMessage(err, t, t('error.failed_load')));
    } finally {
      if (requestVersion === trendRequestVersionRef.current && requestSiteId === siteIdRef.current) {
        setCreditTrendLoading(false);
      }
    }
  }, [usageRange, t]);

  const loadCreditEventPage = useCallback(async (nextOffset: number) => {
    const requestSiteId = siteIdRef.current;
    if (!requestSiteId) return;
    const requestVersion = ++eventRequestVersionRef.current;
    setCreditEventLoading(true);
    setCreditEventError('');
    setCreditEvents(null);
    try {
      const response = await portalClient.getAccountCreditEvents({
        ...creditEventRangeParams(usageRange),
        feature: creditEventFeature,
        siteId: requestSiteId,
        limit: creditEventPageSize,
        offset: nextOffset,
      });
      if (requestVersion !== eventRequestVersionRef.current || requestSiteId !== siteIdRef.current) return;
      setCreditEvents(response.data);
      setCreditEventOffset(nextOffset);
    } catch (err) {
      if (requestVersion !== eventRequestVersionRef.current || requestSiteId !== siteIdRef.current) return;
      setCreditEventError(formatPortalErrorMessage(err, t, t('error.failed_load')));
    } finally {
      if (requestVersion === eventRequestVersionRef.current && requestSiteId === siteIdRef.current) {
        setCreditEventLoading(false);
      }
    }
  }, [creditEventFeature, usageRange, t]);

  useEffect(() => {
    siteIdRef.current = siteId;
    trendRequestVersionRef.current += 1;
    eventRequestVersionRef.current += 1;
    setCreditTrend(null);
    setCreditTrendLoading(false);
    setCreditTrendError('');
    setCreditEvents(null);
    setCreditEventOffset(0);
    setCreditEventLoading(false);
    setCreditEventError('');
    setSelectedCreditEvent(null);
    setActiveView('trend');
  }, [siteId]);

  useEffect(() => {
    if (!isOpen || !siteId || siteContextReady) {
      setSiteContextError('');
      return;
    }
    let cancelled = false;
    setSiteContextError('');
    void selectSite(siteId).catch((err) => {
      if (!cancelled) setSiteContextError(formatPortalErrorMessage(err, t, t('error.failed_load')));
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, siteId, siteContextReady, selectSite, siteContextAttempt, t]);

  useEffect(() => {
    if (!isOpen || !siteId || !siteContextReady) return;
    if (activeView !== 'trend') return;
    void loadCreditTrend();
    return () => {
      trendRequestVersionRef.current += 1;
    };
  }, [activeView, isOpen, loadCreditTrend, siteId, siteContextReady]);

  useEffect(() => {
    if (!isOpen || !siteId || !siteContextReady) return;
    if (activeView !== 'records') return;
    void loadCreditEventPage(0);
    return () => {
      eventRequestVersionRef.current += 1;
    };
  }, [activeView, creditEventFeature, usageRange, isOpen, loadCreditEventPage, siteId, siteContextReady]);

  const formatQuotaValue = (value: unknown) => formatNumber(Math.round(Number(value || 0)));
  const formatCreditAmount = (value: number) => formatNumber(Math.abs(Math.round(value)));
  const formatCreditPoints = (value: number) =>
    t('portal.usage.credit_points_value', { count: formatNumber(Math.abs(Math.round(value))) }, '{{count}} AI credits');
  const eventFeatureText = (entry: PortalCreditEvent, field: 'title' | 'detail') =>
    t(
      `portal.usage.credit_ledger_feature_${entry.feature_key}_${field}`,
      {},
      field === 'title' ? entry.feature_label : entry.feature_detail,
    );

  const creditEventItems = creditEvents?.items || [];
  const creditEventCount = Number(creditEvents?.pagination?.total ?? 0);
  const filteredConsumedCredits = Number(creditEvents?.summary?.consumed_ai_credits ?? 0);
  const creditRecordsUpdatedAt = creditEvents?.generated_at
    ? formatUsageUpdatedAt(creditEvents.generated_at, locale)
    : '';
  const trendUpdatedAt = creditTrend?.generated_at
    ? formatUsageUpdatedAt(creditTrend.generated_at, locale)
    : '';
  const trendTotal = Number(creditTrend?.total_ai_credits || 0);
  const updatedText = (time: string) => (time ? t('portal.usage.updated_at_inline', { time }, 'Updated {{time}}') : '');
  const summaryText = activeView === 'trend'
    ? (!creditTrendLoading && !creditTrendError && creditTrend
        ? joinSummaryParts([
            t('portal.usage.trend_total', { count: formatNumber(trendTotal) }, '{{count}} AI credits used in this range'),
            updatedText(trendUpdatedAt),
          ])
        : '')
    : (!creditEventLoading && !creditEventError && creditEvents
        ? joinSummaryParts([
            t(
              'portal.usage.credit_events_summary',
              { credits: formatQuotaValue(filteredConsumedCredits), count: formatQuotaValue(creditEventCount) },
              '{{credits}} AI credits used across {{count}} service events.',
            ),
            updatedText(creditRecordsUpdatedAt),
          ])
        : '');
  const pageStart = creditEventCount > 0 ? creditEventOffset + 1 : 0;
  const pageEnd = Math.min(creditEventOffset + creditEventPageSize, creditEventCount);
  const hasPreviousPage = creditEventOffset > 0;
  const hasNextPage = creditEventOffset + creditEventPageSize < creditEventCount;
  const siteTitle = site ? getPortalSiteDisplayName(site) : t('common.site', {}, 'Site');
  const siteUrl = site ? getPortalSiteUrlDisplay(site) : '';

  const dialogTitle = selectedCreditEvent
    ? eventFeatureText(selectedCreditEvent, 'title')
    : t('portal.billing.site_usage_dialog_title', {}, 'Site usage');
  const dialogDescription = siteUrl ? `${siteTitle} · ${siteUrl}` : siteTitle;

  return (
    <Modal
      isOpen={isOpen && Boolean(site)}
      onClose={handleModalClose}
      closeLabel={t('common.close', {}, 'Close')}
      title={dialogTitle}
      description={dialogDescription}
      size="2xl"
      className="h-[min(90vh,48rem)] rounded-[18px] shadow-[0_16px_44px_rgba(15,23,42,0.14)]"
    >
      <div className="flex min-h-full flex-col gap-4" data-portal-billing="site-usage-dialog">
        {!siteId ? (
          <PortalEmptyState
            title={t('portal.usage.choose_site_title', {}, 'Choose a site to view its usage')}
            description={t('portal.billing.site_usage_pick_hint', {}, 'Pick a connected site to review its trend and AI credit records.')}
          />
        ) : siteContextError ? (
          <PortalErrorState
            title={t('error.failed_load')}
            description={siteContextError}
            retryLabel={t('common.retry')}
            onRetry={() => setSiteContextAttempt((value) => value + 1)}
          />
        ) : !siteContextReady ? (
          <div className="space-y-2" aria-label={t('common.loading')} data-portal-usage="site-dialog-context-loading">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-900" />
            ))}
          </div>
        ) : selectedCreditEvent ? (
          <div className="space-y-6" data-portal-usage="site-dialog-event-detail">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={closeCreditEvent}
            >
              {t('common.back', {}, 'Back')}
            </button>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">{t('portal.usage.credit_events_points_column', {}, 'AI credits')}</dt>
                <dd className="mt-1 text-lg font-semibold">
                  {formatCreditPoints(selectedCreditEvent.consumed_ai_credits || selectedCreditEvent.net_ai_credit_delta)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">{t('portal.usage.credit_ledger_time', {}, 'Time')}</dt>
                <dd className="mt-1 font-medium">{formatUsagePeriodEnd(selectedCreditEvent.created_at, locale)}</dd>
              </div>
            </dl>
            <section>
              <h3 className="font-semibold">{t('portal.usage.credit_events_breakdown_title', {}, 'AI credit breakdown')}</h3>
              <div className="mt-3 divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {selectedCreditEvent.components.map((component) => (
                  <div key={component.key} className="flex justify-between gap-4 px-4 py-3 text-sm">
                    <span>{t(`portal.usage.credit_events_component_${component.key}`)}</span>
                    <strong>{formatCreditPoints(component.ai_credits)}</strong>
                  </div>
                ))}
              </div>
              {selectedCreditEvent.component_count > 1 ? (
                <p className="mt-2 text-xs text-slate-500">
                  {t(
                    'portal.usage.credit_events_grouped_hint',
                    { count: String(selectedCreditEvent.component_count) },
                    '{{count}} billing entries were combined into this service event.',
                  )}
                </p>
              ) : null}
            </section>
            <details className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800">
              <summary className="cursor-pointer font-medium">{t('portal.support_information', {}, 'Support information')}</summary>
              <p className="mt-3 break-all text-sm text-slate-500">
                {t('portal.usage.credit_events_support_reference', {}, 'Reference')}: {selectedCreditEvent.support_reference}
              </p>
            </details>
          </div>
        ) : (
            <>
              <div
                className="sticky -top-4 z-20 -mx-6 -mt-4 space-y-3 border-b border-slate-200 bg-white px-6 pt-4 dark:border-slate-800 dark:bg-gray-900"
                data-portal-usage="site-dialog-header"
              >
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2" data-portal-usage="site-dialog-summary">
                  <p className="min-w-0 flex-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    <span data-portal-usage="site-dialog-summary-text">
                      {summaryText || t('common.loading', {}, 'Loading...')}
                    </span>
                    <PortalInfoHint
                      label={t('portal.usage.primary_trend_title', {}, 'AI credit usage trend')}
                      detail={t('portal.usage.credit_events_desc', {}, 'Service events that consumed AI credits.')}
                      className="ml-1 align-middle"
                      data-portal-usage="trend-help"
                    />
                  </p>
                  <div
                    role="radiogroup"
                    aria-label={t('portal.usage.credit_events_window_label', {}, 'Time range')}
                    className="inline-flex max-w-full shrink-0 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800"
                    data-portal-usage="site-dialog-range"
                  >
                    {SITE_USAGE_RANGES.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={usageRange === option.value}
                        className={`min-h-9 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
                          usageRange === option.value
                            ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-950 dark:text-blue-300'
                            : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white'
                        }`}
                        onClick={() => {
                          setUsageRange(option.value);
                          setCreditEventOffset(0);
                        }}
                      >
                        {t(option.key, {}, option.fallback)}
                      </button>
                    ))}
                  </div>
                </div>
                <div data-portal-usage="site-dialog-tabs">
                <div
                  role="tablist"
                  aria-label={t('portal.usage.view_tabs_label', {}, 'Usage views')}
                  className="-mb-px flex gap-1"
                >
                  {([
                    { value: 'trend' as const, label: t('portal.usage.view_tab_trend', {}, 'Trend') },
                    { value: 'records' as const, label: t('portal.usage.view_tab_records', {}, 'AI credit records') },
                  ]).map((view) => (
                    <button
                      key={view.value}
                      id={`portal-site-usage-tab-${view.value}`}
                      type="button"
                      role="tab"
                      aria-selected={activeView === view.value}
                      aria-controls={`portal-site-usage-panel-${view.value}`}
                      tabIndex={activeView === view.value ? 0 : -1}
                      className={`min-h-11 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors ${
                        activeView === view.value
                          ? 'border-slate-950 text-slate-950 dark:border-white dark:text-white'
                          : 'border-transparent text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white'
                      }`}
                      onClick={() => setActiveView(view.value)}
                      onKeyDown={(event) => {
                        const currentIndex = SITE_USAGE_VIEWS.indexOf(view.value);
                        const nextIndex = event.key === 'ArrowRight'
                          ? (currentIndex + 1) % SITE_USAGE_VIEWS.length
                          : event.key === 'ArrowLeft'
                            ? (currentIndex - 1 + SITE_USAGE_VIEWS.length) % SITE_USAGE_VIEWS.length
                            : -1;
                        if (nextIndex < 0) return;
                        event.preventDefault();
                        const nextView = SITE_USAGE_VIEWS[nextIndex];
                        setActiveView(nextView);
                        requestAnimationFrame(() => document.getElementById(`portal-site-usage-tab-${nextView}`)?.focus());
                      }}
                    >
                      {view.label}
                    </button>
                  ))}
                </div>
                </div>
              </div>

              <div
                id="portal-site-usage-panel-trend"
                role="tabpanel"
                aria-labelledby="portal-site-usage-tab-trend"
                hidden={activeView !== 'trend'}
              >
                {activeView === 'trend' ? (
                  <PortalCreditTrendPanel
                    payload={creditTrend}
                    window={usageRange}
                    isLoading={creditTrendLoading}
                    error={creditTrendError}
                    onRetry={() => void loadCreditTrend()}
                    embedded
                  />
                ) : null}
              </div>

              <div
                id="portal-site-usage-panel-records"
                role="tabpanel"
                aria-labelledby="portal-site-usage-tab-records"
                hidden={activeView !== 'records'}
                className="space-y-5"
                data-portal-usage="site-dialog-records"
              >
                {activeView === 'records' ? (
                  <div className="space-y-4">
                    <label className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                      <span>{t('portal.usage.credit_events_feature_label', {}, 'Service')}</span>
                      <select
                        className="input h-9 w-auto min-w-40 py-1"
                        value={creditEventFeature}
                        disabled={creditEventLoading}
                        onChange={(event) => {
                          setCreditEventFeature(event.target.value as PortalCreditEventFeature);
                          setCreditEventOffset(0);
                        }}
                        data-portal-usage="records-feature-filter"
                      >
                        <option value="">{t('portal.usage.credit_events_feature_all', {}, 'All services')}</option>
                        {PORTAL_USAGE_CREDIT_EVENT_FILTER_FEATURES.map((feature) => (
                          <option key={feature} value={feature}>
                            {t(`portal.usage.credit_ledger_feature_${feature}_title`)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {creditEventError ? (
                      <PortalErrorState
                        title={t('error.failed_load')}
                        description={creditEventError}
                        retryLabel={t('common.retry')}
                        onRetry={() => void loadCreditEventPage(creditEventOffset)}
                      />
                    ) : creditEventLoading && !creditEvents ? (
                      <div className="space-y-2" aria-label={t('common.loading')}>
                        {[0, 1, 2, 3].map((item) => (
                          <div key={item} className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-900" />
                        ))}
                      </div>
                    ) : creditEventItems.length > 0 ? (
                      <>
                        <div className="hidden sm:block" data-portal-usage="records-table">
                          <table className="w-full table-fixed text-left text-sm">
                            <caption className="sr-only">{t('portal.usage.credit_events_title')}</caption>
                            <colgroup>
                              <col className="w-40" />
                              <col />
                              <col className="w-28" />
                              <col className="w-8" />
                            </colgroup>
                            <thead className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                              <tr>
                                <th scope="col" className="px-2 py-2 font-medium">{t('portal.usage.credit_ledger_time')}</th>
                                <th scope="col" className="px-2 py-2 font-medium">{t('portal.usage.credit_events_feature_label')}</th>
                                <th scope="col" className="px-2 py-2 text-right font-medium">{t('portal.usage.credit_events_points_column')}</th>
                                <th scope="col" className="px-0 py-2"><span className="sr-only">{t('common.view_details')}</span></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {creditEventItems.map((entry) => (
                                <tr
                                  key={entry.event_id}
                                  className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                                  onClick={() => setSelectedCreditEvent(entry)}
                                  data-portal-usage="records-row"
                                >
                                  <th scope="row" className="whitespace-nowrap px-2 py-3 font-normal text-slate-600 dark:text-slate-300">
                                    {formatCreditEventTime(entry.created_at, locale)}
                                  </th>
                                  <td className="break-words px-2 py-3 text-slate-900 dark:text-slate-100">{eventFeatureText(entry, 'title')}</td>
                                  <td className="whitespace-nowrap px-2 py-3 text-right font-semibold tabular-nums">
                                    {formatCreditAmount(entry.consumed_ai_credits)}
                                  </td>
                                  <td className="px-0 py-3 text-right">
                                    <button
                                      type="button"
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-lg leading-none text-slate-400 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:text-slate-200"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setSelectedCreditEvent(entry);
                                      }}
                                      aria-label={`${eventFeatureText(entry, 'title')} · ${t('common.view_details')}`}
                                    >
                                      <span aria-hidden="true">›</span>
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="divide-y divide-slate-100 dark:divide-slate-800 sm:hidden">
                          {creditEventItems.map((entry) => (
                            <button
                              key={entry.event_id}
                              type="button"
                              className="flex w-full items-center gap-3 py-3 text-left"
                              onClick={() => setSelectedCreditEvent(entry)}
                              data-portal-usage="records-row"
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block break-words font-medium">{eventFeatureText(entry, 'title')}</span>
                                <span className="mt-0.5 block text-xs text-slate-500">
                                  {formatCreditEventTime(entry.created_at, locale)}
                                </span>
                              </span>
                              <strong className="whitespace-nowrap tabular-nums">{formatCreditPoints(entry.consumed_ai_credits)}</strong>
                              <span aria-hidden="true" className="text-lg leading-none text-slate-400">›</span>
                            </button>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="py-6 text-sm text-slate-500">{t('portal.usage.credit_events_empty')}</p>
                    )}
                  </div>
                ) : null}
              </div>

              {activeView === 'records' && !creditEventError && creditEvents && creditEventCount > 0 ? (
                <nav
                  className="sticky -bottom-4 z-20 -mx-6 -mb-4 mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-3 dark:border-slate-800 dark:bg-gray-900"
                  aria-label={t('common.pagination', {}, 'Pagination')}
                  data-portal-usage="records-pagination"
                >
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t(
                      'common.pagination_summary',
                      { start: String(pageStart), end: String(pageEnd), total: String(creditEventCount) },
                      `${pageStart}-${pageEnd} of ${creditEventCount}`,
                    )}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={!hasPreviousPage || creditEventLoading}
                      onClick={() => void loadCreditEventPage(Math.max(0, creditEventOffset - creditEventPageSize))}
                    >
                      {t('common.previous', {}, 'Previous')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={!hasNextPage || creditEventLoading}
                      onClick={() => void loadCreditEventPage(creditEventOffset + creditEventPageSize)}
                    >
                      {t('common.next_page', {}, 'Next page')}
                    </button>
                  </div>
                </nav>
              ) : null}
            </>
        )}
      </div>
    </Modal>
  );
}
