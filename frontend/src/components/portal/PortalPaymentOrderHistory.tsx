'use client';

import { PortalStatusBadge } from '@/components/portal/PortalStatusBadge';
import { PortalInfoHint } from '@/components/portal/PortalScaffold';
import {
  type PortalPaymentOrder,
  type PortalPaymentOrderListPayload,
  type PortalPaymentOrderStatusGroup,
} from '@/lib/portal-client';
import {
  DEFAULT_PORTAL_CURRENCY,
  formatPortalCurrency,
  normalizePortalCurrency,
} from '@/lib/currency';
import { cn, formatDate, formatNumber } from '@/lib/utils';
import { PortalLoadingState } from '@/components/portal/PortalPageState';

export const PORTAL_PAYMENT_ORDER_PAGE_SIZE = 10;

type TranslateFn = (key: string, params?: Record<string, string>, fallback?: string) => string;

type PortalPaymentOrderHistoryProps = {
  t: TranslateFn;
  payload: PortalPaymentOrderListPayload | null;
  counts: Record<PortalPaymentOrderStatusGroup, number>;
  statusGroup: PortalPaymentOrderStatusGroup;
  offset: number;
  isLoading: boolean;
  error: string | null;
  cancelPendingOrderId: string | null;
  cancelConfirmOrderId: string | null;
  onStatusGroupChange: (statusGroup: PortalPaymentOrderStatusGroup) => void;
  onOffsetChange: (offset: number) => void;
  onCancelConfirmChange: (orderId: string | null) => void;
  onCancel: (order: PortalPaymentOrder) => void;
};

function normalizePaymentText(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '_');
}

export function isPortalPaymentOrderPending(order: PortalPaymentOrder): boolean {
  return normalizePaymentText(order.status) === 'pending';
}

function resolvePaymentOrderTitle(order: PortalPaymentOrder, t: TranslateFn): string {
  const packId = String(order.credit_pack?.pack_id || '').trim();
  const rawTitle = String(order.credit_pack?.label || order.subject || '').trim();
  const normalized = normalizePaymentText(`${packId} ${rawTitle}`);
  const packKey = normalized.includes('pack_small') || normalized.includes('small_credit_pack')
    ? 'pack_small'
    : normalized.includes('pack_medium') || normalized.includes('medium_credit_pack')
      ? 'pack_medium'
      : normalized.includes('pack_large') || normalized.includes('large_credit_pack')
        ? 'pack_large'
        : '';

  if (packKey) {
    return t(`portal.usage.credit_pack_${packKey}`, {}, rawTitle || order.order_id);
  }
  if (normalizePaymentText(order.purchase_kind).includes('subscription')) {
    const tier = String(order.target_tier_id || '').trim();
    const tierLabel = tier ? `${tier.charAt(0).toUpperCase()}${tier.slice(1)}` : '';
    return tierLabel
      ? t(
          'portal.usage.payment_order_subscription_title',
          { tier: tierLabel },
          `${tierLabel} monthly package`
        )
      : rawTitle;
  }
  return rawTitle || order.order_id;
}

function resolvePaymentOrderStatusLabel(order: PortalPaymentOrder, t: TranslateFn): string {
  const status = normalizePaymentText(order.status);
  const code = normalizePaymentText(order.status_detail?.code);
  // Closed-tab family: badge matches Tab「已关闭」; reason stays in detail / title.
  if (code.includes('expired') || status === 'expired') {
    return t('portal.usage.payment_orders_tab_closed', {}, 'Closed');
  }
  if (code.includes('awaiting_payment_confirmation') || status === 'pending') {
    return t('portal.usage.payment_order_status_waiting_confirmation', {}, 'Waiting for payment confirmation');
  }
  if (code.includes('paid') || status === 'paid') return t('portal.usage.payment_order_status_paid', {}, 'Paid');
  if (code.includes('refund') || status === 'refunded') return t('portal.usage.payment_order_status_refunded', {}, 'Refunded');
  if (status === 'failed') return t('portal.usage.payment_order_status_failed', {}, 'Failed');
  if (status === 'canceled' || status === 'cancelled') {
    return t('portal.usage.payment_orders_tab_closed', {}, 'Closed');
  }
  return t('portal.usage.payment_order_status_unknown', {}, 'To confirm');
}

function isPortalPaymentOrderClosedFamily(order: PortalPaymentOrder): boolean {
  const status = normalizePaymentText(order.status);
  const code = normalizePaymentText(order.status_detail?.code);
  return (
    code.includes('expired')
    || status === 'expired'
    || status === 'canceled'
    || status === 'cancelled'
  );
}

function resolvePaymentProviderLabel(order: PortalPaymentOrder, t: TranslateFn): string {
  const provider = normalizePaymentText(order.provider);
  if (provider === 'alipay') return t('portal.usage.payment_provider_alipay', {}, 'Alipay');
  if (provider === 'wechat_pay' || provider === 'wechat') {
    return t('portal.usage.payment_provider_wechat', {}, 'WeChat Pay');
  }
  if (provider === 'manual') return t('portal.usage.payment_provider_manual', {}, 'Manual payment');
  return String(order.provider || '').trim() || t('portal.usage.payment_provider_unknown', {}, 'Payment provider');
}

function resolvePaymentOrderDetail(order: PortalPaymentOrder, t: TranslateFn): string {
  const status = normalizePaymentText(order.status);
  const code = normalizePaymentText(order.status_detail?.code);
  if (code.includes('expired')) {
    return t('portal.usage.payment_order_expired_detail', {}, 'This unpaid order has expired.');
  }
  if (code.includes('awaiting_payment_confirmation') || status === 'pending') {
    const provider = resolvePaymentProviderLabel(order, t);
    return t(
      'portal.usage.payment_order_waiting_confirmation_detail',
      { provider },
      `Waiting for ${provider} confirmation. Package changes or credits are granted after provider confirmation.`
    );
  }
  if (code.includes('paid') || status === 'paid') {
    return t('portal.usage.payment_order_paid_detail', {}, 'Payment has been confirmed.');
  }
  if (code.includes('refund') || status === 'refunded') {
    return t('portal.usage.payment_order_refunded_detail', {}, 'This order has been refunded.');
  }
  if (status === 'failed') return t('portal.usage.payment_order_failed_detail', {}, 'Payment was not completed.');
  if (status === 'canceled' || status === 'cancelled') {
    return t('portal.usage.payment_order_canceled_detail', {}, 'This unpaid order was canceled.');
  }
  return t('portal.usage.payment_order_default_detail', {}, 'Payment status is recorded by Cloud.');
}

function paymentOrderAllowsAction(
  order: PortalPaymentOrder,
  action: 'continue_payment' | 'cancel'
): boolean {
  return Array.isArray(order.available_actions) && order.available_actions.includes(action);
}

function formatPaymentOrderReference(orderId: string): string {
  const normalized = String(orderId || '').trim();
  if (normalized.length <= 20) return normalized;
  return `${normalized.slice(0, 14)}...${normalized.slice(-4)}`;
}

export function PortalPaymentOrderHistory({
  t,
  payload,
  counts,
  statusGroup,
  offset,
  isLoading,
  error,
  cancelPendingOrderId,
  cancelConfirmOrderId,
  onStatusGroupChange,
  onOffsetChange,
  onCancelConfirmChange,
  onCancel,
}: PortalPaymentOrderHistoryProps) {
  const orders = payload?.items || [];
  const total = Number(payload?.pagination?.total || 0);
  const pageEnd = Math.min(offset + orders.length, total);
  const hasActionableRows = orders.some(
    (order) => paymentOrderAllowsAction(order, 'continue_payment') || paymentOrderAllowsAction(order, 'cancel'),
  );
  const paymentOrdersHelp = t(
    'portal.usage.payment_orders_desc',
    {},
    'Payment results follow verified Alipay notifications. Unpaid orders close after 30 minutes; canceled orders remain visible here for 7 days.',
  );
  const tabs: Array<{ id: PortalPaymentOrderStatusGroup; label: string }> = [
    { id: 'all', label: t('portal.usage.payment_orders_tab_all', {}, 'All') },
    { id: 'pending', label: t('portal.usage.payment_orders_tab_pending', {}, 'Pending') },
    { id: 'paid', label: t('portal.usage.payment_orders_tab_paid', {}, 'Paid') },
    { id: 'closed', label: t('portal.usage.payment_orders_tab_closed', {}, 'Closed') },
  ];
  const renderOrderActions = (order: PortalPaymentOrder, className: string) => {
    const isConfirmingCancel = cancelConfirmOrderId === order.order_id;
    return (
      <div className={className}>
        {paymentOrderAllowsAction(order, 'continue_payment') && order.checkout_url ? (
          <a className="btn btn-primary" href={order.checkout_url} target="_blank" rel="noopener noreferrer">
            {t('portal.usage.payment_order_continue', {}, 'Continue payment')}
          </a>
        ) : null}
        {paymentOrderAllowsAction(order, 'cancel') ? (
          isConfirmingCancel ? (
            <>
              <button
                type="button"
                className="btn btn-danger"
                disabled={cancelPendingOrderId !== null}
                onClick={() => onCancel(order)}
              >
                {cancelPendingOrderId === order.order_id
                  ? t('common.saving', {}, 'Saving...')
                  : t('portal.usage.payment_order_confirm_cancel', {}, 'Confirm cancel order')}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={cancelPendingOrderId !== null}
                onClick={() => onCancelConfirmChange(null)}
              >
                {t('common.back', {}, 'Back')}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-outline portal-outline-danger"
              disabled={cancelPendingOrderId !== null}
              onClick={() => onCancelConfirmChange(order.order_id)}
            >
              {t('portal.usage.payment_order_cancel', {}, 'Cancel order')}
            </button>
          )
        ) : null}
      </div>
    );
  };

  // Account truly has no orders: quiet one-liner. Filtered tabs with 0 rows keep
  // the panel + status filter so the user can switch without losing structure.
  const accountOrderTotal =
    Number(counts.all || 0)
    || Number(counts.pending || 0) + Number(counts.paid || 0) + Number(counts.closed || 0);
  const accountHasOrders = accountOrderTotal > 0;
  if (!isLoading && orders.length === 0 && !accountHasOrders && statusGroup === 'all') {
    return (
      <p
        className="px-1 text-sm text-slate-500 dark:text-slate-400"
        data-portal-account="payment-orders-empty"
        role={error ? 'status' : undefined}
      >
        <span className="font-medium text-slate-700 dark:text-slate-200">
          {t('portal.usage.payment_orders_title', {}, 'Payment orders')}
        </span>
        <span className="mx-2 text-slate-300 dark:text-slate-600">·</span>
        {error
          ? error
          : t('portal.usage.payment_orders_empty', {}, 'No payment orders yet.')}
      </p>
    );
  }

  const onStatusFilterChange = (next: PortalPaymentOrderStatusGroup) => {
    onStatusGroupChange(next);
    onOffsetChange(0);
    onCancelConfirmChange(null);
  };
  // Compact segmented control (pill chips) — not giant page tabs, not a crude header <select>.
  const renderStatusFilter = () => (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="tablist"
      aria-label={t('portal.usage.payment_orders_filter_label', {}, 'Filter payment orders')}
      data-portal-account="payment-orders-status-filter"
    >
      {tabs.map((tab) => {
        const selected = statusGroup === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={isLoading}
            data-portal-account={`payment-orders-status-${tab.id}`}
            className={cn(
              'inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition',
              selected
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
            )}
            onClick={() => onStatusFilterChange(tab.id)}
          >
            <span>{tab.label}</span>
            <span className={cn('tabular-nums', selected ? 'opacity-80' : 'opacity-60')}>
              {counts[tab.id] || 0}
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <details
      className="group overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-none dark:border-slate-800 dark:bg-slate-950"
      open
      data-portal-account="payment-orders"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold text-gray-950 dark:text-white">
              {t('portal.usage.payment_orders_title', {}, 'Payment orders')}
            </span>
            <span
              className="inline-flex"
              onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
              onKeyDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
            >
              <PortalInfoHint
                label={t('portal.usage.payment_orders_title', {}, 'Payment orders')}
                aria-label={paymentOrdersHelp}
                data-portal-account="payment-orders-help"
                detail={paymentOrdersHelp}
              />
            </span>
          </span>
          <span className="mt-1 block text-sm text-gray-600 dark:text-gray-400">
            {t(
              'portal.usage.payment_orders_summary',
              {
                pending: String(counts.pending || 0),
                paid: String(counts.paid || 0),
                closed: String(counts.closed || 0),
              },
              `${counts.pending || 0} pending, ${counts.paid || 0} paid, ${counts.closed || 0} closed`
            )}
          </span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-lg text-slate-500 transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="border-t border-slate-200 px-5 pb-5 pt-3 dark:border-slate-800">
        {error ? <p className="mb-3 text-sm text-red-700 dark:text-red-300">{error}</p> : null}
        <div className="mb-3" data-portal-account="payment-orders-status-filter-bar">
          {renderStatusFilter()}
        </div>
        <div role="region" aria-label={t('portal.usage.payment_orders_title', {}, 'Payment orders')}>
          {isLoading && orders.length === 0 ? (
            <PortalLoadingState message={t('portal.usage.payment_orders_loading', {}, 'Loading payment orders...')} compact />
          ) : orders.length > 0 ? (
            <>
              <div className="hidden overflow-x-auto lg:block" data-portal-billing="payment-orders-table">
                <table className="w-full table-fixed text-left text-sm">
                  <caption className="sr-only">
                    {paymentOrdersHelp}
                  </caption>
                  <thead className="border-b border-slate-200/80 text-xs font-medium uppercase tracking-[0.12em] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <tr>
                      <th scope="col" className="px-3 py-3 font-medium">{t('portal.usage.payment_order_column', {}, 'Order')}</th>
                      <th scope="col" className="w-[18%] px-3 py-3 font-medium">{t('common.status', {}, 'Status')}</th>
                      <th scope="col" className="w-[14%] px-3 py-3 text-right font-medium">{t('portal.usage.payment_order_purchase_amount', {}, 'Amount')}</th>
                      <th scope="col" className="w-[18%] px-3 py-3 font-medium">{t('portal.audit.time_column', {}, 'Time')}</th>
                      {hasActionableRows ? (
                        <th scope="col" className="w-40 px-3 py-3 text-right font-medium">{t('common.actions', {}, 'Actions')}</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800">
                    {orders.map((order) => {
                      const isPending = isPortalPaymentOrderPending(order);
                      const showDetail = isPending || isPortalPaymentOrderClosedFamily(order);
                      const detailText = showDetail ? resolvePaymentOrderDetail(order, t) : '';
                      const isExpireCountdown = Boolean(isPending && order.expires_at);
                      const timeLabel = isExpireCountdown
                        ? t(
                            'portal.usage.payment_order_expires_at',
                            { time: formatDate(order.expires_at) },
                            `Complete payment before ${formatDate(order.expires_at)}`
                          )
                        : order.created_at ? formatDate(order.created_at) : '—';
                      const timeTitle = isExpireCountdown
                        ? formatDate(order.expires_at)
                        : order.created_at ? formatDate(order.created_at) : undefined;
                      return (
                        <tr key={order.order_id} data-payment-order-id={order.order_id} className="align-middle">
                          <th scope="row" className="min-w-0 px-3 py-4 font-normal">
                            <p className="truncate font-semibold text-slate-950 dark:text-white" title={resolvePaymentOrderTitle(order, t)}>
                              {resolvePaymentOrderTitle(order, t)}
                            </p>
                            {detailText ? (
                              <p className="mt-1 line-clamp-2 text-xs font-normal leading-5 text-slate-500 dark:text-slate-400" title={detailText}>
                                {detailText}
                              </p>
                            ) : null}
                            {order.purchase_kind === 'credit_pack' && Number(order.credit_pack?.ai_credits || 0) > 0 ? (
                              <p className="mt-1 text-xs font-normal text-slate-500 dark:text-slate-400">
                                {t(
                                  'portal.usage.payment_order_credit_snapshot',
                                  { credits: formatNumber(Number(order.credit_pack?.ai_credits || 0)) },
                                  `${formatNumber(Number(order.credit_pack?.ai_credits || 0))} AI credits in this order`
                                )}
                              </p>
                            ) : null}
                            <p className="mt-1 truncate text-xs font-medium text-slate-500 dark:text-slate-400" title={order.order_id}>
                              {t(
                                'portal.usage.payment_order_provider_reference',
                                {
                                  provider: resolvePaymentProviderLabel(order, t),
                                  order: formatPaymentOrderReference(order.order_id),
                                },
                                `${resolvePaymentProviderLabel(order, t)}, order ${formatPaymentOrderReference(order.order_id)}`
                              )}
                            </p>
                          </th>
                          <td className="px-3 py-4">
                            <span title={detailText || undefined}>
                              <PortalStatusBadge label={resolvePaymentOrderStatusLabel(order, t)} status={order.status || 'pending'} />
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-right font-semibold text-slate-950 dark:text-white">
                            {formatPortalCurrency(Number(order.amount || 0), {
                              from: normalizePortalCurrency(order.currency),
                              to: DEFAULT_PORTAL_CURRENCY,
                            })}
                          </td>
                          <td className="px-3 py-4 text-xs leading-5 text-slate-500 dark:text-slate-400">
                            <span className={isExpireCountdown ? 'block' : 'block whitespace-nowrap'} title={timeTitle}>{timeLabel}</span>
                          </td>
                          {hasActionableRows ? (
                            <td className="px-3 py-4">
                              {renderOrderActions(order, 'flex flex-wrap items-center justify-end gap-2 [&_.btn]:whitespace-nowrap')}
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-slate-200 border-y border-slate-200 text-sm dark:divide-slate-800 dark:border-slate-800 lg:hidden">
                {orders.map((order) => {
                  const isPending = isPortalPaymentOrderPending(order);
                  const showDetail = isPending || isPortalPaymentOrderClosedFamily(order);
                  const detailText = showDetail ? resolvePaymentOrderDetail(order, t) : '';
                  const timeLabel = isPending && order.expires_at
                    ? t('portal.usage.payment_order_expires_at', { time: formatDate(order.expires_at) }, `Complete payment before ${formatDate(order.expires_at)}`)
                    : order.created_at ? formatDate(order.created_at) : '—';
                  const orderHasActions = (
                    paymentOrderAllowsAction(order, 'continue_payment')
                    || paymentOrderAllowsAction(order, 'cancel')
                  );
                  return (
                    <div key={order.order_id} data-payment-order-mobile-id={order.order_id} className="grid gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-slate-950 dark:text-white">{resolvePaymentOrderTitle(order, t)}</p>
                          <span title={detailText || undefined}>
                            <PortalStatusBadge label={resolvePaymentOrderStatusLabel(order, t)} status={order.status || 'pending'} />
                          </span>
                        </div>
                        {detailText ? (
                          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400" title={detailText}>{detailText}</p>
                        ) : null}
                        {order.purchase_kind === 'credit_pack' && Number(order.credit_pack?.ai_credits || 0) > 0 ? (
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {t('portal.usage.payment_order_credit_snapshot', { credits: formatNumber(Number(order.credit_pack?.ai_credits || 0)) }, `${formatNumber(Number(order.credit_pack?.ai_credits || 0))} AI credits in this order`)}
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400" title={order.order_id}>
                          {t('portal.usage.payment_order_provider_reference', { provider: resolvePaymentProviderLabel(order, t), order: formatPaymentOrderReference(order.order_id) }, `${resolvePaymentProviderLabel(order, t)}, order ${formatPaymentOrderReference(order.order_id)}`)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{t('portal.usage.payment_order_purchase_amount', {}, 'Purchase amount')}</p>
                        <p className="font-semibold text-slate-950 dark:text-white">
                          {formatPortalCurrency(Number(order.amount || 0), { from: normalizePortalCurrency(order.currency), to: DEFAULT_PORTAL_CURRENCY })}
                        </p>
                        <p className="mt-1 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400" title={timeLabel !== '—' ? timeLabel : undefined}>
                          {timeLabel}
                        </p>
                      </div>
                      {orderHasActions ? renderOrderActions(order, 'flex flex-wrap items-center gap-2') : null}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="rounded-xl border border-slate-200 px-4 py-6 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
              {t('portal.usage.payment_orders_filter_empty', {}, 'No orders in this status.')}
            </p>
          )}
        </div>
        {total > PORTAL_PAYMENT_ORDER_PAGE_SIZE ? (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t(
                'portal.usage.payment_orders_page_summary',
                {
                  start: String(total > 0 ? offset + 1 : 0),
                  end: String(pageEnd),
                  total: String(total),
                },
                `${offset + 1}-${pageEnd} of ${total}`
              )}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={offset === 0 || isLoading}
                onClick={() => onOffsetChange(Math.max(0, offset - PORTAL_PAYMENT_ORDER_PAGE_SIZE))}
              >
                {t('common.previous', {}, 'Previous')}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!payload?.pagination?.has_more || isLoading}
                onClick={() => onOffsetChange(offset + PORTAL_PAYMENT_ORDER_PAGE_SIZE)}
              >
                {t('common.next', {}, 'Next')}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </details>
  );
}
