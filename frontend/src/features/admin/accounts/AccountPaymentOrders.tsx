'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { AdminDataTableFrame } from '@/components/admin/AdminDataTableFrame';
import { AdminWorkbenchDialog } from '@/components/admin/AdminWorkbenchDialog';
import { buildAdminAuditTrailHref, type AdminMutationReceiptPayload } from '@/components/admin/AdminMutationReceipt';
import { BackofficeIdentifier } from '@/components/backoffice/BackofficeIdentifier';
import { useLocale } from '@/contexts/LocaleContext';
import { createApiClient } from '@/lib/api-client';
import { ApiError } from '@/lib/errors';
import { formatDate } from '@/lib/utils';

const refundSchema = z.object({
  refund_id: z.string().min(1), status: z.string().min(1),
  amount: z.number().finite().nonnegative(), currency: z.string().regex(/^[A-Z]{3}$/),
  external_refund_no: z.string().nullable(), provider_refund_no: z.string().nullable(),
  reason: z.string().nullable(),
});
const orderSchema = z.object({
  order_id: z.string().min(1), subject: z.string(), provider: z.string(), status: z.string(),
  amount: z.number().finite().nonnegative(), currency: z.string().regex(/^[A-Z]{3}$/),
  paid_at: z.string().nullable(), created_at: z.string().nullable(),
  external_order_no: z.string().nullable(), refund_window_end_at: z.string().nullable(),
  refund_blocker: z.string(), refund: refundSchema.nullable(),
});
const ordersSchema = z.object({
  items: z.array(orderSchema),
  pagination: z.object({
    limit: z.number().int().positive(), offset: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
});
type Refund = z.infer<typeof refundSchema>;
type PaymentOrder = z.infer<typeof orderSchema>;

const client = createApiClient({ idempotencyPrefix: 'admin_full_refund' });
const PAGE_SIZE = 5;

export function AccountPaymentOrders({ accountId, customerName, onRefreshAccount }: {
  accountId: string; customerName: string; onRefreshAccount: () => void;
}) {
  const { t, locale } = useLocale();
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<PaymentOrder | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [notice, setNotice] = useState('');
  const [uncertain, setUncertain] = useState<string[]>([]);
  const [receipt, setReceipt] = useState<AdminMutationReceiptPayload | null>(null);
  const busy = useRef(false);
  const path = `/api/admin/accounts/${encodeURIComponent(accountId)}/payment-orders`;
  const query = useQuery({
    queryKey: ['admin', 'account-payment-orders', accountId, offset],
    queryFn: async ({ signal }) => ordersSchema.parse((await client.request<unknown>(
      `${path}?limit=${PAGE_SIZE}&offset=${offset}`, { signal },
    )).data),
    retry: false,
    staleTime: 0,
  });
  const money = (order: { amount: number; currency: string }) => new Intl.NumberFormat(locale, {
    style: 'currency', currency: order.currency,
  }).format(order.amount);
  const statusLabel = (status: string) => t(`admin.payments.status.${status}`, {}, status);
  const blockerLabel = (code: string) => t(`admin.payments.block.${code}`, {}, code);
  const orderResult = selected && query.data?.items.find(item => item.order_id === selected.order_id);
  const selectedRefund = orderResult?.refund;
  const auditHref = buildAdminAuditTrailHref(receipt);

  async function submit() {
    if (!selected || busy.current || submitted || !reason.trim()) return;
    busy.current = true;
    setSaving(true);
    setNotice('');
    try {
      const response = await client.request<{ refund: Refund; receipt: AdminMutationReceiptPayload }>(
        `${path}/${encodeURIComponent(selected.order_id)}/refunds`,
        { method: 'POST', body: { reason: reason.trim() } },
      );
      setReceipt(response.data.receipt);
      setSubmitted(true);
      setNotice(t('admin.payments.recorded'));
    } catch (error) {
      // A transport failure can happen after the refund was durably created.
      // Only refresh the original record; never automatically repeat the write.
      if (!(error instanceof ApiError) || error.statusCode === 0 || error.statusCode >= 500
        || error.errorCode === 'service.payment_refund_status_unknown') {
        setSubmitted(true);
        setUncertain(current => [...new Set([...current, selected.order_id])]);
        setNotice(t('admin.payments.unconfirmed'));
      } else {
        setNotice(t('admin.payments.rejected'));
      }
    } finally {
      await query.refetch();
      busy.current = false;
      setSaving(false);
    }
  }

  function close() {
    if (busy.current) return;
    if (!submitted && reason.trim() && !window.confirm(t('admin.payments.discard'))) return;
    setSelected(null);
  }

  return (
    <div id="payment-orders" className="space-y-3">
      <AdminDataTableFrame
        title={t('admin.payments.title')}
        dataUi="account-payment-orders"
        resultLabel={query.data
          ? t('admin.payments.count', { count: String(query.data.pagination.total) })
          : t('admin.payments.unavailable')}
        headerActions={<button type="button" className="btn btn-secondary" disabled={saving || query.isFetching} onClick={() => void query.refetch()}>{t('common.refresh')}</button>}
        footer={query.data && query.data.pagination.total > PAGE_SIZE ? (
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 p-3 dark:border-slate-800">
            <button type="button" className="btn btn-secondary" disabled={saving || query.isFetching || offset === 0} onClick={() => setOffset(value => Math.max(0, value - PAGE_SIZE))}>{t('common.previous')}</button>
            <span className="text-sm">{offset + 1}–{Math.min(offset + PAGE_SIZE, query.data.pagination.total)} / {query.data.pagination.total}</span>
            <button type="button" className="btn btn-secondary" disabled={saving || query.isFetching || offset + PAGE_SIZE >= query.data.pagination.total} onClick={() => setOffset(value => value + PAGE_SIZE)}>{t('common.next')}</button>
          </div>
        ) : undefined}
      >
        {query.isError ? <p role="alert" className="px-4 py-3 text-sm text-rose-700 dark:text-rose-300">{t('admin.payments.read_error')}</p> : null}
        {query.isPending ? <p role="status" className="px-4 py-3 text-sm">{t('common.loading')}</p> : null}
        {query.data?.items.length === 0 ? <p className="px-4 py-3 text-sm">{t('admin.payments.empty')}</p> : null}
        {query.data?.items.length ? (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500 dark:text-slate-400"><tr>
              <th className="px-4 py-2">{t('admin.payments.order')}</th>
              <th className="px-4 py-2 text-right">{t('admin.payments.amount')}</th>
              <th className="px-4 py-2">{t('admin.payments.state')}</th>
              <th className="px-4 py-2">{t('admin.payments.refund')}</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {query.data.items.map(order => (
                <tr key={order.order_id} data-order-id={order.order_id} className="align-top">
                  <td className="max-w-xs px-4 py-3">
                    <p className="break-words font-medium">{order.subject}</p>
                    <BackofficeIdentifier value={order.order_id} />
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{order.provider === 'alipay' ? t('admin.payments.alipay') : order.provider} · {formatDate(order.paid_at || order.created_at || undefined)}</p>
                    <details className="mt-2 text-xs"><summary className="cursor-pointer">{t('admin.payments.order_evidence')}</summary>
                      <p className="mt-1 break-all">{order.order_id}</p>
                      <p className="break-all">{order.external_order_no}</p>
                      <p>{t('admin.payments.deadline')}：{order.refund_window_end_at ? formatDate(order.refund_window_end_at) : t('admin.payments.not_recorded')}</p>
                    </details>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{money(order)}</td>
                  <td className="px-4 py-3">{statusLabel(order.status)}</td>
                  <td className="max-w-sm px-4 py-3">
                    {order.refund ? <>
                      <p className="font-medium">{t('admin.payments.refund')}：{statusLabel(order.refund.status)}</p>
                      {['requested', 'unknown'].includes(order.refund.status) ? <p className="mt-1">{t('admin.payments.unconfirmed')}</p> : null}
                      <details className="mt-2"><summary className="cursor-pointer">{t('admin.payments.evidence')}</summary>
                        <p className="mt-1 break-all">{order.refund.refund_id}</p>
                        <p className="break-all">{order.refund.external_refund_no}</p>
                        <p className="break-all">{order.refund.provider_refund_no}</p>
                        <p className="break-words">{order.refund.reason}</p>
                      </details>
                      {order.refund.status === 'succeeded' ? <button type="button" className="btn btn-secondary mt-2" onClick={onRefreshAccount}>{t('admin.payments.refresh_account')}</button> : null}
                    </> : uncertain.includes(order.order_id) ? <p role="status">{t('admin.payments.unconfirmed')}</p> : order.refund_blocker ? <p>{blockerLabel(order.refund_blocker)}</p> : (
                      <button type="button" className="btn btn-secondary whitespace-nowrap" disabled={saving || query.isFetching || query.isError} onClick={() => {
                        setSelected(order); setReason(''); setSubmitted(false); setNotice('');
                      }}>{t('admin.payments.full_refund')}</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </AdminDataTableFrame>
      {auditHref ? <Link className="inline-block text-sm text-blue-600 hover:underline dark:text-blue-300" href={auditHref}>{t('admin.payments.audit')}</Link> : null}
      <AdminWorkbenchDialog
        open={selected !== null} title={t('admin.payments.confirm_title')} titleId="account-full-refund-title"
        width="compact" density="compact" saving={saving}
        closeLabel={t('common.close')} cancelLabel={t('common.cancel')}
        saveLabel={t('admin.payments.confirm')} savingLabel={t('common.loading')}
        footerNotice={t('admin.payments.effect')}
        onClose={close} onSubmit={() => void submit()}
        footerActions={<div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary" disabled={saving} onClick={close}>{t('common.close')}</button>
          {submitted || selectedRefund ? <button type="button" className="btn btn-secondary" disabled={saving || query.isFetching} onClick={() => void query.refetch()}>{t('common.refresh')}</button>
            : <button type="submit" className="btn btn-danger" disabled={saving || !reason.trim() || query.isError || Boolean(orderResult?.refund_blocker)}>{saving ? t('common.loading') : t('admin.payments.confirm')}</button>}
        </div>}
      >
        {selected ? <>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            <dt>{t('admin.payments.customer')}</dt><dd className="break-words">{customerName}</dd>
            <dt>{t('admin.payments.order')}</dt><dd className="break-all">{selected.subject}<br />{selected.order_id}</dd>
            <dt>{t('admin.payments.alipay_order')}</dt><dd className="break-all">{selected.external_order_no}</dd>
            <dt>{t('admin.payments.amount')}</dt><dd className="font-semibold">{money(selected)}</dd>
            <dt>{t('admin.payments.deadline')}</dt><dd>{selected.refund_window_end_at ? formatDate(selected.refund_window_end_at) : t('admin.payments.not_recorded')}</dd>
          </dl>
          <label className="text-sm">{t('admin.payments.reason')}
            <textarea className="input mt-1 !min-h-20" rows={3} maxLength={500} required value={reason} disabled={saving || submitted} onChange={event => setReason(event.target.value)} />
          </label>
          {notice ? <p role="status" className="text-sm">{notice}</p> : null}
          {query.isError ? <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{t('admin.payments.read_error')}</p> : null}
          {selectedRefund ? <p role="status" className="text-sm font-medium">{t('admin.payments.refund')}：{statusLabel(selectedRefund.status)}</p> : null}
        </> : null}
      </AdminWorkbenchDialog>
    </div>
  );
}
