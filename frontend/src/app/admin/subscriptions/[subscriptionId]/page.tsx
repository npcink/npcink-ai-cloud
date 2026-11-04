'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { customerLabel } from '@/features/admin/accounts/customer-label';
import { readSubscriptionDetail, subscriptionAuditScope, SubscriptionEvidenceError, type SubscriptionEvidence } from '@/features/admin/subscriptions/evidence';
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
import {
  ADMIN_QUEUE_PATHNAMES,
  normalizeAdminReturnTo,
} from '@/lib/admin-return-context';
import { formatDate, formatNumber as formatInteger } from '@/lib/utils';

type SubscriptionBillingSnapshotRebuildResult = {
  receipt?: AdminMutationReceiptPayload;
};

const subscriptionDetailClient = createApiClient({ idempotencyPrefix: 'admin_subscription_detail' });

function SubscriptionDetailContent() {
  const { subscriptionId } = useParams<{ subscriptionId: string }>();
  return <SubscriptionDetailView key={subscriptionId} subscriptionId={subscriptionId} />;
}

function SubscriptionDetailView({ subscriptionId }: { subscriptionId: string }) {
  const searchParams = useSearchParams();
  const { t } = useLocale();
  const toast = useToast();
  const returnTo = normalizeAdminReturnTo(
    searchParams.get('return_to'),
    {
      allowedPathnames: [ADMIN_QUEUE_PATHNAMES.subscriptions],
      fallback: ADMIN_QUEUE_PATHNAMES.subscriptions,
    }
  );
  const [evidence, setEvidence] = useState<SubscriptionEvidence | null>(null);
  const detail = evidence?.detail;
  const mountedRef = useRef(false);
  const requestSequenceRef = useRef(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastReceipt, setLastReceipt] = useState<AdminMutationReceiptPayload | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [isSnapshotRefreshSaving, setIsSnapshotRefreshSaving] = useState(false);
  const [snapshotAwaitingRead, setSnapshotAwaitingRead] = useState(false);
  const [snapshotRefreshError, setSnapshotRefreshError] = useState<string | null>(null);
  const [loadVersion, setLoadVersion] = useState(0);

  const loadDetail = useCallback(async () => {
    const sequence = ++requestSequenceRef.current;
    setIsLoading(true);
    try {
      const payload = (await subscriptionDetailClient.request<unknown>(
        `/api/admin/subscriptions/${encodeURIComponent(subscriptionId)}`
      )).data;
      const next = readSubscriptionDetail(payload, subscriptionId);
      if (!mountedRef.current || requestSequenceRef.current !== sequence) return false;
      setEvidence(next);
      setError(null);
      return true;
    } catch (err) {
      if (mountedRef.current && requestSequenceRef.current === sequence) {
        setError(err instanceof SubscriptionEvidenceError
          ? t('admin.subscriptions.evidence_invalid', {}, 'Subscription evidence is incomplete or does not match this request. Retry the read.')
          : resolveUiErrorMessage(err, t('error.failed_load')));
      }
      throw err;
    } finally {
      if (mountedRef.current && requestSequenceRef.current === sequence) setIsLoading(false);
    }
  }, [subscriptionId, t]);

  useEffect(() => {
    mountedRef.current = true;
    void loadDetail().catch(() => {});
    return () => { mountedRef.current = false; requestSequenceRef.current += 1; };
  }, [loadVersion, loadDetail]);

  const reloadDetail = async () => {
    if (await loadDetail()) {
      setSnapshotAwaitingRead(false);
      setSnapshotRefreshError(null);
    }
  };

  const normalized = useMemo(() => {
    if (!detail || !evidence) return null;
    const subscription = detail.subscription;
    const account = detail.account;
    const plan = detail.plan;
    const planVersion = detail.plan_version;
    const budget = detail.budget_state;
    const usage = detail.usage_totals;
    const grace = detail.subscription_grace;
    const graceDays = detail.commercial_policy.subscription.grace_period_days;
    const budgetHeadroom = detail.budget_headroom;
    const billingSnapshotStatus = detail.billing_snapshot_status;

    return {
      subscriptionId: subscription.subscription_id,
      status: normalizeStatusToken(subscription.status),
      accountId: account?.account_id || '',
      accountName: account ? customerLabel(account, '') : '',
      planId: subscription.plan_id,
      planName: plan?.name || '',
      planVersionId: planVersion?.plan_version_id || subscription.plan_version_id,
      currentPeriodStart: String(subscription.current_period_start_at || ''),
      currentPeriodEnd: String(subscription.current_period_end_at || ''),
      graceDays,
      graceActive: Boolean(grace.active),
      graceUntilAt: String(grace.grace_until_at || ''),
      runsCurrent: budget.runs.current_total,
      runsLimit: budget.runs.limit,
      tokensCurrent: budget.tokens.current_total,
      tokensLimit: budget.tokens.limit,
      costCurrent: budget.cost.current_total,
      costSnapshotMissingCount: usage.cost_cny_snapshot_missing_count,
      costLimit: budget.cost.limit,
      baseRunsLimit: budgetHeadroom.base_budget.runs,
      baseTokensLimit: budgetHeadroom.base_budget.tokens,
      baseCostLimit: budgetHeadroom.base_budget.cost,
      topupRunsDelta: budgetHeadroom.current_period_topup_delta.runs,
      topupTokensDelta: budgetHeadroom.current_period_topup_delta.tokens,
      topupCostDelta: budgetHeadroom.current_period_topup_delta.cost,
      effectiveRunsLimit: budgetHeadroom.effective_budget.runs,
      effectiveTokensLimit: budgetHeadroom.effective_budget.tokens,
      effectiveCostLimit: budgetHeadroom.effective_budget.cost,
      billingSnapshotStatus: billingSnapshotStatus.status,
      billingSnapshotSummary: billingSnapshotStatus.summary,
      billingSnapshotFreshCount: billingSnapshotStatus.fresh_site_count,
      billingSnapshotStaleCount: billingSnapshotStatus.stale_site_count,
      billingSnapshotMissingCount: billingSnapshotStatus.missing_site_count,
      billingSnapshotNextAction: {
        action: String(billingSnapshotStatus.next_action?.action || ''),
        label: String(billingSnapshotStatus.next_action?.label || ''),
        detail: String(billingSnapshotStatus.next_action?.detail || ''),
      },
      hasBudgetPressure: budget.runs.over_limit || budget.tokens.over_limit || budget.cost.over_limit,
      relatedSites: evidence.sites.sites.map((site) => ({
        siteId: site.site_id,
        siteName: site.name,
        status: site.status,
      })),
    };
  }, [detail, evidence]);

  if (isLoading && !evidence) {
    return <AdminRouteSkeleton />;
  }

  if (error && !evidence) {
    return (
      <BackofficePageStack>
        <BackofficePrimaryPanel
          eyebrow={t('admin.workspace_tab_service_status', {}, 'Service status')}
          title={t('admin.subscription_detail.load_error_title', {}, 'Subscription detail is temporarily unavailable')}
          description={t('admin.subscription_detail.load_error_desc', {}, 'The operator shell remains available. Retry this bounded subscription read without leaving the current route.')}
        >
          <p className="mb-3 break-all text-sm">{subscriptionId}</p>
          <BackofficeDiagnosticNotice
            message={error}
            retryLabel={t('common.retry')}
            onRetry={() => setLoadVersion((value) => value + 1)}
          />
        </BackofficePrimaryPanel>
      </BackofficePageStack>
    );
  }

  if (!normalized || !detail || !evidence) return <AdminRouteSkeleton />;
  const siteIssues = evidence.sites.issues;
  const canJudge = !error && !isLoading && !siteIssues.length && Boolean(detail.account && detail.plan && detail.plan_version);
  const auditScope = !error && !isLoading ? subscriptionAuditScope(evidence) : null;

  const nextStepCopy = normalized.hasBudgetPressure
    ? t(
        'admin.subscription_detail.next_step_budget',
        {},
        'Budget pressure is visible. Confirm the customer coverage first, then inspect a covered site only if runtime service is affected.'
      )
    : ['past_due', 'expired', 'suspended'].includes(normalized.status)
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
  const conclusionTitle = !canJudge
    ? t('admin.subscription_detail.conclusion_unknown', {}, 'Subscription evidence needs verification')
    : needsCustomerCoverage
    ? t('admin.subscription_detail.conclusion_coverage_title', {}, 'Customer coverage needs follow-up')
    : hasSnapshotFollowUp
      ? t('admin.subscription_detail.conclusion_snapshot_title', {}, 'Usage statistics need maintenance')
      : t('admin.subscription_detail.conclusion_stable_title', {}, 'Subscription coverage is stable');
  const conclusionDescription = !canJudge
    ? t('admin.subscription_detail.evidence_incomplete', {}, 'Some subscription evidence is unavailable or stale. Dependent operations are blocked; retry this subscription read.')
    : needsCustomerCoverage
    ? nextStepCopy
    : hasSnapshotFollowUp
      ? t('admin.subscription_detail.current_conclusion_snapshot', {}, 'Refresh usage statistics. This status alone does not mean payment failure or blocked Cloud access.')
      : nextStepCopy;
  const accountCoverageHref = normalized.accountId
    ? `/admin/accounts/${encodeURIComponent(normalized.accountId)}#coverage-actions` : '';
  const siteCollectionUnavailable = siteIssues.some(issue => issue.index === null);
  const siteCountValue = siteCollectionUnavailable ? t('common.unknown', {}, 'Unknown') : siteIssues.length
    ? t('admin.subscription_detail.site_count_partial', { valid: String(normalized.relatedSites.length), count: String(siteIssues.length) }, `${normalized.relatedSites.length} valid · ${siteIssues.length} unavailable`)
    : formatInteger(normalized.relatedSites.length);
  const relatedSiteCountLabel = siteIssues.length ? siteCountValue :
    normalized.relatedSites.length > 0
      ? t(
          'admin.subscription_detail.covered_sites_count',
          { count: String(normalized.relatedSites.length) },
          `${normalized.relatedSites.length} covered sites`
        )
      : t('common.not_found', {}, 'Not found');

  const handleBillingSnapshotRefresh = async () => {
    if (!canJudge || isSnapshotRefreshSaving || snapshotAwaitingRead) return;
    setLastReceipt(null);
    setSnapshotRefreshError(null);
    setIsSnapshotRefreshSaving(true);
    try {
      const data = (await subscriptionDetailClient.request<SubscriptionBillingSnapshotRebuildResult>(
        `/api/admin/subscriptions/${encodeURIComponent(subscriptionId)}/billing-snapshots/rebuild`,
        {
          method: 'POST',
          body: {},
        }
      )).data;
      if (!mountedRef.current) return;
      setLastReceipt(data.receipt || null);
      toast.success(
        t(
          'admin.subscription_detail.snapshot_refresh_notice',
          {},
          'Current-period billing snapshots were rebuilt for this subscription.'
        ),
        t('admin.subscription_detail.snapshot_refresh_success_title', {}, 'Billing statistics refreshed')
      );
      setSnapshotAwaitingRead(true);
      try {
        await reloadDetail();
      } catch (readError) {
        if (mountedRef.current) setSnapshotRefreshError(resolveUiErrorMessage(readError, t('error.failed_load')));
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setSnapshotRefreshError(
        resolveUiErrorMessage(err, t('error.failed_save', {}, 'Failed to save.'))
      );
    } finally {
      if (mountedRef.current) setIsSnapshotRefreshSaving(false);
    }
  };

  return (
    <BackofficePageStack>
      <BackofficePageHeader
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
          { label: t('admin.subscription_detail.covered_sites_label', {}, 'Covered sites'), value: siteCountValue },
        ]}
      />

      {error ? <BackofficeDiagnosticNotice
        message={`${error} ${t('admin.subscription_detail.retained', {}, 'Showing the last valid detail; it is stale.')}`}
        retryLabel={snapshotAwaitingRead ? undefined : t('common.retry')}
        onRetry={snapshotAwaitingRead ? undefined : () => void reloadDetail().catch(() => {})}
      /> : null}
      <BackofficeSectionPanel>
        <p className="text-xs text-slate-500 dark:text-slate-400">{t('admin.subscription_detail.period_boundary', {}, 'Period end is not payment evidence.')}{normalized.planId === 'free' ? ` ${t('admin.subscription_detail.free_record', {}, 'Free also has a subscription record.')}` : ''}{normalized.relatedSites.some(site => site.status === 'removed') ? ` ${t('admin.subscription_detail.removed_history', {}, 'Removed sites remain in history and do not require current statistics maintenance.')}` : ''}</p>
        <section className="mt-2 grid items-start gap-4 min-[850px]:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="flex min-w-0 flex-col gap-3">
            <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
              {t('admin.subscription_detail.current_follow_up', {}, 'Current conclusion')}
            </p>
            <h2 className="mt-1 text-base font-semibold text-slate-950 dark:text-white">{conclusionTitle}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{conclusionDescription}</p>
            </div>
            {!canJudge && !siteIssues.length && !error ? <button type="button" className="btn btn-secondary btn-sm" disabled={isLoading || isSnapshotRefreshSaving}
              onClick={() => void reloadDetail().catch(() => {})}>{t('common.retry')}</button> : null}
            <div className="flex flex-wrap items-center gap-3">
              {needsCustomerCoverage && accountCoverageHref ? (
                <Link href={accountCoverageHref} className="btn btn-primary">
                  {t('admin.subscription_detail.open_customer_coverage_action', {}, 'Open customer coverage')}
                </Link>
              ) : null}
              {hasSnapshotFollowUp && normalized.billingSnapshotNextAction.action ? (
                <button
                  type="button"
                  className={needsCustomerCoverage ? 'btn btn-secondary' : 'btn btn-primary'}
                  onClick={() => void handleBillingSnapshotRefresh()}
                  disabled={!canJudge || isSnapshotRefreshSaving || snapshotAwaitingRead}
                >
                  {isSnapshotRefreshSaving
                    ? t('admin.subscription_detail.snapshot_refresh_saving', {}, 'Refreshing statistics...')
                    : localizedSnapshotActionLabel ||
                      t('admin.subscription_detail.snapshot_refresh_action', {}, 'Refresh this period billing statistics')}
                </button>
              ) : null}
            {snapshotAwaitingRead ? <div role="status" className="space-y-2 text-sm">
              <p>{t('admin.saved_awaiting_read', {}, 'Write succeeded. Reload to confirm the saved state before editing again.')}</p>
              <button type="button" className="btn btn-secondary" disabled={isLoading || isSnapshotRefreshSaving} onClick={() => void reloadDetail().catch((err) => setSnapshotRefreshError(resolveUiErrorMessage(err, t('error.failed_load'))))}>{t('common.retry')}</button>
            </div> : null}
            {snapshotRefreshError && !error ? (
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
          <div data-ui="subscription-summary-card" className="min-w-0 rounded-xl bg-slate-50/80 px-3 py-2 dark:bg-slate-900/45" aria-labelledby="subscription-facts-heading">
            <h2 id="subscription-facts-heading" className="text-sm font-semibold text-slate-950 dark:text-white">
              {t('admin.subscription_detail.basic_information', {}, 'Subscription facts')}
            </h2>
            <dl className="mt-1 grid gap-x-4 sm:grid-cols-2">
              <div className="border-b border-slate-200/70 py-2 dark:border-slate-800">
                <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t('common.account', {}, 'Customer')}</dt>
                <dd className="mt-1 break-words text-sm font-medium text-slate-950 dark:text-white [overflow-wrap:anywhere]">
                  {normalized.accountName || t('admin.accounts.unnamed_customer', {}, 'Unnamed customer')}
                  {normalized.accountId ? (
                    <Link href={`/admin/accounts/${encodeURIComponent(normalized.accountId)}`} className="ml-2 text-blue-600 hover:underline dark:text-blue-300">
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
                <dd className="mt-1 text-sm tabular-nums text-slate-700 dark:text-slate-200">
                  <span className="inline-block">{normalized.currentPeriodStart ? formatDate(normalized.currentPeriodStart) : t('common.not_available', {}, 'N/A')}</span>
                  {' – '}
                  <span className="inline-block">{normalized.currentPeriodEnd ? formatDate(normalized.currentPeriodEnd) : t('common.not_available', {}, 'N/A')}</span>
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
                <dd className="mt-1 text-sm font-medium tabular-nums text-slate-950 dark:text-white">{siteCountValue}</dd>
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
              <table className="w-full min-w-[36rem] text-left text-sm [&_td:not(:first-child)]:text-right [&_th:not(:first-child)]:text-right">
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
          {siteIssues.length ? <div role="alert" data-ui="subscription-site-evidence" className="space-y-2 text-sm">
            <p>{siteCollectionUnavailable
              ? t('admin.subscription_detail.sites_collection', {}, 'Covered-site collection is missing or invalid. Its size is unknown; dependent operations are blocked.')
              : t('admin.subscription_detail.sites_invalid', { count: String(siteIssues.length) }, `${siteIssues.length} covered-site evidence entries are unavailable. Valid sites remain below; dependent operations are blocked.`)}</p>
            {!siteCollectionUnavailable ? <ul className="list-inside list-disc">{siteIssues.map(issue => <li key={issue.index}>
              {t(`admin.subscription_detail.site_issue_${issue.reason}`, { index: String(issue.index! + 1) }, `Site entry ${issue.index! + 1}: ${issue.reason}`)}
            </li>)}</ul> : null}
            <button type="button" className="btn btn-secondary btn-sm" disabled={isLoading || isSnapshotRefreshSaving}
              onClick={() => void reloadDetail().catch(() => {})}>{t('common.retry')}</button>
          </div> : null}
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
                      <Link href={`/admin/sites/${encodeURIComponent(site.siteId)}`} className="font-medium text-blue-600 hover:underline dark:text-blue-300">
                        {t('admin.site_detail.open_site_action', {}, 'Open site')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : !siteIssues.length ? (
            <p className="py-4 text-sm text-slate-600 dark:text-slate-300">
              {t('admin.subscription_detail.no_covered_sites', {}, 'No covered sites are attached to this subscription.')}
            </p>
          ) : null}
        </BackofficeSectionPanel>
        {auditScope ? <AdminAuditSummaryPanel
          key={`${subscriptionId}:${auditScope.accountId}:${auditScope.siteId}`}
          title={t('admin.audit_summary.subscription_title', {}, 'Recent audit summary for this subscription')}
          siteId={auditScope.siteId}
          accountId={auditScope.accountId}
          trailHref={`/api/admin/audit-events?${auditScope.accountId
            ? `account_id=${encodeURIComponent(auditScope.accountId)}`
            : `site_id=${encodeURIComponent(auditScope.siteId)}`}&limit=20`}
          display="table"
          compactEmpty
          className="self-start"
        /> : <p data-ui="subscription-audit-unavailable" className="text-sm text-slate-600 dark:text-slate-300">
          {t('admin.subscription_detail.audit_unavailable', {}, 'Audit evidence requires a current, verified customer or site scope. Retry the subscription read.')}
        </p>}
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
