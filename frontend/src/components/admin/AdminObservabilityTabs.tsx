'use client';

import Link from 'next/link';
import { AdminNavigationScopeHint } from './AdminNavigationScopeHint';
import { usePathname } from 'next/navigation';
import { useLocale } from '@/contexts/LocaleContext';
import { AdminObservationWindow } from '@/components/admin/AdminObservationWindow';
import { adminNavigationWindowHint, adminScopedNavigationHref, observationNavigation } from '@/features/admin/navigation';
import { useObservationScope } from '@/features/admin/observability/useObservationScope';
import { cn } from '@/lib/utils';

export function AdminObservabilityTabs({ showWindow = true }: { showWindow?: boolean }) {
  const { locale, t } = useLocale();
  const pathname = usePathname();
  const params = useObservationScope();
  const quality = pathname === '/admin/usage-statistics' && params.get('view') === 'quality';
  return <div data-ui="admin-observability-toolbar" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
    <nav aria-label={locale === 'zh-CN' ? '运行观测' : 'Runtime observation'} data-ui="admin-observability-tabs" className="flex flex-wrap gap-1">
      {observationNavigation.map(item => {
        const active = item.href.includes('?view=quality') ? quality : pathname === item.href && !quality;
        return <span key={item.href} className="inline-flex items-center"><Link href={adminScopedNavigationHref(item.href, params)} aria-current={active ? 'page' : undefined} title={adminNavigationWindowHint(item.href, params, locale)} className={cn('inline-flex min-h-[var(--admin-compact-control-height)] items-center border-b-2 px-3 py-2 text-sm font-semibold transition', active ? 'border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-white')}>{t(item.labelKey, {}, item.fallback)}</Link><AdminNavigationScopeHint href={item.href} params={params} /></span>;
      })}
    </nav>
    {showWindow ? <AdminObservationWindow /> : null}
  </div>;
}
