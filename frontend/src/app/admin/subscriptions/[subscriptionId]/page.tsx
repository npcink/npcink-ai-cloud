'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { LoadingFallback } from '@/components/ui/LoadingFallback';
import { useToast } from '@/components/ui/Toast';
import { useLocale } from '@/contexts/LocaleContext';
import { createApiClient } from '@/lib/api-client';
import { localizeAdminCommercialCopy } from '@/lib/admin-commercial-copy';
import { resolveAdminPackageLabel } from '@/lib/admin-plan-copy';
import { resolveUiErrorMessage } from '@/lib/errors';
import { normalizeStatusToken, translateStatusLabel } from '@/lib/status-display';
import {
  BackofficeDiagnosticNotice,
  BackofficeDisclosure,
  BackofficePageHeader,
  BackofficePageStack,
  BackofficePrimaryPanel,
  BackofficeSectionPanel,
} from '@/components/backoffice/BackofficeScaffold';
import { type AdminMutationReceiptPayload } from '@/components/admin/AdminMutationReceipt';
import { AdminLatestOperationButton } from '@/components/admin/AdminLatestOperationDialog';
import { AdminHorizontalScroll } from '@/components/admin/AdminHorizontalScroll';
import { AdminRouteSkeleton } from '@/components/admin/AdminRouteSkeleton';
import { BackofficeIdentifier } from '@/components/backoffice/BackofficeIdentifier';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';
import { AdminAuditSummaryPanel } from '@/components/admin/AdminAuditSummaryPanel';
import { formatAdminCurrency } from '@/lib/currency';
import { formatDate, formatNumber as formatInteger } from '@/lib/utils';

type SubscriptionDetailPayload = {
  subscription?: {
    subscription_id?: string;
    account_id?: string;
    status?: string;
    plan_id?: string;
    plan_version_id?: string;
    current_period_start_at?: string;
    current_period_end_at?: string;
    metadata?: Record<string, unknown>;
  };
  account?: {
    account_id?: string;
    name?: string;
    status?: string;
  };
  covered_sites?: Array<{
    site_id?: string;
    name?: string;
    status?: string;
  }>;
  plan?: {
    plan_id?: string;
    display_name?: string;
  };
  plan_version?: {
    plan_version_id?: string;
  };
  commercial_policy?: {
    subscription?: {
      grace_period_days?: number;
    };
  };
  budget_headroom?: {
    base_budget?: {
      runs?: number;
      tokens?: number;
      cost?: number;
    };
    current_period_topup_delta?: {
      runs?: number;
      tokens?: number;
      cost?: number;
    };
    effective_budget?: {
      runs?: number;
      tokens?: number;
      cost?: number;
    };
  };
  budget_state?: Record<
    string,
    {
      current_total?: number;
      limit?: number;
      over_limit?: boolean;
    }
  >;
  subscription_grace?: {
    subscription_status?: string;
    active?: boolean;
    grace_until_at?: string;
  };
  usage_totals?: {
    runs?: number;
    tokens?: number;
    cost_cny?: number;
    cost_cny_snapshot_missing_count?: number;
  };
  related_surfaces?: {
    site_href?: string;
    account_href?: string;
    audit_href?: string;
  };
  billing_snapshot_status?: {
    status?: string;
    summary?: string;
    site_count?: number;
    fresh_site_count?: number;
    stale_site_count?: number;
    missing_site_count?: number;
    next_action?: {
      action?: string;
      label?: string;
      detail?: string;
    } | null;
  };
  commercial_follow_up?: {
    lifecycle_posture?: string;
    snapshot_reconciliation_summary?: string;
    next_operator_follow_up?: string;
  };
};

type SubscriptionBillingSnapshotRebuildResult = {
  receipt?: AdminMutationReceiptPayload;
};

const subscriptionDetailClient = createApiClient({ idempotencyPrefix: 'admin_subscription_detail' });

function normalizeSubscriptionReturnTo(value: string | null): string {
  if (!value) {
    return '/admin/subscriptions';
  }
  try {
    const parsed = new URL(value, 'https://admin.local');
    if (
      parsed.origin === 'https://admin.local' &&
      parsed.pathname === '/admin/subscriptions'
    ) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    // Fall through to the canonical subscription queue.
  }
  return '/admin/subscriptions';
}

function SubscriptionDetailContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { t } = useLocale();
  const toast = useToast();
  const { subscriptionId } = params as { subscriptionId: string };
  const returnTo = normalizeSubscriptionReturnTo(searchParams.get('return_to'));
  const [detail, setDetail] = useState<SubscriptionDetailPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastReceipt, setLastReceipt] = useState<AdminMutationReceiptPayload | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [isSnapshotRefreshSaving, setIsSnapshotRefreshSaving] = useState(false);
  const [snapshotRefreshError, setSnapshotRefreshError] = useState<string | null>(null);
  const [loadVersion, setLoadVersion] = useState(0);

  useEffect(() => {
    const loadDetail = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const payload = (await subscriptionDetailClient.request<SubscriptionDetailPayload>(
          `/api/admin/subscriptions/${encodeURIComponent(subscriptionId)}`
        )).data;
        setDetail(payload);
      } catch (err) {
        setError(resolveUiErrorMessage(err, t('error.failed_load')));
      } finally {
        setIsLoading(false);
      }
    };

    void loadDetail();
  }, [loadVersion, subscriptionId, t]);

  const reloadDetail = async () => {
    const payload = (await subscriptionDetailClient.request<SubscriptionDetailPayload>(
      `/api/admin/subscriptions/${encodeURIComponent(subscriptionId)}`
    )).data;
    setDetail(payload);
  };

  const normalized = useMemo(() => {
    const subscription = detail?.subscription ?? {};
    const account = detail?.account ?? {};
    const relatedSites = Array.isArray(detail?.covered_sites)
      ? detail?.covered_sites ?? []
      : [];
    const plan = detail?.plan ?? {};
    const planVersion = detail?.plan_version ?? {};
    const budget = detail?.budget_state ?? {};
    const usage = detail?.usage_totals ?? {};
    const grace = detail?.subscription_grace ?? {};
    const graceDays = Number(detail?.commercial_policy?.subscription?.grace_period_days ?? 0);
    const budgetHeadroom = detail?.budget_headroom ?? {};
    const billingSnapshotStatus = detail?.billing_snapshot_status ?? {};

    return {
      subscriptionId: String(subscription.subscription_id || subscriptionId),
      status: normalizeStatusToken(String(subscription.status || grace.subscription_status || 'unknown')),
      accountId: String(account.account_id || subscription.account_id || ''),
      accountName: String(account.name || ''),
      planId: String(plan.plan_id || subscription.plan_id || ''),
      planName: String(plan.display_name || plan.plan_id || subscription.plan_id || ''),
      planVersionId: String(planVersion.plan_version_id || subscription.plan_version_id || ''),
      currentPeriodStart: String(subscription.current_period_start_at || ''),
      currentPeriodEnd: String(subscription.current_period_end_at || ''),
      graceDays,
      graceActive: Boolean(grace.active),
      graceUntilAt: String(grace.grace_until_at || ''),
      runsCurrent: Number(budget.runs?.current_total ?? usage.runs ?? 0),
      runsLimit: Number(budget.runs?.limit ?? 0),
      tokensCurrent: Number(budget.tokens?.current_total ?? usage.tokens ?? 0),
      tokensLimit: Number(budget.tokens?.limit ?? 0),
      costCurrent: Number(budget.cost?.current_total ?? usage.cost_cny ?? 0),
      costSnapshotMissingCount: Math.max(
        0,
        Number(usage.cost_cny_snapshot_missing_count ?? 0)
      ),
      costLimit: Number(budget.cost?.limit ?? 0),
      baseRunsLimit: Number(budgetHeadroom.base_budget?.runs ?? 0),
      baseTokensLimit: Number(budgetHeadroom.base_budget?.tokens ?? 0),
      baseCostLimit: Number(budgetHeadroom.base_budget?.cost ?? 0),
      topupRunsDelta: Number(budgetHeadroom.current_period_topup_delta?.runs ?? 0),
      topupTokensDelta: Number(budgetHeadroom.current_period_topup_delta?.tokens ?? 0),
      topupCostDelta: Number(budgetHeadroom.current_period_topup_delta?.cost ?? 0),
      effectiveRunsLimit: Number(budgetHeadroom.effective_budget?.runs ?? budget.runs?.limit ?? 0),
      effectiveTokensLimit: Number(budgetHeadroom.effective_budget?.tokens ?? budget.tokens?.limit ?? 0),
      effectiveCostLimit: Number(budgetHeadroom.effective_budget?.cost ?? budget.cost?.limit ?? 0),
      billingSnapshotStatus: String(billingSnapshotStatus.status || 'unknown'),
      billingSnapshotSummary: String(billingSnapshotStatus.summary || ''),
      billingSnapshotFreshCount: Number(billingSnapshotStatus.fresh_site_count ?? 0),
      billingSnapshotStaleCount: Number(billingSnapshotStatus.stale_site_count ?? 0),
      billingSnapshotMissingCount: Number(billingSnapshotStatus.missing_site_count ?? 0),
      billingSnapshotNextAction: {
        action: String(billingSnapshotStatus.next_action?.action || ''),
        label: String(billingSnapshotStatus.next_action?.label || ''),
        detail: String(billingSnapshotStatus.next_action?.detail || ''),
      },
      hasBudgetPressure: Boolean(budget.runs?.over_limit || budget.tokens?.over_limit || budget.cost?.over_limit),
      relatedSites: relatedSites.map((site) => ({
        siteId: String(site.site_id || ''),
        siteName: String(site.name || ''),
        status: String(site.status || 'unknown'),
      })),
    };
  }, [detail, subscriptionId]);

  if (isLoading) {
    return <AdminRouteSkeleton />;
  }

  if (error) {
    return (
      <BackofficePageStack>
        <BackofficePrimaryPanel
          eyebrow={t('admin.nav_coverage', {}, 'Service status')}
          title={t('admin.subscription_detail.load_error_title', {}, 'Subscription detail is temporarily unavailable')}
          description={t('admin.subscription_detail.load_error_desc', {}, 'The operator shell remains available. Retry this bounded subscription read without leaving the current route.')}
        >
          <BackofficeDiagnosticNotice
            message={error}
            retryLabel={t('common.retry')}
            onRetry={() => setLoadVersion((value) => value + 1)}
          />
        </BackofficePrimaryPanel>
      </BackofficePageStack>
    );
  }

  const nextStepCopy = normalized.hasBudgetPressure
    ? t(
        'admin.subscription_detail.next_step_budget',
        {},
        'Budget pressure is visible. Confirm the customer coverage first, then inspect a covered site only if runtime service is affected.'
      )
    : normalized.status === 'past_due' || normalized.status === 'expired'
      ? t(
          'admin.subscription_detail.next_step_status',
          {},
          'Service continuity depends on this customer follow-up. Open the customer account first, then inspect a site only when service impact needs confirmation.'
        )
      : t(
          'admin.subscription_detail.next_step_default',
          {},
          'Service coverage looks stable. Use customer detail for account context and open a covered site only when runtime continuity needs inspection.'
        );
  const statusValue = translateStatusLabel(normalized.status, t);
  const packageLabel = resolveAdminPackageLabel(t, {
    planId: normalized.planId,
    fallback: normalized.planName || normalized.planId,
  }) || t('common.unknown', {}, 'Unknown');
  const lifecyclePosture = localizeAdminCommercialCopy(detail?.commercial_follow_up?.lifecycle_posture, t);
  const snapshotReconciliation = localizeAdminCommercialCopy(
    detail?.commercial_follow_up?.snapshot_reconciliation_summary,
    t
  );
  const nextOperatorFollowUp = localizeAdminCommercialCopy(
    detail?.commercial_follow_up?.next_operator_follow_up,
    t
  );
  const billingSnapshotStatusLabel =
    normalized.billingSnapshotStatus === 'fresh'
      ? t('admin.subscription_detail.snapshot_status_fresh', {}, 'Fresh')
      : normalized.billingSnapshotStatus === 'stale'
      ? t('admin.subscription_detail.snapshot_status_stale', {}, 'Stale')
      : normalized.billingSnapshotStatus === 'missing'
      ? t('admin.subscription_detail.snapshot_status_missing', {}, 'Missing')
      : t('common.unknown', {}, 'Unknown');
  const billingSnapshotStatusTone =
    normalized.billingSnapshotStatus === 'fresh'
      ? 'active'
      : normalized.billingSnapshotStatus === 'stale'
      ? 'warning'
      : normalized.billingSnapshotStatus === 'missing'
      ? 'error'
      : 'unknown';
  const localizedBillingSnapshotSummary = localizeAdminCommercialCopy(normalized.billingSnapshotSummary, t);
  const localizedSnapshotActionLabel = localizeAdminCommercialCopy(normalized.billingSnapshotNextAction.label, t);
  const localizedSnapshotActionDetail = localizeAdminCommercialCopy(normalized.billingSnapshotNextAction.detail, t);
  const hasSnapshotFollowUp = ['missing', 'stale'].includes(normalized.billingSnapshotStatus);
  const needsCustomerCoverage = normalized.hasBudgetPressure || ['past_due', 'expired', 'suspended'].includes(normalized.status);
  const conclusionTitle = hasSnapshotFollowUp
    ? t('admin.subscription_detail.conclusion_snapshot_title', {}, 'Billing statistics need reconciliation')
    : normalized.hasBudgetPressure
      ? t('admin.subscription_detail.conclusion_budget_title', {}, 'Budget pressure needs customer follow-up')
      : needsCustomerCoverage
        ? t('admin.subscription_detail.conclusion_coverage_title', {}, 'Customer coverage needs follow-up')
        : t('admin.subscription_detail.conclusion_stable_title', {}, 'Subscription coverage is stable');
  const conclusionDescription = hasSnapshotFollowUp
    ? t('admin.subscription_detail.current_conclusion_snapshot', {}, 'This period billing statistics need follow-up before treating this customer service state as reconciled.')
    : nextStepCopy;
  const accountCoverageHref = detail?.related_surfaces?.account_href || normalized.accountId
    ? `${detail?.related_surfaces?.account_href || `/admin/accounts/${encodeURIComponent(normalized.accountId)}`}#coverage-actions`
    : '';
  const relatedSiteCountLabel =
    normalized.relatedSites.length > 0
      ? t(
          'admin.subscription_detail.covered_sites_count',
          { count: String(normalized.relatedSites.length) },
          `${normalized.relatedSites.length} covered sites`
        )
      : t('common.not_found', {}, 'Not found');

  const handleBillingSnapshotRefresh = async () => {
    setLastReceipt(null);
    setSnapshotRefreshError(null);
    setIsSnapshotRefreshSaving(true);
    try {
      const data = (await subscriptionDetailClient.request<SubscriptionBillingSnapshotRebuildResult>(
        `/api/admin/subscriptions/${encodeURIComponent(normalized.subscriptionId)}/billing-snapshots/rebuild`,
        {
          method: 'POST',
          body: {},
        }
      )).data;
      setLastReceipt(data.receipt || null);
      toast.success(
        t(
          'admin.subscription_detail.snapshot_refresh_notice',
          {},
          'Current-period billing snapshots were rebuilt for this subscription.'
        ),
        t('admin.subscription_detail.snapshot_refresh_success_title', {}, 'Billing statistics refreshed')
      );
      await reloadDetail();
    } catch (err) {
      setSnapshotRefreshError(
        resolveUiErrorMessage(err, t('error.failed_save', {}, 'Failed to save.'))
      );
    } finally {
      setIsSnapshotRefreshSaving(false);
    }
  };

  return (
    <BackofficePageStack>
      <BackofficePageHeader
        eyebrow={t('admin.nav_subscriptions', {}, 'Subscription operations')}
        title={t(
          'admin.subscription_detail.title',
          { subscription: packageLabel },
          `Subscription detail: ${packageLabel}`
        )}
        description={t(
          'admin.subscription_detail.primary_desc',
          {},
          'Review the current conclusion, subscription facts, usage, and related evidence.'
        )}
        secondaryAction={(
          <Link href={returnTo} className="btn btn-secondary">
            {t('admin.back_to_subscriptions', {}, 'Back to subscription operations')}
          </Link>
        )}
        summaryItems={[
          { label: t('common.status', {}, 'Status'), value: <BackofficeStatusBadge status={normalized.status} label={statusValue} /> },
          { label: t('admin.subscription_detail.snapshot_freshness', {}, 'Billing statistics'), value: <BackofficeStatusBadge status={billingSnapshotStatusTone} label={billingSnapshotStatusLabel} /> },
          { label: t('common.account', {}, 'Customer'), value: normalized.accountName || t('admin.subscription_detail.current_customer_label', {}, 'Current customer') },
          { label: t('admin.subscription_detail.covered_sites_label', {}, 'Covered sites'), value: formatInteger(normalized.relatedSites.length) },
        ]}
      />

      <BackofficeSectionPanel>
        <section className="grid gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(32rem,1.2fr)]">
          <div className="flex min-w-0 flex-col justify-between gap-4">
            <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
              {t('admin.subscription_detail.current_follow_up', {}, 'Current conclusion')}
            </p>
            <h2 className="mt-1 text-base font-semibold text-slate-950 dark:text-white">{conclusionTitle}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{conclusionDescription}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {hasSnapshotFollowUp && normalized.billingSnapshotNextAction.action ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void handleBillingSnapshotRefresh()}
                  disabled={isSnapshotRefreshSaving}
                >
                  {isSnapshotRefreshSaving
                    ? t('admin.subscription_detail.snapshot_refresh_saving', {}, 'Refreshing statistics...')
                    : localizedSnapshotActionLabel ||
                      t('admin.subscription_detail.snapshot_refresh_action', {}, 'Refresh this period billing statistics')}
                </button>
              ) : accountCoverageHref ? (
                needsCustomerCoverage ? (
                  <Link href={accountCoverageHref} className="btn btn-primary">
                    {t('admin.subscription_detail.open_customer_coverage_action', {}, 'Open customer coverage')}
                  </Link>
                ) : null
              ) : null}
            {snapshotRefreshError ? (
              <BackofficeDiagnosticNotice message={snapshotRefreshError} />
            ) : null}
            <AdminLatestOperationButton
              receipt={lastReceipt}
              isOpen={receiptOpen}
              onOpen={() => setReceiptOpen(true)}
              onClose={() => setReceiptOpen(false)}
              title={t('admin.latest_operation', {}, 'Latest operation')}
              triggerLabel={t('admin.latest_operation', {}, 'Latest operation')}
            />
            </div>
          </div>
          <div data-ui="subscription-summary-card" className="rounded-xl bg-slate-50/80 px-4 py-3 dark:bg-slate-900/45" aria-labelledby="subscription-facts-heading">
            <h2 id="subscription-facts-heading" className="text-sm font-semibold text-slate-950 dark:text-white">
              {t('admin.subscription_detail.basic_information', {}, 'Subscription facts')}
            </h2>
            <dl className="mt-2 grid gap-x-6 sm:grid-cols-2">
              <div className="border-b border-slate-200/70 py-2 dark:border-slate-800">
                <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t('common.account', {}, 'Customer')}</dt>
                <dd className="mt-1 text-sm font-medium text-slate-950 dark:text-white">
                  {normalized.accountName || t('admin.subscription_detail.current_customer_label', {}, 'Current customer')}
                  {normalized.accountId ? (
                    <Link href={`/admin/accounts/${normalized.accountId}`} className="ml-2 text-blue-600 hover:underline dark:text-blue-300">
                      {t('admin.subscription_detail.open_customer_action', {}, 'Open customer')}
                    </Link>
                  ) : null}
                </dd>
              </div>
              <div className="border-b border-slate-200/70 py-2 dark:border-slate-800">
                <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t('admin.current_package', {}, 'Current package')}</dt>
                <dd className="mt-1 text-sm font-medium text-slate-950 dark:text-white">{packageLabel}</dd>
              </div>
              <div className="border-b border-slate-200/70 py-2 dark:border-slate-800">
                <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t('admin.billing_period', {}, 'Billing period')}</dt>
                <dd className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                  {normalized.currentPeriodStart ? formatDate(normalized.currentPeriodStart) : t('common.not_available', {}, 'N/A')}
                  {' – '}
                  {normalized.currentPeriodEnd ? formatDate(normalized.currentPeriodEnd) : t('common.not_available', {}, 'N/A')}
                </dd>
              </div>
              <div className="border-b border-slate-200/70 py-2 dark:border-slate-800">
                <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t('admin.subscription_detail.grace_policy', {}, 'Grace policy')}</dt>
                <dd className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                  {t('admin.subscription_detail.grace_days', { days: String(normalized.graceDays) }, `${normalized.graceDays} day grace policy`)}
                  {normalized.graceUntilAt ? ` · ${t('admin.subscription_detail.grace_until', { date: formatDate(normalized.graceUntilAt) }, `Grace until ${formatDate(normalized.graceUntilAt)}`)}` : null}
                </dd>
              </div>
              <div className="py-2">
                <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t('admin.subscription_detail.snapshot_freshness', {}, 'Billing statistics')}</dt>
                <dd className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                  <span className="font-medium text-slate-950 dark:text-white">{billingSnapshotStatusLabel}</span>
                  <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                    {t(
                      'admin.subscription_detail.snapshot_freshness_counts',
                      {
                        fresh: String(normalized.billingSnapshotFreshCount),
                        stale: String(normalized.billingSnapshotStaleCount),
                        missing: String(normalized.billingSnapshotMissingCount),
                      },
                      `Current ${normalized.billingSnapshotFreshCount} · Refresh ${normalized.billingSnapshotStaleCount} · Missing ${normalized.billingSnapshotMissingCount}`
                    )}
                  </span>
                </dd>
              </div>
              <div className="py-2">
                <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t('admin.subscription_detail.covered_sites_label', {}, 'Covered sites')}</dt>
                <dd className="mt-1 text-sm font-medium tabular-nums text-slate-950 dark:text-white">{formatInteger(normalized.relatedSites.length)}</dd>
              </div>
            </dl>
          </div>
        </section>
      </BackofficeSectionPanel>

      <div data-ui="subscription-operational-grid" className="grid items-stretch gap-6 xl:grid-cols-2 2xl:grid-cols-[minmax(36rem,1.45fr)_minmax(18rem,0.8fr)_minmax(18rem,0.8fr)]">
      <BackofficeSectionPanel className="h-full space-y-4 xl:col-span-2 2xl:col-span-1">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
                  {t('admin.subscription_detail.usage_title', {}, 'Budget and usage')}
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {t('admin.subscription_detail.usage_boundary', {}, 'Base budget plus current-period top-up becomes the effective budget.')}
                </p>
              </div>
            </div>
            <AdminHorizontalScroll
              className="mt-4"
              label={t('admin.subscription_detail.usage_table_region_label', {}, 'Budget and usage')}
              hint={t('admin.table_scroll_hint', {}, 'Swipe horizontally to see more columns.')}
            >
              <table className="min-w-[36rem] text-left text-sm">
                <thead className="text-xs text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="py-2 font-semibold">{t('admin.subscription_detail.metric_label', {}, 'Metric')}</th>
                    <th className="py-2 font-semibold">{t('admin.subscription_detail.base_budget', {}, 'Base budget')}</th>
                    <th className="py-2 font-semibold">{t('admin.subscription_detail.current_topup', {}, 'Top-up')}</th>
                    <th className="py-2 font-semibold">{t('admin.subscription_detail.effective_budget', {}, 'Effective budget')}</th>
                    <th className="py-2 font-semibold">{t('admin.subscription_detail.used', {}, 'Used')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                  <tr>
                    <td className="py-2 text-slate-600 dark:text-slate-300">{t('common.requests', {}, 'Runs')}</td>
                    <td className="py-2 font-medium tabular-nums">{formatInteger(normalized.baseRunsLimit)}</td>
                    <td className="py-2 font-medium tabular-nums">{formatInteger(normalized.topupRunsDelta)}</td>
                    <td className="py-2 font-semibold tabular-nums text-slate-950 dark:text-white">{formatInteger(normalized.effectiveRunsLimit)}</td>
                    <td className="py-2 font-medium tabular-nums">{formatInteger(normalized.runsCurrent)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-slate-600 dark:text-slate-300">{t('common.tokens', {}, 'Tokens')}</td>
                    <td className="py-2 font-medium tabular-nums">{formatInteger(normalized.baseTokensLimit)}</td>
                    <td className="py-2 font-medium tabular-nums">{formatInteger(normalized.topupTokensDelta)}</td>
                    <td className="py-2 font-semibold tabular-nums text-slate-950 dark:text-white">{formatInteger(normalized.effectiveTokensLimit)}</td>
                    <td className="py-2 font-medium tabular-nums">{formatInteger(normalized.tokensCurrent)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-slate-600 dark:text-slate-300">{t('common.cost', {}, 'Cost')}</td>
                    <td className="py-2 font-medium tabular-nums">{formatAdminCurrency(normalized.baseCostLimit)}</td>
                    <td className="py-2 font-medium tabular-nums">{formatAdminCurrency(normalized.topupCostDelta)}</td>
                    <td className="py-2 font-semibold tabular-nums text-slate-950 dark:text-white">{formatAdminCurrency(normalized.effectiveCostLimit)}</td>
                    <td
                      className="py-2 font-medium tabular-nums"
                      data-ui="cost-snapshot-completeness"
                    >
                      <span>
                        {normalized.costSnapshotMissingCount > 0 ? '≥ ' : ''}
                        {formatAdminCurrency(normalized.costCurrent)}
                      </span>
                      {normalized.costSnapshotMissingCount > 0 ? (
                        <span className="mt-1 block max-w-xs text-xs font-normal leading-5 text-amber-700 dark:text-amber-300">
                          {t(
                            'admin.subscription_detail.cost_snapshot_incomplete',
                            { count: formatInteger(normalized.costSnapshotMissingCount) },
                            `Known CNY minimum · missing call-time snapshots: ${formatInteger(normalized.costSnapshotMissingCount)}`
                          )}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                </tbody>
              </table>
            </AdminHorizontalScroll>
      </BackofficeSectionPanel>

        <BackofficeSectionPanel className="h-full space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                {t('admin.subscription_detail.related_evidence_eyebrow', {}, 'Related evidence')}
              </p>
              <h2 className="mt-2 text-xl font-semibold text-gray-950 dark:text-white">
                {t('admin.subscription_detail.covered_sites_label', {}, 'Covered sites')}
              </h2>
            </div>
            <BackofficeStatusBadge status="inactive" label={relatedSiteCountLabel} />
          </div>
          {normalized.relatedSites.length > 0 ? (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <tr>
                  <th className="py-2 font-semibold">{t('common.site', {}, 'Site')}</th>
                  <th className="py-2 font-semibold">{t('common.status', {}, 'Status')}</th>
                  <th className="py-2 text-right font-semibold">{t('common.actions', {}, 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                {normalized.relatedSites.map((site) => (
                  <tr key={site.siteId}>
                    <td className="py-3 font-medium text-slate-950 dark:text-white">
                      {site.siteName || t('admin.site_detail.current_site_label', {}, 'Current site')}
                    </td>
                    <td className="py-3">
                      <BackofficeStatusBadge status={site.status} label={translateStatusLabel(site.status, t)} />
                    </td>
                    <td className="py-3 text-right">
                      <Link href={`/admin/sites/${site.siteId}`} className="font-medium text-blue-600 hover:underline dark:text-blue-300">
                        {t('admin.site_detail.open_site_action', {}, 'Open site')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="py-4 text-sm text-slate-600 dark:text-slate-300">
              {t('admin.subscription_detail.no_covered_sites', {}, 'No covered sites are attached to this subscription.')}
            </p>
          )}
        </BackofficeSectionPanel>
        <AdminAuditSummaryPanel
          title={t('admin.audit_summary.subscription_title', {}, 'Recent audit summary for this subscription')}
          siteId={normalized.relatedSites[0]?.siteId || ''}
          accountId={normalized.accountId}
          trailHref={detail?.related_surfaces?.audit_href}
          display="table"
          className="h-full"
        />
      </div>

      <BackofficeDisclosure
        summary={t('admin.subscription_detail.advanced_operational_evidence', {}, 'Support and advanced evidence')}
        contentClassName="space-y-4"
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <section>
            <h2 className="text-sm font-semibold text-slate-950 dark:text-white">
              {t('admin.subscription_detail.route_hint', {}, 'Boundary')}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              {t(
                'admin.subscription_detail.route_hint_desc',
                {},
                'This page explains service coverage and billing evidence. It does not become customer access authority, site access authority, or a runtime control surface.'
              )}
            </p>
            <div className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
              {lifecyclePosture ? <p>{lifecyclePosture}</p> : null}
              {snapshotReconciliation ? <p>{snapshotReconciliation}</p> : null}
              {nextOperatorFollowUp ? <p>{nextOperatorFollowUp}</p> : null}
              {localizedBillingSnapshotSummary ? <p>{localizedBillingSnapshotSummary}</p> : null}
              {localizedSnapshotActionDetail ? <p>{localizedSnapshotActionDetail}</p> : null}
            </div>
          </section>
          <section>
            <h2 className="text-sm font-semibold text-slate-950 dark:text-white">
              {t('portal.support_information', {}, 'Support information')}
            </h2>
            <div className="mt-3 space-y-2 text-xs text-slate-500 dark:text-slate-400">
              <BackofficeIdentifier value={normalized.subscriptionId} full />
              {normalized.accountId ? <BackofficeIdentifier value={normalized.accountId} full /> : null}
              {normalized.planId ? <BackofficeIdentifier value={normalized.planId} full /> : null}
              {normalized.planVersionId ? <BackofficeIdentifier value={normalized.planVersionId} full /> : null}
              {normalized.relatedSites.map((site) => (
                <BackofficeIdentifier key={site.siteId} value={site.siteId} full />
              ))}
            </div>
          </section>
        </div>
      </BackofficeDisclosure>
    </BackofficePageStack>
  );
}

export default function AdminSubscriptionDetailPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <SubscriptionDetailContent />
    </Suspense>
  );
}
