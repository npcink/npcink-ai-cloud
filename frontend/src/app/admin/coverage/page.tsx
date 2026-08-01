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

function customerDisplayName(name: string | undefined, accountId: string, unnamedLabel: string): string {
  const normalizedName = name?.trim();
  return normalizedName && normalizedName !== accountId ? normalizedName : unnamedLabel;
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
  const [focusedCoverageKey, setFocusedCoverageKey] = useState(() => searchParams.get('focus') || '');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const mountedRef = useRef(false);
  const queueParamsRef = useRef(new URLSearchParams(searchParamsKey));
  const coverageRequestActiveRef = useRef(false);
  const coverageRequestSequenceRef = useRef(0);

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
        (key === 'sort' && value === 'priority');
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
    setFocusedCoverageKey(params.get('focus') || '');
  }, [pathname, searchParamsKey]);

  const visibleQueueItems = useMemo(
    () =>
      (queue?.items || []).filter(
      (item) => !isInternalCoverageRecord(item.account.account_id, item.account.name)
      ),
    [queue?.items]
  );
  const customerLabelsByKey = useMemo(() => {
    const groups = new Map<string, CoverageQueueItem[]>();
    const labels = new Map<string, string>();
    for (const item of visibleQueueItems) {
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
  }, [t, visibleQueueItems]);
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
        item.primary_identity?.email,
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
  const selectedCoverageItem = focusedCoverageKey
    ? visibleItems.find((item) => queueItemKey(item) === focusedCoverageKey) || null
    : null;
  const selectedCoverageLabel = selectedCoverageItem
    ? customerLabelsByKey.get(queueItemKey(selectedCoverageItem)) ||
      t('admin.coverage.unnamed_customer', {}, 'Unnamed customer')
    : '';
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
          { label: t('common.updated_at', {}, 'Updated'), value: queue.generated_at ? formatDate(queue.generated_at) : t('common.unknown', {}, 'Unknown') },
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

      <BackofficeSectionPanel className="overflow-hidden p-0">
          <div className="space-y-3 border-b border-slate-200/80 px-4 py-4 dark:border-slate-800">
            <div className="flex justify-end">
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
                    updateQueueUrl({
                      status: nextValue,
                      q: searchQuery.trim() || null,
                      reason: reasonFilter || null,
                      sort,
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
                    updateQueueUrl({
                      status: view,
                      q: searchQuery.trim() || null,
                      reason: nextValue || null,
                      sort,
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
                    updateQueueUrl({
                      status: view,
                      q: searchQuery.trim() || null,
                      reason: reasonFilter || null,
                      sort: nextValue,
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
                      updateQueueUrl({ q: null, reason: null, status: null, sort: null });
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
                    setView('needs_action');
                    setSort('priority');
                    updateQueueUrl({ q: null, reason: null, status: null, sort: null });
                  }}
                >
                  {t('common.clear_filters', {}, 'Clear filters')}
                </button>
              )}
            />
          )}
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
