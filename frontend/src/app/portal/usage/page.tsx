'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LoadingFallback } from '@/components/ui/LoadingFallback';

/**
 * Deep-link shim: Spec merges Usage into Package.
 * Preserve query (site/view) and land on /portal/billing#usage.
 */
function PortalUsageRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const query = searchParams.toString();
    router.replace(`/portal/billing${query ? `?${query}` : ''}#usage`);
  }, [router, searchParams]);

  return <LoadingFallback />;
}

export default function PortalUsagePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <PortalUsageRedirect />
    </Suspense>
  );
}
