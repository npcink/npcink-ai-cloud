'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';
import { AdminMutationReceipt, type AdminMutationReceiptPayload } from '@/components/admin/AdminMutationReceipt';
import { AdminWorkbenchDialog } from '@/components/admin/AdminWorkbenchDialog';
import { LoadingFallback } from '@/components/ui/LoadingFallback';
import { useLocale } from '@/contexts/LocaleContext';
import {
  localizeFeatureGroup,
  localizeOperatorNote,
  localizePackageAlias,
  localizePackageFitCue,
} from '@/lib/admin-plan-copy';
import { createApiClient } from '@/lib/api-client';
import { resolveUiErrorMessage } from '@/lib/errors';
import { translateStatusLabel } from '@/lib/status-display';
import { formatNumber as formatInteger } from '@/lib/utils';

type PlanRecord = {
  plan_id: string;
  name: string;
  status: string;
  description: string;
  metadata?: Record<string, unknown>;
};

type PlanVersionRecord = {
  version_label: string;
  status: string;
  budgets: Record<string, unknown>;
  concurrency: Record<string, unknown>;
  policy: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
};

type TierSummary = {
  tier_id: string;
  label: string;
  package_alias: string;
  monthly_included_points: number;
  site_limit: number;
  max_vector_documents: number;
  budgets_template: Record<string, unknown>;
  concurrency_template: Record<string, unknown>;
  max_batch_items: number;
  package_operator_note: string;
  policy_baseline: Record<string, unknown>;
  canonical_shell: {
    entitlements: Record<string, unknown>;
    budgets: Record<string, unknown>;
    concurrency: Record<string, unknown>;
    policy: Record<string, unknown>;
    metadata: Record<string, unknown>;
  };
  feature_groups: string[];
};

type PackageFitCue = {
  code: string;
  severity: string;
  title: string;
  detail: string;
};

type PlanDetailPayload = {
  plan: PlanRecord;
  latest_version?: PlanVersionRecord | null;
  sales_offer?: {
    amount: number;
    currency: string;
  } | null;
  tier_summary: TierSummary;
  package_fit_cues: PackageFitCue[];
};

type PlanVersionFormState = {
  monthly_included_points: string;
  site_limit: string;
  max_vector_documents: string;
  max_cost_cny_per_period: string;
  sales_price_cny: string;
  max_active_runs: string;
  max_batch_items: string;
  grace_period_days: string;
};

type ManagementTab = 'parameters' | 'diagnostics';

type PlanManagementWorkbenchProps = {
  open: boolean;
  planId: string;
  fallbackName: string;
  activeSubscriptionCount: number;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

const planManagementClient = createApiClient({ idempotencyPrefix: 'admin_plan_management' });

function numberField(value: unknown): string {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? String(numeric) : '0';
}

function numericValue(value: unknown): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function buildInitialForm(detail: PlanDetailPayload | null): PlanVersionFormState {
  const latestVersion = detail?.latest_version || null;
  const tierSummary = detail?.tier_summary;
  const canonicalShell = tierSummary?.canonical_shell;
  const canonicalBudgets = canonicalShell?.budgets || {};
  const canonicalConcurrency = canonicalShell?.concurrency || {};
  const canonicalPolicy = canonicalShell?.policy || {};
  const canonicalMetadata = canonicalShell?.metadata || {};
  const budgets = latestVersion?.budgets || canonicalBudgets;
  const concurrency = latestVersion?.concurrency || canonicalConcurrency;
  const policy = latestVersion?.policy || canonicalPolicy;
  const metadata = latestVersion?.metadata || canonicalMetadata;
  const policySubscription = (policy.subscription || canonicalPolicy.subscription || {}) as Record<string, unknown>;

  return {
    monthly_included_points: numberField(
      budgets.max_ai_credits_per_period ??
        metadata.monthly_included_points ??
        tierSummary?.monthly_included_points
    ),
    site_limit: numberField(metadata.site_limit ?? tierSummary?.site_limit),
    max_vector_documents: numberField(metadata.max_vector_documents ?? tierSummary?.max_vector_documents),
    max_cost_cny_per_period: numberField(budgets.max_cost_cny_per_period),
    sales_price_cny: numberField(detail?.sales_offer?.amount),
    max_active_runs: numberField(concurrency.max_active_runs),
    max_batch_items: numberField(metadata.max_batch_items ?? tierSummary?.max_batch_items),
    grace_period_days: numberField(policySubscription.grace_period_days),
  };
}

function buildBaselineFieldPatch(tierSummary: TierSummary): Partial<PlanVersionFormState> {
  const budgets = tierSummary.canonical_shell?.budgets || {};
  const concurrency = tierSummary.canonical_shell?.concurrency || {};
  const policySubscription = (tierSummary.canonical_shell?.policy?.subscription || {}) as Record<string, unknown>;
  return {
    monthly_included_points: numberField(tierSummary.monthly_included_points),
    site_limit: numberField(tierSummary.site_limit),
    max_vector_documents: numberField(tierSummary.max_vector_documents),
    max_cost_cny_per_period: numberField(budgets.max_cost_cny_per_period),
    max_active_runs: numberField(concurrency.max_active_runs),
    max_batch_items: numberField(tierSummary.max_batch_items),
    grace_period_days: numberField(policySubscription.grace_period_days),
  };
}

function ParameterField({
  label,
  detail,
  unit,
  value,
  onChange,
  min = 0,
  step = 1,
}: {
  label: string;
  detail: string;
  unit: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  step?: number;
}) {
  return (
    <label className="grid min-w-0 content-start gap-1.5 border-b border-slate-200 py-3 dark:border-slate-800">
      <span className="text-sm font-semibold text-slate-950 dark:text-white">{label}</span>
      <span data-ui="plan-parameter-control" className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto]">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="input h-10 min-w-0 appearance-none rounded-r-none border-r-0 text-right tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          type="number"
          inputMode={step < 1 ? 'decimal' : 'numeric'}
          min={min}
          step={step}
        />
        <span
          aria-hidden="true"
          data-ui="plan-parameter-unit"
          className="flex h-[var(--admin-compact-control-height)] shrink-0 items-center whitespace-nowrap rounded-r-md border border-slate-300 bg-slate-50 px-3 text-xs font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
        >
          {unit}
        </span>
      </span>
      <span className="text-xs leading-5 text-slate-500 dark:text-slate-400">{detail}</span>
    </label>
  );
}

export function PlanManagementWorkbench({
  open,
  planId,
  fallbackName,
  activeSubscriptionCount,
  onClose,
  onSaved,
}: PlanManagementWorkbenchProps) {
  const { t } = useLocale();
  const [detail, setDetail] = useState<PlanDetailPayload | null>(null);
  const [form, setForm] = useState<PlanVersionFormState>(() => buildInitialForm(null));
  const [activeTab, setActiveTab] = useState<ManagementTab>('parameters');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastReceipt, setLastReceipt] = useState<AdminMutationReceiptPayload | null>(null);

  const loadDetail = useCallback(async (showLoading = true) => {
    if (!planId) return;
    if (showLoading) setIsLoading(true);
    setError(null);
    try {
      const payload = (await planManagementClient.request<PlanDetailPayload>(
        `/api/admin/plans/${encodeURIComponent(planId)}`
      )).data;
      setDetail(payload);
      setForm(buildInitialForm(payload));
    } catch (loadError) {
      setError(resolveUiErrorMessage(loadError, t('error.failed_load')));
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [planId, t]);

  useEffect(() => {
    if (!open || !planId) return;
    setDetail(null);
    setNotice(null);
    setLastReceipt(null);
    setActiveTab('parameters');
    void loadDetail();
  }, [loadDetail, open, planId]);

  const latestVersion = detail?.latest_version || null;
  const localizedAlias = detail
    ? localizePackageAlias(
        t,
        detail.tier_summary?.tier_id || detail.plan.plan_id,
        detail.tier_summary?.package_alias || detail.plan.name
      )
    : fallbackName;
  const packageFitCue = detail?.package_fit_cues?.[0]
    ? localizePackageFitCue(t, detail.package_fit_cues[0])
    : null;
  const operatorNote = detail
    ? localizeOperatorNote(
        t,
        detail.tier_summary?.tier_id || detail.plan.plan_id,
        detail.tier_summary?.package_operator_note || ''
      )
    : '';
  const baselinePatch = useMemo(
    () => detail ? buildBaselineFieldPatch(detail.tier_summary) : {},
    [detail]
  );
  const hasUnsavedChanges = useMemo(() => {
    if (!detail) return false;
    const savedForm = buildInitialForm(detail);
    return (Object.keys(form) as Array<keyof PlanVersionFormState>)
      .some((field) => form[field] !== savedForm[field]);
  }, [detail, form]);

  const updateField = (field: keyof PlanVersionFormState, value: string) => {
    setNotice(null);
    setForm((current) => ({ ...current, [field]: value }));
  };

  const restoreSavedValues = () => {
    if (!detail) return;
    setForm(buildInitialForm(detail));
    setNotice(t('admin.plans.saved_values_restored_notice', {}, 'Saved values restored.'));
  };

  const applyDefaultValues = () => {
    setForm((current) => ({ ...current, ...baselinePatch }));
    setNotice(
      t(
        'admin.plans.default_values_applied_notice',
        { tier: localizedAlias },
        `${localizedAlias} defaults applied. Sales price is unchanged; save to publish these values.`
      )
    );
  };

  const handleSave = async () => {
    if (!detail || isSaving) return;
    setIsSaving(true);
    setError(null);
    setNotice(null);
    setLastReceipt(null);
    try {
      const payload = {
        monthly_included_points: Number(form.monthly_included_points || 0),
        site_limit: Number(form.site_limit || 0),
        max_vector_documents: Number(form.max_vector_documents || 0),
        max_cost_cny_per_period: Number(form.max_cost_cny_per_period || 0),
        sales_price_cny: Number(form.sales_price_cny || 0),
        max_active_runs: Number(form.max_active_runs || 0),
        max_batch_items: Number(form.max_batch_items || 0),
        grace_period_days: Number(form.grace_period_days || 0),
      };
      const data = (await planManagementClient.request<{ receipt?: AdminMutationReceiptPayload | null }>(
        `/api/admin/plans/${encodeURIComponent(planId)}`,
        { method: 'PATCH', body: payload }
      )).data;
      setNotice(
        t(
          'admin.coverage_package_release_saved_notice',
          {},
          'Package changes saved and published. Existing subscriptions on this package use the latest values.'
        )
      );
      setLastReceipt(data.receipt ?? null);
      await loadDetail(false);
      await onSaved();
    } catch (saveError) {
      setError(resolveUiErrorMessage(saveError, t('error.failed_save', {}, 'Failed to save.')));
    } finally {
      setIsSaving(false);
    }
  };

  const tabs: Array<{ id: ManagementTab; label: string }> = [
    { id: 'parameters', label: t('admin.plans.parameters_tab', {}, 'Package parameters') },
    { id: 'diagnostics', label: t('admin.package_advanced_info_diagnostics', {}, 'Diagnostics') },
  ];

  return (
    <AdminWorkbenchDialog
      open={open}
      title={t('admin.plans.manage_title', { package: localizedAlias }, `Manage ${localizedAlias}`)}
      titleId="plan-management-workbench-title"
      headerAccessory={detail ? (
        <BackofficeStatusBadge
          status={latestVersion?.status || detail.plan.status}
          label={translateStatusLabel(latestVersion?.status || detail.plan.status, t)}
        />
      ) : null}
      message={notice || undefined}
      error={error || undefined}
      saving={isSaving}
      closeLabel={t('common.close', {}, 'Close')}
      cancelLabel={t('common.close', {}, 'Close')}
      saveLabel={t('common.save', {}, 'Save')}
      savingLabel={t('common.saving', {}, 'Saving...')}
      footerNotice={hasUnsavedChanges && activeSubscriptionCount > 0
        ? t(
            'admin.plans.subscription_impact',
            { count: formatInteger(activeSubscriptionCount) },
            `Saving will affect ${formatInteger(activeSubscriptionCount)} active subscriptions.`
          )
        : ''}
      footerActions={(
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-secondary" disabled={isSaving} onClick={onClose}>
            {t('common.close', {}, 'Close')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!detail || isLoading || isSaving}>
            {isSaving ? t('common.saving', {}, 'Saving...') : t('common.save', {}, 'Save')}
          </button>
        </div>
      )}
      width="wide"
      density="compact"
      onClose={onClose}
      onSubmit={() => void handleSave()}
    >
      {isLoading && !detail ? <LoadingFallback /> : null}

      {!isLoading && !detail ? (
        <div className="py-8 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {t('admin.plans.load_detail_failed', {}, 'Package management data could not be loaded.')}
          </p>
          <button type="button" className="btn btn-secondary mt-4" onClick={() => void loadDetail()}>
            {t('common.retry', {}, 'Retry')}
          </button>
        </div>
      ) : null}

      {detail ? (
        <>
          <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                className={`border-b-2 px-3 py-2 text-sm font-semibold transition ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300'
                    : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'parameters' ? (
            <section aria-labelledby="plan-parameters-title">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 id="plan-parameters-title" className="text-sm font-semibold text-slate-950 dark:text-white">
                    {t('admin.plans.parameters_title', {}, 'Current package parameters')}
                  </h4>
                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    {t('admin.plans.parameters_desc', {}, 'Review the meaning of each value and edit it in the same list.')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    aria-label={t('admin.plans.restore_saved_full_label', {}, 'Restore saved values')}
                    title={t('admin.plans.restore_saved_full_label', {}, 'Restore saved values')}
                    disabled={!hasUnsavedChanges || isSaving}
                    onClick={restoreSavedValues}
                  >
                    {t('admin.reset_to_latest_version', {}, 'Restore saved values')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    aria-label={t(
                      'admin.plans.apply_defaults_full_label',
                      { tier: localizedAlias },
                      `Apply ${localizedAlias} defaults`
                    )}
                    title={t(
                      'admin.plans.apply_defaults_full_label',
                      { tier: localizedAlias },
                      `Apply ${localizedAlias} defaults`
                    )}
                    disabled={isSaving}
                    onClick={applyDefaultValues}
                  >
                    {t('admin.apply_tier_baseline', { tier: localizedAlias }, `Restore ${localizedAlias} suggested values`)}
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-5">
                <section aria-labelledby="plan-customer-package-title">
                  <h5 id="plan-customer-package-title" className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t('admin.plans.customer_package_section', {}, 'Customer package')}
                  </h5>
                  <div
                    data-ui="plan-parameter-grid"
                    className="mt-1 grid gap-x-5 sm:grid-cols-2 xl:grid-cols-3"
                  >
                    <ParameterField
                      label={t('admin.sales_price_cny', {}, 'Sales price (CNY / 30 days)')}
                      detail={t('admin.sales_price_cny_detail', {}, 'Customer-facing 30-day price used for new Alipay orders.')}
                      unit={t('admin.plans.unit_cny_30_days', {}, 'CNY / 30d')}
                      value={form.sales_price_cny}
                      step={0.01}
                      onChange={(value) => updateField('sales_price_cny', value)}
                    />
                    <ParameterField
                      label={t('admin.included_points', {}, 'Package AI credits')}
                      detail={t('admin.included_points_detail', {}, 'Current-period package AI credits shared by all sites on this account.')}
                      unit={t('admin.plans.unit_credits', {}, 'credits')}
                      value={form.monthly_included_points}
                      onChange={(value) => updateField('monthly_included_points', value)}
                    />
                    <ParameterField
                      label={t('admin.site_limit', {}, 'Site limit')}
                      detail={t('admin.site_limit_detail', {}, 'Maximum sites covered by the current customer subscription.')}
                      unit={t('admin.plans.unit_sites', {}, 'sites')}
                      value={form.site_limit}
                      min={1}
                      onChange={(value) => updateField('site_limit', value)}
                    />
                    <ParameterField
                      label={t('admin.vector_documents_limit', {}, 'Knowledge articles')}
                      detail={t('admin.vector_documents_limit_detail', {}, 'Account-level article capacity for Site Knowledge indexing.')}
                      unit={t('admin.plans.unit_articles', {}, 'articles')}
                      value={form.max_vector_documents}
                      onChange={(value) => updateField('max_vector_documents', value)}
                    />
                  </div>
                </section>

                <section aria-labelledby="plan-runtime-limits-title">
                  <h5 id="plan-runtime-limits-title" className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t('admin.plans.runtime_limits_section', {}, 'Runtime limits')}
                  </h5>
                  <div
                    data-ui="plan-parameter-grid"
                    className="mt-1 grid gap-x-5 sm:grid-cols-2 xl:grid-cols-3"
                  >
                    <ParameterField
                      label={t('admin.concurrency', {}, 'Concurrency')}
                      detail={t('admin.plan_template_concurrency_detail', {}, 'Maximum tasks that may run at the same time for this package.')}
                      unit={t('admin.plans.unit_runs', {}, 'runs')}
                      value={form.max_active_runs}
                      onChange={(value) => updateField('max_active_runs', value)}
                    />
                    <ParameterField
                      label={t('admin.batch_ceiling', {}, 'Batch ceiling')}
                      detail={t('admin.batch_ceiling_detail', {}, 'Maximum tasks allowed in one operator batch.')}
                      unit={t('admin.plans.unit_items', {}, 'items')}
                      value={form.max_batch_items}
                      onChange={(value) => updateField('max_batch_items', value)}
                    />
                    <ParameterField
                      label={t('admin.model_cost_budget_cny', {}, 'Model cost budget (CNY / period)')}
                      detail={t('admin.period_cost_budget_detail', {}, 'Internal provider-cost monitoring threshold; it does not change the sales price.')}
                      unit={t('admin.plans.unit_cny_period', {}, 'CNY / period')}
                      value={form.max_cost_cny_per_period}
                      step={0.01}
                      onChange={(value) => updateField('max_cost_cny_per_period', value)}
                    />
                    <ParameterField
                      label={t('admin.grace_period_label', {}, 'Grace period')}
                      detail={t('admin.plans.grace_period_detail', {}, 'Days the subscription may remain available after the current period ends.')}
                      unit={t('admin.plans.unit_days', {}, 'days')}
                      value={form.grace_period_days}
                      onChange={(value) => updateField('grace_period_days', value)}
                    />
                  </div>
                </section>
              </div>

              {lastReceipt ? (
                <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-800">
                  <AdminMutationReceipt receipt={lastReceipt} title={t('admin.latest_receipt', {}, 'Latest receipt')} />
                </div>
              ) : null}
            </section>
          ) : null}

          {activeTab === 'diagnostics' ? (
            <section className="grid gap-4" aria-labelledby="plan-diagnostics-title">
              <div>
                <h4 id="plan-diagnostics-title" className="text-sm font-semibold text-slate-950 dark:text-white">
                  {t('admin.package_advanced_info_diagnostics', {}, 'Diagnostics')}
                </h4>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {t(
                    'admin.plans.diagnostics_desc',
                    {},
                    'Technical identifiers and package posture are available here for support and audit review.'
                  )}
                </p>
              </div>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div className="border-b border-slate-200 pb-2 dark:border-slate-800">
                  <dt className="text-xs text-slate-500 dark:text-slate-400">
                    {t('admin.plans.package_id_label', {}, 'Package ID')}
                  </dt>
                  <dd className="mt-1 font-mono text-slate-950 dark:text-white">{detail.plan.plan_id}</dd>
                </div>
                <div className="border-b border-slate-200 pb-2 dark:border-slate-800">
                  <dt className="text-xs text-slate-500 dark:text-slate-400">
                    {t('admin.plans.latest_version_label', {}, 'Latest version')}
                  </dt>
                  <dd className="mt-1 font-mono text-slate-950 dark:text-white">{latestVersion?.version_label || '—'}</dd>
                </div>
              </dl>
              {packageFitCue ? (
                <div className="border-l-2 border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-700 dark:bg-amber-950/20">
                  <p className="text-sm font-semibold text-slate-950 dark:text-white">{packageFitCue.title}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{packageFitCue.detail}</p>
                </div>
              ) : null}
              <div>
                <p className="text-sm font-semibold text-slate-950 dark:text-white">
                  {t('admin.feature_groups', {}, 'Feature groups')}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {detail.tier_summary.feature_groups.length ? detail.tier_summary.feature_groups.map((feature) => (
                    <span key={feature} className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      {localizeFeatureGroup(t, feature)}
                    </span>
                  )) : <span className="text-sm text-slate-500">{t('admin.feature_groups_empty', {}, 'No feature groups attached.')}</span>}
                </div>
              </div>
              <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
                <p className="text-sm font-semibold text-slate-950 dark:text-white">
                  {t('admin.package_posture', {}, 'Package posture')}
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {operatorNote || t('admin.policy_baseline_missing', {}, 'No package posture note is attached.')}
                </p>
              </div>
            </section>
          ) : null}

        </>
      ) : null}
    </AdminWorkbenchDialog>
  );
}
