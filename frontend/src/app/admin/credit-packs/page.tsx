'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';
import {
  BackofficeEmptyState,
  BackofficeLayer,
  BackofficePageStack,
  BackofficeSummaryStrip,
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
import { createApiClient } from '@/lib/api-client';
import { ADMIN_CURRENCY } from '@/lib/currency';
import { resolveUiErrorMessage } from '@/lib/errors';
import { cn, formatDate, formatNumber } from '@/lib/utils';

type CreditPackItem = {
  pack_id: string;
  label: string;
  ai_credits: number;
  amount: number;
  currency: string;
  recommended_for_tiers: string[];
  validity_days: number;
  active: boolean;
};

type CreditPackCatalogPayload = {
  catalog_version: string;
  period_policy: string;
  expiry_policy: string;
  default_validity_days: number;
  items: CreditPackItem[];
  updated_at?: string;
};

type PackStatusFilter = 'all' | 'active' | 'inactive';

const MANAGED_TIERS = ['free', 'plus', 'pro', 'agency'] as const;
const creditPacksClient = createApiClient({ idempotencyPrefix: 'admin_credit_packs' });

function normalizeItem(item: CreditPackItem): CreditPackItem {
  return {
    ...item,
    ai_credits: Math.max(1, Number(item.ai_credits || 0)),
    amount: Math.max(0.01, Number(item.amount || 0)),
    validity_days: Math.max(1, Number(item.validity_days || 365)),
    currency: ADMIN_CURRENCY,
    recommended_for_tiers: Array.isArray(item.recommended_for_tiers) ? item.recommended_for_tiers : [],
    active: Boolean(item.active),
  };
}

function normalizeStatusFilter(value: string | null): PackStatusFilter {
  return value === 'active' || value === 'inactive' ? value : 'all';
}

function formatPackAmount(item: CreditPackItem): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: ADMIN_CURRENCY,
    minimumFractionDigits: 2,
  }).format(item.amount);
}

async function fetchCatalog(): Promise<CreditPackCatalogPayload> {
  return (await creditPacksClient.request<CreditPackCatalogPayload>('/api/admin/credit-packs')).data;
}

async function saveCatalog(items: CreditPackItem[]): Promise<CreditPackCatalogPayload> {
  return (await creditPacksClient.request<CreditPackCatalogPayload>('/api/admin/credit-packs', {
    method: 'PATCH',
    body: { items },
  })).data;
}

export default function AdminCreditPacksPage() {
  const { t } = useLocale();
  const toast = useToast();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusFilter = normalizeStatusFilter(searchParams.get('status'));
  const focusedPackId = searchParams.get('focus') || '';
  const [catalog, setCatalog] = useState<CreditPackCatalogPayload | null>(null);
  const [items, setItems] = useState<CreditPackItem[]>([]);
  const [draft, setDraft] = useState<CreditPackItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const requestActiveRef = useRef(false);
  const requestSequenceRef = useRef(0);
  const hasLoadedRef = useRef(false);

  const updateCatalogUrl = useCallback((updates: { status?: PackStatusFilter | null; focus?: string | null }) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value && value !== 'all') params.set(key, value);
      else params.delete(key);
    });
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const loadCatalog = useCallback(async (refresh = false) => {
    if (requestActiveRef.current) return;
    requestActiveRef.current = true;
    const sequence = ++requestSequenceRef.current;
    if (refresh || hasLoadedRef.current) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      const payload = await fetchCatalog();
      if (sequence !== requestSequenceRef.current) return;
      setCatalog(payload);
      setItems((payload.items || []).map(normalizeItem));
      setLoadedAt(new Date());
      hasLoadedRef.current = true;
    } catch (err) {
      if (sequence !== requestSequenceRef.current) return;
      setError(resolveUiErrorMessage(err, t('error.failed_load')));
    } finally {
      if (sequence === requestSequenceRef.current) {
        requestActiveRef.current = false;
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [t]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const activeCount = useMemo(() => items.filter((item) => item.active).length, [items]);
  const defaultValidityDays = Number(catalog?.default_validity_days || 365);
  const filteredItems = useMemo(
    () => items.filter((item) => statusFilter === 'all' || (statusFilter === 'active' ? item.active : !item.active)),
    [items, statusFilter]
  );
  const selectedItem = filteredItems.find((item) => item.pack_id === focusedPackId) || filteredItems[0] || null;
  const savedItemForDraft = draft ? items.find((item) => item.pack_id === draft.pack_id) || null : null;
  const isDraftDirty = Boolean(draft && savedItemForDraft && JSON.stringify(normalizeItem(draft)) !== JSON.stringify(normalizeItem(savedItemForDraft)));

  const openEditor = (item: CreditPackItem) => {
    updateCatalogUrl({ focus: item.pack_id });
    setEditorError(null);
    setDraft(normalizeItem({ ...item, recommended_for_tiers: [...item.recommended_for_tiers] }));
  };

  const closeEditor = () => {
    if (!isSaving) {
      setEditorError(null);
      setDraft(null);
    }
  };

  const toggleDraftTier = (tier: string) => {
    setDraft((current) => {
      if (!current) return current;
      const tiers = new Set(current.recommended_for_tiers);
      if (tiers.has(tier)) tiers.delete(tier);
      else tiers.add(tier);
      return normalizeItem({ ...current, recommended_for_tiers: Array.from(tiers) });
    });
  };

  const handleSaveDraft = async () => {
    if (!draft || !isDraftDirty) return;
    setIsSaving(true);
    setEditorError(null);
    try {
      const nextItems = items.map((item) => item.pack_id === draft.pack_id ? normalizeItem(draft) : normalizeItem(item));
      const payload = await saveCatalog(nextItems);
      setCatalog(payload);
      setItems((payload.items || []).map(normalizeItem));
      setLoadedAt(new Date());
      setDraft(null);
      toast.success(
        t('admin.credit_packs_saved_notice', {}, 'AI credit pack catalog saved.'),
        t('admin.credit_packs_saved_title', {}, 'AI credit pack updated')
      );
    } catch (err) {
      setEditorError(resolveUiErrorMessage(err, t('error.failed_save')));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading && !catalog) return <LoadingFallback />;

  if (!catalog && !isLoading) {
    return (
      <BackofficePageStack>
        <BackofficeEmptyState
          title={t('admin.credit_packs_unavailable_title', {}, 'AI credit pack catalog unavailable')}
          description={error || t('error.failed_load')}
          action={<button type="button" className="btn btn-primary" onClick={() => void loadCatalog(true)}>{t('common.retry')}</button>}
        />
      </BackofficePageStack>
    );
  }

  return (
    <BackofficePageStack className="space-y-5">
      <BackofficeLayer
        eyebrow={t('admin.credit_packs_eyebrow', {}, 'Commercial catalog')}
        title={t('admin.credit_packs_title', {}, 'AI credit packs')}
        description={t(
          'admin.credit_packs_directory_desc',
          {},
          'Review the customer purchase catalog first. Edit one pack only when price, credits, validity, visibility, or package fit must change.'
        )}
        actions={(
          <>
            <button type="button" className="btn btn-secondary" onClick={() => void loadCatalog(true)} disabled={isRefreshing || isSaving}>
              {isRefreshing ? t('common.loading', {}, 'Loading...') : t('common.refresh', {}, 'Refresh')}
            </button>
            <Link href="/admin/plans" className="btn btn-secondary">{t('admin.credit_packs_open_packages', {}, 'Open package catalog')}</Link>
          </>
        )}
      />

      {error ? (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
          <span>{error}{items.length > 0 ? <span className="mt-1 block text-xs">{t('admin.credit_packs_retained_notice', {}, 'Showing the last successfully loaded AI credit pack catalog.')}</span> : null}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadCatalog(true)}>{t('common.retry')}</button>
        </div>
      ) : null}

      <BackofficeSummaryStrip items={[
        { label: t('admin.credit_packs_active_count', {}, 'Active packs'), value: `${activeCount}/${items.length}` },
        { label: t('admin.credit_packs_default_validity', {}, 'Default validity'), value: t('admin.credit_packs_validity_days_value', { days: String(defaultValidityDays) }, `${defaultValidityDays} days`) },
        { label: t('admin.credit_packs_expiry_policy', {}, 'Expiry policy'), value: t('admin.credit_packs_expiry_policy_value', {}, 'Purchase time + validity') },
        { label: t('common.updated_at', {}, 'Updated'), value: loadedAt ? formatDate(loadedAt.toISOString()) : t('common.unknown', {}, 'Unknown') },
      ]} />

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
                onClick={() => updateCatalogUrl({ status, focus: null })}
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
                      <span className="mt-0.5 block truncate text-xs font-normal text-slate-500 dark:text-slate-400">{item.pack_id}</span>
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
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEditor(item)}>
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
        error={editorError || undefined}
        saving={isSaving}
        closeLabel={t('common.close', {}, 'Close')}
        cancelLabel={t('common.cancel', {}, 'Cancel')}
        saveLabel={t('admin.credit_packs_save_pack_action', {}, 'Save pack')}
        savingLabel={t('common.saving', {}, 'Saving...')}
        footerNotice={t('admin.credit_packs_edit_boundary', {}, 'This edit changes future customer purchases only. Existing payment orders and package entitlement remain unchanged.')}
        footerActions={(
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary btn-sm" disabled={isSaving} onClick={closeEditor}>{t('common.cancel', {}, 'Cancel')}</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={isSaving || !isDraftDirty} onClick={() => void handleSaveDraft()}>{isSaving ? t('common.saving', {}, 'Saving...') : t('admin.credit_packs_save_pack_action', {}, 'Save pack')}</button>
          </div>
        )}
        width="compact"
        density="compact"
        onClose={closeEditor}
        onSubmit={() => void handleSaveDraft()}
      >
        {draft ? (
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
              value={<input aria-label={t('admin.credit_packs_pack_label', {}, 'Pack')} className="input w-full" value={draft.label} onChange={(event) => setDraft((current) => current ? { ...current, label: event.target.value } : current)} />}
              detail={t('admin.credit_packs_label_note', {}, 'Customer-facing catalog name.')}
            />
            <AdminConfigurationRow
              rowId="credit-pack-credits"
              label={t('admin.credit_packs_credits_label', {}, 'Credits')}
              value={<input aria-label={t('admin.credit_packs_credits_label', {}, 'Credits')} className="input w-36" type="number" min={1} step={100} value={draft.ai_credits} onChange={(event) => setDraft((current) => current ? normalizeItem({ ...current, ai_credits: Number(event.target.value) }) : current)} />}
              detail={t('admin.credit_packs_credits_note', {}, 'Granted after a successful future purchase.')}
            />
            <AdminConfigurationRow
              rowId="credit-pack-amount"
              label={t('admin.credit_packs_amount_label', {}, 'Amount')}
              value={<input aria-label={t('admin.credit_packs_amount_label', {}, 'Amount')} className="input w-36" type="number" min={0.01} step={1} value={draft.amount} onChange={(event) => setDraft((current) => current ? normalizeItem({ ...current, amount: Number(event.target.value) }) : current)} />}
              detail={t('admin.credit_packs_currency_fixed_cny', {}, 'RMB pricing is fixed.')}
            />
            <AdminConfigurationRow
              rowId="credit-pack-validity"
              label={t('admin.credit_packs_validity_label', {}, 'Validity')}
              value={<input aria-label={t('admin.credit_packs_validity_label', {}, 'Validity')} className="input w-36" type="number" min={1} max={1095} step={1} value={draft.validity_days} onChange={(event) => setDraft((current) => current ? normalizeItem({ ...current, validity_days: Number(event.target.value) }) : current)} />}
              detail={t('admin.credit_packs_validity_note', {}, 'Days after the payment order is completed.')}
            />
            <AdminConfigurationRow
              rowId="credit-pack-visibility"
              label={t('admin.credit_packs_visibility_toggle', {}, 'Customer visible')}
              value={<label className="inline-flex cursor-pointer items-center gap-2"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft((current) => current ? { ...current, active: event.target.checked } : current)} /><span>{t(draft.active ? 'common.active' : 'common.inactive', {}, draft.active ? 'Active' : 'Inactive')}</span></label>}
              detail={t('admin.credit_packs_visibility_note', {}, 'Controls future customer catalog visibility only.')}
            />
            <AdminConfigurationRow
              rowId="credit-pack-recommended-tiers"
              label={t('admin.credit_packs_recommended_tiers_label', {}, 'Recommended')}
              value={<div className="flex flex-wrap gap-1.5">{MANAGED_TIERS.map((tier) => <label key={tier} className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:text-slate-200"><input type="checkbox" checked={draft.recommended_for_tiers.includes(tier)} onChange={() => toggleDraftTier(tier)} /><span>{tier}</span></label>)}</div>}
              detail={t('admin.credit_packs_recommended_note', {}, 'Presentation guidance; package entitlement does not change.')}
            />
          </AdminConfigurationTable>
        ) : null}
      </AdminWorkbenchDialog>
    </BackofficePageStack>
  );
}
