'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  BackofficeMetricStrip,
  BackofficePageStack,
  BackofficeStackCard,
} from '@/components/backoffice/BackofficeScaffold';
import {
  PortalEmptyState,
  PortalErrorState,
  PortalLoadingState,
  PortalSignedOutState,
} from '@/components/portal/PortalPageState';
import { PortalWorkspaceHeader } from '@/components/portal/PortalWorkspaceHeader';
import { LoadingFallback } from '@/components/ui/LoadingFallback';
import { useLocale } from '@/contexts/LocaleContext';
import { usePortalSiteSelection } from '@/hooks/usePortalSiteSelection';
import { useSession } from '@/hooks/useSession';
import {
  portalClient,
  type PortalBillingReconciliation,
  type PortalBillingSnapshot,
} from '@/lib/portal-client';
import { resolveCustomerPackageDisplay } from '@/lib/customer-package-display';
import { DEFAULT_PORTAL_CURRENCY, formatPortalCurrency, normalizePortalCurrency } from '@/lib/currency';
import { formatCompactNumber, formatDate, formatNumber } from '@/lib/utils';

function coerceFiniteNumber(value: unknown): number {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function PortalBillingContent() {
  const searchParams = useSearchParams();
  const { t } = useLocale();
  const { session, isLoading: sessionLoading, isAuthenticated, selectSite } = useSession();
  const { sites, selectedSiteId, selectedSite, setSelectedSiteId } = usePortalSiteSelection({
    session,
    isAuthenticated,
    searchParams,
    selectSite,
  });
  const [snapshots, setSnapshots] = useState<PortalBillingSnapshot[]>([]);
  const [reconciliation, setReconciliation] = useState<PortalBillingReconciliation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBilling = useCallback(async (siteId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const bundle = await portalClient.getBillingBundle(siteId);
      setSnapshots(bundle.snapshots);
      setReconciliation(bundle.reconciliation);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.failed_load', {}, 'Failed to load.'));
      setSnapshots([]);
      setReconciliation(null);
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!selectedSiteId) {
      setIsLoading(false);
      return;
    }
    void loadBilling(selectedSiteId);
  }, [loadBilling, selectedSiteId]);

  if (sessionLoading) {
    return <PortalLoadingState message={t('portal.loading_session', {}, 'Loading session...')} />;
  }

  if (!isAuthenticated || !session) {
    return (
      <PortalSignedOutState
        title={t('auth.sign_in_required', {}, 'Sign in required')}
        description={t('portal.signed_out_desc', {}, 'Sign in to view Cloud service details.')}
        actionLabel={t('nav.sign_in', {}, 'Sign in')}
      />
    );
  }

  if (!sites.length || !selectedSiteId || !selectedSite) {
    return (
      <PortalEmptyState
        title={t('portal.empty_no_site_title', {}, 'No site available')}
        description={t('portal.empty_no_site_desc', {}, 'Ask an operator to provision a site before using Cloud billing detail.')}
      />
    );
  }

  if (isLoading) {
    return <PortalLoadingState message={t('portal.billing.loading', {}, 'Loading billing snapshots...')} />;
  }

  const currency = normalizePortalCurrency(snapshots[0]?.currency || DEFAULT_PORTAL_CURRENCY);
  const latestSnapshot = snapshots[0] || null;
  const syncState = reconciliation?.reconciliation?.in_sync;
  const currentSubscription = session.current_subscription || null;
  const snapshotPlanVersionId =
    latestSnapshot?.plan_version_id || currentSubscription?.plan_version_id || '';
  const packageDisplay = resolveCustomerPackageDisplay(t, {
    planId: currentSubscription?.plan_id,
    planVersionId: snapshotPlanVersionId,
    packageAlias: currentSubscription?.package_alias,
    formalPlanName: selectedSite.plan_name,
    planKind: currentSubscription?.plan_kind,
    coverageState: currentSubscription ? 'covered' : 'uncovered',
  });
  const packageLabel = packageDisplay.display_package_label || t('portal.home.package_pending_label', {}, 'To confirm');

  return (
    <BackofficePageStack>
      <PortalWorkspaceHeader
        eyebrow={t('portal.workspace_label', {}, 'Portal')}
        title={t('portal.billing.customer_title', {}, 'Package records')}
        description={t('portal.billing.subtitle', {}, 'Confirm the current package and whether service records need review.')}
        currentPage="billing"
        sites={sites}
        selectedSiteId={selectedSiteId}
        onSiteChange={setSelectedSiteId}
      />

      {error ? (
        <PortalErrorState
          title={t('error.failed_load', {}, 'Failed to load')}
          description={error}
          retryLabel={t('common.retry', {}, 'Retry')}
          onRetry={() => void loadBilling(selectedSiteId)}
        />
      ) : null}

      <BackofficeMetricStrip
        items={[
          { label: t('portal.current_subscription_label', {}, 'Current package'), value: packageLabel },
          { label: t('portal.billing.records_count_label', {}, 'Records'), value: formatNumber(snapshots.length) },
          {
            label: t('portal.billing.service_record_status', {}, 'Record status'),
            value: syncState === false ? t('common.attention', {}, 'Attention') : t('common.ok', {}, 'OK'),
            detail:
              syncState === false
                ? t('portal.billing.service_record_attention_detail', {}, 'Ask support to review before relying on this record.')
                : t('portal.billing.service_record_ready_detail', {}, 'No record issue is visible.'),
            size: 'compact',
          },
          {
            label: t('portal.updated_at', {}, 'Updated'),
            value: latestSnapshot?.generated_at ? formatDate(latestSnapshot.generated_at) : t('portal.home.package_pending_label', {}, 'To confirm'),
            size: 'compact',
          },
        ]}
      />

      <BackofficeStackCard>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
              {t('portal.billing.service_record_label', {}, 'Service records')}
            </p>
            <h2 className="mt-2 text-lg font-semibold text-gray-950 dark:text-white">
              {syncState === false
                ? t('portal.billing.reconciliation_attention', {}, 'Service records need support review')
                : t('portal.billing.reconciliation_ready', {}, 'Service records look normal')}
            </h2>
          </div>
          <span className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-200">
            {syncState === false ? t('common.attention', {}, 'Attention') : t('common.ok', {}, 'OK')}
          </span>
        </div>
      </BackofficeStackCard>

      <BackofficeStackCard>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
              {t('portal.current_subscription_label', {}, 'Current package')}
            </p>
            <h2 className="mt-2 text-lg font-semibold text-gray-950 dark:text-white">{packageLabel}</h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              {t(
                'portal.billing.operator_notice',
                {},
                'This page only shows the package currently attached to the site. Package changes are handled by support.'
              )}
            </p>
          </div>
          <Link href={`/portal/sites/${selectedSiteId}`} className="btn btn-secondary">
            {t('portal.site_record', {}, 'Site Record')}
          </Link>
        </div>
      </BackofficeStackCard>

      <BackofficeStackCard>
        <p className="text-sm font-semibold text-gray-950 dark:text-white">
          {t('portal.billing.help_title', {}, 'Need help?')}
        </p>
        <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
          {t(
            'portal.billing.help_desc',
            {},
            'If the package or record status looks wrong, contact support with the selected site name. Technical record IDs are hidden below unless support asks for them.'
          )}
        </p>
      </BackofficeStackCard>

      <details className="overflow-hidden rounded-[1.4rem] border border-gray-200 bg-white dark:border-gray-800 dark:bg-slate-950">
        <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-gray-950 hover:bg-gray-50 dark:text-white dark:hover:bg-slate-900">
          {t('portal.billing.records_title', {}, 'Support record details')}
        </summary>
        <div className="grid gap-4 border-t border-gray-200 p-4 dark:border-gray-800 lg:grid-cols-2">
          {snapshots.map((snapshot) => (
            <BackofficeStackCard key={`record-${snapshot.snapshot_id}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
	                  <p className="text-sm font-semibold text-gray-950 dark:text-white">
	                    {t('portal.billing.record_title', {}, 'Package record')}
	                  </p>
	                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
	                    {t('portal.billing.record_support_hint', {}, 'Support can look up the technical record if needed.')}
	                  </p>
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {formatDate(snapshot.generated_at)}
                </span>
              </div>
              <BackofficeMetricStrip
                items={[
	                  {
	                    label: t('portal.usage.package_service_uses_label', {}, 'Service uses'),
	                    value: formatNumber(coerceFiniteNumber(snapshot.totals?.runs)),
	                  },
	                  {
	                    label: t('portal.usage.breakdown_tokens', {}, 'Point usage'),
	                    value: formatCompactNumber(coerceFiniteNumber(snapshot.totals?.tokens_total)),
	                  },
	                  {
	                    label: t('portal.usage.package_budget_label', {}, 'Budget'),
	                    value: formatPortalCurrency(coerceFiniteNumber(snapshot.totals?.cost), { to: currency }),
	                  },
                ]}
              />
            </BackofficeStackCard>
          ))}
          {!snapshots.length ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('portal.billing.records_empty', {}, 'No records')}
            </p>
          ) : null}
        </div>
      </details>

      {!snapshots.length ? (
        <PortalEmptyState
          title={t('portal.billing.empty_title', {}, 'No package records yet')}
          description={t('portal.billing.empty_desc', {}, 'Package records will appear after support finishes the first service cycle.')}
        />
      ) : null}
    </BackofficePageStack>
  );
}

export default function PortalBillingPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <PortalBillingContent />
    </Suspense>
  );
}
