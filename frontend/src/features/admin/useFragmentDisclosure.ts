'use client';

import { useEffect, useRef } from 'react';

/** Fragment evidence links must reveal content mounted after asynchronous loading. */
export function useFragmentDisclosure(fragment: string, ready = true) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const reveal = () => {
      if (ready && window.location.hash === `#${fragment}` && ref.current) {
        ref.current.open = true;
        document.getElementById(fragment)?.scrollIntoView({ block: 'start' });
      }
    };
    reveal();
    window.addEventListener('hashchange', reveal);
    return () => window.removeEventListener('hashchange', reveal);
  }, [fragment, ready]);
  return ref;
}
