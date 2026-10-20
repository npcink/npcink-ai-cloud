'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ListPagination } from '@/components/ui/ListPagination';
import { Modal } from '@/components/ui/Modal';
import { PortalCreditTrendPanel } from '@/components/portal/PortalCreditTrendPanel';
import {
  PortalEmptyState,
  PortalErrorState,
} from '@/components/portal/PortalPageState';
import { useLocale } from '@/contexts/LocaleContext';
import { useDialogFocusManagement } from '@/hooks/useDialogFocusManagement';
import {
  portalClient,
  type PortalCreditEvent,
  type PortalCreditEventFeature,
  type PortalCreditEventsPayload,
  type PortalCreditEventWindow,
  type PortalCreditTrendPayload,
  type PortalCreditTrendWindow,
  type Site,
} from '@/lib/portal-client';
import { PORTAL_USAGE_CREDIT_EVENT_FILTER_FEATURES } from '@/lib/portal-usage-credit-event-features';
import { formatPortalErrorMessage } from '@/lib/portal-error';
import type { Locale } from '@/lib/i18n';
import { formatNumber } from '@/lib/utils';
import {
  getPortalSiteDisplayName,
  getPortalSiteUrlDisplay,
} from '@/lib/portal-site-display';

type SiteUsageView = 'trend' | 'records';
const SITE_USAGE_VIEWS: SiteUsageView[] = ['trend', 'records'];

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
  const [activeView, setActiveView] = useState<SiteUsageView>('trend');
  const [creditTrendWindow, setCreditTrendWindow] = useState<PortalCreditTrendWindow>('24h');
  const [creditTrend, setCreditTrend] = useState<PortalCreditTrendPayload | null>(null);
  const [creditTrendLoading, setCreditTrendLoading] = useState(false);
  const [creditTrendError, setCreditTrendError] = useState('');
  const [creditEvents, setCreditEvents] = useState<PortalCreditEventsPayload | null>(null);
  const [creditEventOffset, setCreditEventOffset] = useState(0);
  const [creditEventLoading, setCreditEventLoading] = useState(false);
  const [creditEventError, setCreditEventError] = useState('');
  const [creditEventWindow, setCreditEventWindow] = useState<PortalCreditEventWindow>('7d');
  const [creditEventFeature, setCreditEventFeature] = useState<PortalCreditEventFeature>('');
  const [selectedCreditEvent, setSelectedCreditEvent] = useState<PortalCreditEvent | null>(null);
  const creditEventPageSize = 20;
  const siteIdRef = useRef(siteId);
  const trendRequestVersionRef = useRef(0);
  const eventRequestVersionRef = useRef(0);

  const closeCreditEvent = useCallback(() => setSelectedCreditEvent(null), []);
  const creditEventDrawerRef = useDialogFocusManagement<HTMLElement>(
    Boolean(selectedCreditEvent),
    closeCreditEvent,
  );

  const loadCreditTrend = useCallback(async () => {
    const requestSiteId = siteIdRef.current;
    if (!requestSiteId) return;
    const requestVersion = ++trendRequestVersionRef.current;
    setCreditTrendLoading(true);
    setCreditTrendError('');
    try {
      const response = await portalClient.getAccountCreditTrend({
        window: creditTrendWindow,
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
  }, [creditTrendWindow, t]);

  const loadCreditEventPage = useCallback(async (nextOffset: number) => {
    const requestSiteId = siteIdRef.current;
    if (!requestSiteId) return;
    const requestVersion = ++eventRequestVersionRef.current;
    setCreditEventLoading(true);
    setCreditEventError('');
    setCreditEvents(null);
    try {
      const response = await portalClient.getAccountCreditEvents({
        window: creditEventWindow,
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
  }, [creditEventFeature, creditEventWindow, t]);

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
    if (!isOpen || !siteId) return;
    if (activeView !== 'trend') return;
    void loadCreditTrend();
    return () => {
      trendRequestVersionRef.current += 1;
    };
  }, [activeView, isOpen, loadCreditTrend, siteId]);

  useEffect(() => {
    if (!isOpen || !siteId) return;
    if (activeView !== 'records') return;
    void loadCreditEventPage(0);
    return () => {
      eventRequestVersionRef.current += 1;
    };
  }, [activeView, creditEventFeature, creditEventWindow, isOpen, loadCreditEventPage, siteId]);

  const formatQuotaValue = (value: unknown) => formatNumber(Math.round(Number(value || 0)));
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
  const siteTitle = site ? getPortalSiteDisplayName(site) : t('common.site', {}, 'Site');
  const siteUrl = site ? getPortalSiteUrlDisplay(site) : '';

  return (
    <>
      <Modal
        isOpen={isOpen && Boolean(site)}
        onClose={onClose}
        closeLabel={t('common.close', {}, 'Close')}
        title={t('portal.billing.site_usage_dialog_title', {}, 'Site usage')}
        description={siteUrl ? `${siteTitle} · ${siteUrl}` : siteTitle}
        size="xl"
        className="max-w-4xl rounded-[18px] shadow-[0_16px_44px_rgba(15,23,42,0.14)]"
      >
        <div className="max-h-[min(75vh,40rem)] space-y-4 overflow-y-auto pr-1" data-portal-billing="site-usage-dialog">
          {!siteId ? (
            <PortalEmptyState
              title={t('portal.usage.choose_site_title', {}, 'Choose a site to view its usage')}
              description={t('portal.billing.site_usage_pick_hint', {}, 'Pick a connected site to review its trend and AI credit records.')}
            />
          ) : (
            <>
              <div className="border-b border-slate-200 dark:border-slate-800" data-portal-usage="site-dialog-tabs">
                <div
                  role="tablist"
                  aria-label={t('portal.usage.view_tabs_label', {}, 'Usage views')}
                  className="flex gap-2"
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
                      className={`min-h-11 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                        activeView === view.value
                          ? 'bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white'
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

              <div
                id="portal-site-usage-panel-trend"
                role="tabpanel"
                aria-labelledby="portal-site-usage-tab-trend"
                hidden={activeView !== 'trend'}
              >
                {activeView === 'trend' ? (
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

              <div
                id="portal-site-usage-panel-records"
                role="tabpanel"
                aria-labelledby="portal-site-usage-tab-records"
                hidden={activeView !== 'records'}
                className="space-y-5"
                data-portal-usage="site-dialog-records"
              >
                {activeView === 'records' ? (
                  <div className="space-y-5">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-950 dark:text-white">
                        {t('portal.usage.credit_events_title', {}, 'AI credit records')}
                      </h2>
                      <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-400">
                        {!creditEventLoading && !creditEventError && creditEvents
                          ? t(
                              'portal.usage.credit_events_summary',
                              {
                                credits: formatQuotaValue(filteredConsumedCredits),
                                count: formatQuotaValue(creditEventCount),
                              },
                              '{{credits}} AI credits used across {{count}} services.',
                            )
                          : t('portal.usage.credit_events_desc', {}, 'Service events that consumed AI credits.')}
                        {creditRecordsUpdatedAt
                          ? ` · ${t('portal.usage.updated_at_inline', { time: creditRecordsUpdatedAt }, 'Updated {{time}}')}`
                          : ''}
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2" aria-label={t('portal.usage.credit_events_filters', {}, 'AI credit record filters')}>
                      <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                        <span>{t('portal.usage.credit_events_window_label', {}, 'Time range')}</span>
                        <select
                          className="input"
                          value={creditEventWindow}
                          disabled={creditEventLoading}
                          onChange={(event) => {
                            setCreditEventWindow(event.target.value as PortalCreditEventWindow);
                            setCreditEventOffset(0);
                          }}
                        >
                          <option value="24h">{t('portal.usage.credit_events_window_24h', {}, 'Last 24 hours')}</option>
                          <option value="7d">{t('portal.usage.credit_events_window_7d', {}, 'Last 7 days')}</option>
                          <option value="30d">{t('portal.usage.credit_events_window_30d', {}, 'Last 30 days')}</option>
                          <option value="period">{t('portal.usage.credit_events_window_period', {}, 'Current package period')}</option>
                        </select>
                      </label>
                      <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                        <span>{t('portal.usage.credit_events_feature_label', {}, 'Service')}</span>
                        <select
                          className="input"
                          value={creditEventFeature}
                          disabled={creditEventLoading}
                          onChange={(event) => {
                            setCreditEventFeature(event.target.value as PortalCreditEventFeature);
                            setCreditEventOffset(0);
                          }}
                        >
                          <option value="">{t('portal.usage.credit_events_feature_all', {}, 'All services')}</option>
                          {PORTAL_USAGE_CREDIT_EVENT_FILTER_FEATURES.map((feature) => (
                            <option key={feature} value={feature}>
                              {t(`portal.usage.credit_ledger_feature_${feature}_title`)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
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
                          <div key={item} className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-900" />
                        ))}
                      </div>
                    ) : creditEventItems.length > 0 ? (
                      <>
                        <div className="hidden overflow-x-auto lg:block" data-portal-usage="records-table">
                          <table className="w-full min-w-[560px] text-left text-sm">
                            <caption className="sr-only">{t('portal.usage.credit_events_title')}</caption>
                            <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800">
                              <tr>
                                <th scope="col" className="px-3 py-3 font-medium">{t('portal.usage.credit_ledger_time')}</th>
                                <th scope="col" className="px-3 py-3 font-medium">{t('portal.usage.credit_events_feature_label')}</th>
                                <th scope="col" className="px-3 py-3 text-right font-medium">{t('portal.usage.credit_events_points_column')}</th>
                                <th scope="col" className="px-3 py-3 text-right font-medium">{t('common.actions')}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                              {creditEventItems.map((entry) => (
                                <tr key={entry.event_id}>
                                  <th scope="row" className="px-3 py-4 font-normal">
                                    {formatCreditEventTime(entry.created_at, locale)}
                                  </th>
                                  <td className="px-3 py-4">{eventFeatureText(entry, 'title')}</td>
                                  <td className="px-3 py-4 text-right font-semibold">
                                    {formatCreditPoints(entry.consumed_ai_credits)}
                                  </td>
                                  <td className="px-3 py-4 text-right">
                                    <button
                                      type="button"
                                      className="btn btn-secondary btn-sm"
                                      onClick={() => setSelectedCreditEvent(entry)}
                                      aria-label={`${eventFeatureText(entry, 'title')} · ${t('common.view_details')}`}
                                    >
                                      {t('common.view_details')}
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="divide-y divide-slate-200 dark:divide-slate-800 lg:hidden">
                          {creditEventItems.map((entry) => (
                            <button
                              key={entry.event_id}
                              type="button"
                              className="flex w-full items-center justify-between gap-4 py-4 text-left"
                              onClick={() => setSelectedCreditEvent(entry)}
                            >
                              <span>
                                <strong>{eventFeatureText(entry, 'title')}</strong>
                                <span className="mt-1 block text-xs text-slate-500">
                                  {formatCreditEventTime(entry.created_at, locale)}
                                </span>
                              </span>
                              <strong>{formatCreditPoints(entry.consumed_ai_credits)}</strong>
                            </button>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="py-6 text-sm text-slate-500">{t('portal.usage.credit_events_empty')}</p>
                    )}
                    {!creditEventError && creditEvents ? (
                      <ListPagination
                        offset={creditEventOffset}
                        limit={creditEventPageSize}
                        total={creditEventCount}
                        isLoading={creditEventLoading}
                        onOffsetChange={(nextOffset) => void loadCreditEventPage(nextOffset)}
                        className="px-0 pb-0"
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      </Modal>

      {selectedCreditEvent ? (
        <div className="fixed inset-0 z-[60]">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/45"
            aria-label={t('common.close')}
            onClick={() => setSelectedCreditEvent(null)}
          />
          <aside
            ref={creditEventDrawerRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="site-credit-event-detail-title"
            className="absolute right-0 top-0 flex h-full w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 dark:border-slate-800">
              <div>
                <h2 id="site-credit-event-detail-title" className="text-xl font-semibold text-slate-950 dark:text-white">
                  {eventFeatureText(selectedCreditEvent, 'title')}
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{siteTitle}</p>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSelectedCreditEvent(null)}>
                {t('common.close')}
              </button>
            </div>
            <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
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
          </aside>
        </div>
      ) : null}
    </>
  );
}
