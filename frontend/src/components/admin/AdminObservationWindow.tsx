'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { BackofficeFilterPill } from '@/components/backoffice/BackofficeFilterPill';
import { useLocale } from '@/contexts/LocaleContext';
import { OBSERVATION_WINDOWS, normalizeObservationWindow, type ObservationWindow } from '@/features/admin/observability/window';

export function AdminObservationWindow({ defaultHours = 336 }: { defaultHours?: ObservationWindow }) {
  const { locale } = useLocale();
  const pathname = usePathname();
  const params = useSearchParams();
  const selected = normalizeObservationWindow(params.get('window'), defaultHours);
  return <div role="group" aria-label={locale === 'zh-CN' ? '观测时间范围' : 'Observation period'} data-ui="admin-observation-window" className="flex flex-wrap items-center gap-1">
    <span className="mr-1 text-xs text-slate-500">{locale === 'zh-CN' ? '近' : 'Last'}</span>
    {OBSERVATION_WINDOWS.map(hours => <BackofficeFilterPill key={hours} active={selected === hours} aria-pressed={selected === hours} tone="info" onClick={() => {
      const next = new URLSearchParams(params.toString());
      next.set('window', String(hours));
      next.delete('focus');
      next.delete('page');
      window.history.pushState(null, '', `${pathname}?${next}`);
    }}>{locale === 'zh-CN' ? `${hours / 24} 天` : `${hours / 24} days`}</BackofficeFilterPill>)}
  </div>;
}
