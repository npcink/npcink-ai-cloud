'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BackofficePageHeader, BackofficePageStack } from '@/components/backoffice/BackofficeScaffold';
import { AdminHelpTip } from '@/components/admin/AdminHelpTip';
import { AdminDataTableFrame } from '@/components/admin/AdminDataTableFrame';
import { useLocale } from '@/contexts/LocaleContext';
import { createApiClient } from '@/lib/api-client';
import { allocateEconomicsBillCosts, buildEconomicsMargin, type EconomicsBillInput, type EconomicsUsageInput, type EconomicsRevenueInput } from '@/features/admin/economics/allocation';

const client = createApiClient({ idempotencyPrefix: 'admin_economics' });
const currentMonth = () => new Date().toISOString().slice(0, 7);
const validMonth = (month: string) => /^(?:[1-9]\d{3})-(?:0[1-9]|1[0-2])$/.test(month) && Number(month.slice(0, 4)) < 9999;
type Usage = EconomicsUsageInput & { generated_at: string };
type Revenue = EconomicsRevenueInput & { subscription_revenue_cny: number; credit_pack_revenue_cny: number; refunds_cny: number };
type Bill = EconomicsBillInput & { id: string };
type Source<T> = { month: string; value: T | null; state: 'loading' | 'ready' | 'error' };
const storageKey = (month: string) => `npcink_economics_bills_${month}`;
function loadBills(month: string): Bill[] {
  const value: unknown = JSON.parse(localStorage.getItem(storageKey(month)) || '[]');
  if (!Array.isArray(value)) return [];
  return value.filter((bill): bill is Bill => !!bill && typeof bill === 'object' && typeof bill.id === 'string' && typeof bill.provider_name === 'string' && typeof bill.amount_cny === 'number' && Number.isFinite(bill.amount_cny) && bill.amount_cny >= 0 && Array.isArray(bill.families) && bill.families.every((family: unknown) => typeof family === 'string'));
}
export default function AdminEconomicsPage() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const requestedMonth = params.get('month') || '';
  const month = validMonth(requestedMonth) ? requestedMonth : currentMonth();
  const [refresh, setRefresh] = useState(0);
  const [usageSource, setUsageSource] = useState<Source<Usage>>({ month, value: null, state: 'loading' });
  const [revenueSource, setRevenueSource] = useState<Source<Revenue>>({ month, value: null, state: 'loading' });
  const [local, setLocal] = useState<{ month: string; bills: Bill[] }>({ month: '', bills: [] });
  const [storageError, setStorageError] = useState(false);
  const usage = usageSource.month === month && usageSource.state === 'ready' ? usageSource.value : null;
  const revenue = revenueSource.month === month && revenueSource.state === 'ready' ? revenueSource.value : null;
  const bills = useMemo(() => local.month === month ? local.bills : [], [local, month]);
  useEffect(() => {
    let bills: Bill[] = [];
    let error = false;
    try { bills = loadBills(month); } catch { error = true; }
    setLocal({ month, bills }); setStorageError(error);
  }, [month]);
  useEffect(() => {
    const controller = new AbortController();
    setUsageSource({ month, value: null, state: 'loading' });
    setRevenueSource({ month, value: null, state: 'loading' });
    // Bills and their derived estimates never enter requests or logs.
    void client.request<Usage>(`/api/admin/economics/usage-by-family?month=${encodeURIComponent(month)}`, { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setUsageSource({ month, value: data, state: 'ready' }); })
      .catch(() => { if (!controller.signal.aborted) setUsageSource({ month, value: null, state: 'error' }); });
    void client.request<Revenue>(`/api/admin/economics/revenue?month=${encodeURIComponent(month)}`, { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setRevenueSource({ month, value: data, state: 'ready' }); })
      .catch(() => { if (!controller.signal.aborted) setRevenueSource({ month, value: null, state: 'error' }); });
    return () => controller.abort();
  }, [month, refresh]);
  function commitBills(next: Bill[]) {
    setLocal({ month, bills: next });
    try { localStorage.setItem(storageKey(month), JSON.stringify(next)); setStorageError(false); }
    catch { setStorageError(true); }
  }
  function updateBill(id: string, patch: Partial<Bill>) { commitBills(bills.map(bill => bill.id === id ? { ...bill, ...patch } : bill)); }
  const allocation = useMemo(() => allocateEconomicsBillCosts(bills, usage), [bills, usage]);
  const margin = useMemo(() => buildEconomicsMargin(revenue, allocation), [revenue, allocation]);
  const hasEnteredCosts = bills.some(bill => bill.amount_cny > 0);
  const money = (value: number) => `¥${value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const label = (key: string) => t(`admin.economics.${key}`);
  const familyLabel = (family: string) => t(`admin.economics.family_${family}`, {}, family);
  const familyNames = Object.keys(usage?.families || {});
  const sourceState = (source: Source<unknown>) => source.month === month ? source.state : 'loading';
  return <BackofficePageStack spacing="compact" data-ui="economics-workspace">
    <BackofficePageHeader title={t('admin.economics.title')} description={t('admin.economics.scope')}
      toolbarControls={<label className="flex items-center gap-2 whitespace-nowrap text-sm">{t('admin.economics.month')}<input aria-label={t('admin.economics.month')} type="month" value={month} className="input input-sm" onChange={event => { if (validMonth(event.target.value)) router.replace(`/admin/economics?month=${event.target.value}`); }} /></label>}
      secondaryAction={<button type="button" className="btn btn-secondary btn-sm" onClick={() => setRefresh(value => value + 1)}>{t('admin.economics.refresh')}</button>}
      summaryItems={[
        { label: t('admin.economics.revenue'), value: revenue ? money(margin.revenueCny) : '—' },
        { label: t('admin.economics.local_cost'), value: hasEnteredCosts ? money(margin.costCny) : '—' },
        { label: t('admin.economics.margin'), value: revenue && hasEnteredCosts && margin.grossMarginRatio !== null ? `${(margin.grossMarginRatio * 100).toFixed(1)}%` : '—' },
        { label: t('admin.economics.current_accounts'), value: revenue ? `${margin.activePaidAccounts} / ${margin.trialingAccounts}` : '—' },
      ]} />
    <p className="text-xs text-slate-500">{t('admin.economics.snapshot_note')}</p>
    {sourceState(revenueSource) === 'loading' ? <p role="status">{t('admin.economics.loading')}</p> : sourceState(revenueSource) === 'error' ? <p role="alert">{t('admin.economics.revenue_error')}</p> : revenue ? <details data-ui="economics-revenue" className="text-sm">
      <summary className="cursor-pointer">{t('admin.economics.revenue_breakdown')}</summary>
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-slate-600 dark:text-slate-300">
        <span>{t('admin.economics.subscription_revenue')}: {money(revenue.subscription_revenue_cny)}</span><span>{t('admin.economics.pack_revenue')}: {money(revenue.credit_pack_revenue_cny)}</span><span>{t('admin.economics.refunds')}: {money(revenue.refunds_cny)}</span>
      </div>
    </details> : null}
    <AdminDataTableFrame density="compact" title={t('admin.economics.usage')} dataUi="economics-usage" resultLabel={`${familyNames.length}`}>
      {sourceState(usageSource) === 'error' ? <p role="alert" className="p-3">{t('admin.economics.usage_error')}</p> : null}
      <table className="w-full min-w-[42rem] text-left text-sm [&_th:not(:first-child)]:text-right [&_td:not(:first-child)]:text-right"><thead><tr>{['family', 'runs', 'tokens', 'calls', 'recorded_cost', 'allocated_cost'].map(key => <th key={key} className="px-3 py-2">{label(key)}</th>)}</tr></thead><tbody>
        {usage ? allocation.rows.map(row => <tr key={row.family} className="border-t border-slate-200 dark:border-slate-800"><td className="px-3 py-2">{familyLabel(row.family)}</td><td className="px-3 py-2 tabular-nums">{row.runs}</td><td className="px-3 py-2 tabular-nums">{row.tokensTotal.toLocaleString(locale)}</td><td className="px-3 py-2 tabular-nums">{row.providerCallCount}</td><td className="px-3 py-2 tabular-nums">${row.providerCallCostUsd.toFixed(4)}</td><td className="px-3 py-2 tabular-nums">{hasEnteredCosts ? money(row.billCostCny) : '—'}</td></tr>) : null}
        {!usage || !allocation.rows.length ? <tr><td className="px-3 py-5" colSpan={6}>{sourceState(usageSource) === 'loading' ? t('admin.economics.loading') : sourceState(usageSource) === 'error' ? '—' : t('admin.economics.no_usage')}</td></tr> : null}
      </tbody></table>
    </AdminDataTableFrame>
    <AdminDataTableFrame density="compact" title={t('admin.economics.bills')} dataUi="economics-bills" resultLabel={`${bills.length}`} headerActions={<button type="button" className="btn btn-secondary btn-sm" disabled={local.month !== month} onClick={() => commitBills([...bills, { id: crypto.randomUUID(), provider_name: '', amount_cny: 0, families: [] }])}>{t('admin.economics.add_bill')}</button>}>
      <p className="px-3 py-2 text-xs text-slate-500">{t('admin.economics.local_scope')}<AdminHelpTip label={t('admin.economics.local_storage_help')}>{t('admin.economics.local_note')}</AdminHelpTip></p>
      {storageError ? <p role="alert" className="px-3 py-2">{t('admin.economics.storage_error')}</p> : null}
      <table className="w-full text-left text-sm"><thead><tr>{['provider', 'amount', 'families', 'action'].map(key => <th key={key} className="px-3 py-2">{label(key)}</th>)}</tr></thead><tbody>
        {bills.map((bill, index) => <tr key={bill.id} data-ui="economics-bill-row" className="border-t border-slate-200 dark:border-slate-800">
          <td className="px-3 py-2"><input aria-label={`${t('admin.economics.provider')} ${index + 1}`} className="input input-sm w-40" maxLength={120} value={bill.provider_name} onChange={event => updateBill(bill.id, { provider_name: event.target.value })} /></td>
          <td className="px-3 py-2"><input aria-label={`${t('admin.economics.amount')} ${index + 1}`} className="input input-sm w-28 text-right tabular-nums" type="number" min="0" step="0.01" value={bill.amount_cny} onChange={event => { const amount = Number(event.target.value); if (Number.isFinite(amount) && amount >= 0) updateBill(bill.id, { amount_cny: amount }); }} /></td>
          <td className="max-w-lg px-3 py-2"><div className="flex flex-wrap gap-x-3 gap-y-2">{Array.from(new Set([...familyNames, ...bill.families])).map(family => <label key={family} className="inline-flex cursor-pointer items-center gap-1 text-xs"><input type="checkbox" checked={bill.families.includes(family)} onChange={event => updateBill(bill.id, { families: event.target.checked ? [...bill.families, family] : bill.families.filter(value => value !== family) })} />{familyLabel(family)}</label>)}{!familyNames.length ? <span className="text-xs text-slate-500">{t('admin.economics.no_mapping')}</span> : null}</div></td>
          <td className="px-3 py-2"><button type="button" className="btn btn-ghost btn-sm" aria-label={`${t('admin.economics.remove')} ${index + 1}`} onClick={() => commitBills(bills.filter(value => value.id !== bill.id))}>{t('admin.economics.remove')}</button></td>
        </tr>)}
        {!bills.length ? <tr><td colSpan={4} className="px-3 py-5">{t('admin.economics.no_bills')}</td></tr> : null}
      </tbody></table>
      <p data-ui="economics-unallocated" className="px-3 py-2 text-xs">{t('admin.economics.unallocated')}: {money(usage ? allocation.unattributedBillCostCny : allocation.totalBillCostCny)}</p>
    </AdminDataTableFrame>
    <details className="border-t border-slate-200 py-3 text-sm dark:border-slate-800"><summary className="cursor-pointer">{t('admin.economics.definitions')}</summary><div className="mt-3 space-y-2 text-slate-500"><p>{t('admin.economics.allocation_note')}</p><p>{t('admin.economics.revenue_note')}</p><p>{t('admin.economics.cost_note')}</p></div></details>
  </BackofficePageStack>;
}
