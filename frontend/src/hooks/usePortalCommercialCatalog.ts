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
  isAuthenticated: boolean;
  t: TranslateFn;
};

export function usePortalCommercialCatalog({
  isAuthenticated,
  t,
}: UsePortalCommercialCatalogOptions) {
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [creditPacks, setCreditPacks] = useState<PortalCreditPackCatalogPayload | null>(null);
  const [planOffers, setPlanOffers] = useState<PortalPlanOfferListPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState('');
  const requestVersionRef = useRef(0);

  const load = useCallback(async () => {
    if (!isAuthenticated) {
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
      if (requestVersion !== requestVersionRef.current) return false;
      setEntitlements(bundle.entitlements);
      setCreditPacks(bundle.creditPacks);
      setPlanOffers(bundle.planOffers || null);
      return true;
    } catch (loadError) {
      if (requestVersion !== requestVersionRef.current) return false;
      setError(formatPortalErrorMessage(loadError, t, t('error.failed_load', {}, 'Failed to load.')));
      setErrorCode(loadError instanceof ApiError ? loadError.errorCode : '');
      return false;
    } finally {
      if (requestVersion === requestVersionRef.current) setIsLoading(false);
    }
  }, [isAuthenticated, t]);

  useLayoutEffect(() => {
    requestVersionRef.current += 1;
    setEntitlements(null);
    setCreditPacks(null);
    setPlanOffers(null);
    setError(null);
    setErrorCode('');
    setIsLoading(Boolean(isAuthenticated));
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void load();
  }, [isAuthenticated, load]);

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
