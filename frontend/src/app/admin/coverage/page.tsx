'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { AdminInspectorDrawer } from '@/components/admin/AdminInspectorDrawer';
import { BackofficeIdentifier } from '@/components/backoffice/BackofficeIdentifier';
import { LoadingFallback } from '@/components/ui/LoadingFallback';
import { useLocale } from '@/contexts/LocaleContext';
import { createApiClient } from '@/lib/api-client';
import {
  BackofficeEmptyState,
  BackofficePageHeader,
  BackofficePageStack,
  BackofficeSectionPanel,
} from '@/components/backoffice/BackofficeScaffold';
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
  primary_identity?: {
    email?: string;
    status?: string;
  } | null;
  identity_relationship_state?: 'healthy' | 'missing' | 'conflict' | 'access_disabled';
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
  filters?: {
    q?: string;
    status?: QueueView;
    reason?: string;
    sort?: QueueSort;
    offset?: number;
    limit?: number;
  };
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
  total?: number;
  hidden_internal_total?: number;
  pagination?: {
    offset?: number;
    limit?: number;
    total?: number;
    has_more?: boolean;
  };
  items?: CoverageQueueItem[];
};

const coverageClient = createApiClient({ idempotencyPrefix: 'admin_coverage' });

const DEFAULT_PAGE_SIZE = 50;
const QUEUE_VIEWS = new Set<QueueView>(['needs_action', 'all', 'error', 'warning', 'ok', 'inactive']);
const QUEUE_SORTS = new Set<QueueSort>(['priority', 'expiry', 'customer']);

function normalizeQueueView(value: string | null): QueueView {
  return value && QUEUE_VIEWS.has(value as QueueView) ? (value as QueueView) : 'needs_action';
}

function normalizeQueueSort(value: string | null): QueueSort {
  return value && QUEUE_SORTS.has(value as QueueSort) ? (value as QueueSort) : 'priority';
}

function normalizeQueueOffset(value: string | null): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeQueueLimit(value: string | null): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 500 ? parsed : DEFAULT_PAGE_SIZE;
}

function queueItemKey(item: CoverageQueueItem): string {
  return `${item.account.account_id}:${item.reason_code}`;
}

function customerDisplayName(name: string | undefined, accountId: string, unnamedLabel: string): string {
  const normalizedName = name?.trim();
  return normalizedName && normalizedName !== accountId ? normalizedName : unnamedLabel;
}

async function readJsonData<T>(url: string, signal?: AbortSignal): Promise<T> {
  return (await coverageClient.request<T>(url, { signal })).data;
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
  const [offset, setOffset] = useState(() => normalizeQueueOffset(searchParams.get('offset')));
  const [limit, setLimit] = useState(() => normalizeQueueLimit(searchParams.get('limit')));
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(() => searchParams.get('q') || '');
  const [focusedCoverageKey, setFocusedCoverageKey] = useState(() => searchParams.get('focus') || '');
  const [queueRequestKey, setQueueRequestKey] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const mountedRef = useRef(false);
  const queueParamsRef = useRef(new URLSearchParams(searchParamsKey));
  const coverageRequestActiveRef = useRef(false);
  const coverageRequestSequenceRef = useRef(0);
  const coverageRequestKeyRef = useRef('');
  const coverageAbortControllerRef = useRef<AbortController | null>(null);

  const coverageRequestKey = useMemo(() => {
    const params = new URLSearchParams({
      status: view,
      sort,
      offset: String(offset),
      limit: String(limit),
    });
    const normalizedQuery = debouncedSearchQuery.trim();
    if (normalizedQuery) params.set('q', normalizedQuery);
    if (reasonFilter) params.set('reason', reasonFilter);
    return params.toString();
  }, [debouncedSearchQuery, limit, offset, reasonFilter, sort, view]);

  const updateQueueUrl = useCallback((patch: Record<string, string | null>) => {
    const nextParams = new URLSearchParams(queueParamsRef.current.toString());
    const changesQueue = Object.keys(patch).some((key) => key !== 'focus');
    if (changesQueue && !Object.prototype.hasOwnProperty.call(patch, 'focus')) {
      nextParams.delete('focus');
      setFocusedCoverageKey('');
    }
    Object.entries(patch).forEach(([key, value]) => {
      const isDefault =
        (key === 'status' && value === 'needs_action') ||
        (key === 'sort' && value === 'priority') ||
        (key === 'offset' && value === '0') ||
        (key === 'limit' && value === String(DEFAULT_PAGE_SIZE));
      if (!value || isDefault) {
        nextParams.delete(key);
      } else {
        nextParams.set(key, value);
      }
      if (key === 'focus') {
        setFocusedCoverageKey(value || '');
      }
    });
    const nextQuery = nextParams.toString();
    queueParamsRef.current = nextParams;
    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    window.history.replaceState(window.history.state, '', nextUrl);
  }, [pathname, setFocusedCoverageKey]);

  const loadCoverage = useCallback(async (force = false) => {
    if (
      !force &&
      coverageRequestActiveRef.current &&
      coverageRequestKeyRef.current === coverageRequestKey
    ) {
      return;
    }
    coverageAbortControllerRef.current?.abort();
    const abortController = new AbortController();
    coverageAbortControllerRef.current = abortController;
    const requestSequence = coverageRequestSequenceRef.current + 1;
    coverageRequestSequenceRef.current = requestSequence;
    coverageRequestActiveRef.current = true;
    coverageRequestKeyRef.current = coverageRequestKey;
    setIsRefreshing(true);
    setError('');
    try {
      const coveragePayload = await readJsonData<CoverageWorkQueue>(
        `/api/admin/coverage-work-queue?${coverageRequestKey}`,
        abortController.signal
      );
      if (mountedRef.current && coverageRequestSequenceRef.current === requestSequence) {
        setQueue(coveragePayload);
        setQueueRequestKey(coverageRequestKey);
      }
    } catch (err) {
      if (abortController.signal.aborted) {
        return;
      }
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
  }, [coverageRequestKey, setError, setIsRefreshing, setQueue, setQueueRequestKey, t]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      coverageAbortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (searchQuery === debouncedSearchQuery) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setOffset(0);
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [debouncedSearchQuery, searchQuery]);

  useEffect(() => {
    void loadCoverage();
  }, [loadCoverage]);

  useEffect(() => {
    const params = new URLSearchParams(searchParamsKey);
    queueParamsRef.current = params;
    setView(normalizeQueueView(params.get('status')));
    setSearchQuery(params.get('q') || '');
    setReasonFilter(params.get('reason') || '');
    setSort(normalizeQueueSort(params.get('sort')));
    setOffset(normalizeQueueOffset(params.get('offset')));
    setLimit(normalizeQueueLimit(params.get('limit')));
    setDebouncedSearchQuery(params.get('q') || '');
    setFocusedCoverageKey(params.get('focus') || '');
  }, [pathname, searchParamsKey]);

  const activeQueue = queue;
  const isQueueTransition = Boolean(
    queue && (
      queueRequestKey !== coverageRequestKey ||
      searchQuery.trim() !== debouncedSearchQuery.trim()
    )
  );
  const visibleItems = useMemo(() => activeQueue?.items || [], [activeQueue]);
  const visibleSummary = {
    total: Number(activeQueue?.summary?.total || 0),
    visible: Number(activeQueue?.summary?.visible || visibleItems.length),
    needs_action: Number(activeQueue?.summary?.needs_action || 0),
    error: Number(activeQueue?.summary?.error || 0),
    warning: Number(activeQueue?.summary?.warning || 0),
    ok: Number(activeQueue?.summary?.ok || 0),
    inactive: Number(activeQueue?.summary?.inactive || 0),
    reason_counts: activeQueue?.summary?.reason_counts || {},
  };
  const pagination = {
    offset: Number(activeQueue?.pagination?.offset ?? offset),
    limit: Number(activeQueue?.pagination?.limit ?? limit),
    total: Number(activeQueue?.pagination?.total ?? activeQueue?.total ?? visibleItems.length),
    hasMore: Boolean(activeQueue?.pagination?.has_more),
  };
  const customerLabelsByKey = useMemo(() => {
    const groups = new Map<string, CoverageQueueItem[]>();
    const labels = new Map<string, string>();
    for (const item of visibleItems) {
      const label = customerDisplayName(
        item.account.name,
        item.account.account_id,
        t('admin.coverage.unnamed_customer', {}, 'Unnamed customer')
      );
      groups.set(label, [...(groups.get(label) || []), item]);
    }
    for (const [label, group] of groups) {
      const orderedGroup = [...group].sort((left, right) =>
        left.account.account_id.localeCompare(right.account.account_id)
      );
      orderedGroup.forEach((item, index) => {
        labels.set(
          queueItemKey(item),
          orderedGroup.length > 1
            ? t(
                'admin.coverage.customer_position',
                {
                  name: label,
                  index: formatInteger(index + 1),
                  total: formatInteger(orderedGroup.length),
                },
                `${label} · ${index + 1}/${orderedGroup.length}`
              )
            : label
        );
      });
    }
    return labels;
  }, [t, visibleItems]);
  const selectedCoverageItem = focusedCoverageKey
    ? visibleItems.find((item) => queueItemKey(item) === focusedCoverageKey) || null
    : null;
  const selectedCoverageLabel = selectedCoverageItem
    ? customerLabelsByKey.get(queueItemKey(selectedCoverageItem)) ||
      t('admin.coverage.unnamed_customer', {}, 'Unnamed customer')
    : '';

  useEffect(() => {
    if (
      activeQueue &&
      offset > 0 &&
      pagination.total <= offset &&
      visibleItems.length === 0
    ) {
      const previousOffset = Math.max(0, Math.floor((pagination.total - 1) / limit) * limit);
      setOffset(previousOffset);
      updateQueueUrl({ offset: String(previousOffset) });
    }
  }, [activeQueue, limit, offset, pagination.total, updateQueueUrl, visibleItems.length]);

  if (error && !activeQueue) {
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

  if (!activeQueue) {
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
    { value: 'inactive', label: translateStatusLabel('inactive', t), count: visibleSummary.inactive },
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
      <BackofficePageHeader
        eyebrow={t('admin.coverage.primary_queue_eyebrow', {}, 'Customer operations')}
        title={t('admin.coverage_surface_title', {}, 'Service status')}
        description={t(
          'admin.coverage_surface_desc',
          {},
          'Find affected customers, understand the blocker, and open the exact action that resolves it.'
        )}
        secondaryAction={(
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
        summaryItems={[
          { label: t('admin.coverage.summary_total', {}, 'Total'), value: formatInteger(visibleSummary.total) },
          { label: t('admin.coverage.filter_needs_action', {}, 'Needs action'), value: formatInteger(visibleSummary.needs_action), toneClassName: visibleSummary.needs_action > 0 ? 'text-amber-600 dark:text-amber-300' : undefined },
          { label: translateStatusLabel('error', t), value: formatInteger(visibleSummary.error), toneClassName: visibleSummary.error > 0 ? 'text-rose-600 dark:text-rose-300' : undefined },
          { label: translateStatusLabel('warning', t), value: formatInteger(visibleSummary.warning), toneClassName: visibleSummary.warning > 0 ? 'text-amber-600 dark:text-amber-300' : undefined },
          { label: t('common.updated_at', {}, 'Updated'), value: activeQueue.generated_at ? formatDate(activeQueue.generated_at) : t('common.unknown', {}, 'Unknown') },
        ]}
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

      <BackofficeSectionPanel
        data-ui="coverage-workspace"
        className="overflow-hidden p-0"
        aria-busy={isQueueTransition || isRefreshing}
      >
          <div className="space-y-3 border-b border-slate-200/80 px-4 py-4 dark:border-slate-800">
            <div className="flex justify-end">
              <p className="text-xs text-slate-500 dark:text-slate-400" role="status">
                {t(
                  'admin.coverage.pagination_range',
                  {
                    start: formatInteger(pagination.total > 0 ? pagination.offset + 1 : 0),
                    end: formatInteger(pagination.offset + visibleItems.length),
                    total: formatInteger(pagination.total),
                  },
                  `${formatInteger(pagination.total > 0 ? pagination.offset + 1 : 0)}–${formatInteger(pagination.offset + visibleItems.length)} of ${formatInteger(pagination.total)} customers`
                )} · {isQueueTransition
                  ? t('common.loading', {}, 'Loading...')
                  : `${t('common.updated_at', {}, 'Updated')} ${activeQueue.generated_at
                  ? formatDate(activeQueue.generated_at)
                  : t('common.unknown', {}, 'Unknown')}`}
              </p>
            </div>

            <div
              data-ui="coverage-filter-toolbar"
              className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(12.5rem,1.35fr)_minmax(7.25rem,0.72fr)_minmax(7.25rem,0.72fr)_minmax(7.25rem,0.68fr)_auto]"
            >
              <label className="min-w-0">
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
                    updateQueueUrl({
                      status: view,
                      q: nextValue.trim() || null,
                      reason: reasonFilter || null,
                      sort,
                      offset: null,
                    });
                  }}
                />
              </label>
              <label className="min-w-0">
                <span className="sr-only">
                  {t('admin.coverage.status_filter_label', {}, 'Service status')}
                </span>
                <select
                  className="input w-full"
                  value={view}
                  onChange={(event) => {
                    const nextValue = normalizeQueueView(event.target.value);
                    setView(nextValue);
                    setOffset(0);
                    updateQueueUrl({
                      status: nextValue,
                      q: searchQuery.trim() || null,
                      reason: reasonFilter || null,
                      sort,
                      offset: null,
                    });
                  }}
                >
                  {filters.map((filter) => (
                    <option key={filter.value} value={filter.value}>
                      {filter.label} · {formatInteger(filter.count)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-0">
                <span className="sr-only">
                  {t('admin.coverage.reason_filter_label', {}, 'Reason')}
                </span>
                <select
                  className="input w-full"
                  value={reasonFilter}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setReasonFilter(nextValue);
                    setOffset(0);
                    updateQueueUrl({
                      status: view,
                      q: searchQuery.trim() || null,
                      reason: nextValue || null,
                      sort,
                      offset: null,
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
              <label className="min-w-0">
                <span className="sr-only">
                  {t('admin.coverage.sort_label', {}, 'Sort')}
                </span>
                <select
                  className="input w-full"
                  value={sort}
                  onChange={(event) => {
                    const nextValue = normalizeQueueSort(event.target.value);
                    setSort(nextValue);
                    setOffset(0);
                    updateQueueUrl({
                      status: view,
                      q: searchQuery.trim() || null,
                      reason: reasonFilter || null,
                      sort: nextValue,
                      offset: null,
                    });
                  }}
                >
                  <option value="priority">{t('admin.coverage.sort_priority', {}, 'Highest impact')}</option>
                  <option value="expiry">{t('admin.coverage.sort_expiry', {}, 'Ending soon')}</option>
                  <option value="customer">{t('admin.coverage.sort_customer', {}, 'Customer name')}</option>
                </select>
              </label>
              <div className="flex">
                <span
                  className="inline-flex"
                  title={t('common.clear_filters', {}, 'Clear filters')}
                  data-ui="coverage-clear-filters-tooltip"
                >
                  <button
                    type="button"
                    className="btn btn-secondary h-11 w-11 shrink-0 p-0"
                    aria-label={t('common.clear_filters', {}, 'Clear filters')}
                    disabled={!searchQuery && !reasonFilter && view === 'needs_action' && sort === 'priority'}
                    onClick={() => {
                      setSearchQuery('');
                      setReasonFilter('');
                      setView('needs_action');
                      setSort('priority');
                      setOffset(0);
                      updateQueueUrl({ q: null, reason: null, status: null, sort: null, offset: null });
                    }}
                  >
                    <svg
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M4 5h16l-6 7v5l-4 2v-7L4 5Z" />
                      <path d="m16.5 16.5 4 4m0-4-4 4" />
                    </svg>
                  </button>
                </span>
              </div>
            </div>
          </div>

          {visibleItems.length ? (
            <div className="overflow-x-auto">
              <table
                className="w-full min-w-[64rem] table-fixed border-collapse text-left text-sm"
                aria-label={t('admin.coverage.table_region_label', {}, 'Customer service status')}
              >
                <thead className="bg-slate-50/80 text-xs font-semibold text-slate-500 dark:bg-slate-950/40 dark:text-slate-400">
                  <tr>
                    <th className="w-[6.5rem] px-4 py-3">{t('common.status', {}, 'Status')}</th>
                    <th className="w-[17rem] px-4 py-3">
                      {t('admin.coverage.table_customer', {}, 'Customer')}
                    </th>
                    <th className="w-[12rem] px-4 py-3">
                      {t('common.package', {}, 'Package')} / {t('common.subscription', {}, 'Subscription')}
                    </th>
                    <th className="w-[6rem] px-4 py-3">{t('common.sites', {}, 'Sites')}</th>
                    <th className="px-4 py-3">{t('admin.coverage.table_issue', {}, 'Issue')}</th>
                    <th className="w-[9rem] px-4 py-3">{t('admin.coverage.table_impact', {}, 'Impact')}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((item) => {
                    const itemKey = queueItemKey(item);
                    const customerLabel =
                      customerLabelsByKey.get(itemKey) ||
                      t('admin.coverage.unnamed_customer', {}, 'Unnamed customer');
                    const daysUntilEnd = item.evidence.days_until_end;
                    const missingKeySites = Number(item.evidence.missing_key_site_count || 0);
                    const siteCount = Number(item.evidence.site_count || 0);
                    const subscriptionStatus =
                      item.evidence.subscription_status ||
                      item.primary_subscription?.status ||
                      'unknown';
                    let impactLabel: string;
                    if (item.reason_code === 'customer_identity_missing') {
                      impactLabel = t(
                        'admin.coverage.identity_missing_impact',
                        {},
                        'Customer cannot sign in'
                      );
                    } else if (item.reason_code === 'customer_identity_conflict') {
                      impactLabel = t(
                        'admin.coverage.identity_conflict_impact',
                        {},
                        'Owner relationship is ambiguous'
                      );
                    } else if (item.reason_code === 'customer_access_disabled') {
                      impactLabel = t(
                        'admin.coverage.access_disabled_impact',
                        {},
                        'Customer access is unavailable'
                      );
                    } else if (item.reason_code === 'customer_account_suspended') {
                      impactLabel = t(
                        'admin.coverage.account_suspended_impact',
                        {},
                        'Customer service is suspended'
                      );
                    } else if (daysUntilEnd != null) {
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
                        className="border-t border-slate-200/80 align-middle dark:border-slate-800"
                      >
                        <td className="px-4 py-3">
                          <CoverageStatusBadge
                            severity={item.severity}
                            label={translateStatusLabel(item.severity, t)}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/accounts/${encodeURIComponent(item.account.account_id)}`}
                            className="block max-w-full break-words font-semibold text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-300"
                          >
                            {customerLabel}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900 dark:text-slate-100">
                            {item.package?.display_package_label || t('common.not_available', {}, 'N/A')}
                          </p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {translateStatusLabel(subscriptionStatus, t)}
                          </p>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                          {formatInteger(siteCount)}
                        </td>
                        <td
                          className="px-4 py-3"
                          aria-label={
                            item.severity === 'error' || item.severity === 'warning'
                              ? undefined
                              : translateStatusLabel(item.severity, t)
                          }
                        >
                          {(item.severity === 'error' || item.severity === 'warning') && item.action_href ? (
                            <>
                              <p className="font-medium text-slate-800 dark:text-slate-100">
                                {translateReasonCode(t, item.reason_code, item.reason_label)}
                              </p>
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                <Link
                                  href={item.action_href}
                                  className="font-semibold text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-300"
                                >
                                  {translateActionLabel(
                                    t,
                                    item.recommended_action,
                                    item.action_label || t('common.open', {}, 'Open')
                                  )} →
                                </Link>
                              </p>
                              <button
                                type="button"
                                className="mt-2 text-xs font-semibold text-slate-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-300"
                                aria-pressed={focusedCoverageKey === itemKey}
                                aria-controls="coverage-evidence-drawer"
                                onClick={() => updateQueueUrl({ focus: itemKey })}
                              >
                                {t('admin.coverage.inspect_evidence_action', {}, 'Inspect evidence')}
                              </button>
                            </>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900 dark:text-slate-100">{impactLabel}</p>
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
              action={visibleSummary.total === 0 ? (
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
                    setView('needs_action');
                    setSort('priority');
                    setOffset(0);
                    updateQueueUrl({ q: null, reason: null, status: null, sort: null, offset: null });
                  }}
                >
                  {t('common.clear_filters', {}, 'Clear filters')}
                </button>
              )}
            />
          )}

          {pagination.total > 0 ? (
            <div
              data-ui="coverage-pagination"
              className="flex flex-col gap-3 border-t border-slate-200/80 px-4 py-3 text-sm dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between"
            >
              <p className="text-slate-500 dark:text-slate-400" role="status">
                {t(
                  'admin.coverage.pagination_range',
                  {
                    start: formatInteger(pagination.offset + 1),
                    end: formatInteger(pagination.offset + visibleItems.length),
                    total: formatInteger(pagination.total),
                  },
                  `${formatInteger(pagination.offset + 1)}–${formatInteger(pagination.offset + visibleItems.length)} of ${formatInteger(pagination.total)} customers`
                )}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={isRefreshing || pagination.offset <= 0}
                  onClick={() => {
                    const previousOffset = Math.max(0, pagination.offset - pagination.limit);
                    setOffset(previousOffset);
                    updateQueueUrl({ offset: String(previousOffset) });
                  }}
                >
                  {t('common.previous', {}, 'Previous')}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={isRefreshing || !pagination.hasMore}
                  onClick={() => {
                    const nextOffset = pagination.offset + pagination.limit;
                    setOffset(nextOffset);
                    updateQueueUrl({ offset: String(nextOffset) });
                  }}
                >
                  {t('common.next', {}, 'Next')}
                </button>
              </div>
            </div>
          ) : null}
      </BackofficeSectionPanel>

      <AdminInspectorDrawer
        open={Boolean(selectedCoverageItem)}
        title={selectedCoverageLabel}
        titleId="coverage-evidence-title"
        eyebrow={t('admin.coverage.evidence_eyebrow', {}, 'Service evidence')}
        description={selectedCoverageItem
          ? translateReasonCode(t, selectedCoverageItem.reason_code, selectedCoverageItem.reason_label)
          : undefined}
        closeLabel={t('common.close', {}, 'Close')}
        onClose={() => updateQueueUrl({ focus: null })}
        headerAccessory={selectedCoverageItem ? (
          <CoverageStatusBadge
            severity={selectedCoverageItem.severity}
            label={translateStatusLabel(selectedCoverageItem.severity, t)}
          />
        ) : null}
        footer={selectedCoverageItem ? (
          <div className="flex flex-wrap gap-2">
            <Link href={selectedCoverageItem.action_href} className="btn btn-primary btn-sm">
              {translateActionLabel(
                t,
                selectedCoverageItem.recommended_action,
                selectedCoverageItem.action_label || t('common.open', {}, 'Open')
              )}
            </Link>
            <Link
              href={`/admin/accounts/${encodeURIComponent(selectedCoverageItem.account.account_id)}`}
              className="btn btn-secondary btn-sm"
            >
              {t('admin.coverage_open_customer_action', {}, 'Open customer')}
            </Link>
          </div>
        ) : null}
      >
        {selectedCoverageItem ? (
          <div id="coverage-evidence-drawer" className="space-y-5">
            <dl className="grid gap-2 text-sm text-slate-600 dark:text-slate-300">
              {[
                [
                  t('common.package', {}, 'Package'),
                  selectedCoverageItem.package?.display_package_label || t('common.not_available', {}, 'N/A'),
                ],
                [
                  t('common.subscription', {}, 'Subscription'),
                  translateStatusLabel(
                    selectedCoverageItem.evidence.subscription_status ||
                      selectedCoverageItem.primary_subscription?.status ||
                      'unknown',
                    t
                  ),
                ],
                [
                  t('common.sites', {}, 'Sites'),
                  formatInteger(Number(selectedCoverageItem.evidence.site_count || 0)),
                ],
                [
                  t('admin.coverage.missing_key_sites', {}, 'Sites missing keys'),
                  formatInteger(Number(selectedCoverageItem.evidence.missing_key_site_count || 0)),
                ],
                [
                  t('admin.coverage.period_end', {}, 'Period end'),
                  selectedCoverageItem.evidence.current_period_end_at
                    ? formatDate(selectedCoverageItem.evidence.current_period_end_at)
                    : t('common.unknown', {}, 'Unknown'),
                ],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 border-b border-slate-200/70 pb-2 last:border-b-0 dark:border-slate-800">
                  <dt>{label}</dt>
                  <dd className="text-right font-semibold text-slate-950 dark:text-white">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900/45">
              <p className="font-semibold text-slate-950 dark:text-white">
                {t('admin.coverage.recommended_action_label', {}, 'Recommended action')}
              </p>
              <p className="mt-1 leading-6 text-slate-600 dark:text-slate-300">
                {translateActionLabel(
                  t,
                  selectedCoverageItem.recommended_action,
                  selectedCoverageItem.action_label || t('common.open', {}, 'Open')
                )}
              </p>
            </div>

            <details className="border-t border-slate-200/80 pt-4 text-sm dark:border-slate-800">
              <summary className="cursor-pointer font-semibold text-slate-800 dark:text-slate-100">
                {t('portal.support_information', {}, 'Support information')}
              </summary>
              <div className="mt-3 space-y-2 text-xs text-slate-500 dark:text-slate-400">
                <BackofficeIdentifier value={selectedCoverageItem.account.account_id} full />
                {selectedCoverageItem.primary_subscription?.subscription_id ? (
                  <BackofficeIdentifier value={selectedCoverageItem.primary_subscription.subscription_id} full />
                ) : null}
                <BackofficeIdentifier value={selectedCoverageItem.reason_code} full />
                {selectedCoverageItem.evidence.billing_snapshot_status?.summary ? (
                  <p className="pt-1 leading-5">{selectedCoverageItem.evidence.billing_snapshot_status.summary}</p>
                ) : null}
              </div>
            </details>

            <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
              {t(
                'admin.coverage.evidence_boundary',
                {},
                'This drawer explains existing service evidence only. Remediation continues in the owning customer or subscription page.'
              )}
            </p>
          </div>
        ) : null}
      </AdminInspectorDrawer>
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
