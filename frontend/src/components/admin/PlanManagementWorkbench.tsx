'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmModal } from '@/components/ui/Modal';
import { useAdminNavigationGuard } from '@/hooks/useAdminNavigationGuard';
import { usePlanEditor } from '@/features/admin/plans/use-plan-editor';
import { buildInitialForm, buildBaselineFieldPatch, type PlanConfirmation } from '@/features/admin/plans/plan-projection';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';
import { AdminMutationReceipt } from '@/components/admin/AdminMutationReceipt';
import { AdminSettingsDisclosure } from '@/components/admin/AdminSettingsDisclosure';
import { AdminWorkbenchDialog } from '@/components/admin/AdminWorkbenchDialog';
import { PlanSalesControl } from '@/components/admin/PlanSalesControl';
import { LoadingFallback } from '@/components/ui/LoadingFallback';
import { useLocale } from '@/contexts/LocaleContext';
import {
  localizeFeatureGroup,
  localizeOperatorNote,
  localizePackageAlias,
  localizePackageFitCue,
} from '@/lib/admin-plan-copy';
import { translateStatusLabel } from '@/lib/status-display';
import { formatNumber as formatInteger } from '@/lib/utils';

type ManagementTab = 'parameters' | 'diagnostics';

type PlanManagementWorkbenchProps = {
  open: boolean;
  planId: string;
  fallbackName: string;
  activeSubscriptionCount: number;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onParametersConfirmed: (current: PlanConfirmation) => void;
};

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
  onParametersConfirmed,
}: PlanManagementWorkbenchProps) {
  const { t } = useLocale();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ManagementTab>('parameters');
  const [pendingExit, setPendingExit] = useState<string | null>(null);
  const editor = usePlanEditor(planId, open, {
    load: t('error.failed_load'), save: t('error.failed_save'),
    unknown: t('admin.plans.operation_unconfirmed'), confirmed: t('admin.plans.operation_confirmed'),
  }, onParametersConfirmed);
  const { detail, setDetail, form, setForm, dirty: hasUnsavedChanges, intent,
    isLoading, isSaving, setIsSaving, lastReceipt, error, notice, setNotice, revisionConflict, conflictRead,
    loadDetail, updateField, handleSave } = editor;
  const operationBlocked = Boolean(intent) || editor.storageBlocked;
  const awaitingRead = operationBlocked || editor.salesReadRequired;
  const { confirmNavigation, cancelNavigation } = useAdminNavigationGuard(
    open && (hasUnsavedChanges || operationBlocked),
    href => setPendingExit(href || null), href => router.push(href),
  );
  // The shared guard intentionally leaves same-route links to their owner.
  // A package focus change is an object switch, so guard it locally as well.
  useEffect(() => {
    if (!open || (!hasUnsavedChanges && !operationBlocked)) return;
    const sameRoute = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, location.href);
      if (url.origin !== location.origin || url.pathname !== location.pathname
        || url.searchParams.get('focus') === new URL(location.href).searchParams.get('focus')) return;
      event.preventDefault(); event.stopPropagation();
      setPendingExit(`${url.pathname}${url.search}${url.hash}`);
    };
    document.addEventListener('click', sameRoute, true);
    return () => document.removeEventListener('click', sameRoute, true);
  }, [open, hasUnsavedChanges, operationBlocked]);
  function requestClose() {
    if (hasUnsavedChanges || operationBlocked) setPendingExit('__close');
    else onClose();
  }
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
  const restoreSavedValues = () => {
    if (!detail || awaitingRead || isSaving) return;
    setForm(buildInitialForm(detail));
    setNotice(t('admin.plans.saved_values_restored_notice', {}, 'Saved values restored.'));
  };
  const applyDefaultValues = () => {
    if (awaitingRead || isSaving) return;
    setForm(current => ({ ...current, ...baselinePatch }));
    setNotice(t('admin.plans.default_values_applied_notice', { tier: localizedAlias }));
  };

  const tabs: Array<{ id: ManagementTab; label: string }> = [
    { id: 'parameters', label: t('admin.plans.parameters_tab', {}, 'Package parameters') },
    { id: 'diagnostics', label: t('admin.package_advanced_info_diagnostics', {}, 'Diagnostics') },
  ];

  return (
    <>
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
          <button type="button" className="btn btn-secondary" disabled={isSaving} onClick={requestClose}>
            {t('common.close', {}, 'Close')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!detail?.latest_version || !editor.ready || isLoading || isSaving || awaitingRead || revisionConflict}>
            {isSaving ? t('common.saving', {}, 'Saving...') : t('common.save', {}, 'Save')}
          </button>
        </div>
      )}
      width="wide"
      density="compact"
      onClose={requestClose}
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

      {revisionConflict ? (
        <div role="alert" data-ui="plan-revision-conflict" className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-slate-950 dark:border-amber-700 dark:bg-amber-950/20 dark:text-white">
          <p>{t('admin.plans.revision_conflict', {}, 'This package changed after you loaded it. Your draft is retained. Saving is blocked until you review the latest values.')}</p>
          <button type="button" className="btn btn-secondary" disabled={isLoading} onClick={() => void loadDetail(true, true)}>
            {t('admin.plans.read_latest', {}, 'Read latest values (keep draft)')}
          </button>
          {conflictRead ? (
            <div className="space-y-2">
              <p>{t('admin.plans.latest_values_review', { price: String(conflictRead.sales_offer?.amount ?? '—'), credits: buildInitialForm(conflictRead).monthly_included_points, status: translateStatusLabel(conflictRead.sales_offer?.status || conflictRead.plan.status, t) }, 'Latest saved package: {{credits}} AI credits, CNY {{price}}; sales: {{status}}. Your inputs below are still your draft.')}</p>
              <button type="button" className="btn btn-secondary" onClick={() => {
                editor.adoptLatest();
              }}>
                {t('admin.plans.replace_draft_latest', {}, 'Discard draft and edit latest values')}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {intent ? <div role="status" data-ui="plan-pending-operation" className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-slate-950 dark:border-amber-700 dark:bg-amber-950/20 dark:text-white">
        <p>{t('admin.plans.operation_pending', { plan: intent.plan_id })}</p>
        <p>{t('admin.plans.submitted_summary', { price: String(intent.values.sales_price_cny), credits: String(intent.values.monthly_included_points) })}</p>
        <details><summary className="cursor-pointer">{t('admin.plans.operation_evidence')}</summary>
          <p className="break-all">{intent.operation_id}</p><p className="break-all">{intent.revision}</p>
        </details>
        <button type="button" className="btn btn-secondary" disabled={isSaving || isLoading || editor.storageBlocked} onClick={() => void editor.confirm()}>{t('admin.plans.confirm_operation')}</button>
      </div> : null}
      {editor.salesReadRequired ? <div role="status" className="space-y-2 text-sm">
        <p>{t('admin.saved_awaiting_read', {}, 'Write succeeded. Reload to confirm the saved state before editing again.')}</p>
        <button type="button" className="btn btn-secondary" disabled={isLoading} onClick={() => void loadDetail()}>{t('common.retry')}</button>
      </div> : null}
      {editor.storageBlocked ? <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{t('admin.plans.storage_blocked')}</p> : null}
      {detail ? (
        <fieldset disabled={isSaving || isLoading || awaitingRead} className="min-w-0">
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
              {detail?.sales_offer ? (
                <PlanSalesControl
                  key={planId}
                  planId={planId}
                  status={detail.sales_offer.status}
                  disabled={isSaving || hasUnsavedChanges || revisionConflict || awaitingRead}
                  onSavingChange={setIsSaving}
                  onSaved={async (status) => {
                    editor.setSalesReadRequired(true);
                    setDetail((current) => current?.sales_offer ? {
                      ...current, sales_offer: { ...current.sales_offer, status },
                    } : current);
                    await loadDetail(false);
                    await onSaved();
                  }}
                />
              ) : null}
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
                      label={t('admin.vector_documents_limit', {}, 'Text knowledge capacity')}
                      detail={t('admin.vector_documents_limit_detail', {}, 'Account-wide indexed articles, pages, and comments. Images count separately; full capacity limits new entries, not updates.')}
                      unit={t('admin.plans.unit_documents', {}, 'entries')}
                      value={form.max_vector_documents}
                      onChange={(value) => updateField('max_vector_documents', value)}
                    />
                    <ParameterField
                      label={t('admin.media_images_limit', {}, 'Image knowledge capacity')}
                      detail={t('admin.media_images_limit_detail', {}, 'Account-wide indexed media-library images, including images outside articles. This is saved capacity, not recognition calls; existing entries can be refreshed.')}
                      unit={t('admin.plans.unit_images', {}, 'images')}
                      value={form.max_media_images}
                      onChange={(value) => updateField('max_media_images', value)}
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
                      label={t('admin.grace_period_label', {}, 'Grace period')}
                      detail={t('admin.plans.grace_period_detail', {}, 'Days the subscription may remain available after the current period ends.')}
                      unit={t('admin.plans.unit_days', {}, 'days')}
                      value={form.grace_period_days}
                      onChange={(value) => updateField('grace_period_days', value)}
                    />
                  </div>
                </section>

                <AdminSettingsDisclosure
                  dataUi="plan-cost-monitoring"
                  title={t('admin.plans.cost_monitoring_title', {}, 'Advanced cost monitoring')}
                  description={t(
                    'admin.plans.cost_monitoring_desc',
                    {},
                    'Internal monitoring only. Set 0 to disable this plan-level threshold; it does not change the customer price or credits.'
                  )}
                  statusLabel={Number(form.max_cost_cny_per_period) === 0 ? t('common.disabled', {}, 'Disabled') : t('common.enabled', {}, 'Enabled')}
                  statusTone={Number(form.max_cost_cny_per_period) === 0 ? 'neutral' : 'configured'}
                >
                  <ParameterField
                    label={t('admin.model_cost_budget_cny', {}, 'Model cost budget (CNY / period)')}
                    detail={t(
                      'admin.period_cost_budget_detail',
                      {},
                      'Internal provider-cost monitoring threshold. Set 0 to disable monitoring; it does not change the sales price.'
                    )}
                    unit={t('admin.plans.unit_cny_period', {}, 'CNY / period')}
                    value={form.max_cost_cny_per_period}
                    min={0}
                    step={0.01}
                    onChange={(value) => updateField('max_cost_cny_per_period', value)}
                  />
                </AdminSettingsDisclosure>
              </div>

              {lastReceipt ? (
                <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-800">
                  <AdminMutationReceipt summary={t('admin.plans.operation_confirmed')} receipt={lastReceipt} title={t('admin.latest_receipt', {}, 'Latest receipt')} />
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

        </fieldset>
      ) : null}
    </AdminWorkbenchDialog>
    <ConfirmModal
      isOpen={pendingExit !== null}
      title={t('admin.plans.leave_title')}
      message={t(intent ? 'admin.plans.leave_pending' : editor.storageBlocked ? 'admin.plans.leave_storage' : 'admin.plans.leave_draft')}
      confirmLabel={t(operationBlocked ? 'admin.plans.leave_keep_pending' : 'admin.plans.discard_leave')}
      cancelLabel={t('common.cancel')}
      variant="danger"
      onClose={() => { setPendingExit(null); cancelNavigation(); }}
      onConfirm={() => {
        const destination = pendingExit;
        setPendingExit(null);
        if (destination === '__close') onClose();
        else if (destination) confirmNavigation(destination);
      }}
    />
    </>
  );
}
