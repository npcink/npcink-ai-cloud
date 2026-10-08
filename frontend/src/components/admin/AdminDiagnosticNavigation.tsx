'use client';

import Link from 'next/link';
import { AdminNavigationScopeHint } from './AdminNavigationScopeHint';
import { usePathname } from 'next/navigation';
import { useLocale } from '@/contexts/LocaleContext';
import { useObservationScope } from '@/features/admin/observability/useObservationScope';
import { cn } from '@/lib/utils';
import { adminNavigationWindowHint, adminScopedNavigationHref, diagnosticNavigation } from '@/features/admin/navigation';

export function AdminDiagnosticNavigation() {
  const pathname = usePathname();
  const params = useObservationScope();
  const { t, locale } = useLocale();
  // The index already exposes these entrances in its direct tool footer.
  if (pathname === '/admin/troubleshooting' || !diagnosticNavigation.some(item => item.href === pathname)) return null;
  return <nav aria-label={locale === 'zh-CN' ? '相关诊断页面' : 'Related diagnostic pages'} data-ui="admin-diagnostic-navigation" className="mb-3 flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
    {diagnosticNavigation.map(item => <span key={item.href} className="inline-flex items-center"><Link href={adminScopedNavigationHref(item.href, params)} title={adminNavigationWindowHint(item.href, params, locale)} aria-current={pathname === item.href ? 'page' : undefined} className={cn('inline-flex min-h-[var(--admin-compact-control-height)] items-center border-b-2 px-3 py-2 text-sm font-semibold transition', pathname === item.href ? 'border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-white')}>
      {t(item.labelKey, {}, item.fallback)}
    </Link><AdminNavigationScopeHint href={item.href} params={params} /></span>)}
  </nav>;
}

export function AdminParentNavigationLink({ href, label }: { href: string; label: string }) {
  const params = useObservationScope(false);
  return <Link href={adminScopedNavigationHref(href, params)} className="truncate font-semibold text-slate-900 hover:text-blue-700 hover:underline dark:text-slate-100 dark:hover:text-blue-300">{label}</Link>;
}
