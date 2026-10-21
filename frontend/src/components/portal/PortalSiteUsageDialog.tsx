'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  type PortalCreditEventDay,
  type PortalCreditEventFeature,
  type PortalCreditEventsPayload,
  type PortalCreditTrendPayload,
  type PortalCreditTrendPoint,
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
  { value: '1h', key: 'portal.usage.range_short_1h', fallback: '1h' },
  { value: '24h', key: 'portal.usage.range_short_24h', fallback: '24h' },
  { value: '7d', key: 'portal.usage.range_short_7d', fallback: '7d' },
  { value: '30d', key: 'portal.usage.range_short_30d', fallback: '30d' },
];

/** Days shown per page when records are grouped by day (7d / 30d). */
const DAY_PAGE_SIZE = 10;

type SiteUsageDayRow = PortalCreditEventDay & { key: string; dayStart: Date };
type SiteUsageBucketFilter = { startAt: string; endAt: string; label: string };

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Server day key (YYYY-MM-DD, already in the requested timezone) → a local Date for labels. */
function dayKeyToDate(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, (month || 1) - 1, date || 1);
}

function formatDayLabel(day: Date, locale: Locale, t: (key: string, params?: Record<string, string>, fallback?: string) => string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'zh-CN', { month: 'numeric', day: 'numeric' }).format(day);
  const weekday = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'zh-CN', { weekday: 'short' }).format(day);
  if (day.getTime() === today.getTime()) return `${date} ${t('portal.usage.day_today', {}, 'Today')}`;
  return `${date} ${weekday}`;
}

function formatClockTime(value: string, locale: Locale): string {
  const date = parseUsageDate(value);
  if (!date) return '-';
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'zh-CN', { hour: '2-digit', minute: '2-digit' }).format(date);
}

/** 「10/20 18:00–19:00」, or both dates when the slot crosses midnight. */
function formatBucketLabel(startAt: string, endAt: string, locale: Locale): string {
  const start = parseUsageDate(startAt);
  const end = parseUsageDate(endAt);
  if (!start || !end) return '';
  const tag = locale === 'en' ? 'en-US' : 'zh-CN';
  const day = (d: Date) => new Intl.DateTimeFormat(tag, { month: 'numeric', day: 'numeric' }).format(d);
  const clock = (d: Date) => new Intl.DateTimeFormat(tag, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  return start.toDateString() === end.toDateString()
    ? `${day(start)} ${clock(start)}–${clock(end)}`
    : `${day(start)} ${clock(start)}–${day(end)} ${clock(end)}`;
}

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
  const [bucketFilter, setBucketFilter] = useState<SiteUsageBucketFilter | null>(null);
  const [dayRows, setDayRows] = useState<SiteUsageDayRow[] | null>(null);
  const [dayTotal, setDayTotal] = useState(0);
  const [dayOffset, setDayOffset] = useState(0);
  const [dayLoading, setDayLoading] = useState(false);
  const [dayError, setDayError] = useState('');
  const [dayFeatureTotals, setDayFeatureTotals] = useState<PortalCreditEventDay['feature_totals']>([]);
  /** Drill-down into one day (replaces the day table inside the records tab). */
  const [drillDay, setDrillDay] = useState<SiteUsageDayRow | null>(null);
  const [drillItems, setDrillItems] = useState<PortalCreditEvent[] | null>(null);
  const [drillError, setDrillError] = useState('');
  const [drillHour, setDrillHour] = useState<SiteUsageBucketFilter | null>(null);
  const [drillPage, setDrillPage] = useState(0);
  const [drillOpenedAt, setDrillOpenedAt] = useState(0);
  const dayRequestVersionRef = useRef(0);
  const drillRequestVersionRef = useRef(0);
  const dialogBodyRef = useRef<HTMLDivElement>(null);
  const savedDayScrollRef = useRef(0);
  const pendingDayScrollRestoreRef = useRef<number | null>(null);
  const isDayMode = !bucketFilter && (usageRange === '7d' || usageRange === '30d');
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
        ...(bucketFilter
          ? { window: usageRange === '1h' ? '24h' as const : usageRange, startAt: bucketFilter.startAt, endAt: bucketFilter.endAt }
          : creditEventRangeParams(usageRange)),
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
  }, [bucketFilter, creditEventFeature, usageRange, t]);

  /** One aggregation request per page of days (portal credit-event-days, local timezone). */
  const loadDayPage = useCallback(async (nextOffset: number) => {
    const requestSiteId = siteIdRef.current;
    if (!requestSiteId || (usageRange !== '7d' && usageRange !== '30d')) return;
    const requestVersion = ++dayRequestVersionRef.current;
    setDayLoading(true);
    setDayError('');
    try {
      const response = await portalClient.getAccountCreditEventDays({
        window: usageRange,
        timezone: browserTimeZone(),
        feature: creditEventFeature,
        siteId: requestSiteId,
        limit: DAY_PAGE_SIZE,
        offset: nextOffset,
      });
      if (requestVersion !== dayRequestVersionRef.current || requestSiteId !== siteIdRef.current) return;
      setDayRows((response.data?.items || []).map((item) => ({ ...item, key: item.day, dayStart: dayKeyToDate(item.day) })));
      setDayTotal(Number(response.data?.pagination?.total ?? 0));
      setDayFeatureTotals(response.data?.summary?.feature_totals || []);
      setDayOffset(nextOffset);
    } catch (err) {
      if (requestVersion !== dayRequestVersionRef.current || requestSiteId !== siteIdRef.current) return;
      setDayError(formatPortalErrorMessage(err, t, t('error.failed_load')));
    } finally {
      if (requestVersion === dayRequestVersionRef.current) setDayLoading(false);
    }
  }, [creditEventFeature, usageRange, t]);

  /** Drill-down loads every call of that day (pages of 50 until the total is reached). */
  const loadDrillDay = useCallback(async (day: SiteUsageDayRow) => {
    const requestSiteId = siteIdRef.current;
    if (!requestSiteId || (usageRange !== '7d' && usageRange !== '30d')) return;
    const requestVersion = ++drillRequestVersionRef.current;
    setDrillItems(null);
    setDrillError('');
    try {
      const collected: PortalCreditEvent[] = [];
      for (let page = 0; page < 40; page += 1) {
        const response = await portalClient.getAccountCreditEvents({
          window: usageRange,
          feature: creditEventFeature,
          siteId: requestSiteId,
          startAt: day.start_at,
          endAt: day.end_at,
          limit: 50,
          offset: collected.length,
        });
        const items = response.data?.items || [];
        collected.push(...items);
        const total = Number(response.data?.pagination?.total ?? collected.length);
        if (items.length === 0 || collected.length >= total) break;
      }
      if (requestVersion !== drillRequestVersionRef.current || requestSiteId !== siteIdRef.current) return;
      collected.sort((a, b) => b.created_at.localeCompare(a.created_at));
      setDrillItems(collected);
    } catch (err) {
      if (requestVersion !== drillRequestVersionRef.current || requestSiteId !== siteIdRef.current) return;
      setDrillError(formatPortalErrorMessage(err, t, t('error.failed_load')));
    }
  }, [creditEventFeature, usageRange, t]);

  const scrollContainer = () => dialogBodyRef.current?.closest('.overflow-y-auto') as HTMLElement | null;

  const openDay = useCallback((day: SiteUsageDayRow) => {
    savedDayScrollRef.current = scrollContainer()?.scrollTop ?? 0;
    setDrillDay(day);
    setDrillOpenedAt(Date.now());
    setDrillHour(null);
    setDrillPage(0);
    scrollContainer()?.scrollTo({ top: 0 });
    void loadDrillDay(day);
  }, [loadDrillDay]);

  /** Back to the day table: same page (dayRows kept in state) and the saved scroll position. */
  const closeDay = useCallback(() => {
    drillRequestVersionRef.current += 1;
    setDrillDay(null);
    setDrillItems(null);
    setDrillHour(null);
    pendingDayScrollRestoreRef.current = savedDayScrollRef.current;
  }, []);

  /**
   * Restore the day-table scroll only after the cached day rows are committed to the DOM
   * (layout effect, before paint), then re-apply once on the next frame in case late layout
   * (sticky footer / summary wrap) clamped it. Restoring from the click handler raced the
   * re-render and got clamped to the drill view's shorter max scroll.
   */
  useLayoutEffect(() => {
    const top = pendingDayScrollRestoreRef.current;
    if (drillDay || top === null || !dayRows) return;
    const el = scrollContainer();
    if (!el) return;
    el.scrollTop = top;
    const frame = requestAnimationFrame(() => {
      if (Math.abs(el.scrollTop - top) > 1) el.scrollTop = top;
      pendingDayScrollRestoreRef.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [drillDay, dayRows]);

  /** Service columns: top 3 services of the whole window (stable across pages) + 其他. */
  const dayServiceColumns = dayFeatureTotals.slice(0, 3).map((item) => item.feature_key);
  const dayHasOtherColumn = dayFeatureTotals.length > 3;

  /** Hourly bars for the drilled day, built from its calls (local hours, up to now). */
  const drillTrend = useMemo<PortalCreditTrendPayload | null>(() => {
    if (!drillDay || !drillItems) return null;
    const dayStart = drillDay.dayStart.getTime();
    const now = drillOpenedAt;
    const hours = Array.from({ length: 24 }, (_, hour) => dayStart + hour * 3600_000).filter((start) => start < now);
    const points = hours.map((start) => {
      const inHour = drillItems.filter((item) => {
        const at = parseUsageDate(item.created_at)?.getTime() ?? -1;
        return at >= start && at < start + 3600_000;
      });
      return {
        start_at: new Date(start).toISOString(),
        end_at: new Date(start + 3600_000).toISOString(),
        ai_credits: inHour.reduce((sum, item) => sum + Number(item.consumed_ai_credits || 0), 0),
        entry_count: inHour.length,
      };
    });
    return {
      contract_version: 'portal-credit-trend-v1',
      generated_at: new Date(now).toISOString(),
      site_id: siteId,
      window: '24h',
      bucket_seconds: 3600,
      start_at: points[0]?.start_at || drillDay.start_at,
      end_at: points[points.length - 1]?.end_at || drillDay.end_at,
      total_ai_credits: points.reduce((sum, point) => sum + point.ai_credits, 0),
      entry_count: drillItems.length,
      points,
    };
  }, [drillDay, drillItems, drillOpenedAt, siteId]);
  const drillFilteredItems = useMemo(() => {
    if (!drillItems) return [];
    if (!drillHour) return drillItems;
    const start = Date.parse(drillHour.startAt);
    const end = Date.parse(drillHour.endAt);
    return drillItems.filter((item) => {
      const at = parseUsageDate(item.created_at)?.getTime() ?? -1;
      return at >= start && at < end;
    });
  }, [drillHour, drillItems]);
  const drillPageItems = drillFilteredItems.slice(drillPage * creditEventPageSize, (drillPage + 1) * creditEventPageSize);

  const selectTrendBucket = useCallback((point: PortalCreditTrendPoint) => {
    setBucketFilter({ startAt: point.start_at, endAt: point.end_at, label: formatBucketLabel(point.start_at, point.end_at, locale) });
    setCreditEventOffset(0);
    setActiveView('records');
  }, [locale]);

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
    setBucketFilter(null);
    setDayRows(null);
    setDrillDay(null);
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

  useEffect(() => {
    if (!isOpen || !siteId || !siteContextReady) return;
    if (activeView !== 'records' || !isDayMode) return;
    setDayRows(null);
    void loadDayPage(0);
    return () => {
      dayRequestVersionRef.current += 1;
      drillRequestVersionRef.current += 1;
    };
  }, [activeView, isDayMode, isOpen, loadDayPage, siteId, siteContextReady]);

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
  const drillSummary = drillDay && drillItems
    ? joinSummaryParts([
        `${formatDayLabel(drillDay.dayStart, locale, t)} · ${t(
          'portal.usage.credit_events_summary',
          {
            credits: formatQuotaValue(drillItems.reduce((sum, item) => sum + Number(item.consumed_ai_credits || 0), 0)),
            count: formatQuotaValue(drillItems.length),
          },
          '{{credits}} AI credits used across {{count}} service events.',
        )}`,
      ])
    : '';
  const summaryDisplay = (activeView === 'records' && drillSummary) || summaryText || t('common.loading', {}, 'Loading...');
  const summarySplitAt = summaryDisplay.lastIndexOf(' ') + 1;
  const summaryHead = summaryDisplay.slice(0, summarySplitAt);
  const summaryTail = summaryDisplay.slice(summarySplitAt);
  const pageStart = creditEventCount > 0 ? creditEventOffset + 1 : 0;
  const pageEnd = Math.min(creditEventOffset + creditEventPageSize, creditEventCount);
  const hasPreviousPage = creditEventOffset > 0;
  const hasNextPage = creditEventOffset + creditEventPageSize < creditEventCount;
  const renderEventTable = (items: PortalCreditEvent[], timeMode: 'time' | 'datetime', nested: boolean) => (
                        <div data-portal-usage={nested ? 'records-day-calls' : 'records-table'}>
                          <table className="w-full table-fixed text-left text-sm">
                            <caption className="sr-only">{t('portal.usage.credit_events_title')}</caption>
                            <colgroup>
                              <col className="w-40" />
                              <col />
                              <col className="w-36" />
                              <col className="w-8" />
                            </colgroup>
                            <thead className={nested ? 'sr-only' : 'border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400'}>
                              <tr>
                                <th scope="col" className="px-2 py-2 font-medium">{t('portal.usage.credit_ledger_time')}</th>
                                <th scope="col" className="px-2 py-2 font-medium">{t('portal.usage.credit_events_feature_label')}</th>
                                <th scope="col" className="px-2 py-2 text-right font-medium">{t('portal.usage.credit_events_points_column')}</th>
                                <th scope="col" className="px-0 py-2"><span className="sr-only">{t('common.view_details')}</span></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {items.map((entry) => (
                                <tr
                                  key={entry.event_id}
                                  className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                                  onClick={() => setSelectedCreditEvent(entry)}
                                  data-portal-usage="records-row"
                                >
                                  <th scope="row" className={`whitespace-nowrap py-3 font-normal ${nested ? 'pl-6 pr-2' : 'px-2'} text-slate-600 dark:text-slate-300`}>
                                    {timeMode === 'time' ? formatClockTime(entry.created_at, locale) : formatCreditEventTime(entry.created_at, locale)}
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
  );
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
                <div className="flex items-center justify-between gap-4" data-portal-usage="site-dialog-summary">
                  <p className="min-w-0 flex-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    <span data-portal-usage="site-dialog-summary-text">
                      {summaryHead}
                      {/* Glue ⓘ to the last word so it never wraps onto a line by itself. */}
                      <span className="whitespace-nowrap" data-portal-usage="site-dialog-summary-tail">
                        {summaryTail}
                        <PortalInfoHint
                          label={t('portal.usage.primary_trend_title', {}, 'AI credit usage trend')}
                          detail={t('portal.usage.credit_events_desc', {}, 'Service events that consumed AI credits.')}
                          className="ml-1 align-middle"
                          data-portal-usage="trend-help"
                        />
                      </span>
                    </span>
                  </p>
                  <div
                    role="radiogroup"
                    aria-label={t('portal.usage.credit_events_window_label', {}, 'Time range')}
                    className="flex shrink-0 items-center gap-1"
                    data-portal-usage="site-dialog-range"
                  >
                    {SITE_USAGE_RANGES.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={usageRange === option.value}
                        className={`whitespace-nowrap rounded-md px-2 py-1 text-sm transition-colors ${
                          usageRange === option.value
                            ? 'font-semibold text-slate-950 dark:text-white'
                            : 'text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white'
                        }`}
                        onClick={() => {
                          setUsageRange(option.value);
                          setCreditEventOffset(0);
                          setBucketFilter(null);
                          setDrillDay(null);
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
                    onBucketSelect={selectTrendBucket}
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
                ref={dialogBodyRef}
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
                          setDrillDay(null);
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
                    {bucketFilter ? (
                      <div className="flex items-center gap-2 text-sm" data-portal-usage="records-bucket-filter">
                        <span className="text-slate-500 dark:text-slate-400">{t('portal.usage.bucket_filter_label', {}, 'Time slot')}</span>
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-blue-50 py-0.5 pl-3 pr-1 font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                          data-portal-usage="records-bucket-chip"
                        >
                          {bucketFilter.label}
                          <button
                            type="button"
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-base leading-none hover:bg-blue-100 dark:hover:bg-blue-900/50"
                            aria-label={t('portal.usage.bucket_filter_clear', {}, 'Clear time slot filter')}
                            onClick={() => setBucketFilter(null)}
                          >
                            <span aria-hidden="true">×</span>
                          </button>
                        </span>
                      </div>
                    ) : null}
                    {isDayMode && drillDay ? (
                      <div className="space-y-4" data-portal-usage="records-day-drill">
                        <nav
                          aria-label={t('portal.usage.day_breakdown_label', {}, 'Day drill-down')}
                          className="flex items-center gap-2 text-sm"
                          data-portal-usage="records-day-breadcrumb"
                        >
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 font-medium text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/40"
                            onClick={closeDay}
                          >
                            <span aria-hidden="true">‹</span>
                            {t(SITE_USAGE_RANGES.find((option) => option.value === usageRange)?.key || '', {}, usageRange)}
                          </button>
                          <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">/</span>
                          <span className="font-semibold text-slate-900 dark:text-slate-100" aria-current="page">
                            {formatDayLabel(drillDay.dayStart, locale, t)}
                          </span>
                        </nav>
                        <PortalCreditTrendPanel
                          payload={drillTrend}
                          window="24h"
                          isLoading={!drillItems && !drillError}
                          error={drillError}
                          onRetry={() => void loadDrillDay(drillDay)}
                          onBucketSelect={(point) => {
                            setDrillHour({ startAt: point.start_at, endAt: point.end_at, label: formatBucketLabel(point.start_at, point.end_at, locale) });
                            setDrillPage(0);
                          }}
                          embedded
                        />
                        {drillHour ? (
                          <div className="flex items-center gap-2 text-sm" data-portal-usage="records-bucket-filter">
                            <span className="text-slate-500 dark:text-slate-400">{t('portal.usage.bucket_filter_label', {}, 'Time slot')}</span>
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-blue-50 py-0.5 pl-3 pr-1 font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                              data-portal-usage="records-bucket-chip"
                            >
                              {drillHour.label}
                              <button
                                type="button"
                                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-base leading-none hover:bg-blue-100 dark:hover:bg-blue-900/50"
                                aria-label={t('portal.usage.bucket_filter_clear', {}, 'Clear time slot filter')}
                                onClick={() => {
                                  setDrillHour(null);
                                  setDrillPage(0);
                                }}
                              >
                                <span aria-hidden="true">×</span>
                              </button>
                            </span>
                          </div>
                        ) : null}
                        {drillItems ? (
                          drillPageItems.length > 0 ? (
                            renderEventTable(drillPageItems, 'time', false)
                          ) : (
                            <p className="py-6 text-sm text-slate-500">{t('portal.usage.credit_events_empty')}</p>
                          )
                        ) : null}
                      </div>
                    ) : isDayMode ? (
                      dayError ? (
                        <PortalErrorState
                          title={t('error.failed_load')}
                          description={dayError}
                          retryLabel={t('common.retry')}
                          onRetry={() => void loadDayPage(dayOffset)}
                        />
                      ) : !dayRows ? (
                        <div className="space-y-2" aria-label={t('common.loading')}>
                          {[0, 1, 2, 3].map((item) => (
                            <div key={item} className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-900" />
                          ))}
                        </div>
                      ) : (
                        <div data-portal-usage="records-day-table">
                          <table className="w-full table-fixed text-left text-sm">
                            <caption className="sr-only">{t('portal.usage.credit_events_title')}</caption>
                            <colgroup>
                              <col className="w-28" />
                              <col className="w-20" />
                              {dayServiceColumns.map((key) => <col key={key} />)}
                              {dayHasOtherColumn ? <col /> : null}
                              <col className="w-28" />
                              <col className="w-8" />
                            </colgroup>
                            <thead className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                              <tr>
                                <th scope="col" className="px-2 py-2 font-medium">{t('portal.usage.day_column', {}, 'Date')}</th>
                                <th scope="col" className="px-2 py-2 text-right font-medium">{t('portal.usage.day_calls_column', {}, 'Calls')}</th>
                                {dayServiceColumns.map((key) => (
                                  <th key={key} scope="col" className="break-words px-2 py-2 text-right font-medium" data-portal-usage="records-day-service-column">
                                    {t(`portal.usage.credit_ledger_feature_${key}_title`, {}, key)}
                                  </th>
                                ))}
                                {dayHasOtherColumn ? (
                                  <th scope="col" className="px-2 py-2 text-right font-medium" data-portal-usage="records-day-service-column">
                                    {t('portal.usage.day_breakdown_other', {}, 'Other')}
                                  </th>
                                ) : null}
                                <th scope="col" className="px-2 py-2 text-right font-medium">{t('portal.usage.day_total_column', {}, 'Total AI credits')}</th>
                                <th scope="col" className="px-0 py-2"><span className="sr-only">{t('portal.usage.day_expand', {}, 'Show calls')}</span></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {dayRows.map((day) => {
                                const hasCalls = day.event_count > 0;
                                const creditsFor = (key: string) => day.feature_totals.find((item) => item.feature_key === key)?.consumed_ai_credits || 0;
                                const otherCredits = day.feature_totals
                                  .filter((item) => !dayServiceColumns.includes(item.feature_key))
                                  .reduce((sum, item) => sum + item.consumed_ai_credits, 0);
                                const serviceCell = (credits: number, key: string) => {
                                  const share = day.consumed_ai_credits > 0 ? credits / day.consumed_ai_credits : 0;
                                  return (
                                    <td key={key} className="px-2 py-3 text-right tabular-nums" data-portal-usage="records-day-service-cell">
                                      {credits > 0 ? (
                                        <>
                                          <span className="whitespace-nowrap">{formatCreditAmount(credits)}<span className="text-slate-400 dark:text-slate-500"> · {Math.round(share * 100)}%</span></span>
                                          <span className="mt-1 block h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden="true">
                                            <span className="block h-full rounded-full bg-blue-200 dark:bg-blue-900" style={{ width: `${Math.max(2, share * 100)}%` }} />
                                          </span>
                                        </>
                                      ) : (
                                        <span className="text-slate-300 dark:text-slate-600">–</span>
                                      )}
                                    </td>
                                  );
                                };
                                return (
                                  <tr
                                    key={day.key}
                                    className={hasCalls ? 'cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60' : 'text-slate-400 dark:text-slate-500'}
                                    onClick={hasCalls ? () => openDay(day) : undefined}
                                    data-portal-usage="records-day-row"
                                  >
                                    <th scope="row" className="whitespace-nowrap px-2 py-3 font-medium">
                                      {formatDayLabel(day.dayStart, locale, t)}
                                    </th>
                                    <td className="whitespace-nowrap px-2 py-3 text-right tabular-nums">{formatNumber(day.event_count)}</td>
                                    {dayServiceColumns.map((key) => serviceCell(creditsFor(key), key))}
                                    {dayHasOtherColumn ? serviceCell(otherCredits, '__other') : null}
                                    <td className="whitespace-nowrap px-2 py-3 text-right font-semibold tabular-nums">
                                      {formatCreditAmount(day.consumed_ai_credits)}
                                    </td>
                                    <td className="px-0 py-3 text-right">
                                      {hasCalls ? (
                                        <button
                                          type="button"
                                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-lg leading-none text-slate-400 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:text-slate-200"
                                          aria-label={`${formatDayLabel(day.dayStart, locale, t)} · ${t('portal.usage.day_expand', {}, 'Show calls')}`}
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            openDay(day);
                                          }}
                                        >
                                          <span aria-hidden="true">›</span>
                                        </button>
                                      ) : null}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )
                    ) : creditEventError ? (
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
                      renderEventTable(creditEventItems, 'datetime', false)
                    ) : (
                      <p className="py-6 text-sm text-slate-500">{t('portal.usage.credit_events_empty')}</p>
                    )}
                  </div>
                ) : null}
              </div>

              {activeView === 'records' && (isDayMode && drillDay
                ? Boolean(drillItems && drillFilteredItems.length > 0)
                : isDayMode ? Boolean(dayRows && dayTotal > 0 && !dayError) : (!creditEventError && creditEvents && creditEventCount > 0)) ? (
                <nav
                  className="sticky -bottom-4 z-20 -mx-6 -mb-4 mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-3 dark:border-slate-800 dark:bg-gray-900"
                  aria-label={t('common.pagination', {}, 'Pagination')}
                  data-portal-usage="records-pagination"
                >
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {isDayMode && drillDay
                      ? t(
                          'common.pagination_summary',
                          {
                            start: String(drillPage * creditEventPageSize + 1),
                            end: String(Math.min((drillPage + 1) * creditEventPageSize, drillFilteredItems.length)),
                            total: String(drillFilteredItems.length),
                          },
                          'Results',
                        )
                      : isDayMode
                      ? t(
                          'portal.usage.day_pagination_summary',
                          { start: String(dayOffset + 1), end: String(Math.min(dayOffset + DAY_PAGE_SIZE, dayTotal)), total: String(dayTotal) },
                          'Days {{start}}-{{end}} of {{total}}',
                        )
                      : t(
                          'common.pagination_summary',
                          { start: String(pageStart), end: String(pageEnd), total: String(creditEventCount) },
                          `${pageStart}-${pageEnd} of ${creditEventCount}`,
                        )}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={isDayMode && drillDay ? drillPage === 0 : isDayMode ? dayOffset === 0 || dayLoading : !hasPreviousPage || creditEventLoading}
                      onClick={() => (isDayMode && drillDay
                        ? setDrillPage((page) => Math.max(0, page - 1))
                        : isDayMode
                        ? void loadDayPage(Math.max(0, dayOffset - DAY_PAGE_SIZE))
                        : void loadCreditEventPage(Math.max(0, creditEventOffset - creditEventPageSize)))}
                    >
                      {t('common.previous', {}, 'Previous')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={isDayMode && drillDay ? (drillPage + 1) * creditEventPageSize >= drillFilteredItems.length : isDayMode ? dayOffset + DAY_PAGE_SIZE >= dayTotal || dayLoading : !hasNextPage || creditEventLoading}
                      onClick={() => (isDayMode && drillDay
                        ? setDrillPage((page) => page + 1)
                        : isDayMode
                        ? void loadDayPage(dayOffset + DAY_PAGE_SIZE)
                        : void loadCreditEventPage(creditEventOffset + creditEventPageSize))}
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
