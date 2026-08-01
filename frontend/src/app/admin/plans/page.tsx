'use client';

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';
import {
  BackofficeInfoHint,
  BackofficeEmptyState,
  BackofficeLayer,
  BackofficePageHeader,
  BackofficePageStack,
  BackofficeSectionPanel,
  BackofficeStackCard,
} from '@/components/backoffice/BackofficeScaffold';
import { LoadingFallback } from '@/components/ui/LoadingFallback';
import { useToast } from '@/components/ui/Toast';
import { AdminDataTableFrame } from '@/components/admin/AdminDataTableFrame';
import { PlanManagementWorkbench } from '@/components/admin/PlanManagementWorkbench';
import { useLocale } from '@/contexts/LocaleContext';
import {
  localizeOperatorNote,
  localizePackageAlias,
  localizePositioning,
  localizeTierLabel,
  localizeUsageBand,
} from '@/lib/admin-plan-copy';
import { createApiClient } from '@/lib/api-client';
import { ADMIN_CURRENCY } from '@/lib/currency';
import { cn, formatDate, formatNumber as formatInteger } from '@/lib/utils';
import { ApiError, resolveUiErrorMessage } from '@/lib/errors';

type PlanVersionRecord = {
  plan_version_id: string;
  version_label: string;
  status: string;
  currency: string;
  budgets: Record<string, unknown>;
  concurrency: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  created_at: string;
};

type PlanRecord = {
  plan_id: string;
  name: string;
  status: string;
  description: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type TierSummary = {
  tier_id: string;
  label: string;
  package_alias: string;
  usage_band: string;
  positioning: string;
  monthly_included_points: number;
  site_limit: number;
  budgets_template: Record<string, unknown>;
  concurrency_template: Record<string, unknown>;
  max_batch_items: number;
  automation_enabled: boolean;
  api_enabled: boolean;
  openclaw_enabled: boolean;
  package_operator_note: string;
  policy_baseline: Record<string, unknown>;
  feature_groups: string[];
};

type PlanListItem = {
  plan: PlanRecord;
  tier_summary: TierSummary;
  latest_version?: PlanVersionRecord | null;
  published_version_count: number;
  subscription_counts: {
    total: number;
    active: number;
  };
};

type CanonicalTierCoverageItem = {
  shell: TierSummary;
  item: PlanListItem | null;
  isPresent: boolean;
};

type PlanCatalogPayload = {
  items?: PlanListItem[];
  tier_templates?: TierSummary[];
};

const PLAN_CATALOG_LOAD_TIMEOUT_MS = 10_000;
type PlanCatalogState = 'missing' | 'unpublished' | 'ready';
const TIER_ORDER = new Map([['free', 0], ['plus', 1], ['pro', 2], ['agency', 3]]);
const plansClient = createApiClient({ idempotencyPrefix: 'admin_plans' });

function catalogState(entry: CanonicalTierCoverageItem): PlanCatalogState {
  if (!entry.item) return 'missing';
  if (!entry.isPresent) return 'unpublished';
  return 'ready';
}

function sortCatalogByTier(entries: CanonicalTierCoverageItem[]): CanonicalTierCoverageItem[] {
  return [...entries].sort(
    (left, right) =>
      (TIER_ORDER.get(left.shell.tier_id) ?? 99) -
      (TIER_ORDER.get(right.shell.tier_id) ?? 99)
  );
}

function catalogStateToneClassName(state: PlanCatalogState): string {
  if (state === 'missing') return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-200';
  if (state === 'unpublished') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-200';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-200';
}

function numericValue(value: unknown): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function latestMetadataValue(
  latestVersion: PlanVersionRecord | null | undefined,
  fallback: unknown,
  key: string
): number {
  const metadata = latestVersion?.metadata || {};
  return numericValue(metadata[key] ?? fallback);
}

async function fetchPlanCatalog(): Promise<PlanCatalogPayload> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), PLAN_CATALOG_LOAD_TIMEOUT_MS);
  try {
    return (await plansClient.request<PlanCatalogPayload>('/api/admin/plans', {
      signal: controller.signal,
    })).data;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function findCanonicalShellPlan(plans: PlanListItem[], tierId: string): PlanListItem | undefined {
  const expectedTierId = tierId;
  return plans.find((item) => {
    const planId = item.plan.plan_id;
    const metadataTierId = String(item.plan.metadata?.tier_id || '');
    const summaryTierId = String(item.tier_summary?.tier_id || '');
    if (planId === tierId || planId === expectedTierId) {
      return true;
    }
    return (
      item.plan.metadata?.source === 'canonical_package_shell_v1' &&
      (metadataTierId === expectedTierId || summaryTierId === expectedTierId)
    );
  });
}

function PlansContent() {
  const { t } = useLocale();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const focusedTierId = searchParams.get('focus') || '';
  const [plans, setPlans] = useState<PlanListItem[]>([]);
  const [tierTemplates, setTierTemplates] = useState<TierSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const activeRequestRef = useRef(false);
  const requestSequenceRef = useRef(0);
  const hasLoadedRef = useRef(false);
  const [form, setForm] = useState({
    plan_id: '',
    name: '',
    status: 'active',
    description: '',
  });

  const updateCatalogUrl = useCallback((changes: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParamsKey);
    Object.entries(changes).forEach(([key, value]) => {
      if (!value) params.delete(key);
      else params.set(key, value);
    });
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [pathname, router, searchParamsKey]);

  const loadPlans = useCallback(async (force = false) => {
    if (!force && activeRequestRef.current) return;
    activeRequestRef.current = true;
    const sequence = ++requestSequenceRef.current;
    if (hasLoadedRef.current) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      const payload = await fetchPlanCatalog();
      if (sequence !== requestSequenceRef.current) return;
      setPlans(payload.items || []);
      setTierTemplates(payload.tier_templates || []);
      setLoadedAt(new Date());
      hasLoadedRef.current = true;
    } catch (err) {
      if (sequence !== requestSequenceRef.current) return;
      const isAbort =
        err instanceof ApiError &&
        err.cause instanceof DOMException &&
        err.cause.name === 'AbortError';
      setError(
        isAbort
          ? t('admin.plans.load_timeout', {}, 'Package catalog did not finish loading. Retry, then check the admin plans endpoint if it repeats.')
          : resolveUiErrorMessage(err, t('error.failed_load'))
      );
    } finally {
      if (sequence === requestSequenceRef.current) {
        activeRequestRef.current = false;
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [t]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  const handleCreatePlan = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      await plansClient.request<Record<string, unknown>>('/api/admin/plans', {
        method: 'POST',
        body: form,
      });
      toast.success(
        t('admin.plan_saved_notice', {}, 'Plan saved. Publish a plan version next to make it selectable for subscriptions.'),
        t('admin.plans.plan_saved_title', {}, 'Package record saved')
      );
      setForm({ plan_id: '', name: '', status: 'active', description: '' });
      await loadPlans(true);
    } catch (err) {
      setError(
        resolveUiErrorMessage(err, t('error.failed_save', {}, 'Failed to save.'))
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleBootstrapShell = useCallback(async (shell: TierSummary) => {
    setIsBootstrapping(true);
    setError(null);
    try {
      const localizedAlias = localizePackageAlias(t, shell.tier_id, shell.package_alias);
      const localizedPositioning = localizePositioning(t, shell.tier_id, shell.positioning);
      const localizedOperatorNote = localizeOperatorNote(t, shell.tier_id, shell.package_operator_note);
      const metadata = {
        tier_id: shell.tier_id,
        package_alias: localizedAlias,
        monthly_included_points: shell.monthly_included_points,
        site_limit: shell.site_limit,
        max_batch_items: shell.max_batch_items,
        source: 'canonical_package_shell_v1',
      };

      await plansClient.request<Record<string, unknown>>('/api/admin/plans', {
        method: 'POST',
        body: {
          plan_id: shell.tier_id,
          name: localizedAlias,
          status: 'active',
          description: localizedPositioning,
          metadata,
        },
      });

      await plansClient.request<Record<string, unknown>>(`/api/admin/plans/${encodeURIComponent(shell.tier_id)}/versions`, {
        method: 'POST',
        body: {
          plan_version_id: `${shell.tier_id}_v1`,
          version_label: 'v1',
          status: 'published',
          currency: ADMIN_CURRENCY,
          entitlements: {
            ability_families: ['*'],
            channels: ['*'],
            execution_kinds: ['*'],
            execution_tiers: ['cloud'],
            data_classifications: ['*'],
          },
          budgets: shell.budgets_template,
          concurrency: shell.concurrency_template,
          policy: {
            subscription: { grace_period_days: Number(shell.policy_baseline?.grace_period_days || 0) },
            budgets: {},
          },
          metadata: {
            ...metadata,
            package_operator_note: localizedOperatorNote,
            baseline_version: 'v1',
          },
        },
      });

      toast.success(
        t(
          'admin.package_shell_bootstrap_notice',
          {},
          `${localizedAlias} package is now available for customer assignment.`
        ),
        t('admin.plans.package_initialized_title', {}, 'Package initialized')
      );
      await loadPlans(true);
    } catch (err) {
      setError(
        resolveUiErrorMessage(err, t('error.failed_save', {}, 'Failed to save.'))
      );
    } finally {
      setIsBootstrapping(false);
    }
  }, [loadPlans, t, toast]);

  const handleBootstrapMissingShells = useCallback(async () => {
    const missingShells = tierTemplates.filter((shell) => {
      const existing = findCanonicalShellPlan(plans, shell.tier_id);
      return !existing || Number(existing.published_version_count || 0) === 0;
    });
    if (missingShells.length === 0) {
      toast.success(
        t('admin.package_shells_present', {}, 'All standard packages are already available.'),
        t('admin.plans.catalog_ready_title', {}, 'Catalog ready')
      );
      return;
    }
    for (const shell of missingShells) {
      // Sequential bootstrap keeps notices and server-side upserts predictable.
      await handleBootstrapShell(shell);
    }
  }, [handleBootstrapShell, plans, t, tierTemplates, toast]);

  if (isLoading) {
    return <LoadingFallback />;
  }

  if (error && plans.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="max-w-md text-center">
          <h2 className="mb-4 text-2xl font-bold text-red-600">{t('common.error')}</h2>
          <p className="mb-6 text-gray-600 dark:text-gray-400">{error}</p>
          <button onClick={() => void loadPlans()} className="btn btn-primary">
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  const canonicalTierCoverage: CanonicalTierCoverageItem[] = tierTemplates.map((shell) => {
    const item = findCanonicalShellPlan(plans, shell.tier_id) || null;
    return {
      shell,
      item,
      isPresent: Boolean(item && Number(item.published_version_count || 0) > 0),
    };
  });
  const readyPackageCount = canonicalTierCoverage.filter((entry) => entry.isPresent).length;
  const activeSubscriptions = canonicalTierCoverage.reduce(
    (sum, entry) => sum + Number(entry.item?.subscription_counts?.active || 0),
    0
  );
  const missingShellCount = canonicalTierCoverage.filter((entry) => !entry.isPresent).length;
  const orderedCatalog = sortCatalogByTier(canonicalTierCoverage);
  const selectedEntry = focusedTierId
    ? orderedCatalog.find((entry) => entry.shell.tier_id === focusedTierId) || null
    : null;

  return (
    <BackofficePageStack className="space-y-5">
      <BackofficePageHeader
        eyebrow={t('admin.nav_plan_catalog', {}, 'Package Catalog')}
        title={t('admin.coverage_package_catalog_title', {}, 'Coverage package catalog')}
        description={t(
          'admin.package_management_center_desc',
          {},
          'Read the active Free, Plus, Pro, and Agency package posture first. Open detail only when price, limits, or release state needs maintenance.'
        )}
        secondaryAction={(
          <button type="button" className="btn btn-secondary" disabled={isRefreshing} onClick={() => void loadPlans(true)}>{isRefreshing ? t('common.loading', {}, 'Loading...') : t('admin.plans.refresh_action', {}, 'Refresh catalog')}</button>
        )}
        summaryItems={[
          { label: t('admin.managed_packages', {}, 'Managed packages'), value: formatInteger(tierTemplates.length) },
          { label: t('admin.ready_packages', {}, 'Ready packages'), value: formatInteger(readyPackageCount), toneClassName: readyPackageCount === tierTemplates.length ? 'text-emerald-600 dark:text-emerald-300' : undefined },
          { label: t('admin.plans.needs_attention_metric', {}, 'Needs attention'), value: formatInteger(missingShellCount), toneClassName: missingShellCount ? 'text-rose-600 dark:text-rose-300' : undefined },
          { label: t('admin.active_subscriptions'), value: formatInteger(activeSubscriptions) },
          { label: t('common.updated_at', {}, 'Updated'), value: loadedAt ? formatDate(loadedAt.toISOString()) : t('common.unknown', {}, 'Unknown') },
        ]}
      />

      {error ? <div role="alert" className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between"><span>{error}{plans.length > 0 ? <span className="mt-1 block text-xs">{t('admin.plans.retained_notice', {}, 'Showing the last successfully loaded catalog.')}</span> : null}</span><button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadPlans(true)}>{t('common.retry')}</button></div> : null}

      <div className="min-w-0">
          <AdminDataTableFrame
            title={t('admin.plans.directory_title', {}, 'Standard package catalog')}
            resultLabel={t(
              'admin.plans.result_count',
              { visible: formatInteger(orderedCatalog.length), total: formatInteger(canonicalTierCoverage.length) },
              `${formatInteger(orderedCatalog.length)} visible · ${formatInteger(canonicalTierCoverage.length)} standard packages`
            )}
            dataUi="plan-catalog-table"
            density="compact"
            headerVisibility="sr-only"
          >
            <p className="sr-only" role="status" aria-live="polite">
              {t(
                'admin.plans.result_count',
                { visible: formatInteger(orderedCatalog.length), total: formatInteger(canonicalTierCoverage.length) },
                `${formatInteger(orderedCatalog.length)} visible · ${formatInteger(canonicalTierCoverage.length)} standard packages`
              )}
            </p>
            {orderedCatalog.length ? (
              <table className="w-full min-w-[48rem] table-fixed text-left text-xs" aria-label={t('admin.plans.list_label', {}, 'Package list')}>
                <thead className="bg-slate-50/70 text-slate-500 dark:bg-slate-900/35 dark:text-slate-400">
                  <tr>
                    <th scope="col" className="w-[16%] px-3 py-2 font-semibold">{t('admin.nav_plan_catalog', {}, 'Package')}</th>
                    <th scope="col" className="w-[30%] px-3 py-2 font-semibold">{t('common.status')}</th>
                    <th scope="col" className="w-[11%] px-3 py-2 text-right font-semibold">{t('admin.active_subscriptions')}</th>
                    <th scope="col" className="w-[13%] px-3 py-2 text-right font-semibold">{t('admin.included_points', {}, 'Package AI credits')}</th>
                    <th scope="col" className="w-[22%] px-3 py-2 font-semibold">{t('common.limit', {}, 'Limits')}</th>
                    <th scope="col" className="w-[8%] px-3 py-2 text-right font-semibold">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {orderedCatalog.map((entry) => {
                    const { shell, item } = entry;
                    const state = catalogState(entry);
                    const latestVersion = item?.latest_version || null;
                    const concurrency = (latestVersion?.concurrency || shell.concurrency_template || {}) as Record<string, unknown>;
                    const sourceTier = item?.tier_summary || shell;
                    const packageAlias = localizePackageAlias(t, shell.tier_id, sourceTier.package_alias);
                    const selected = selectedEntry?.shell.tier_id === shell.tier_id;
                    const attentionReason = state === 'missing'
                      ? t('admin.plans.reason_missing', {}, 'The standard package record does not exist and cannot be assigned.')
                      : state === 'unpublished'
                        ? t('admin.plans.reason_unpublished', {}, 'The package exists but has no published version for subscription assignment.')
                        : null;
                    const planId = item?.plan?.plan_id || '';
                    const subscriptionsHref = `/admin/subscriptions?plan_id=${encodeURIComponent(planId || shell.tier_id)}`;
                    return (
                      <tr
                        key={shell.tier_id}
                        data-ui="plan-catalog-item"
                        aria-selected={selected}
                        className={cn(
                          'border-b border-slate-200/80 align-middle transition last:border-b-0 dark:border-slate-800',
                          selected ? 'bg-blue-50/65 dark:bg-blue-950/15' : 'hover:bg-slate-50/70 dark:hover:bg-slate-950/35'
                        )}
                      >
                        <td className="px-3 py-2.5">
                          <p className="font-semibold text-slate-950 dark:text-white">{packageAlias}</p>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className={cn('inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold', catalogStateToneClassName(state))}>
                              {t(`admin.plans.state_${state}`, {}, state)}
                            </span>
                          </div>
                          {attentionReason ? <p className="mt-1 line-clamp-2 leading-4 text-slate-600 dark:text-slate-300">{attentionReason}</p> : null}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-slate-950 dark:text-white">
                          {planId ? (
                            <Link
                              href={subscriptionsHref}
                              aria-label={`${t('admin.plans.open_subscriptions_action', {}, 'Open subscriptions')} · ${packageAlias}`}
                              className="inline-flex min-w-8 cursor-pointer items-center justify-end gap-1 rounded px-1 py-0.5 text-blue-700 underline-offset-4 hover:bg-blue-50 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:text-blue-300 dark:hover:bg-blue-950/30"
                            >
                              {formatInteger(item?.subscription_counts?.active || 0)}
                              <span aria-hidden="true">›</span>
                            </Link>
                          ) : formatInteger(item?.subscription_counts?.active || 0)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-slate-950 dark:text-white">
                          {formatInteger(latestMetadataValue(latestVersion, sourceTier.monthly_included_points, 'monthly_included_points'))}
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="whitespace-nowrap text-[0.68rem] text-slate-600 dark:text-slate-300">
                            <span>{t('admin.site_limit', {}, 'Sites')} <strong className="text-slate-950 dark:text-white">{formatInteger(latestMetadataValue(latestVersion, sourceTier.site_limit, 'site_limit'))}</strong></span>
                            <span className="mx-1.5 text-slate-300 dark:text-slate-700">·</span>
                            <span>{t('admin.concurrency', {}, 'Concurrency')} <strong className="text-slate-950 dark:text-white">{formatInteger(numericValue(concurrency.max_active_runs))}</strong></span>
                            <span className="mx-1.5 text-slate-300 dark:text-slate-700">·</span>
                            <span>{t('admin.batch_ceiling', {}, 'Batch')} <strong className="text-slate-950 dark:text-white">{formatInteger(latestMetadataValue(latestVersion, sourceTier.max_batch_items, 'max_batch_items'))}</strong></span>
                          </p>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            aria-label={planId
                              ? t('admin.plans.manage_title', { package: packageAlias }, `Manage ${packageAlias}`)
                              : undefined}
                            aria-pressed={selected}
                            aria-haspopup={planId ? 'dialog' : undefined}
                            aria-controls={planId ? 'plan-management-workbench-title' : undefined}
                            onClick={() => {
                              if (planId) {
                                updateCatalogUrl({ focus: shell.tier_id });
                                return;
                              }
                              document.getElementById('package-maintenance')?.scrollIntoView({ behavior: 'smooth' });
                            }}
                          >
                            {planId
                              ? t('admin.plans.manage_action', {}, 'Manage')
                              : t('admin.plans.open_advanced_setup', {}, 'Initialize')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <BackofficeEmptyState
                className="m-4"
                title={t('admin.plans.empty_title', {}, 'No standard packages are available')}
                description={t('admin.plans.empty_desc', {}, 'Refresh the catalog, then initialize any missing standard packages.')}
              />
            )}
          </AdminDataTableFrame>
      </div>

      {selectedEntry?.item?.plan?.plan_id ? (
        <PlanManagementWorkbench
          open
          planId={selectedEntry.item.plan.plan_id}
          activeSubscriptionCount={Number(selectedEntry.item.subscription_counts?.active || 0)}
          fallbackName={localizePackageAlias(
            t,
            selectedEntry.shell.tier_id,
            (selectedEntry.item.tier_summary || selectedEntry.shell).package_alias
          )}
          onClose={() => updateCatalogUrl({ focus: null })}
          onSaved={() => loadPlans(true)}
        />
      ) : null}

      {missingShellCount > 0 ? (
      <details id="package-maintenance" className="border-t border-slate-200 pt-4 dark:border-slate-800">
        <summary className="cursor-pointer list-none">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-950 dark:text-white">
                <span>{t('admin.package_shell_maintenance_toggle_label', {}, 'Package initialization')}</span>
                <BackofficeInfoHint
                  detail={t(
                    'admin.plans.advanced_maintenance_desc',
                    {},
                    'Initialize missing standard packages or create an exceptional package record.'
                  )}
                />
              </p>
            </div>
            <span className="inline-flex w-fit items-center rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-300">
              {missingShellCount > 0
                ? t('admin.package_shell_bootstrap_missing', {}, 'Some standard packages are still missing or unpublished.')
                : t('admin.package_shells_present', {}, 'All standard packages are already available.')}
            </span>
          </div>
        </summary>
        {error ? (
          <div role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        ) : null}

      <div className="mt-6">
        <BackofficeLayer
          eyebrow={t('admin.quick_actions')}
          title={t('admin.package_shell_bootstrap_title', {}, 'Create missing standard packages')}
          description={t(
            'admin.package_shell_bootstrap_desc',
            {},
            'Use these shortcuts to create any missing Free / Plus / Pro / Agency package entries before assigning them to customers.'
          )}
          descriptionDisplay="hint"
        />
        <BackofficeSectionPanel className="mt-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {missingShellCount > 0
              ? t(
                  'admin.package_shell_bootstrap_missing',
                  {},
                  `${missingShellCount} standard package${missingShellCount > 1 ? 's are' : ' is'} still missing or unpublished.`
                )
              : t('admin.package_shells_present', {}, 'All standard packages are already available.')}
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void handleBootstrapMissingShells()}
            disabled={isBootstrapping || missingShellCount === 0}
          >
            {t('admin.bootstrap_missing_shells', {}, 'Create missing packages')}
          </button>
        </div>
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
          {canonicalTierCoverage.map(({ shell, item, isPresent }) => {
            return (
              <BackofficeStackCard key={shell.tier_id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950 dark:text-white">
                      {localizePackageAlias(t, shell.tier_id, shell.package_alias)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {localizeTierLabel(t, shell.tier_id)} · {localizeUsageBand(t, shell.tier_id, shell.usage_band)}
                    </p>
                  </div>
                  <BackofficeStatusBadge
                    status={isPresent ? 'published' : 'draft'}
                    label={isPresent ? t('status.published', {}, 'published') : t('status.draft', {}, 'missing')}
                  />
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <MetricInline
                    label={t('admin.included_points', {}, 'Included AI credits')}
                    value={formatInteger(shell.monthly_included_points)}
                  />
                  <MetricInline
                    label={t('admin.site_limit', {}, 'Site limit')}
                    value={formatInteger(shell.site_limit)}
                  />
                  <MetricInline
                    label={t('admin.concurrency', {}, 'Concurrency')}
                    value={formatInteger(Number(shell.concurrency_template?.max_active_runs || 0))}
                  />
                  <MetricInline
                    label={t('admin.batch_ceiling', {}, 'Batch ceiling')}
                    value={formatInteger(shell.max_batch_items)}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-secondary mt-4 w-full"
                  disabled={isBootstrapping || isPresent}
                  onClick={() => void handleBootstrapShell(shell)}
                >
                  {isPresent
                    ? t('admin.package_shell_present', {}, 'Already present')
                    : t('admin.create_package_shell', {}, `Create ${localizePackageAlias(t, shell.tier_id, shell.package_alias)} package`)}
                </button>
                {item?.plan?.plan_id ? (
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    {t(
                      'admin.package_shell_binding',
                      { planId: item.plan.plan_id },
                      `This standard package uses ID ${item.plan.plan_id}.`
                    )}
                  </p>
                ) : null}
              </BackofficeStackCard>
            );
          })}
        </div>
        </BackofficeSectionPanel>
      </div>

      <div className="mt-6">
        <BackofficeLayer
          eyebrow={t('admin.quick_actions')}
          title={t('admin.create_plan_title', {}, 'Create package record')}
          description={t(
            'admin.create_plan_form_desc_v2',
            {},
            'Create package objects here only when the customer coverage queue genuinely needs a new package. This is a deep inspection workflow, not a default operator path.'
          )}
          descriptionDisplay="hint"
        />
        <BackofficeSectionPanel className="mt-4">
        <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-[0.9fr_1fr_0.7fr]" onSubmit={handleCreatePlan}>
          <label className="text-sm">
            <span className="mb-2 block font-medium text-gray-700 dark:text-gray-300">{t('admin.plan_id', {}, 'Package ID')}</span>
            <input
              value={form.plan_id}
              onChange={(event) => setForm((current) => ({ ...current, plan_id: event.target.value }))}
              className="input w-full"
              placeholder="free"
              required
            />
          </label>
          <label className="text-sm">
            <span className="mb-2 block font-medium text-gray-700 dark:text-gray-300">{t('common.label')}</span>
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="input w-full"
              placeholder="Free"
              required
            />
          </label>
          <label className="text-sm">
            <span className="mb-2 block font-medium text-gray-700 dark:text-gray-300">{t('common.status')}</span>
            <select
              value={form.status}
              onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
              className="input w-full"
            >
              <option value="active">{t('status.active', {}, 'active')}</option>
              <option value="draft">{t('status.draft', {}, 'draft')}</option>
              <option value="archived">{t('status.archived', {}, 'archived')}</option>
            </select>
          </label>
          <label className="text-sm md:col-span-2 xl:col-span-2">
            <span className="mb-2 block font-medium text-gray-700 dark:text-gray-300">{t('common.description')}</span>
            <textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              className="input min-h-28 w-full"
              placeholder={t(
                'admin.plan_description_placeholder',
                {},
                'Describe the intended package posture, operating band, and any operator-only notes.'
              )}
            />
          </label>
          <div className="flex items-end justify-end">
            <button type="submit" className="btn btn-secondary w-full xl:w-auto" disabled={isSaving}>
              {isSaving ? t('common.saving', {}, 'Saving…') : t('common.create')}
            </button>
          </div>
        </form>
        </BackofficeSectionPanel>
      </div>
      </details>
      ) : null}
    </BackofficePageStack>
  );
}

function MetricInline({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 px-3 py-2 dark:border-slate-800">
      <p className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}

export default function AdminPlansPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <PlansContent />
    </Suspense>
  );
}
