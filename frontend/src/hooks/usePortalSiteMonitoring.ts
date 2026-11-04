'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { portalClient, type PortalMonitoringOverviewSummary } from '@/lib/portal-client';
import { formatPortalErrorMessage } from '@/lib/portal-error';

type TranslateFn = (key: string, params?: Record<string, string>, fallback?: string) => string;

export type PortalSiteMonitoringRefreshNotice = 'success' | 'error' | null;

export function usePortalSiteMonitoring(siteId: string, t: TranslateFn) {
  const [overview, setOverview] = useState<PortalMonitoringOverviewSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [refreshNotice, setRefreshNotice] = useState<PortalSiteMonitoringRefreshNotice>(null);
  const manualRefreshRef = useRef(false);

  const refresh = useCallback(() => {
    manualRefreshRef.current = true;
    setRefreshNotice(null);
    setIsRefreshing(true);
    setRefreshNonce((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!siteId) {
      setOverview(null);
      setError('');
      setRefreshNotice(null);
      setIsRefreshing(false);
      return;
    }

    let isCancelled = false;
    const wasManual = manualRefreshRef.current;
    setIsLoading(true);
    setError('');
    void portalClient
      .getMonitoringOverview(siteId, { windowHours: 24 })
      .then((response) => {
        if (isCancelled) return;
        setOverview(response.data);
        if (wasManual) {
          manualRefreshRef.current = false;
          setRefreshNotice('success');
        }
      })
      .catch((loadError) => {
        if (isCancelled) return;
        setOverview(null);
        setError(formatPortalErrorMessage(
          loadError,
          t,
          t('portal.monitoring.load_failed', {}, 'Service status could not be loaded for the current site.')
        ));
        if (wasManual) {
          manualRefreshRef.current = false;
          setRefreshNotice('error');
        }
      })
      .finally(() => {
        if (isCancelled) return;
        setIsLoading(false);
        if (wasManual) setIsRefreshing(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [refreshNonce, siteId, t]);

  return {
    overview,
    isLoading,
    error,
    refresh,
    isRefreshing,
    refreshNotice,
    clearRefreshNotice: () => setRefreshNotice(null),
  };
}
