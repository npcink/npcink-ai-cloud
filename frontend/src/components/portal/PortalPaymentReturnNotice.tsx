'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PortalCard } from '@/components/portal/PortalScaffold';
import type { Locale } from '@/lib/i18n';
import { portalClient, type Entitlements, type PortalPaymentOrder } from '@/lib/portal-client';
import { formatPortalErrorMessage } from '@/lib/portal-error';
import { formatDateTime, formatNumber } from '@/lib/utils';

type TranslateFn = (key: string, params?: Record<string, string>, fallback?: string) => string;

type PortalPaymentReturnNoticeProps = {
  t: TranslateFn;
  locale: Locale;
  provider: string;
  orderId: string;
  isAuthenticated: boolean;
  contextSiteId?: string;
  entitlements: Entitlements | null;
  refreshSession: () => Promise<unknown>;
  refreshBilling: () => Promise<unknown>;
  refreshPaymentOrders: () => Promise<unknown>;
};

function normalizePaymentText(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '_');
}

function isPaidPaymentStatus(status: string): boolean {
  return status === 'paid';
}

function isClosedPaymentStatus(status: string): boolean {
  return status === 'canceled' || status === 'refunded';
}

export function PortalPaymentReturnNotice({
  t,
  locale,
  provider,
  orderId,
  isAuthenticated,
  contextSiteId,
  entitlements,
  refreshSession,
  refreshBilling,
  refreshPaymentOrders,
}: PortalPaymentReturnNoticeProps) {
  const [order, setOrder] = useState<PortalPaymentOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [reconciled, setReconciled] = useState(false);
  const [billingFresh, setBillingFresh] = useState(false);
  const [reconcileError, setReconcileError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const dependenciesRef = useRef({ t, refreshSession, refreshBilling, refreshPaymentOrders });
  const normalizedContextSiteId = String(contextSiteId || '').trim();
  const contextSiteIdRef = useRef(normalizedContextSiteId);
  const loadRequestVersionRef = useRef(0);
  const loadOrderPromiseRef = useRef<Promise<PortalPaymentOrder | null> | null>(null);
  const reconcilePromiseRef = useRef<Promise<void> | null>(null);
  const shouldPoll = provider === 'alipay' && Boolean(orderId);
  const visible = Boolean(normalizedContextSiteId) && (shouldPoll || Boolean(order));
  const activeOrderId = orderId || order?.order_id || '';

  useEffect(() => {
    dependenciesRef.current = { t, refreshSession, refreshBilling, refreshPaymentOrders };
  }, [refreshBilling, refreshPaymentOrders, refreshSession, t]);

  useLayoutEffect(() => {
    contextSiteIdRef.current = normalizedContextSiteId;
    loadRequestVersionRef.current += 1;
    setOrder(null);
    setError(null);
    setTimedOut(false);
    setReconciled(false);
    setBillingFresh(false);
    setReconcileError(null);
    setIsRefreshing(false);
    loadOrderPromiseRef.current = null;
    reconcilePromiseRef.current = null;
  }, [normalizedContextSiteId]);

  const loadOrder = useCallback((): Promise<PortalPaymentOrder | null> => {
    if (loadOrderPromiseRef.current) return loadOrderPromiseRef.current;
    const requestContextSiteId = contextSiteIdRef.current;
    if (!requestContextSiteId || !activeOrderId) return Promise.resolve(null);
    const requestVersion = ++loadRequestVersionRef.current;
    const loadPromise = (async () => {
      try {
        const response = await portalClient.getAccountPaymentOrder(activeOrderId);
        if (
          requestVersion !== loadRequestVersionRef.current
          || requestContextSiteId !== contextSiteIdRef.current
        ) return null;
        setOrder(response.data.order);
        setError(null);
        return response.data.order;
      } catch (loadError) {
        if (
          requestVersion !== loadRequestVersionRef.current
          || requestContextSiteId !== contextSiteIdRef.current
        ) return null;
        const translate = dependenciesRef.current.t;
        setError(formatPortalErrorMessage(loadError, translate, translate('error.failed_load')));
        return null;
      } finally {
        if (
          requestVersion === loadRequestVersionRef.current
          && requestContextSiteId === contextSiteIdRef.current
        ) {
          loadOrderPromiseRef.current = null;
        }
      }
    })();
    loadOrderPromiseRef.current = loadPromise;
    return loadPromise;
  }, [activeOrderId]);

  const reconcile = useCallback((): Promise<void> => {
    if (reconcilePromiseRef.current) return reconcilePromiseRef.current;
    const reconcileContextSiteId = contextSiteIdRef.current;
    if (!reconcileContextSiteId) return Promise.resolve();
    setIsRefreshing(true);
    setReconciled(false);
    setBillingFresh(false);
    setReconcileError(null);
    const dependencies = dependenciesRef.current;
    const reconcilePromise = Promise.allSettled([
      dependencies.refreshSession(),
      dependencies.refreshBilling(),
      dependencies.refreshPaymentOrders(),
    ]).then((results) => {
      if (reconcileContextSiteId !== contextSiteIdRef.current) return;
      const failed = results.some(
        (result) => result.status === 'rejected' || result.value === false
      );
      const billingResult = results[1];
      setBillingFresh(
        billingResult.status === 'fulfilled' && billingResult.value !== false
      );
      setReconciled(true);
      if (failed) {
        setReconcileError(
          dependenciesRef.current.t(
            'portal.package.alipay_return_refresh_partial',
            {},
            'Payment status is confirmed, but some account totals could not be refreshed. Try again.'
          )
        );
      }
    }).finally(() => {
      if (reconcilePromiseRef.current === reconcilePromise) {
        reconcilePromiseRef.current = null;
      }
      if (reconcileContextSiteId === contextSiteIdRef.current) {
        setIsRefreshing(false);
      }
    });
    reconcilePromiseRef.current = reconcilePromise;
    return reconcilePromise;
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !normalizedContextSiteId || !shouldPoll) return;
    const pollContextSiteId = normalizedContextSiteId;
    let canceled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const poll = async () => {
      const nextOrder = await loadOrder();
      if (canceled || pollContextSiteId !== contextSiteIdRef.current) return;
      const status = normalizePaymentText(nextOrder?.status);
      if (isPaidPaymentStatus(status) || isClosedPaymentStatus(status)) {
        window.history.replaceState(window.history.state, '', '/portal/billing');
        await reconcile();
        if (canceled || pollContextSiteId !== contextSiteIdRef.current) return;
        return;
      }
      attempts += 1;
      if (attempts >= 20) {
        setTimedOut(true);
        return;
      }
      timer = setTimeout(() => void poll(), 3000);
    };
    setTimedOut(false);
    void poll();
    return () => {
      canceled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isAuthenticated, loadOrder, normalizedContextSiteId, reconcile, shouldPoll]);

  if (!visible) return null;

  const status = normalizePaymentText(order?.status);
  const paid = isPaidPaymentStatus(status);
  const closed = isClosedPaymentStatus(status);
  const credits = Number(order?.credit_pack?.ai_credits || 0);
  const creditQuota = entitlements?.quota_summary?.ai_credits;
  const totalAvailableValue = creditQuota?.total_remaining;
  const totalAvailable = totalAvailableValue == null ? null : Number(totalAvailableValue);
  const nextExpiry = String(creditQuota?.paid_next_expires_at || '');

  const handleRefresh = async () => {
    const refreshContextSiteId = contextSiteIdRef.current;
    if (!refreshContextSiteId || isRefreshing) return;
    setTimedOut(false);
    const nextOrder = await loadOrder();
    if (refreshContextSiteId !== contextSiteIdRef.current) return;
    const nextStatus = normalizePaymentText(nextOrder?.status);
    if (isPaidPaymentStatus(nextStatus) || isClosedPaymentStatus(nextStatus)) {
      window.history.replaceState(window.history.state, '', '/portal/billing');
    }
    await reconcile();
  };

  return (
    <PortalCard
      data-ui="payment-return-notice"
      role="status"
      aria-live="polite"
      className={paid
        ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/20'
        : closed
          ? 'border-red-200 bg-red-50/70 dark:border-red-900/60 dark:bg-red-950/20'
          : 'border-blue-200 bg-blue-50/70 dark:border-blue-900/60 dark:bg-blue-950/20'}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-950 dark:text-white">
            {paid
              ? t('portal.package.alipay_return_paid_title', {}, 'Payment confirmed')
              : closed
                ? t('portal.package.alipay_return_closed_title', {}, 'Payment was not completed')
                : t('portal.package.alipay_return_title', {}, 'Payment confirmation is pending')}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
            {paid
              ? credits > 0
                ? t('portal.package.alipay_return_paid_credits_desc', { count: formatNumber(credits) }, `Payment is confirmed and ${formatNumber(credits)} credits were added.`)
                : t('portal.package.alipay_return_paid_desc', {}, 'Payment is confirmed and your package has been updated.')
              : closed
                ? t('portal.package.alipay_return_closed_desc', {}, 'This order is closed. You can create a new order if needed.')
                : timedOut
                  ? t('portal.package.alipay_return_timeout_desc', {}, 'Confirmation is taking longer than expected. Refresh again or contact support with the order number.')
                  : t('portal.package.alipay_return_desc', {}, 'You have returned from Alipay. Cloud is checking the verified asynchronous notification.')}
          </p>
          {paid && credits > 0 ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <div data-payment-return-metric="credited" className="rounded-xl border border-emerald-200/80 bg-white/70 px-3 py-3 dark:border-emerald-900/70 dark:bg-slate-950/40">
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('portal.package.alipay_return_credited_label', {}, 'Added this time')}</p>
                <p className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">{formatNumber(credits)}</p>
              </div>
              <div data-payment-return-metric="total-available" className="rounded-xl border border-emerald-200/80 bg-white/70 px-3 py-3 dark:border-emerald-900/70 dark:bg-slate-950/40">
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('portal.usage.total_remaining_label', {}, 'Total available')}</p>
                <p className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">
                  {!reconciled
                    ? t('common.loading', {}, 'Loading...')
                    : billingFresh && totalAvailable != null && Number.isFinite(totalAvailable)
                      ? formatNumber(totalAvailable)
                      : t('common.not_available', {}, 'Not available')}
                </p>
              </div>
              <div data-payment-return-metric="next-expiry" className="rounded-xl border border-emerald-200/80 bg-white/70 px-3 py-3 dark:border-emerald-900/70 dark:bg-slate-950/40">
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('portal.package.alipay_return_expiry_label', {}, 'Nearest paid-credit expiry')}</p>
                <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">
                  {!reconciled
                    ? t('common.loading', {}, 'Loading...')
                    : billingFresh && nextExpiry
                      ? formatDateTime(nextExpiry, locale)
                      : t('common.not_available', {}, 'Not available')}
                </p>
              </div>
            </div>
          ) : null}
          {activeOrderId ? <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t('portal.package.alipay_return_order', { order: activeOrderId }, `Order ${activeOrderId}`)}</p> : null}
          {error ? <p className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</p> : null}
          {reconcileError ? <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">{reconcileError}</p> : null}
        </div>
        {(!paid && !closed) || Boolean(reconcileError) ? (
          <button
            type="button"
            className="btn btn-secondary shrink-0"
            disabled={isRefreshing}
            onClick={() => void handleRefresh()}
          >
            {reconcileError
              ? t('common.retry', {}, 'Retry')
              : t('common.refresh', {}, 'Refresh')}
          </button>
        ) : null}
      </div>
    </PortalCard>
  );
}
