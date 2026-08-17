'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PORTAL_PAYMENT_ORDER_PAGE_SIZE } from '@/components/portal/PortalPaymentOrderHistory';
import {
  portalClient,
  type PortalPaymentOrder,
  type PortalPaymentOrderListPayload,
  type PortalPaymentOrderStatusGroup,
} from '@/lib/portal-client';
import { formatPortalErrorMessage } from '@/lib/portal-error';
import { ApiError } from '@/lib/errors';

type TranslateFn = (key: string, params?: Record<string, string>, fallback?: string) => string;

type UsePortalPaymentOrdersOptions = {
  isAuthenticated: boolean;
  t: TranslateFn;
};

export function usePortalPaymentOrders({
  isAuthenticated,
  t,
}: UsePortalPaymentOrdersOptions) {
  const [payload, setPayload] = useState<PortalPaymentOrderListPayload | null>(null);
  const [statusGroup, setStatusGroup] = useState<PortalPaymentOrderStatusGroup>('all');
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState('');
  const [cancelPendingOrderId, setCancelPendingOrderId] = useState<string | null>(null);
  const [cancelConfirmOrderId, setCancelConfirmOrderId] = useState<string | null>(null);
  const tabInitialized = useRef(false);
  const loadRequestVersionRef = useRef(0);
  const cancelRequestVersionRef = useRef(0);

  const load = useCallback(
    async (nextStatusGroup: PortalPaymentOrderStatusGroup, nextOffset: number) => {
      if (!isAuthenticated) {
        loadRequestVersionRef.current += 1;
        setIsLoading(false);
        return false;
      }
      const requestVersion = ++loadRequestVersionRef.current;
      setIsLoading(true);
      setError(null);
      setErrorCode('');
      try {
        const response = await portalClient.listAccountPaymentOrders({
          statusGroup: nextStatusGroup,
          limit: PORTAL_PAYMENT_ORDER_PAGE_SIZE,
          offset: nextOffset,
        });
        if (requestVersion !== loadRequestVersionRef.current) return false;
        setPayload(response.data);
        if (!tabInitialized.current) {
          tabInitialized.current = true;
          const initialGroup = Number(response.data.counts?.pending || 0) > 0 ? 'pending' : 'all';
          if (initialGroup !== nextStatusGroup) {
            setStatusGroup(initialGroup);
            setOffset(0);
          }
        }
        return true;
      } catch (loadError) {
        if (requestVersion !== loadRequestVersionRef.current) return false;
        setError(formatPortalErrorMessage(loadError, t, t('error.failed_load')));
        setErrorCode(loadError instanceof ApiError ? loadError.errorCode : '');
        return false;
      } finally {
        if (requestVersion === loadRequestVersionRef.current) setIsLoading(false);
      }
    },
    [isAuthenticated, t]
  );

  useLayoutEffect(() => {
    loadRequestVersionRef.current += 1;
    cancelRequestVersionRef.current += 1;
    tabInitialized.current = false;
    setPayload(null);
    setStatusGroup('all');
    setOffset(0);
    setIsLoading(Boolean(isAuthenticated));
    setError(null);
    setErrorCode('');
    setCancelPendingOrderId(null);
    setCancelConfirmOrderId(null);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void load(statusGroup, offset);
  }, [isAuthenticated, load, offset, statusGroup]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const refresh = () => void load(statusGroup, offset);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, load, offset, statusGroup]);

  const cancel = useCallback(async (order: PortalPaymentOrder) => {
    if (!isAuthenticated) return;
    const requestVersion = ++cancelRequestVersionRef.current;
    setCancelPendingOrderId(order.order_id);
    setCancelConfirmOrderId(null);
    setError(null);
    setErrorCode('');
    try {
      await portalClient.cancelAccountPaymentOrder(order.order_id);
      if (requestVersion !== cancelRequestVersionRef.current) return;
      await load(statusGroup, offset);
    } catch (cancelError) {
      if (requestVersion !== cancelRequestVersionRef.current) return;
      setError(formatPortalErrorMessage(cancelError, t, t('error.failed_save')));
      setErrorCode(cancelError instanceof ApiError ? cancelError.errorCode : '');
    } finally {
      if (requestVersion === cancelRequestVersionRef.current) setCancelPendingOrderId(null);
    }
  }, [isAuthenticated, load, offset, statusGroup, t]);

  return {
    payload,
    statusGroup,
    offset,
    isLoading,
    error,
    errorCode,
    cancelPendingOrderId,
    cancelConfirmOrderId,
    load,
    cancel,
    setStatusGroup,
    setOffset,
    setCancelConfirmOrderId,
  };
}
