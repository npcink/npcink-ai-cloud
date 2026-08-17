'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';
import { LoadingFallback } from '@/components/ui/LoadingFallback';
import { useSession } from '@/hooks/useSession';
import { formatPortalErrorReference } from '@/lib/portal-error';
import { useLocale } from '@/contexts/LocaleContext';
import { recordPortalJourneyBestEffort } from '@/lib/portal-customer-journey';

const PUBLIC_PORTAL_PATHS = new Set([
  '/portal/login',
  '/portal/register',
  '/portal/dev-entry',
]);

export function PortalSessionBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { t } = useLocale();
  const { session, isAuthenticated, isLoading, sessionInvalid, error, logout, refresh } = useSession();
  const redirectStartedRef = useRef(false);
  const isPublicPath = PUBLIC_PORTAL_PATHS.has(pathname);
  const selectedSiteId = session?.selected_context?.site.site_id || '';

  useEffect(() => {
    if (!isAuthenticated || !selectedSiteId) return;
    void recordPortalJourneyBestEffort(selectedSiteId, 'login', 'succeeded', {
      oncePerSession: true,
    });
  }, [isAuthenticated, selectedSiteId]);

  useEffect(() => {
    if (isPublicPath) {
      redirectStartedRef.current = false;
      return;
    }
    if (isLoading || isAuthenticated || !sessionInvalid || redirectStartedRef.current) {
      return;
    }

    redirectStartedRef.current = true;
    const returnTo = `${pathname}${window.location.search}`;
    const loginUrl = `/portal/login?redirect=${encodeURIComponent(returnTo)}`;
    void logout().finally(() => window.location.replace(loginUrl));
  }, [isAuthenticated, isLoading, isPublicPath, logout, pathname, sessionInvalid]);

  if (!isPublicPath && !isLoading && !isAuthenticated) {
    if (!sessionInvalid) {
      const reference = formatPortalErrorReference(error);
      return (
        <main className="mx-auto flex min-h-[60vh] max-w-xl items-center px-5 py-16">
          <div className="w-full rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-100" role="alert">
            <h1 className="text-xl font-semibold">
              {t('portal.session_check_failed_title', {}, 'Portal is temporarily unavailable')}
            </h1>
            <p className="mt-2 text-sm leading-6">
              {t(
                'portal.session_check_failed_desc',
                {},
                'We could not verify your session. Your browser has not been signed out.'
              )}
            </p>
            {reference ? (
              <p className="mt-2 text-xs opacity-75">
                {t('portal.support_reference', {}, 'Reference')}: {reference}
              </p>
            ) : null}
            <button type="button" className="btn btn-primary mt-5" onClick={() => void refresh()}>
              {t('common.retry', {}, 'Try again')}
            </button>
          </div>
        </main>
      );
    }
    return <LoadingFallback />;
  }

  return children;
}
