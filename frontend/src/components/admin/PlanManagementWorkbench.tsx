'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BackofficeIdentifier } from '@/components/backoffice/BackofficeIdentifier';
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
import { ADMIN_CURRENCY } from '@/lib/currency';
import { resolveUiErrorMessage } from '@/lib/errors';
import { translateStatusLabel } from '@/lib/status-display';
import { formatCurrency, formatDate, formatNumber as formatInteger } from '@/lib/utils';

type PlanRecord = {
  plan_id: string;
  name: string;
  status: string;
  description: string;
  metadata?: Record<string, unknown>;
};

type PlanVersionRecord = {
  plan_version_id: string;
  version_label: string;
  status: string;
  currency: string;
  entitlements: Record<string, unknown>;
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
  versions: PlanVersionRecord[];
  latest_version?: PlanVersionRecord | null;
  sales_offer?: {
    amount: number;
    currency: string;
  } | null;
  tier_summary: TierSummary;
  package_fit_cues: PackageFitCue[];
  subscriptions: Array<unknown>;
};

type PlanVersionFormState = {
  plan_version_id: string;
  version_label: string;
  status: string;
  monthly_included_points: string;
  site_limit: string;
  max_vector_documents: string;
  max_cost_cny_per_period: string;
  sales_price_cny: string;
  max_active_runs: string;
  max_batch_items: string;
  grace_period_days: string;
  entitlements_json: string;
  metadata_override_json: string;
  budgets_override_json: string;
  concurrency_override_json: string;
  policy_override_json: string;
};

type ManagementTab = 'parameters' | 'diagnostics' | 'history';

type PlanManagementWorkbenchProps = {
  open: boolean;
  planId: string;
  fallbackName: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

const planManagementClient = createApiClient({ idempotencyPrefix: 'admin_plan_management' });

function prettyJson(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

function parseJsonObject(raw: string, label: string): Record<string, unknown> {
  const value = raw.trim();
  if (!value) return {};
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function mergeJsonObjects(
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  Object.entries(override).forEach(([key, value]) => {
    const current = result[key];
    if (
      current &&
      typeof current === 'object' &&
      !Array.isArray(current) &&
      value &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      result[key] = mergeJsonObjects(
        current as Record<string, unknown>,
        value as Record<string, unknown>
      );
      return;
    }
    result[key] = value;
  });
  return result;
}

function numberField(value: unknown): string {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? String(numeric) : '0';
}

function numericValue(value: unknown): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function buildInitialForm(detail: PlanDetailPayload | null): PlanVersionFormState {
  const latestVersion = detail?.latest_version || detail?.versions?.[0] || null;
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
  const nextVersionNumber = Number(detail?.versions?.length || 0) + 1;

  return {
    plan_version_id: latestVersion?.plan_version_id || `${detail?.plan?.plan_id || 'plan'}_v${nextVersionNumber}`,
    version_label: latestVersion?.version_label || `v${nextVersionNumber}`,
    status: latestVersion?.status || 'published',
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
    entitlements_json: prettyJson(latestVersion?.entitlements || canonicalShell?.entitlements || {}),
    metadata_override_json: '{}',
    budgets_override_json: '{}',
    concurrency_override_json: '{}',
    policy_override_json: '{}',
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

function JsonField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-sm">
      <span className="mb-1.5 block font-medium text-slate-700 dark:text-slate-300">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="input min-h-28 w-full font-mono text-xs"
      />
    </label>
  );
}

function ParameterField({
  label,
  detail,
  value,
  onChange,
  min = 0,
  step = 1,
}: {
  label: string;
  detail: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  step?: number;
}) {
  return (
    <label className="grid content-start gap-1.5 border-b border-slate-200 py-3 dark:border-slate-800">
      <span className="text-sm font-semibold text-slate-950 dark:text-white">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="input h-9 w-full"
        type="number"
        min={min}
        step={step}
      />
      <span className="text-xs leading-5 text-slate-500 dark:text-slate-400">{detail}</span>
    </label>
  );
}

export function PlanManagementWorkbench({
  open,
  planId,
  fallbackName,
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

  const latestVersion = detail?.latest_version || detail?.versions?.[0] || null;
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

  const updateField = (field: keyof PlanVersionFormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSave = async () => {
    if (!detail || isSaving) return;
    setIsSaving(true);
    setError(null);
    setNotice(null);
    setLastReceipt(null);
    try {
      const currentVersion = detail.latest_version || detail.versions[0] || null;
      const baseMetadata = mergeJsonObjects(
        mergeJsonObjects(
          {
            tier_id: detail.tier_summary?.tier_id || '',
            source: (currentVersion?.metadata?.source as string | undefined) || 'operator_plan_management_workbench',
          },
          currentVersion?.metadata || {}
        ),
        {
          monthly_included_points: Number(form.monthly_included_points || 0),
          site_limit: Number(form.site_limit || 0),
          max_vector_documents: Number(form.max_vector_documents || 0),
          max_batch_items: Number(form.max_batch_items || 0),
        }
      );
      const payload = {
        plan_version_id: form.plan_version_id,
        version_label: form.version_label,
        status: form.status,
        currency: ADMIN_CURRENCY,
        entitlements: parseJsonObject(form.entitlements_json, 'Entitlements'),
        budgets: mergeJsonObjects(
          {
            max_ai_credits_per_period: Number(form.monthly_included_points || 0),
            max_runs_per_period: 0,
            max_tokens_per_period: 0,
            max_cost_cny_per_period: Number(form.max_cost_cny_per_period || 0),
          },
          parseJsonObject(form.budgets_override_json, 'Budgets override')
        ),
        concurrency: mergeJsonObjects(
          { max_active_runs: Number(form.max_active_runs || 0) },
          parseJsonObject(form.concurrency_override_json, 'Concurrency override')
        ),
        policy: mergeJsonObjects(
          {
            subscription: { grace_period_days: Number(form.grace_period_days || 0) },
            budgets: {},
          },
          parseJsonObject(form.policy_override_json, 'Policy override')
        ),
        metadata: mergeJsonObjects(
          baseMetadata,
          parseJsonObject(form.metadata_override_json, 'Metadata override')
        ),
        sales_price_cny: Number(form.sales_price_cny || 0),
      };
      const data = (await planManagementClient.request<{ receipt?: AdminMutationReceiptPayload | null }>(
        `/api/admin/plans/${encodeURIComponent(planId)}/versions`,
        { method: 'POST', body: payload }
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
    { id: 'history', label: t('admin.package_advanced_info_history', {}, 'Release history') },
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
      footerNotice={t(
        'admin.plans.workbench_notice',
        {},
        'Saving publishes these values as the current package version.'
      )}
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
          <dl className="grid gap-px overflow-hidden rounded border border-slate-200 bg-slate-200 sm:grid-cols-3 dark:border-slate-800 dark:bg-slate-800">
            {[
              [t('admin.plans.package_id_label', {}, 'Package ID'), detail.plan.plan_id],
              [t('admin.plans.latest_version_label', {}, 'Latest version'), latestVersion?.version_label || '—'],
              [t('admin.active_subscriptions'), formatInteger(detail.subscriptions.length)],
            ].map(([label, value]) => (
              <div key={label} className="bg-white px-3 py-2 dark:bg-slate-950">
                <dt className="text-[0.68rem] text-slate-500 dark:text-slate-400">{label}</dt>
                <dd className="mt-1 font-semibold text-slate-950 dark:text-white">{value}</dd>
              </div>
            ))}
          </dl>

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
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm(buildInitialForm(detail))}>
                    {t('admin.reset_to_latest_version', {}, 'Restore saved values')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setForm((current) => ({ ...current, ...baselinePatch }))}
                  >
                    {t('admin.apply_tier_baseline', { tier: localizedAlias }, `Restore ${localizedAlias} suggested values`)}
                  </button>
                </div>
              </div>

              <div className="mt-2 grid gap-x-6 sm:grid-cols-2">
                <ParameterField
                  label={t('admin.included_points', {}, 'Package AI credits')}
                  detail={t('admin.included_points_detail', {}, 'Current-period package AI credits shared by all sites on this account.')}
                  value={form.monthly_included_points}
                  onChange={(value) => updateField('monthly_included_points', value)}
                />
                <ParameterField
                  label={t('admin.site_limit', {}, 'Site limit')}
                  detail={t('admin.site_limit_detail', {}, 'Maximum sites covered by the current customer subscription.')}
                  value={form.site_limit}
                  min={1}
                  onChange={(value) => updateField('site_limit', value)}
                />
                <ParameterField
                  label={t('admin.vector_documents_limit', {}, 'Knowledge articles')}
                  detail={t('admin.vector_documents_limit_detail', {}, 'Account-level article capacity for Site Knowledge indexing.')}
                  value={form.max_vector_documents}
                  onChange={(value) => updateField('max_vector_documents', value)}
                />
                <ParameterField
                  label={t('admin.sales_price_cny', {}, 'Sales price (CNY / 30 days)')}
                  detail={t('admin.sales_price_cny_detail', {}, 'Customer-facing 30-day price used for new Alipay orders.')}
                  value={form.sales_price_cny}
                  step={0.01}
                  onChange={(value) => updateField('sales_price_cny', value)}
                />
                <ParameterField
                  label={t('admin.model_cost_budget_cny', {}, 'Model cost budget (CNY / period)')}
                  detail={t('admin.period_cost_budget_detail', {}, 'Internal provider-cost monitoring threshold; it does not change the sales price.')}
                  value={form.max_cost_cny_per_period}
                  step={0.01}
                  onChange={(value) => updateField('max_cost_cny_per_period', value)}
                />
                <ParameterField
                  label={t('admin.concurrency', {}, 'Concurrency')}
                  detail={t('admin.plan_template_concurrency_detail', {}, 'Maximum tasks that may run at the same time for this package.')}
                  value={form.max_active_runs}
                  onChange={(value) => updateField('max_active_runs', value)}
                />
                <ParameterField
                  label={t('admin.batch_ceiling', {}, 'Batch ceiling')}
                  detail={t('admin.batch_ceiling_detail', {}, 'Maximum tasks allowed in one operator batch.')}
                  value={form.max_batch_items}
                  onChange={(value) => updateField('max_batch_items', value)}
                />
                <ParameterField
                  label={t('admin.grace_period_label', {}, 'Grace period')}
                  detail={t('admin.plans.grace_period_detail', {}, 'Days the subscription may remain available after the current period ends.')}
                  value={form.grace_period_days}
                  onChange={(value) => updateField('grace_period_days', value)}
                />
              </div>

              <details className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-800">
                <summary className="cursor-pointer text-sm font-semibold text-slate-700 dark:text-slate-300">
                  {t('admin.plan_advanced_json_title', {}, 'Advanced JSON overrides')}
                </summary>
                <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {t(
                    'admin.plan_advanced_json_rare',
                    {},
                    'Rare override only. Normal package maintenance should not require raw entitlement or policy JSON.'
                  )}
                </p>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <JsonField label={t('admin.entitlements', {}, 'Entitlements')} value={form.entitlements_json} onChange={(value) => updateField('entitlements_json', value)} />
                  <JsonField label={t('admin.metadata_override', {}, 'Metadata override')} value={form.metadata_override_json} onChange={(value) => updateField('metadata_override_json', value)} />
                  <JsonField label={t('admin.budgets_override', {}, 'Budgets override')} value={form.budgets_override_json} onChange={(value) => updateField('budgets_override_json', value)} />
                  <JsonField label={t('admin.concurrency_override', {}, 'Concurrency override')} value={form.concurrency_override_json} onChange={(value) => updateField('concurrency_override_json', value)} />
                  <JsonField label={t('admin.policy_override', {}, 'Policy override')} value={form.policy_override_json} onChange={(value) => updateField('policy_override_json', value)} />
                </div>
              </details>

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
                  {t('admin.package_advanced_info_desc', {}, 'Use this only for diagnostics, audit, or release review.')}
                </p>
              </div>
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

          {activeTab === 'history' ? (
            <section aria-labelledby="plan-history-title">
              <h4 id="plan-history-title" className="text-sm font-semibold text-slate-950 dark:text-white">
                {t('admin.package_advanced_info_history', {}, 'Release history')}
              </h4>
              {detail.versions.length ? (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[36rem] text-left text-sm">
                    <thead className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                      <tr>
                        <th className="px-2 py-2 font-semibold">{t('admin.plans.latest_version_label', {}, 'Version')}</th>
                        <th className="px-2 py-2 font-semibold">{t('common.status')}</th>
                        <th className="px-2 py-2 font-semibold">{t('common.created')}</th>
                        <th className="px-2 py-2 font-semibold">{t('common.currency', {}, 'Currency')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.versions.map((version) => (
                        <tr key={version.plan_version_id} className="border-b border-slate-200 last:border-b-0 dark:border-slate-800">
                          <td className="px-2 py-2">
                            <p className="font-semibold text-slate-950 dark:text-white">{version.version_label}</p>
                            <BackofficeIdentifier value={version.plan_version_id} />
                          </td>
                          <td className="px-2 py-2">
                            <BackofficeStatusBadge status={version.status} label={translateStatusLabel(version.status, t)} />
                          </td>
                          <td className="px-2 py-2 text-slate-600 dark:text-slate-300">{formatDate(version.created_at)}</td>
                          <td className="px-2 py-2 text-slate-600 dark:text-slate-300">{version.currency}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                  {t('admin.plans.history_empty', {}, 'No package versions have been published yet.')}
                </p>
              )}
              {detail.sales_offer ? (
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  {t('admin.sales_price_cny', {}, 'Sales price')}: {formatCurrency(detail.sales_offer.amount, detail.sales_offer.currency || ADMIN_CURRENCY)}
                </p>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}
    </AdminWorkbenchDialog>
  );
}
