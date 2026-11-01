'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';
import {
  BackofficeConfigurationHeader,
  BackofficeEmptyState,
  BackofficePageStack,
} from '@/components/backoffice/BackofficeScaffold';
import {
  AdminConfigurationRow,
  AdminConfigurationTable,
} from '@/components/admin/AdminConfigurationTable';
import { AdminDataTableFrame } from '@/components/admin/AdminDataTableFrame';
import { AdminWorkbenchDialog } from '@/components/admin/AdminWorkbenchDialog';
import { LoadingFallback } from '@/components/ui/LoadingFallback';
import { useToast } from '@/components/ui/Toast';
import { useLocale } from '@/contexts/LocaleContext';
import { ConfirmModal } from '@/components/ui/Modal';
import { useAdminNavigationGuard } from '@/hooks/useAdminNavigationGuard';
import { useCreditPackEditor } from '@/features/admin/credit-packs/use-credit-pack-editor';
import { MANAGED_TIERS, type CreditPackItem } from '@/features/admin/credit-packs/catalog-projection';
import { ADMIN_CURRENCY } from '@/lib/currency';
import { cn, formatDate, formatNumber } from '@/lib/utils';

type PackStatusFilter = 'all' | 'active' | 'inactive';

function normalizeStatusFilter(value: string | null): PackStatusFilter {
  return value === 'active' || value === 'inactive' ? value : 'all';
}

function formatPackAmount(item: CreditPackItem): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: ADMIN_CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(item.amount);
}

export default function AdminCreditPacksPage() {
  const { t } = useLocale();
  const toast = useToast();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusFilter = normalizeStatusFilter(searchParams.get('status'));
  const focusedPackId = searchParams.get('focus') || '';
  const editor = useCreditPackEditor({
    load: t('error.failed_load'), save: t('error.failed_save'),
    unknown: t('admin.credit_packs_operation_unknown'), invalid: t('admin.credit_packs_form_invalid'),
    conflict: t('admin.credit_packs_catalog_changed'),
  }, () => toast.success(t('admin.credit_packs_saved_notice'), t('admin.credit_packs_saved_title')));
  const { catalog, items, draft, draftConflict, conflictRead, intent, blocked, storageBlocked,
    isLoading, isRefreshing, isSaving, catalogFresh, loadedAt, error, editorError, receiptId,
    isDraftDirty, loadCatalog, updateField, handleSaveDraft } = editor;
  const [pendingExit, setPendingExit] = useState<string | null>(null);
  const localAction = useRef<(() => void) | null>(null);
  const { confirmNavigation, cancelNavigation } = useAdminNavigationGuard(isDraftDirty || blocked,
    href => setPendingExit(href || null), href => router.push(href));
  function requestAction(action: () => void) {
    if (isSaving) return;
    if (isDraftDirty || blocked) { localAction.current = action; setPendingExit('__local'); }
    else action();
  }
  useEffect(() => {
    if (!isDraftDirty && !blocked) return;
    const sameRoute = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, location.href);
      if (url.origin !== location.origin || url.pathname !== location.pathname || url.search === location.search) return;
      event.preventDefault(); event.stopPropagation(); setPendingExit(`${url.pathname}${url.search}${url.hash}`);
    };
    document.addEventListener('click', sameRoute, true);
    return () => document.removeEventListener('click', sameRoute, true);
  }, [isDraftDirty, blocked]);
  const updateCatalogUrl = useCallback((updates: { status?: PackStatusFilter | null; focus?: string | null }) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value && value !== 'all') params.set(key, value);
      else params.delete(key);
    });
    const query = params.toString();
    if (query === searchParams.toString()) return;
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const activeCount = useMemo(() => items.filter((item) => item.active).length, [items]);
  const defaultValidityDays = catalog?.default_validity_days;
  const filteredItems = useMemo(
    () => items.filter((item) => statusFilter === 'all' || (statusFilter === 'active' ? item.active : !item.active)),
    [items, statusFilter]
  );
  const selectedItem = (focusedPackId ? filteredItems.find((item) => item.pack_id === focusedPackId) : filteredItems[0]) || null;
  const openEditor = (item: CreditPackItem) => requestAction(() => {
    if (blocked) return;
    updateCatalogUrl({ focus: item.pack_id }); editor.openEditor(item);
  });
  const closeEditor = () => requestAction(editor.closeEditor);
  const toggleDraftTier = (tier: string) => {
    if (!draft) return;
    const tiers = new Set(draft.recommended_for_tiers);
    if (tiers.has(tier)) tiers.delete(tier); else tiers.add(tier);
    updateField('recommended_for_tiers', Array.from(tiers));
  };
  const pendingEvidence = <>
    {intent ? <div role="status" data-ui="credit-pack-pending-operation" className="space-y-2 border border-amber-300 bg-amber-50 p-3 text-sm text-slate-950 dark:border-amber-700 dark:bg-amber-950/20 dark:text-white">
      <p>{t('admin.credit_packs_pending_target', { target: intent.form.label })}</p>
      <p>{t('admin.credit_packs_operation_unknown')}</p>
      <p>{t('admin.credit_packs_submitted_summary', { amount: intent.form.amount, credits: intent.form.ai_credits, days: intent.form.validity_days })}</p>
      <details><summary>{t('admin.credit_packs_operation_evidence')}</summary><p className="break-all">{intent.target}</p><p className="break-all">{intent.operation_id}</p><p className="break-all">{intent.expected_revision}</p></details>
      <button type="button" className="btn btn-secondary btn-sm" disabled={isSaving || storageBlocked} onClick={() => void editor.confirm()}>{t('admin.credit_packs_confirm_operation')}</button>
    </div> : null}
    {storageBlocked ? <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{t('admin.credit_packs_storage_blocked')}</p> : null}
  </>;
  const exitDialog = <ConfirmModal isOpen={pendingExit !== null} title={t('admin.credit_packs_leave_title')}
    message={t(blocked ? 'admin.credit_packs_leave_pending' : 'admin.credit_packs_leave_draft')}
    confirmLabel={t(blocked ? 'admin.credit_packs_leave_keep_pending' : 'admin.credit_packs_discard_leave')}
    cancelLabel={t('common.cancel')} variant="danger"
    onClose={() => { setPendingExit(null); localAction.current = null; cancelNavigation(); }}
    onConfirm={() => {
      const destination = pendingExit; setPendingExit(null);
      if (destination === '__local') { const action = localAction.current; localAction.current = null; action?.(); }
      else if (destination) { editor.closeEditor(); confirmNavigation(destination); }
    }} />;

  if (isLoading && !catalog) return <LoadingFallback />;

  if (!catalog && !isLoading) {
    return (
      <BackofficePageStack>
        {pendingEvidence}{exitDialog}
        <BackofficeEmptyState
          title={t('admin.credit_packs_unavailable_title', {}, 'AI credit pack catalog unavailable')}
          description={error || t('error.failed_load')}
          action={<button type="button" className="btn btn-primary" disabled={Boolean(draft) || blocked} onClick={() => void loadCatalog(true)}>{t('common.retry')}</button>}
        />
      </BackofficePageStack>
    );
  }

  return (
    <BackofficePageStack className="space-y-5">
      {!draft ? pendingEvidence : null}
      {exitDialog}
      {receiptId ? <p role="status" className="text-sm">{t('admin.credit_packs_confirmed_receipt', { id: String(receiptId) })}</p> : null}
      <BackofficeConfigurationHeader
        title={t('admin.credit_packs_title', {}, 'AI credit packs')}
        description={t(
          'admin.credit_packs_directory_desc',
          {},
          'Review the customer purchase catalog first. Edit one pack only when price, credits, validity, visibility, or package fit must change.'
        )}
        secondaryAction={(
          <button type="button" className="btn btn-secondary" onClick={() => void loadCatalog(true)} disabled={isRefreshing || isSaving || Boolean(draft) || blocked}>
            {isRefreshing ? t('common.loading', {}, 'Loading...') : t('common.refresh', {}, 'Refresh')}
          </button>
        )}
        summaryItems={[
          { label: t('admin.credit_packs_active_count', {}, 'Active packs'), value: `${activeCount}/${items.length}` },
          { label: t('admin.credit_packs_default_validity', {}, 'Default validity'), value: t('admin.credit_packs_validity_days_value', { days: String(defaultValidityDays) }, `${defaultValidityDays} days`) },
          { label: t('common.updated_at', {}, 'Updated'), value: loadedAt ? formatDate(loadedAt.toISOString()) : t('common.unknown', {}, 'Unknown') },
        ]}
      />

      {error ? (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
          <span>{error}{items.length > 0 ? <span className="mt-1 block text-xs">{t('admin.credit_packs_retained_notice', {}, 'Showing the last successfully loaded AI credit pack catalog.')}</span> : null}</span>
          <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(draft) || blocked} onClick={() => void loadCatalog(true)}>{t('common.retry')}</button>
        </div>
      ) : null}

      {focusedPackId && !selectedItem ? (
        <div role="status" className="flex items-center gap-3 text-sm">
          <span>{t('admin.credit_packs_focus_missing', {}, 'The requested pack is absent from the current results.')}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => updateCatalogUrl({ focus: null })}>{t('common.clear', {}, 'Clear')}</button>
        </div>
      ) : null}
      <p role="status" aria-live="polite" className="sr-only">
        {t('admin.credit_packs_result_count', { visible: String(filteredItems.length), total: String(items.length) }, '{{visible}} visible · {{total}} total')}
      </p>

      <AdminDataTableFrame
        title={t('admin.credit_packs_directory_title', {}, 'AI credit pack catalog')}
        resultLabel={t('admin.credit_packs_result_count', { visible: String(filteredItems.length), total: String(items.length) }, '{{visible}} visible · {{total}} total')}
        dataUi="credit-pack-directory-table"
        density="compact"
        headerActions={(
          <div className="flex flex-wrap items-center gap-2" aria-label={t('admin.credit_packs_status_filter', {}, 'Pack visibility')}>
            {(['all', 'active', 'inactive'] as PackStatusFilter[]).map((status) => (
              <button
                key={status}
                type="button"
                aria-pressed={statusFilter === status}
                className={cn(
                  'cursor-pointer rounded border px-2.5 py-1 text-xs font-medium transition',
                  statusFilter === status
                    ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-slate-600'
                )}
                onClick={() => requestAction(() => { editor.closeEditor(); updateCatalogUrl({ status, focus: null }); })}
              >
                {status === 'all' ? t('common.all', {}, 'All') : status === 'active' ? t('common.active', {}, 'Active') : t('common.inactive', {}, 'Inactive')}
              </button>
            ))}
          </div>
        )}
      >
        {filteredItems.length ? (
          <table className="w-full min-w-[960px] table-fixed text-left text-sm" aria-label={t('admin.credit_packs_list_label', {}, 'AI credit pack list')}>
            <colgroup>
              <col className="w-[23%]" />
              <col className="w-[13%]" />
              <col className="w-[13%]" />
              <col className="w-[11%]" />
              <col className="w-[21%]" />
              <col className="w-[10%]" />
              <col className="w-[9%]" />
            </colgroup>
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-400">
              <tr>
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-1.5 dark:bg-slate-900" scope="col">{t('admin.credit_packs_pack_label', {}, 'Pack')}</th>
                <th className="px-3 py-1.5" scope="col">{t('admin.credit_packs_credits_label', {}, 'Credits')}</th>
                <th className="px-3 py-1.5" scope="col">{t('admin.credit_packs_amount_label', {}, 'Amount')}</th>
                <th className="px-3 py-1.5" scope="col">{t('admin.credit_packs_validity_label', {}, 'Validity')}</th>
                <th className="px-3 py-1.5" scope="col">{t('admin.credit_packs_recommended_tiers_label', {}, 'Recommended')}</th>
                <th className="px-3 py-1.5" scope="col">{t('admin.credit_packs_visibility_toggle', {}, 'Customer visible')}</th>
                <th className="sticky right-0 z-10 bg-slate-50 px-3 py-1.5 text-right dark:bg-slate-900" scope="col">{t('common.actions', {}, 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredItems.map((item) => {
                const selected = selectedItem?.pack_id === item.pack_id;
                const cellBackground = selected
                  ? 'bg-blue-50/70 dark:bg-blue-950/20'
                  : 'bg-white dark:bg-slate-950';
                return (
                  <tr
                    key={item.pack_id}
                    data-ui="credit-pack-directory-row"
                    data-pack-id={item.pack_id}
                    data-selected={selected ? 'true' : 'false'}
                    className={selected ? 'bg-blue-50/70 dark:bg-blue-950/20' : 'bg-white hover:bg-slate-50/70 dark:bg-slate-950 dark:hover:bg-slate-900/40'}
                  >
                    <th className={`sticky left-0 z-[5] px-3 py-2 align-middle ${cellBackground}`} scope="row">
                      <span className="block truncate font-semibold text-slate-950 dark:text-white">{item.label}</span>
                      {items.filter(pack => pack.label === item.label).length > 1 ? <span className="mt-0.5 block break-all text-xs font-normal text-slate-500 dark:text-slate-400">{item.pack_id}</span> : null}
                    </th>
                    <td className="px-3 py-2 align-middle font-semibold tabular-nums text-slate-950 dark:text-white">{formatNumber(item.ai_credits)}</td>
                    <td className="px-3 py-2 align-middle font-semibold tabular-nums text-slate-950 dark:text-white">{formatPackAmount(item)}</td>
                    <td className="px-3 py-2 align-middle text-slate-700 dark:text-slate-200">{t('admin.credit_packs_validity_days_value', { days: String(item.validity_days) }, `${item.validity_days} days`)}</td>
                    <td className="px-3 py-2 align-middle">
                      <div className="flex flex-wrap gap-1.5">
                        {item.recommended_for_tiers.length
                          ? item.recommended_for_tiers.map((tier) => <span key={tier} className="rounded border border-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300">{tier}</span>)
                          : <span className="text-xs text-slate-500 dark:text-slate-400">{t('admin.credit_packs_no_recommended_tiers', {}, 'None')}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <BackofficeStatusBadge status={item.active ? 'published' : 'draft'} label={t(item.active ? 'common.active' : 'common.inactive', {}, item.active ? 'Active' : 'Inactive')} />
                    </td>
                    <td className={`sticky right-0 z-[5] px-3 py-2 text-right align-middle ${cellBackground}`}>
                      <button type="button" className="btn btn-secondary btn-sm" disabled={!catalogFresh || isSaving || blocked} onClick={() => openEditor(item)}>
                        {t('admin.credit_packs_edit_action', {}, 'Edit')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <BackofficeEmptyState title={t('admin.credit_packs_empty_title', {}, 'No packs in this view')} description={t('admin.credit_packs_empty_desc', {}, 'Clear the visibility filter to inspect the full catalog.')} />
        )}
      </AdminDataTableFrame>

      <AdminWorkbenchDialog
        open={Boolean(draft)}
        title={draft ? t('admin.credit_packs_edit_title', { name: draft.label }, 'Edit {{name}}') : ''}
        titleId="credit-pack-workbench-title"
        headerAccessory={draft ? <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{draft.pack_id}</span> : null}
        error={intent ? undefined : editorError || (draftConflict ? t('admin.credit_packs_revision_conflict') : undefined)}
        saving={isSaving}
        closeLabel={t('common.close', {}, 'Close')}
        cancelLabel={t('common.cancel', {}, 'Cancel')}
        saveLabel={t('admin.credit_packs_save_pack_action', {}, 'Save pack')}
        savingLabel={t('common.saving', {}, 'Saving...')}
        footerNotice={t('admin.credit_packs_edit_boundary', {}, 'This edit changes future customer purchases only. Existing payment orders and package entitlement remain unchanged.')}
        footerActions={(
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary btn-sm" disabled={isSaving} onClick={closeEditor}>{t('common.cancel', {}, 'Cancel')}</button>
            {draftConflict ? <button type="button" className="btn btn-secondary btn-sm" disabled={isRefreshing} onClick={() => void loadCatalog(true, true)}>{t('admin.credit_packs_read_latest')}</button> : null}
            {conflictRead ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => requestAction(editor.adoptLatest)}>{t('admin.credit_packs_adopt_latest')}</button> : null}
            <button type="submit" className="btn btn-primary btn-sm" disabled={isSaving || blocked || draftConflict || !catalogFresh || !isDraftDirty}>{isSaving ? t('common.saving', {}, 'Saving...') : t('admin.credit_packs_save_pack_action', {}, 'Save pack')}</button>
          </div>
        )}
        width="compact"
        density="compact"
        onClose={closeEditor}
        onSubmit={() => void handleSaveDraft()}
      >
        {pendingEvidence}
        {draftConflict ? <p role="status" className="text-sm">{t('admin.credit_packs_conflict_preserved')}</p> : null}
        {conflictRead ? <div role="status" className="text-sm"><p>{t('admin.credit_packs_latest_review')}</p>{conflictRead.items.map(item => <p key={item.pack_id}>{item.label} · {t('admin.credit_packs_submitted_summary', { amount: String(item.amount), credits: String(item.ai_credits), days: String(item.validity_days) })} · {t(item.active ? 'common.active' : 'common.inactive')} · {item.recommended_for_tiers.join(', ')}</p>)}</div> : null}
        {draft ? (
          <fieldset disabled={isSaving || blocked || !catalogFresh} className="min-w-0">
          <AdminConfigurationTable
            ariaLabel={t('admin.credit_packs_edit_title', { name: draft.label }, 'Edit {{name}}')}
            itemHeading={t('admin.credit_packs_configuration_item', {}, 'Setting')}
            valueHeading={t('admin.credit_packs_configuration_value', {}, 'Current value')}
            detailHeading={t('admin.credit_packs_configuration_detail', {}, 'Action / note')}
            density="compact"
          >
            <AdminConfigurationRow
              rowId="credit-pack-label"
              label={t('admin.credit_packs_pack_label', {}, 'Pack')}
              value={<input aria-label={t('admin.credit_packs_pack_label', {}, 'Pack')} className="input w-full" required maxLength={96} value={draft.label} onChange={(event) => updateField('label', event.target.value)} />}
              detail={t('admin.credit_packs_label_note', {}, 'Customer-facing catalog name.')}
            />
            <AdminConfigurationRow
              rowId="credit-pack-credits"
              label={t('admin.credit_packs_credits_label', {}, 'Credits')}
              value={<input aria-label={t('admin.credit_packs_credits_label', {}, 'Credits')} className="input w-36" type="number" required min={1} max={10000000} step={1} value={draft.ai_credits} onChange={(event) => updateField('ai_credits', event.target.value)} />}
              detail={t('admin.credit_packs_credits_note', {}, 'Granted after a successful future purchase.')}
            />
            <AdminConfigurationRow
              rowId="credit-pack-amount"
              label={t('admin.credit_packs_amount_label', {}, 'Amount')}
              value={<input aria-label={t('admin.credit_packs_amount_label', {}, 'Amount')} className="input w-36" type="number" required min={0.000001} step={0.000001} value={draft.amount} onChange={(event) => updateField('amount', event.target.value)} />}
              detail={t('admin.credit_packs_currency_fixed_cny', {}, 'RMB pricing is fixed.')}
            />
            <AdminConfigurationRow
              rowId="credit-pack-validity"
              label={t('admin.credit_packs_validity_label', {}, 'Validity')}
              value={<input aria-label={t('admin.credit_packs_validity_label', {}, 'Validity')} className="input w-36" type="number" required min={1} max={1095} step={1} value={draft.validity_days} onChange={(event) => updateField('validity_days', event.target.value)} />}
              detail={t('admin.credit_packs_validity_note', {}, 'Days after the payment order is completed.')}
            />
            <AdminConfigurationRow
              rowId="credit-pack-visibility"
              label={t('admin.credit_packs_visibility_toggle', {}, 'Customer visible')}
              value={<label className="inline-flex cursor-pointer items-center gap-2"><input type="checkbox" checked={draft.active} onChange={(event) => updateField('active', event.target.checked)} /><span>{t(draft.active ? 'common.active' : 'common.inactive', {}, draft.active ? 'Active' : 'Inactive')}</span></label>}
              detail={t('admin.credit_packs_visibility_note', {}, 'Controls future customer catalog visibility only.')}
            />
            <AdminConfigurationRow
              rowId="credit-pack-recommended-tiers"
              label={t('admin.credit_packs_recommended_tiers_label', {}, 'Recommended')}
              value={<div className="flex flex-wrap gap-1.5">{MANAGED_TIERS.map((tier) => <label key={tier} className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:text-slate-200"><input type="checkbox" checked={draft.recommended_for_tiers.includes(tier)} onChange={() => toggleDraftTier(tier)} /><span>{tier}</span></label>)}</div>}
              detail={t('admin.credit_packs_recommended_note', {}, 'Presentation guidance; package entitlement does not change.')}
            />
          </AdminConfigurationTable>
          </fieldset>
        ) : null}
      </AdminWorkbenchDialog>
    </BackofficePageStack>
  );
}
