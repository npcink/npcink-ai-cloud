'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  portalClient,
  type Entitlements,
  type PortalCreditPackCatalogPayload,
  type PortalPlanOfferListPayload,
} from '@/lib/portal-client';
import { ApiError } from '@/lib/errors';
import { formatPortalErrorMessage } from '@/lib/portal-error';

type TranslateFn = (key: string, params?: Record<string, string>, fallback?: string) => string;

type UsePortalCommercialCatalogOptions = {
  contextSiteId?: string;
  isAuthenticated: boolean;
  t: TranslateFn;
};

export function usePortalCommercialCatalog({
  contextSiteId,
  isAuthenticated,
  t,
}: UsePortalCommercialCatalogOptions) {
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [creditPacks, setCreditPacks] = useState<PortalCreditPackCatalogPayload | null>(null);
  const [planOffers, setPlanOffers] = useState<PortalPlanOfferListPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState('');
  const normalizedContextSiteId = String(contextSiteId || '').trim();
  const contextSiteIdRef = useRef(normalizedContextSiteId);
  const requestVersionRef = useRef(0);

  const load = useCallback(async () => {
    const requestContextSiteId = contextSiteIdRef.current;
    if (!isAuthenticated || !requestContextSiteId) {
      requestVersionRef.current += 1;
      setEntitlements(null);
      setCreditPacks(null);
      setPlanOffers(null);
      setIsLoading(false);
      setError(null);
      setErrorCode('');
      return false;
    }
    const requestVersion = ++requestVersionRef.current;
    setIsLoading(true);
    setError(null);
    setErrorCode('');
    try {
      const bundle = await portalClient.getAccountCommercialBundle();
      if (
        requestVersion !== requestVersionRef.current
        || requestContextSiteId !== contextSiteIdRef.current
      ) return false;
      setEntitlements(bundle.entitlements);
      setCreditPacks(bundle.creditPacks);
      setPlanOffers(bundle.planOffers || null);
      return true;
    } catch (loadError) {
      if (
        requestVersion !== requestVersionRef.current
        || requestContextSiteId !== contextSiteIdRef.current
      ) return false;
      setError(formatPortalErrorMessage(loadError, t, t('error.failed_load', {}, 'Failed to load.')));
      setErrorCode(loadError instanceof ApiError ? loadError.errorCode : '');
      return false;
    } finally {
      if (
        requestVersion === requestVersionRef.current
        && requestContextSiteId === contextSiteIdRef.current
      ) setIsLoading(false);
    }
  }, [isAuthenticated, t]);

  useLayoutEffect(() => {
    contextSiteIdRef.current = normalizedContextSiteId;
    requestVersionRef.current += 1;
    setEntitlements(null);
    setCreditPacks(null);
    setPlanOffers(null);
    setError(null);
    setErrorCode('');
    setIsLoading(Boolean(isAuthenticated && normalizedContextSiteId));
  }, [isAuthenticated, normalizedContextSiteId]);

  useEffect(() => {
    if (!isAuthenticated || !normalizedContextSiteId) {
      return;
    }
    void load();
  }, [isAuthenticated, load, normalizedContextSiteId]);

  return {
    entitlements,
    creditPacks,
    planOffers,
    isLoading,
    error,
    errorCode,
    load,
  };
}
