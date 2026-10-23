'use client';

import React, { FormEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BackofficeIdentifier } from '@/components/backoffice/BackofficeIdentifier';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';
import { BackofficeFilterPill } from '@/components/backoffice/BackofficeFilterPill';
import {
  BackofficeEmptyState,
  BackofficePageHeader,
  BackofficePageStack,
  BackofficeSectionPanel,
} from '@/components/backoffice/BackofficeScaffold';
import { LoadingFallback } from '@/components/ui/LoadingFallback';
import { AdminInspectorDrawer } from '@/components/admin/AdminInspectorDrawer';
import { AdminQueueKeyboardHint } from '@/components/admin/AdminQueueKeyboardHint';
import { useLocale } from '@/contexts/LocaleContext';
import { createApiClient } from '@/lib/api-client';
import { resolveAdminPackageLabel } from '@/lib/admin-plan-copy';
import { formatAdminCurrency } from '@/lib/currency';
import { resolveUiErrorMessage } from '@/lib/errors';
import {
  ADMIN_QUEUE_PATHNAMES,
  buildAdminDetailHref,
  buildAdminQueueReturnTo,
} from '@/lib/admin-return-context';
import { useAdminQueueKeyboard } from '@/features/admin/useAdminQueueKeyboard';
import { cn, formatDate, formatNumber as formatInteger } from '@/lib/utils';

interface Subscription {
  subscription_id: string;
  account_id: string;
  account_name?: string;
  site_count: number;
  covered_sites: Array<{
    site_id: string;
    name: string;
  }>;
  status: string;
  plan_id: string;
  plan_version_id: string;
  package_alias?: string;
  current_period_start: string;
  current_period_end: string;
  billing_summary?: {
    total_cost: number;
    latest_snapshot_id?: string;
  };
  billing_snapshot_status?: {
    status: string;
    summary?: string;
    fresh_site_count: number;
    stale_site_count: number;
    missing_site_count: number;
  };
  operator_risk: {
    level: RiskLevel;
    reason_code: string;
  };
}

interface SubscriptionApiItem {
  subscription?: {
    subscription_id?: string;
    account_id?: string;
    status?: string;
    plan_id?: string;
    plan_version_id?: string;
    current_period_start_at?: string;
    current_period_end_at?: string;
  };
  account?: {
    account_id?: string;
    name?: string;
  };
  covered_sites?: Array<{
    site_id?: string;
    name?: string;
  }>;
  coverage?: {
    site_count?: number;
    package_alias?: string;
  };
  expiry?: {
    current_period_end_at?: string;
  };
  latest_billing_snapshots?: Array<{
    totals?: {
      cost?: number;
    };
    snapshot_id?: string;
  }>;
  billing_snapshot_status?: {
    status?: string;
    summary?: string;
    fresh_site_count?: number;
    stale_site_count?: number;
    missing_site_count?: number;
  };
  operator_risk?: {
    level?: string;
    reason_code?: string;
  };
}

interface SubscriptionsPayload {
  items?: SubscriptionApiItem[];
  total?: number;
  summary?: Partial<Record<RiskLevel, number>>;
}

type QueueSort = 'priority' | 'expiry' | 'customer';
type RiskLevel = 'critical' | 'warning' | 'monitor' | 'stable';
type RiskFilter = 'needs_action' | 'all' | RiskLevel;

const SUBSCRIPTION_PAGE_SIZE = 10;
const STATUS_FILTERS = ['', 'past_due', 'expired', 'trialing', 'active'] as const;
const RISK_FILTERS: RiskFilter[] = ['needs_action', 'critical', 'warning', 'monitor', 'stable', 'all'];
const ALLOWED_STATUSES = new Set(['', 'past_due', 'expired', 'trialing', 'active', 'suspended', 'canceled']);
const ALLOWED_SORTS = new Set<QueueSort>(['priority', 'expiry', 'customer']);
const ALLOWED_RISK_LEVELS = new Set<RiskLevel>(['critical', 'warning', 'monitor', 'stable']);
const ALLOWED_RISK_FILTERS = new Set<RiskFilter>(['needs_action', 'all', 'critical', 'warning', 'monitor', 'stable']);
const subscriptionsClient = createApiClient({ idempotencyPrefix: 'admin_subscriptions' });

function daysUntil(raw?: string): number | null {
  if (!raw) return null;
  const ms = new Date(raw).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.ceil(ms / 86400000);
}

function normalizeSubscription(item: SubscriptionApiItem): Subscription {
  const subscription = item.subscription || {};
  const account = item.account || {};
  const sites = Array.isArray(item.covered_sites) ? item.covered_sites : [];
  const snapshots = Array.isArray(item.latest_billing_snapshots) ? item.latest_billing_snapshots : [];

  return {
    subscription_id: subscription.subscription_id || '',
    account_id: subscription.account_id || account.account_id || '',
    account_name: account.name || '',
    site_count: Number(item.coverage?.site_count || sites.length || 0),
    covered_sites: sites
      .map((site) => ({
        site_id: String(site.site_id || ''),
        name: String(site.name || site.site_id || ''),
      }))
      .filter((site) => site.site_id),
    status: subscription.status || 'unknown',
    plan_id: subscription.plan_id || '',
    plan_version_id: subscription.plan_version_id || '',
    package_alias: item.coverage?.package_alias || '',
    current_period_start: subscription.current_period_start_at || '',
    current_period_end: subscription.current_period_end_at || item.expiry?.current_period_end_at || '',
    billing_summary: {
      total_cost: snapshots.reduce((sum, snapshot) => sum + Number(snapshot.totals?.cost || 0), 0),
      latest_snapshot_id: snapshots[0]?.snapshot_id,
    },
    billing_snapshot_status: {
      status: item.billing_snapshot_status?.status || 'unknown',
      summary: item.billing_snapshot_status?.summary || '',
      fresh_site_count: Number(item.billing_snapshot_status?.fresh_site_count || 0),
      stale_site_count: Number(item.billing_snapshot_status?.stale_site_count || 0),
      missing_site_count: Number(item.billing_snapshot_status?.missing_site_count || 0),
    },
    operator_risk: {
      level: normalizeRiskLevel(item.operator_risk?.level),
      reason_code: item.operator_risk?.reason_code || 'snapshot_unknown',
    },
  };
}

function normalizeRiskLevel(value?: string): RiskLevel {
  return value && ALLOWED_RISK_LEVELS.has(value as RiskLevel) ? (value as RiskLevel) : 'monitor';
}

function normalizeRiskFilter(value: string | null): RiskFilter {
  return value && ALLOWED_RISK_FILTERS.has(value as RiskFilter) ? (value as RiskFilter) : 'needs_action';
}

function normalizeStatus(value: string | null): string {
  return value && ALLOWED_STATUSES.has(value) ? value : '';
}

function normalizeSort(value: string | null): QueueSort {
  return value && ALLOWED_SORTS.has(value as QueueSort) ? (value as QueueSort) : 'priority';
}

function normalizeOffset(value: string | null): number {
  const parsed = Number(value || 0);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeSubscriptionLimit(value: string | null): number {
  const parsed = Number(value || SUBSCRIPTION_PAGE_SIZE);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100
    ? parsed
    : SUBSCRIPTION_PAGE_SIZE;
}

type QuietQueuePaginationProps = {
  offset: number;
  limit: number;
  total: number;
  isLoading?: boolean;
  onOffsetChange: (offset: number) => void;
};

/** Quiet footer: always show range / total (shared ListPagination hides single-page). */
function QuietQueuePagination({
  offset,
  limit,
  total,
  isLoading = false,
  onOffsetChange,
}: QuietQueuePaginationProps) {
  const { t } = useLocale();
  const safeTotal = Math.max(0, total);
  const safeOffset = Math.max(0, offset);
  const start = safeTotal > 0 ? safeOffset + 1 : 0;
  const end = Math.min(safeOffset + limit, safeTotal);
  const hasPrevious = safeOffset > 0;
  const hasNext = safeOffset + limit < safeTotal;

  return (
    <nav
      className="flex flex-col gap-3 border-t border-slate-200 px-3 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800"
      aria-label={t('common.pagination', {}, 'Pagination')}
      data-ui="subscription-quiet-pagination"
    >
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {t(
          'common.pagination_summary',
          { start: String(start), end: String(end), total: String(safeTotal) },
          `${start}-${end} of ${safeTotal}`
        )}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={!hasPrevious || isLoading}
          onClick={() => onOffsetChange(Math.max(0, safeOffset - limit))}
        >
          {t('common.previous', {}, 'Previous')}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={!hasNext || isLoading}
          onClick={() => onOffsetChange(safeOffset + limit)}
        >
          {t('common.next_page', {}, 'Next page')}
        </button>
      </div>
    </nav>
  );
}

function customerDisplayName(
  name: string | undefined,
  accountId: string,
  unnamedLabel: string
): string {
  const normalizedName = name?.trim();
  if (!normalizedName || normalizedName === accountId || normalizedName.startsWith('acct_')) {
    return unnamedLabel;
  }
  return normalizedName;
}

function riskToneClassName(level: RiskLevel): string {
  if (level === 'critical') {
    return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-200';
  }
  if (level === 'warning') {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-200';
  }
  if (level === 'stable') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-200';
  }
  return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/25 dark:text-blue-200';
}

function SubscriptionsContent() {
  const { t } = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const appliedStatus = normalizeStatus(searchParams.get('status'));
  const appliedAccountId = searchParams.get('account_id') || '';
  const appliedCustomer = searchParams.get('customer') || '';
  const appliedPlanId = searchParams.get('plan_id') || '';
  const appliedExpiresBefore = searchParams.get('expires_before') || '';
  const appliedRisk = normalizeRiskFilter(searchParams.get('risk'));
  const sort = normalizeSort(searchParams.get('sort'));
  const offset = normalizeOffset(searchParams.get('offset'));
  const limit = normalizeSubscriptionLimit(searchParams.get('limit'));
  const focusedSubscriptionId = searchParams.get('focus') || '';

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<Record<RiskLevel, number>>({
    critical: 0,
    warning: 0,
    monitor: 0,
    stable: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [draftFilters, setDraftFilters] = useState({
    customer: appliedCustomer || appliedAccountId,
    plan_id: appliedPlanId,
    expires_before: appliedExpiresBefore,
  });
  const mountedRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const activeRequestKeyRef = useRef('');
  const requestSequenceRef = useRef(0);

  const requestKey = useMemo(() => {
    const params = new URLSearchParams();
    if (appliedStatus) params.set('status', appliedStatus);
    if (appliedAccountId) params.set('account_id', appliedAccountId);
    if (appliedCustomer) params.set('customer', appliedCustomer);
    if (appliedPlanId) params.set('plan_id', appliedPlanId);
    if (appliedExpiresBefore) params.set('expires_before', appliedExpiresBefore);
    params.set('risk', appliedRisk);
    params.set('sort', sort);
    params.set('limit', String(limit));
    if (offset > 0) params.set('offset', String(offset));
    return params.toString();
  }, [appliedAccountId, appliedCustomer, appliedExpiresBefore, appliedPlanId, appliedRisk, appliedStatus, limit, offset, sort]);

  const updateQueueUrl = useCallback((patch: Record<string, string | null>) => {
    const nextParams = new URLSearchParams(searchParamsKey);
    Object.entries(patch).forEach(([key, value]) => {
      const isDefault =
        (key === 'risk' && value === 'needs_action') ||
        (key === 'sort' && value === 'priority') ||
        (key === 'offset' && value === '0') ||
        (key === 'limit' && value === String(SUBSCRIPTION_PAGE_SIZE));
      if (!value || isDefault) nextParams.delete(key);
      else nextParams.set(key, value);
    });
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [pathname, router, searchParamsKey]);

  const loadSubscriptions = useCallback(async (force = false) => {
    if (!force && activeRequestKeyRef.current === requestKey) return;

    const sequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = sequence;
    activeRequestKeyRef.current = requestKey;
    setError('');
    if (force || hasLoadedRef.current) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const payload = (await subscriptionsClient.request<SubscriptionsPayload>(
        `/api/admin/subscriptions?${requestKey}`
      )).data;
      const nextItems = (payload.items || []).map(normalizeSubscription);
      const nextTotal = Number(payload.total ?? nextItems.length);
      const nextSummary = {
        critical: Number(payload.summary?.critical || 0),
        warning: Number(payload.summary?.warning || 0),
        monitor: Number(payload.summary?.monitor || 0),
        stable: Number(payload.summary?.stable || 0),
      };
      if (mountedRef.current && requestSequenceRef.current === sequence) {
        setSubscriptions(nextItems);
        setTotal(nextTotal);
        setSummary(nextSummary);
        hasLoadedRef.current = true;
        setHasLoaded(true);
      }
    } catch (err) {
      if (mountedRef.current && requestSequenceRef.current === sequence) {
        setError(resolveUiErrorMessage(err, t('error.failed_load')));
      }
    } finally {
      if (requestSequenceRef.current === sequence) {
        activeRequestKeyRef.current = '';
        if (mountedRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    }
  }, [requestKey, t]);

  useEffect(() => {
    mountedRef.current = true;
    void loadSubscriptions();
    return () => {
      mountedRef.current = false;
    };
  }, [loadSubscriptions]);

  useEffect(() => {
    setDraftFilters({
      customer: appliedCustomer || appliedAccountId,
      plan_id: appliedPlanId,
      expires_before: appliedExpiresBefore,
    });
  }, [appliedAccountId, appliedCustomer, appliedExpiresBefore, appliedPlanId]);

  const queuedSubscriptions = subscriptions;

  const selectedSubscription = focusedSubscriptionId
    ? queuedSubscriptions.find((item) => item.subscription_id === focusedSubscriptionId) || null
    : null;
  const selectedSubscriptionIndex = selectedSubscription
    ? queuedSubscriptions.findIndex((item) => item.subscription_id === selectedSubscription.subscription_id)
    : -1;
  const previousSubscription = selectedSubscriptionIndex > 0
    ? queuedSubscriptions[selectedSubscriptionIndex - 1]
    : null;
  const nextSubscription =
    selectedSubscriptionIndex >= 0 && selectedSubscriptionIndex < queuedSubscriptions.length - 1
      ? queuedSubscriptions[selectedSubscriptionIndex + 1]
      : null;
  const currentQueueHref = buildAdminQueueReturnTo({
    pathname,
    searchParams: searchParamsKey,
    policy: {
      allowedPathnames: [ADMIN_QUEUE_PATHNAMES.subscriptions],
      fallback: ADMIN_QUEUE_PATHNAMES.subscriptions,
    },
  });
  const subscriptionDetailHref = (subscriptionId: string) =>
    buildAdminDetailHref({
      detailPathname: `/admin/subscriptions/${encodeURIComponent(subscriptionId)}`,
      returnTo: currentQueueHref,
      policy: {
        allowedPathnames: [ADMIN_QUEUE_PATHNAMES.subscriptions],
        fallback: ADMIN_QUEUE_PATHNAMES.subscriptions,
      },
    });

  const keyboardFocus = useAdminQueueKeyboard({
    itemIds: queuedSubscriptions.map((subscription) => subscription.subscription_id),
    focusedId: focusedSubscriptionId,
    onFocus: (subscriptionId) => updateQueueUrl({ focus: subscriptionId }),
    onOpen: (subscriptionId) => router.push(subscriptionDetailHref(subscriptionId)),
    onClose: () => updateQueueUrl({ focus: null }),
  });

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateQueueUrl({
      customer: draftFilters.customer.trim() || null,
      account_id: null,
      plan_id: draftFilters.plan_id.trim() || null,
      expires_before: draftFilters.expires_before || null,
      offset: null,
      focus: null,
    });
  };

  const clearFilters = () => {
    setDraftFilters({ customer: '', plan_id: '', expires_before: '' });
    updateQueueUrl({
      status: null,
      risk: null,
      account_id: null,
      customer: null,
      plan_id: null,
      expires_before: null,
      sort: null,
      limit: null,
      offset: null,
      focus: null,
    });
  };

  if (error && !hasLoaded) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="max-w-md text-center" role="alert">
          <h2 className="mb-4 text-2xl font-bold text-rose-600">{t('common.error')}</h2>
          <p className="mb-6 text-slate-600 dark:text-slate-400">{error}</p>
          <button type="button" onClick={() => void loadSubscriptions(true)} className="btn btn-primary">
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  if (isLoading && !hasLoaded) return <LoadingFallback />;

  const hasFilters = Boolean(
    appliedRisk !== 'needs_action' ||
    appliedStatus ||
    appliedAccountId ||
    appliedCustomer ||
    appliedPlanId ||
    appliedExpiresBefore ||
    sort !== 'priority'
  );
  const isShowingRetainedResults = Boolean(error && hasLoaded);
  const riskReasonByCode: Record<string, string> = {
    past_due: t('admin.subscriptions.reason_past_due', {}, 'Billing follow-up is already active and may affect service continuity.'),
    expired: t('admin.subscriptions.reason_expired', {}, 'The subscription has ended and needs a renewal or closure decision.'),
    suspended: t('admin.subscriptions.reason_suspended', {}, 'Service is suspended and requires an explicit operator decision.'),
    snapshot_stale: t('admin.subscriptions.reason_snapshot_stale', {}, 'This period billing statistics need refresh before the account is treated as reconciled.'),
    snapshot_missing: t('admin.subscriptions.reason_snapshot_missing', {}, 'This period billing statistics are missing for at least one covered site.'),
    expiring: t('admin.subscriptions.reason_expiring', {}, 'Current period ends soon, so renewal or follow-up should happen before support load increases.'),
    trialing: t('admin.subscriptions.reason_trialing', {}, 'Trial coverage is still active and should be checked before converting or ending.'),
    canceled: t('admin.subscriptions.reason_canceled', {}, 'The subscription is canceled and should remain visible until its service posture is closed.'),
    snapshot_unknown: t('admin.subscriptions.reason_snapshot_unknown', {}, 'Billing statistics are not yet classifiable, so the subscription needs monitoring.'),
    stable: t('admin.subscriptions.reason_active', {}, 'Service coverage is currently stable and remains here as lower-priority review context.'),
  };

  return (
    <BackofficePageStack className="space-y-5">
      <BackofficePageHeader
        title={t('admin.coverage_workspace_subscriptions_title', {}, 'Subscription operations')}
        description={t(
          'admin.subscriptions.workspace_desc',
          {},
          'Review the current filtered subscription register by service risk, then open one bounded detail surface for evidence and follow-up.'
        )}
        secondaryAction={(
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void loadSubscriptions(true)}
            disabled={isRefreshing}
          >
            {isRefreshing
              ? t('common.loading', {}, 'Loading...')
              : t('admin.subscriptions.refresh_action', {}, 'Refresh subscriptions')}
          </button>
        )}
        summaryItems={[
          {
            label: t('admin.subscriptions.summary_critical_metric', {}, 'Critical'),
            value: formatInteger(summary.critical),
            toneClassName: summary.critical > 0 ? 'text-rose-600 dark:text-rose-300' : undefined,
          },
          {
            label: t('admin.subscriptions.summary_warning_metric', {}, 'Warning'),
            value: formatInteger(summary.warning),
            toneClassName: summary.warning > 0 ? 'text-amber-600 dark:text-amber-300' : undefined,
          },
        ]}
      />

      {error ? (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-200 sm:flex-row sm:items-center sm:justify-between"
        >
          <span>
            {error}
            {isShowingRetainedResults ? (
              <span className="mt-1 block text-xs">
                {t(
                  'admin.subscriptions.retained_results_notice',
                  {},
                  'Showing the last successfully loaded results; refresh failed, so they may be stale or may not match the current filters.'
                )}
              </span>
            ) : null}
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadSubscriptions(true)}>
            {t('common.retry')}
          </button>
        </div>
      ) : null}

      <>
        <BackofficeSectionPanel className="overflow-hidden p-0">
          <div className="space-y-3 border-b border-slate-200/80 px-4 py-3 dark:border-slate-800 md:px-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-slate-950 dark:text-white">
                  {t('admin.subscriptions.queue_list_title', {}, 'Customers needing service follow-up')}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {t(
                    'admin.subscriptions.queue_list_desc_v2',
                    {},
                    'Filters, risk classification, and sorting are applied across all matching subscriptions by the service API.'
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 sm:justify-end">
                <AdminQueueKeyboardHint />
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400" role="status">
                  {t(
                    'admin.subscriptions.result_count',
                    { visible: formatInteger(queuedSubscriptions.length), total: formatInteger(total) },
                    `${formatInteger(queuedSubscriptions.length)} on this page · ${formatInteger(total)} total`
                  )}
                </p>
              </div>
            </div>

            <div
              role="group"
              aria-label={t('admin.subscriptions.risk_filter_label', {}, 'Follow-up state')}
              data-ui="subscription-risk-pills"
              className="flex min-w-0 flex-wrap items-center gap-1.5"
            >
              {RISK_FILTERS.map((risk) => {
                const active = appliedRisk === risk;
                const tone =
                  risk === 'critical'
                    ? 'danger'
                    : risk === 'warning' || risk === 'needs_action'
                      ? 'warning'
                      : risk === 'stable'
                        ? 'success'
                        : risk === 'monitor'
                          ? 'info'
                          : 'neutral';
                return (
                  <BackofficeFilterPill
                    key={risk}
                    active={active}
                    aria-pressed={active}
                    tone={tone}
                    onClick={() => updateQueueUrl({
                      risk,
                      offset: null,
                      focus: null,
                    })}
                  >
                    {t(`admin.subscriptions.risk_filter_${risk}`, undefined, risk)}
                  </BackofficeFilterPill>
                );
              })}
            </div>

            <div
              role="group"
              aria-label={t('admin.subscriptions.status_filter_label', {}, 'Subscription status')}
              data-ui="subscription-status-pills"
              className="flex min-w-0 flex-wrap items-center gap-1.5"
            >
              {STATUS_FILTERS.map((status) => {
                const active = appliedStatus === status;
                const tone =
                  status === 'past_due' || status === 'expired'
                    ? 'danger'
                    : status === 'trialing'
                      ? 'warning'
                      : status === 'active'
                        ? 'success'
                        : 'neutral';
                return (
                  <BackofficeFilterPill
                    key={status || 'all'}
                    active={active}
                    aria-pressed={active}
                    tone={tone}
                    onClick={() => updateQueueUrl({
                      status: status || null,
                      offset: null,
                      focus: null,
                    })}
                  >
                    {status
                      ? t(`status.${status}`, undefined, status)
                      : t('admin.subscriptions.all_statuses', {}, 'All subscription states')}
                  </BackofficeFilterPill>
                );
              })}
            </div>

            <form
              data-ui="subscription-filter-toolbar"
              onSubmit={applyFilters}
              className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
            >
              <label className="min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-200 sm:min-w-[12rem]">
                <span className="sr-only">{t('admin.subscriptions.customer_filter_label', {}, 'Customer')}</span>
                <input
                  type="search"
                  className="input w-full"
                  value={draftFilters.customer}
                  placeholder={t('admin.subscriptions.customer_filter_placeholder', {}, 'Name, email, or Account ID')}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, customer: event.target.value }))}
                />
              </label>
              <label className="text-sm text-slate-700 dark:text-slate-200 sm:w-36">
                <span className="sr-only">{t('common.plan', {}, 'Package')}</span>
                <input
                  type="search"
                  className="input w-full"
                  value={draftFilters.plan_id}
                  placeholder={t('admin.subscriptions.plan_filter_placeholder', {}, 'Plan ID')}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, plan_id: event.target.value }))}
                />
              </label>
              <label className="text-sm text-slate-700 dark:text-slate-200 sm:w-40">
                <span className="sr-only">{t('admin.expires_before')}</span>
                <input
                  type="date"
                  className="input w-full"
                  value={draftFilters.expires_before}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, expires_before: event.target.value }))}
                />
              </label>
              <label className="text-sm text-slate-700 dark:text-slate-200 sm:w-44">
                <span className="sr-only">{t('admin.subscriptions.sort_label', {}, 'Sort')}</span>
                <select
                  className="input w-full"
                  value={sort}
                  onChange={(event) => updateQueueUrl({ sort: normalizeSort(event.target.value), focus: null })}
                >
                  <option value="priority">{t('admin.subscriptions.sort_priority', {}, 'Highest risk')}</option>
                  <option value="expiry">{t('admin.subscriptions.sort_expiry', {}, 'Ending soon')}</option>
                  <option value="customer">{t('admin.subscriptions.sort_customer', {}, 'Customer name')}</option>
                </select>
              </label>
              <div className="flex items-center gap-2 sm:ml-auto">
                <button type="submit" className="btn btn-primary btn-sm whitespace-nowrap">
                  {t('admin.subscriptions.apply_filters', {}, 'Apply')}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm whitespace-nowrap"
                  aria-label={t('common.clear_filters', {}, 'Clear filters')}
                  disabled={!hasFilters && !draftFilters.customer && !draftFilters.plan_id && !draftFilters.expires_before}
                  onClick={clearFilters}
                >
                  {t('common.clear_filters', {}, 'Clear filters')}
                </button>
              </div>
            </form>
          </div>

          {queuedSubscriptions.length ? (
            <div role="list" aria-label={t('admin.subscriptions.queue_region_label', {}, 'Subscription risk queue')}>
              {queuedSubscriptions.map((subscription) => {
                const riskLevel = subscription.operator_risk.level;
                const remaining = daysUntil(subscription.current_period_end);
                const snapshotStatus = subscription.billing_snapshot_status?.status || 'unknown';
                const isSelected = selectedSubscription?.subscription_id === subscription.subscription_id;
                const packageLabel = resolveAdminPackageLabel(t, {
                  planId: subscription.plan_id,
                  packageAlias: subscription.package_alias,
                  fallback: subscription.package_alias || subscription.plan_id,
                }) || t('common.unknown');
                const riskReason =
                  riskReasonByCode[subscription.operator_risk.reason_code] ||
                  riskReasonByCode.snapshot_unknown;
                const customerLabel =
                  customerDisplayName(
                    subscription.account_name,
                    subscription.account_id,
                    t('admin.subscriptions.unnamed_customer', {}, 'Unnamed customer')
                  );

                return (
                  <article
                    key={subscription.subscription_id}
                    role="listitem"
                    data-ui="subscription-queue-item"
                    className={cn(
                      'grid gap-4 border-b border-slate-200/80 px-5 py-5 transition last:border-b-0 dark:border-slate-800 md:grid-cols-[minmax(10rem,0.85fr)_minmax(13rem,1.15fr)] md:items-center md:px-6',
                      riskLevel === 'stable'
                        ? '2xl:grid-cols-[minmax(14rem,1.4fr)_minmax(9rem,0.8fr)_auto]'
                        : '2xl:grid-cols-[minmax(11rem,1fr)_minmax(13rem,1.35fr)_minmax(9rem,0.8fr)_auto]',
                      isSelected ? 'bg-blue-50/65 dark:bg-blue-950/15' : 'hover:bg-slate-50/70 dark:hover:bg-slate-950/35'
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-semibold text-slate-950 dark:text-white">
                          {customerLabel}
                        </h3>
                        <BackofficeStatusBadge
                          status={subscription.status}
                          label={t(`status.${subscription.status}`, undefined, subscription.status)}
                        />
                      </div>
                      <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">{packageLabel}</p>
                    </div>

                    <div className={riskLevel === 'stable' ? 'hidden' : 'min-w-0'}>
                      <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold', riskToneClassName(riskLevel))}>
                        {t(`admin.subscriptions.risk_${riskLevel}`, undefined, riskLevel)}
                      </span>
                      <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200">{riskReason}</p>
                    </div>

                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-slate-600 dark:text-slate-300 lg:grid-cols-1">
                      <div className="flex justify-between gap-3">
                        <dt>{t('common.sites', {}, 'Sites')}</dt>
                        <dd className="font-semibold tabular-nums text-slate-950 dark:text-white">{formatInteger(subscription.site_count)}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt>{t('admin.subscriptions.snapshot_status_metric', {}, 'Snapshot')}</dt>
                        <dd className="font-semibold text-slate-950 dark:text-white">
                          {t(`status.${snapshotStatus}`, undefined, snapshotStatus)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt>{t('admin.billing_period')}</dt>
                        <dd className="font-semibold text-slate-950 dark:text-white">
                          {remaining === null
                            ? t('common.unknown', {}, 'Unknown')
                            : remaining >= 0
                              ? t('admin.days_until_end', { days: String(remaining) })
                              : t('admin.subscriptions.days_past_end', { days: String(Math.abs(remaining)) }, `${Math.abs(remaining)} days past end`)}
                        </dd>
                      </div>
                    </dl>

                    <div className="flex flex-wrap gap-2 md:justify-end">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        aria-pressed={isSelected}
                        aria-controls="subscription-inspector"
                        onClick={() => updateQueueUrl({ focus: subscription.subscription_id })}
                      >
                        {t('admin.subscriptions.inspect_action', {}, 'Inspect')}
                      </button>
                      <Link href={subscriptionDetailHref(subscription.subscription_id)} className="btn btn-primary btn-sm whitespace-nowrap">
                        {t('admin.coverage_open_subscription_detail_action', {}, 'Inspect detail')}
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <BackofficeEmptyState
              className="m-5 md:m-6"
              title={appliedRisk === 'needs_action' && !appliedStatus && !appliedAccountId && !appliedPlanId && !appliedExpiresBefore
                ? t('admin.subscriptions.no_follow_up_title', {}, 'No subscriptions need follow-up')
                : t('admin.subscriptions.no_match_title', {}, 'No subscriptions match these filters')}
              description={t(
                appliedRisk === 'needs_action' && !appliedStatus && !appliedAccountId && !appliedPlanId && !appliedExpiresBefore
                  ? 'admin.subscriptions.no_follow_up_desc'
                  : 'admin.subscriptions.no_match_desc',
                {},
                appliedRisk === 'needs_action' && !appliedStatus && !appliedAccountId && !appliedPlanId && !appliedExpiresBefore
                  ? 'Critical, warning, and monitoring queues are currently empty. Choose All to inspect normal subscriptions.'
                  : 'Clear or adjust the current status, customer, package, and expiry filters. No subscription record has been changed.'
              )}
              action={hasFilters ? (
                <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>
                  {t('common.clear_filters', {}, 'Clear filters')}
                </button>
              ) : undefined}
            />
          )}

          <QuietQueuePagination
            offset={offset}
            limit={limit}
            total={total}
            isLoading={isRefreshing}
            onOffsetChange={(nextOffset) => updateQueueUrl({ offset: String(nextOffset), focus: null })}
          />
        </BackofficeSectionPanel>

        <AdminInspectorDrawer
          open={Boolean(selectedSubscription) && !keyboardFocus}
          title={t('admin.subscriptions.inspector_title', {}, 'Current subscription focus')}
          titleId="subscription-inspector-title"
          eyebrow={t('admin.subscriptions.inspector_eyebrow', {}, 'Inspector')}
          closeLabel={t('common.close', {}, 'Close')}
          onClose={() => updateQueueUrl({ focus: null })}
          headerAccessory={selectedSubscription ? (
            <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold', riskToneClassName(selectedSubscription.operator_risk.level))}>
              {t(`admin.subscriptions.risk_${selectedSubscription.operator_risk.level}`, undefined, selectedSubscription.operator_risk.level)}
            </span>
          ) : null}
          footer={selectedSubscription ? (
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={!previousSubscription}
                onClick={() => previousSubscription && updateQueueUrl({ focus: previousSubscription.subscription_id })}
              >
                {t('admin.subscriptions.inspector_previous', {}, 'Previous item')}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={!nextSubscription}
                onClick={() => nextSubscription && updateQueueUrl({ focus: nextSubscription.subscription_id })}
              >
                {t('admin.subscriptions.inspector_next', {}, 'Next item')}
              </button>
            </div>
          ) : null}
        >
          {selectedSubscription ? (
              <div className="space-y-5" id="subscription-inspector">
                <div>
                  <p className="text-base font-semibold text-slate-950 dark:text-white">
                    {customerDisplayName(
                      selectedSubscription.account_name,
                      selectedSubscription.account_id,
                      t('admin.subscriptions.unnamed_customer', {}, 'Unnamed customer')
                    )}
                  </p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    {resolveAdminPackageLabel(t, {
                      planId: selectedSubscription.plan_id,
                      packageAlias: selectedSubscription.package_alias,
                      fallback: selectedSubscription.package_alias || selectedSubscription.plan_id,
                    }) || t('common.unknown')}
                  </p>
                </div>

                <dl className="grid gap-2 text-sm text-slate-600 dark:text-slate-300">
                  {[
                    [t('common.subscription', {}, 'Subscription'), t(`status.${selectedSubscription.status}`, undefined, selectedSubscription.status)],
                    [t('common.sites', {}, 'Sites'), formatInteger(selectedSubscription.site_count)],
                    [t('admin.subscriptions.snapshot_status_metric', {}, 'Snapshot'), t(`status.${selectedSubscription.billing_snapshot_status?.status || 'unknown'}`, undefined, selectedSubscription.billing_snapshot_status?.status || 'unknown')],
                    [t('admin.period_start'), formatDate(selectedSubscription.current_period_start)],
                    [t('admin.period_end'), formatDate(selectedSubscription.current_period_end)],
                    [t('admin.usage_cost'), formatAdminCurrency(selectedSubscription.billing_summary?.total_cost || 0)],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4 border-b border-slate-200/70 pb-2 last:border-b-0 dark:border-slate-800">
                      <dt>{label}</dt>
                      <dd className="text-right font-semibold text-slate-950 dark:text-white">{value}</dd>
                    </div>
                  ))}
                </dl>

                <div className="flex flex-wrap gap-2">
                  <Link href={subscriptionDetailHref(selectedSubscription.subscription_id)} className="btn btn-primary btn-sm">
                    {t('admin.coverage_open_subscription_detail_action', {}, 'Inspect detail')}
                  </Link>
                  <Link href={`/admin/accounts/${selectedSubscription.account_id}`} className="btn btn-secondary btn-sm">
                    {t('admin.coverage_open_customer_action', {}, 'Open customer')}
                  </Link>
                </div>

                <details className="border-t border-slate-200/80 pt-4 text-sm dark:border-slate-800">
                  <summary className="cursor-pointer font-semibold text-slate-800 dark:text-slate-100">
                    {t('portal.support_information', {}, 'Support information')}
                  </summary>
                  <div className="mt-3 space-y-2 text-xs text-slate-500 dark:text-slate-400">
                    <BackofficeIdentifier value={selectedSubscription.subscription_id} full />
                    <BackofficeIdentifier value={selectedSubscription.account_id} full />
                    {selectedSubscription.plan_version_id ? <BackofficeIdentifier value={selectedSubscription.plan_version_id} full /> : null}
                    {selectedSubscription.billing_snapshot_status?.summary ? (
                      <p className="pt-1 leading-5">{selectedSubscription.billing_snapshot_status.summary}</p>
                    ) : null}
                  </div>
                </details>

                {selectedSubscription.covered_sites.length ? (
                  <details className="border-t border-slate-200/80 pt-4 text-sm dark:border-slate-800">
                    <summary className="cursor-pointer font-semibold text-slate-800 dark:text-slate-100">
                      {t('admin.subscriptions.covered_sites_title', {}, 'Covered sites')}
                    </summary>
                    <div className="mt-3 flex flex-col items-start gap-2">
                      {selectedSubscription.covered_sites.map((site) => (
                        <Link key={site.site_id} href={`/admin/sites/${site.site_id}`} className="text-blue-700 hover:underline dark:text-blue-300">
                          {site.name || site.site_id}
                        </Link>
                      ))}
                    </div>
                  </details>
                ) : null}

                <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {t(
                    'admin.subscriptions.inspector_boundary',
                    {},
                    'This inspector opens existing subscription, customer, and site evidence only. It does not create checkout, payment, entitlement, or WordPress write controls.'
                  )}
                </p>
              </div>
          ) : null}
        </AdminInspectorDrawer>
      </>
    </BackofficePageStack>
  );
}

export default function AdminSubscriptionsPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <SubscriptionsContent />
    </Suspense>
  );
}
