'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Center navigation against the whole content area; use a second row when utilities need the space. */
export function AdminHeaderLayout({ left, navigation, utilities }: {
  left: ReactNode;
  navigation: ReactNode;
  utilities: ReactNode;
}) {
  const headerRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const utilitiesRef = useRef<HTMLDivElement>(null);
  const navigationRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<'empty' | 'inline' | 'row'>('row');

  useEffect(() => {
    const header = headerRef.current;
    const leftElement = leftRef.current;
    const utilitiesElement = utilitiesRef.current;
    const navigationElement = navigationRef.current;
    if (!header || !leftElement || !utilitiesElement || !navigationElement) return;
    let frame = 0;
    const measure = () => {
      if (!navigationElement.querySelector('nav')) {
        setPlacement('empty');
        return;
      }
      const style = getComputedStyle(header);
      const available = header.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const side = Math.max(leftElement.getBoundingClientRect().width, utilitiesElement.getBoundingClientRect().width);
      const required = navigationElement.scrollWidth + 2 * (side + parseFloat(style.columnGap));
      setPlacement(available >= required ? 'inline' : 'row');
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const resize = new ResizeObserver(schedule);
    for (const element of [header, leftElement, utilitiesElement, navigationElement]) resize.observe(element);
    const mutation = new MutationObserver(schedule);
    mutation.observe(navigationElement, { childList: true, subtree: true });
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
    };
  }, []);

  return (
    <div ref={headerRef} data-ui="admin-header-layout" data-navigation-layout={placement}
      className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-1.5 md:px-5">
      <div ref={leftRef} className="col-start-1 row-start-1 flex w-max items-center">{left}</div>
      <div data-ui="admin-header-secondary" className={cn(
        'min-w-0 max-w-full justify-self-center overflow-x-auto',
        placement === 'empty' ? 'hidden' : placement === 'inline' ? 'col-start-2 row-start-1' : 'col-span-3 col-start-1 row-start-2'
      )}>
        <div ref={navigationRef} className="w-max max-w-full">{navigation}</div>
      </div>
      <div ref={utilitiesRef} className="col-start-3 row-start-1 w-max justify-self-end">{utilities}</div>
    </div>
  );
}
