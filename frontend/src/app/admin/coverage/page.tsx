'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { LoadingFallback } from '@/components/ui/LoadingFallback';
import { useLocale } from '@/contexts/LocaleContext';
import { createApiClient } from '@/lib/api-client';
import {
  BackofficeEmptyState,
  BackofficeLayer,
  BackofficePageStack,
  BackofficeSectionPanel,
} from '@/components/backoffice/BackofficeScaffold';
import { BackofficeIdentifier } from '@/components/backoffice/BackofficeIdentifier';
import { resolveUiErrorMessage } from '@/lib/errors';
import { translateStatusLabel } from '@/lib/status-display';
import { cn, formatDate, formatNumber as formatInteger } from '@/lib/utils';

type QueueSeverity = 'error' | 'warning' | 'ok' | 'inactive';
type QueueView = 'needs_action' | 'all' | QueueSeverity;
type QueueSort = 'priority' | 'expiry' | 'customer';

type CoverageQueueItem = {
  account: {
    account_id: string;
    name?: string;
    status?: string;
  };
  primary_subscription?: {
    subscription_id?: string;
    status?: string;
    current_period_end_at?: string;
  } | null;
  package?: {
    display_package_label?: string;
    package_kind?: string;
    coverage_state?: string;
  };
  severity: QueueSeverity;
  priority?: number;
  reason_code: string;
  reason_label: string;
  recommended_action: string;
  action_label: string;
  action_href: string;
  evidence: {
    site_count?: number;
    active_site_count?: number;
    active_key_site_count?: number;
    missing_key_site_count?: number;
    subscription_status?: string;
    current_period_end_at?: string;
    days_until_end?: number | null;
    billing_snapshot_status?: {
      status?: string;
      summary?: string;
      fresh_site_count?: number;
      stale_site_count?: number;
      missing_site_count?: number;
    };
  };
};

type CoverageWorkQueue = {
  generated_at?: string;
  summary?: {
    total?: number;
    visible?: number;
    needs_action?: number;
    error?: number;
    warning?: number;
    ok?: number;
    inactive?: number;
    reason_counts?: Record<string, number>;
  };
  items?: CoverageQueueItem[];
};

const coverageClient = createApiClient({ idempotencyPrefix: 'admin_coverage' });

const INTERNAL_TEST_TEXT_RE = /Fatal error|Stack trace|Command line code|Uncaught ValueError|Path must not be empty|(^|[_-])smoke([_-]|$)|codex_image_smoke|site_knowledge_smoke/i;
const QUEUE_VIEWS = new Set<QueueView>(['needs_action', 'all', 'error', 'warning', 'ok', 'inactive']);
const QUEUE_SORTS = new Set<QueueSort>(['priority', 'expiry', 'customer']);

function isInternalCoverageRecord(...values: Array<string | undefined>): boolean {
  return INTERNAL_TEST_TEXT_RE.test(values.filter(Boolean).join(' '));
}

function normalizeQueueView(value: string | null): QueueView {
  return value && QUEUE_VIEWS.has(value as QueueView) ? (value as QueueView) : 'needs_action';
}

function normalizeQueueSort(value: string | null): QueueSort {
  return value && QUEUE_SORTS.has(value as QueueSort) ? (value as QueueSort) : 'priority';
}

function queueItemKey(item: CoverageQueueItem): string {
  return `${item.account.account_id}:${item.reason_code}`;
}

async function readJsonData<T>(url: string): Promise<T> {
  return (await coverageClient.request<T>(url)).data;
}

function severityToneClassName(severity: string): string {
  const normalized = severity.toLowerCase();
  if (normalized === 'error') {
    return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200';
  }
  if (normalized === 'warning') {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200';
  }
  if (normalized === 'ok') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200';
  }
  return 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200';
}

function translateReasonCode(
  t: (key: string, params?: Record<string, string>, fallback?: string) => string,
  reasonCode: string,
  fallback: string
): string {
  return t(`admin.coverage.reason.${reasonCode}`, {}, fallback);
}

function translateActionLabel(
  t: (key: string, params?: Record<string, string>, fallback?: string) => string,
  action: string,
  fallback: string
): string {
  return t(`admin.coverage.action.${action}`, {}, fallback);
}

function translateReasonShortLabel(
  t: (key: string, params?: Record<string, string>, fallback?: string) => string,
  reasonCode: string
): string {
  const fallback = reasonCode
    .replace(/^service_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  return t(`admin.coverage.reason_short.${reasonCode}`, {}, fallback);
}

function CoverageStatusBadge({
  severity,
  label,
}: {
  severity: string;
  label: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold leading-none',
        severityToneClassName(severity)
      )}
    >
      {label}
    </span>
  );
}

function buildQueueSummary(items: CoverageQueueItem[]): Required<NonNullable<CoverageWorkQueue['summary']>> {
  const reasonCounts: Record<string, number> = {};
  const summary = {
    total: items.length,
    visible: items.length,
    needs_action: 0,
    error: 0,
    warning: 0,
    ok: 0,
    inactive: 0,
    reason_counts: reasonCounts,
  };

  for (const item of items) {
    if (item.severity === 'error') summary.error += 1;
    if (item.severity === 'warning') summary.warning += 1;
    if (item.severity === 'ok') summary.ok += 1;
    if (item.severity === 'inactive') summary.inactive += 1;
    if (item.severity === 'error' || item.severity === 'warning') summary.needs_action += 1;
    reasonCounts[item.reason_code] = (reasonCounts[item.reason_code] || 0) + 1;
  }

  return summary;
}

function AdminCoverageContent() {
  const { t } = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const [queue, setQueue] = useState<CoverageWorkQueue | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<QueueView>(() => normalizeQueueView(searchParams.get('status')));
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') || '');
  const [reasonFilter, setReasonFilter] = useState(() => searchParams.get('reason') || '');
  const [sort, setSort] = useState<QueueSort>(() => normalizeQueueSort(searchParams.get('sort')));
  const [selectedKey, setSelectedKey] = useState(() => searchParams.get('focus') || '');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const mountedRef = useRef(false);
  const queueParamsRef = useRef(new URLSearchParams(searchParamsKey));
  const coverageRequestActiveRef = useRef(false);
  const coverageRequestSequenceRef = useRef(0);

  const updateQueueUrl = useCallback((patch: Record<string, string | null>) => {
    const nextParams = new URLSearchParams(queueParamsRef.current.toString());
    Object.entries(patch).forEach(([key, value]) => {
      const isDefault =
        (key === 'status' && value === 'needs_action') ||
        (key === 'sort' && value === 'priority');
      if (!value || isDefault) {
        nextParams.delete(key);
      } else {
        nextParams.set(key, value);
      }
    });
    const nextQuery = nextParams.toString();
    queueParamsRef.current = nextParams;
    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    window.history.replaceState(window.history.state, '', nextUrl);
  }, [pathname]);

  const loadCoverage = useCallback(async (force = false) => {
    if (!force && coverageRequestActiveRef.current) {
      return;
    }
    const requestSequence = coverageRequestSequenceRef.current + 1;
    coverageRequestSequenceRef.current = requestSequence;
    coverageRequestActiveRef.current = true;
    if (force) {
      setIsRefreshing(true);
    }
    setError('');
    try {
      const coveragePayload = await readJsonData<CoverageWorkQueue>('/api/admin/coverage-work-queue');
      if (mountedRef.current && coverageRequestSequenceRef.current === requestSequence) {
        setQueue(coveragePayload);
      }
    } catch (err) {
      if (mountedRef.current && coverageRequestSequenceRef.current === requestSequence) {
        setError(resolveUiErrorMessage(err, t('error.failed_load')));
      }
    } finally {
      if (coverageRequestSequenceRef.current === requestSequence) {
        coverageRequestActiveRef.current = false;
        if (mountedRef.current) {
          setIsRefreshing(false);
        }
      }
    }
  }, [setError, setIsRefreshing, setQueue, t]);

  useEffect(() => {
    mountedRef.current = true;
    void loadCoverage();
    return () => {
      mountedRef.current = false;
    };
  }, [loadCoverage]);

  useEffect(() => {
    const params = new URLSearchParams(searchParamsKey);
    queueParamsRef.current = params;
    setView(normalizeQueueView(params.get('status')));
    setSearchQuery(params.get('q') || '');
    setReasonFilter(params.get('reason') || '');
    setSort(normalizeQueueSort(params.get('sort')));
    setSelectedKey(params.get('focus') || '');
  }, [searchParamsKey]);

  const visibleQueueItems = useMemo(
    () =>
      (queue?.items || []).filter(
      (item) => !isInternalCoverageRecord(item.account.account_id, item.account.name)
      ),
    [queue?.items]
  );
  const visibleSummary = useMemo(() => buildQueueSummary(visibleQueueItems), [visibleQueueItems]);
  const visibleItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const filtered = visibleQueueItems.filter((item) => {
      const matchesView =
        view === 'all' ||
        (view === 'needs_action'
          ? item.severity === 'error' || item.severity === 'warning'
          : item.severity === view);
      if (!matchesView || (reasonFilter && item.reason_code !== reasonFilter)) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      return [
        item.account.account_id,
        item.account.name,
        item.primary_subscription?.subscription_id,
        item.package?.display_package_label,
        item.reason_label,
        item.reason_code,
      ].filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery);
    });
    const severityRank: Record<QueueSeverity, number> = { error: 0, warning: 1, inactive: 2, ok: 3 };
    return [...filtered].sort((left, right) => {
      if (sort === 'customer') {
        return String(left.account.name || left.account.account_id).localeCompare(
          String(right.account.name || right.account.account_id)
        );
      }
      if (sort === 'expiry') {
        const leftDays = left.evidence.days_until_end ?? Number.MAX_SAFE_INTEGER;
        const rightDays = right.evidence.days_until_end ?? Number.MAX_SAFE_INTEGER;
        return leftDays - rightDays || severityRank[left.severity] - severityRank[right.severity];
      }
      return Number(left.priority ?? severityRank[left.severity] * 100) -
        Number(right.priority ?? severityRank[right.severity] * 100) ||
        String(left.account.name || left.account.account_id).localeCompare(
          String(right.account.name || right.account.account_id)
        );
    });
  }, [reasonFilter, searchQuery, sort, view, visibleQueueItems]);
  const selectedQueueItem =
    visibleItems.find((item) => queueItemKey(item) === selectedKey) || visibleItems[0] || null;

  if (error && !queue) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="max-w-md text-center">
          <h2 className="mb-4 text-2xl font-bold text-red-600">{t('common.error')}</h2>
          <p className="mb-6 text-gray-600 dark:text-gray-400">{error}</p>
          <button onClick={() => void loadCoverage(true)} className="btn btn-primary">
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  if (!queue) {
    return <LoadingFallback />;
  }

  const filters: Array<{ value: QueueView; label: string; count: number }> = [
    {
      value: 'needs_action',
      label: t('admin.coverage.filter_needs_action', {}, 'Needs action'),
      count: visibleSummary.needs_action,
    },
    { value: 'error', label: translateStatusLabel('error', t), count: visibleSummary.error },
    { value: 'warning', label: translateStatusLabel('warning', t), count: visibleSummary.warning },
    { value: 'ok', label: translateStatusLabel('ok', t), count: visibleSummary.ok },
    {
      value: 'all',
      label: t('common.all', {}, 'All'),
      count: visibleSummary.total,
    },
  ];
  const reasonEntries = Object.entries(visibleSummary.reason_counts || {})
    .sort((left, right) => Number(right[1] || 0) - Number(left[1] || 0))
    .slice(0, 6);
  return (
    <BackofficePageStack className="space-y-5">
      <BackofficeLayer
        eyebrow={t('admin.coverage.primary_queue_eyebrow', {}, 'Customer operations')}
        title={t('admin.coverage_surface_title', {}, 'Service status')}
        description={t(
          'admin.coverage_surface_desc',
          {},
          'Find affected customers, understand the blocker, and open the exact action that resolves it.'
        )}
        actions={(
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void loadCoverage(true)}
            disabled={isRefreshing}
          >
            {isRefreshing
              ? t('common.loading', {}, 'Loading...')
              : t('admin.coverage.refresh_action', {}, 'Refresh')}
          </button>
        )}
      />

      {error ? (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-200 sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{error}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadCoverage(true)}>
            {t('common.retry')}
          </button>
        </div>
      ) : null}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(20rem,0.72fr)]">
        <BackofficeSectionPanel className="overflow-hidden p-0">
          <div className="space-y-3 border-b border-slate-200/80 px-4 py-4 dark:border-slate-800">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div
                className="flex flex-wrap gap-2"
                aria-label={t('admin.coverage.status_filter_label', {}, 'Service status')}
              >
                {filters.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    aria-pressed={view === filter.value}
                    onClick={() => {
                      setView(filter.value);
                      setSelectedKey('');
                      updateQueueUrl({
                        status: filter.value,
                        q: searchQuery.trim() || null,
                        reason: reasonFilter || null,
                        sort,
                        focus: null,
                      });
                    }}
                    className={cn(
                      'cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium transition',
                      view === filter.value
                        ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:text-white'
                    )}
                  >
                    {filter.label} <span className="ml-1 tabular-nums">{formatInteger(filter.count)}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400" role="status">
                {t(
                  'admin.coverage.queue_count',
                  { visible: formatInteger(visibleItems.length), total: formatInteger(visibleQueueItems.length) },
                  `${formatInteger(visibleItems.length)} of ${formatInteger(visibleQueueItems.length)} customers`
                )} · {t('common.updated_at', {}, 'Updated')} {queue.generated_at
                  ? formatDate(queue.generated_at)
                  : t('common.unknown', {}, 'Unknown')}
              </p>
            </div>

            <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-[minmax(13rem,1fr)_minmax(9rem,0.55fr)_minmax(9rem,0.5fr)_auto]">
              <label>
                <span className="sr-only">
                  {t('common.search', {}, 'Search')}
                </span>
                <input
                  type="search"
                  className="input w-full"
                  value={searchQuery}
                  placeholder={t('admin.coverage.search_placeholder', {}, 'Customer, account, subscription, or package')}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setSearchQuery(nextValue);
                    setSelectedKey('');
                    updateQueueUrl({
                      status: view,
                      q: nextValue.trim() || null,
                      reason: reasonFilter || null,
                      sort,
                      focus: null,
                    });
                  }}
                />
              </label>
              <label>
                <span className="sr-only">
                  {t('admin.coverage.reason_filter_label', {}, 'Reason')}
                </span>
                <select
                  className="input w-full"
                  value={reasonFilter}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setReasonFilter(nextValue);
                    setSelectedKey('');
                    updateQueueUrl({
                      status: view,
                      q: searchQuery.trim() || null,
                      reason: nextValue || null,
                      sort,
                      focus: null,
                    });
                  }}
                >
                  <option value="">{t('admin.coverage.reason_all', {}, 'All reasons')}</option>
                  {reasonEntries.map(([reasonCode, count]) => (
                    <option key={reasonCode} value={reasonCode}>
                      {translateReasonShortLabel(t, reasonCode)} · {formatInteger(Number(count || 0))}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="sr-only">
                  {t('admin.coverage.sort_label', {}, 'Sort')}
                </span>
                <select
                  className="input w-full"
                  value={sort}
                  onChange={(event) => {
                    const nextValue = normalizeQueueSort(event.target.value);
                    setSort(nextValue);
                    updateQueueUrl({
                      status: view,
                      q: searchQuery.trim() || null,
                      reason: reasonFilter || null,
                      sort: nextValue,
                      focus: selectedKey || null,
                    });
                  }}
                >
                  <option value="priority">{t('admin.coverage.sort_priority', {}, 'Highest impact')}</option>
                  <option value="expiry">{t('admin.coverage.sort_expiry', {}, 'Ending soon')}</option>
                  <option value="customer">{t('admin.coverage.sort_customer', {}, 'Customer name')}</option>
                </select>
              </label>
              <div className="flex">
                <button
                  type="button"
                  className="btn btn-secondary w-full md:w-auto"
                  disabled={!searchQuery && !reasonFilter && view === 'needs_action' && sort === 'priority'}
                  onClick={() => {
                    setSearchQuery('');
                    setReasonFilter('');
                    setView('needs_action');
                    setSort('priority');
                    setSelectedKey('');
                    updateQueueUrl({ q: null, reason: null, status: null, sort: null, focus: null });
                  }}
                >
                  {t('common.clear_filters', {}, 'Clear filters')}
                </button>
              </div>
            </div>
          </div>

          {visibleItems.length ? (
            <div className="overflow-x-auto">
              <table
                className="w-full min-w-[52rem] table-fixed border-collapse text-left text-sm"
                aria-label={t('admin.coverage.table_region_label', {}, 'Customer service status')}
              >
                <thead className="bg-slate-50/80 text-xs font-semibold text-slate-500 dark:bg-slate-950/40 dark:text-slate-400">
                  <tr>
                    <th className="w-[6.5rem] px-4 py-3">{t('common.status', {}, 'Status')}</th>
                    <th className="w-[13rem] px-4 py-3">
                      {t('admin.coverage.table_customer', {}, 'Customer')}
                    </th>
                    <th className="px-4 py-3">{t('admin.coverage.table_issue', {}, 'Issue')}</th>
                    <th className="w-[9rem] px-4 py-3">{t('admin.coverage.table_impact', {}, 'Impact')}</th>
                    <th className="w-[7.5rem] px-4 py-3 text-right">{t('common.actions', {}, 'Actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((item) => {
                    const itemKey = queueItemKey(item);
                    const isSelected = selectedQueueItem ? queueItemKey(selectedQueueItem) === itemKey : false;
                    const customerLabel =
                      item.account.name || t('admin.subscription_detail.current_customer_label', {}, 'Current customer');
                    const daysUntilEnd = item.evidence.days_until_end;
                    const missingKeySites = Number(item.evidence.missing_key_site_count || 0);
                    const siteCount = Number(item.evidence.site_count || 0);
                    let impactLabel: string;
                    if (daysUntilEnd != null) {
                      impactLabel = t(
                        'admin.coverage.days_remaining',
                        { count: formatInteger(daysUntilEnd) },
                        `${formatInteger(daysUntilEnd)} days remaining`
                      );
                    } else if (missingKeySites > 0) {
                      impactLabel = t(
                        'admin.coverage.missing_key_impact',
                        { count: formatInteger(missingKeySites) },
                        `${formatInteger(missingKeySites)} sites missing keys`
                      );
                    } else {
                      impactLabel = t(
                        'admin.coverage.site_impact',
                        { count: formatInteger(siteCount) },
                        `${formatInteger(siteCount)} sites`
                      );
                    }
                    return (
                      <tr
                        key={itemKey}
                        data-ui="coverage-queue-item"
                        className={cn(
                          'border-t border-slate-200/80 align-middle transition dark:border-slate-800',
                          isSelected
                            ? 'bg-blue-50/65 dark:bg-blue-950/15'
                            : 'hover:bg-slate-50/70 dark:hover:bg-slate-950/35'
                        )}
                      >
                        <td className="px-4 py-3">
                          <CoverageStatusBadge
                            severity={item.severity}
                            label={translateStatusLabel(item.severity, t)}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            className="max-w-full cursor-pointer text-left font-semibold text-slate-950 hover:text-blue-700 hover:underline dark:text-white dark:hover:text-blue-300"
                            aria-pressed={isSelected}
                            aria-controls="coverage-inspector"
                            onClick={() => {
                              setSelectedKey(itemKey);
                              updateQueueUrl({
                                status: view,
                                q: searchQuery.trim() || null,
                                reason: reasonFilter || null,
                                sort,
                                focus: itemKey,
                              });
                            }}
                          >
                            <span className="block truncate">{customerLabel}</span>
                          </button>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            <BackofficeIdentifier value={item.account.account_id} />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800 dark:text-slate-100">
                            {translateReasonCode(t, item.reason_code, item.reason_label)}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900 dark:text-slate-100">{impactLabel}</p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {item.package?.display_package_label || t('common.not_available', {}, 'N/A')}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={item.action_href || `/admin/accounts/${item.account.account_id}`}
                            className="btn btn-primary btn-sm whitespace-nowrap"
                          >
                            {translateActionLabel(
                              t,
                              item.recommended_action,
                              item.action_label || t('common.open', {}, 'Open')
                            )}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <BackofficeEmptyState
              className="m-5 md:m-6"
              title={t('admin.coverage.no_match_title', {}, 'No customers match these filters')}
              description={t(
                'admin.coverage.no_match_desc',
                {},
                'Clear or adjust the current status, reason, and search filters. The source queue has not been changed.'
              )}
              action={visibleQueueItems.length === 0 ? (
                <Link href="/admin/accounts" className="btn btn-secondary btn-sm">
                  {t('admin.coverage_open_customer_register_action', {}, 'Open customer register')}
                </Link>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setSearchQuery('');
                    setReasonFilter('');
                    setView('all');
                    setSort('priority');
                    updateQueueUrl({ q: null, reason: null, status: 'all', sort: null, focus: null });
                  }}
                >
                  {t('common.clear_filters', {}, 'Clear filters')}
                </button>
              )}
            />
          )}
        </BackofficeSectionPanel>

        <aside id="coverage-inspector" className="xl:sticky xl:top-24" aria-live="polite">
          <BackofficeSectionPanel className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl font-semibold text-gray-950 dark:text-white">
                {t('admin.coverage.inspector_title', {}, 'Customer details')}
              </h2>
              {selectedQueueItem ? (
                <CoverageStatusBadge
                  severity={selectedQueueItem.severity}
                  label={translateStatusLabel(selectedQueueItem.severity, t)}
                />
              ) : null}
            </div>

            {selectedQueueItem ? (
              <div className="space-y-4">
                <div>
                  <p className="text-base font-semibold text-slate-950 dark:text-white">
                    {selectedQueueItem.account.name || t('admin.subscription_detail.current_customer_label', {}, 'Current customer')}
                  </p>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    <BackofficeIdentifier value={selectedQueueItem.account.account_id} full />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {translateReasonCode(t, selectedQueueItem.reason_code, selectedQueueItem.reason_label)}
                  </p>
                </div>

                <dl className="grid gap-2 text-sm text-slate-600 dark:text-slate-300">
                  {[
                    [t('common.package', {}, 'Package'), selectedQueueItem.package?.display_package_label || t('common.not_available', {}, 'N/A')],
                    [t('common.sites', {}, 'Sites'), formatInteger(Number(selectedQueueItem.evidence.site_count || 0))],
                    [t('admin.account_detail.active_api_keys_label', {}, 'Active API keys'), formatInteger(Number(selectedQueueItem.evidence.active_key_site_count || 0))],
                    [t('admin.subscriptions.snapshot_status_metric', {}, 'Snapshot'), translateStatusLabel(selectedQueueItem.evidence.billing_snapshot_status?.status || 'unknown', t)],
                    [t('common.subscription', {}, 'Subscription'), translateStatusLabel(selectedQueueItem.evidence.subscription_status || 'unknown', t)],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4 border-b border-slate-200/70 pb-2 last:border-b-0 dark:border-slate-800">
                      <dt>{label}</dt>
                      <dd className="text-right font-semibold text-slate-950 dark:text-white">{value}</dd>
                    </div>
                  ))}
                </dl>

                <div className="flex flex-wrap gap-2">
                  <Link
                    href={selectedQueueItem.action_href || `/admin/accounts/${selectedQueueItem.account.account_id}`}
                    className="btn btn-primary btn-sm"
                  >
                    {translateActionLabel(t, selectedQueueItem.recommended_action, selectedQueueItem.action_label || t('common.open', {}, 'Open'))}
                  </Link>
                  <Link href={`/admin/accounts/${selectedQueueItem.account.account_id}`} className="btn btn-secondary btn-sm">
                    {t('admin.coverage_open_customer_action', {}, 'Open customer')}
                  </Link>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {t('admin.coverage.inspector_empty', {}, 'No customer needs inspection in this snapshot.')}
              </p>
            )}
          </BackofficeSectionPanel>
        </aside>
      </div>
    </BackofficePageStack>
  );
}

export default function AdminCoveragePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AdminCoverageContent />
    </Suspense>
  );
}
