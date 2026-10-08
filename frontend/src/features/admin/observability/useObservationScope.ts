'use client';

import { useEffect, useMemo } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { normalizeObservationWindow, observationCapability } from './window';

/** Navigation, active controls and requests share the effective URL scope. */
export function useObservationScope(canonicalize = true): URLSearchParams {
  const pathname = usePathname();
  const params = useSearchParams();
  const capability = observationCapability(`${pathname}?${params}`);
  const raw = params.get('window');
  const selected = capability ? normalizeObservationWindow(raw, undefined, capability) : null;
  const scope = useMemo(() => {
    const next = new URLSearchParams(params.toString());
    if (selected !== null) next.set('window', String(selected));
    return next;
  }, [params, selected]);
  useEffect(() => {
    if (canonicalize && raw !== null && selected !== null && raw !== String(selected)) {
      window.history.replaceState(null, '', `${pathname}?${scope}`);
    }
  }, [canonicalize, pathname, raw, selected, scope]);
  return scope;
}
