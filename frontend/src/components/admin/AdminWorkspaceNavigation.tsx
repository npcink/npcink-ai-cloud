'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from '@/contexts/LocaleContext';
import { cn } from '@/lib/utils';
import {
  adminNavigationWindowHint,
  adminScopedNavigationHref,
  diagnosticNavigation,
  observationNavigation,
  workspaceNavigation,
} from '@/features/admin/navigation';
import { useObservationScope } from '@/features/admin/observability/useObservationScope';
import { AdminNavigationScopeHint } from './AdminNavigationScopeHint';

const matchesRoute = (href: string, pathname: string) => {
  const route = href.split('?')[0];
  return pathname === route || pathname.startsWith(`${route}/`);
};

/** One shell-owned secondary navigation for every Admin family. */
export function AdminWorkspaceNavigation() {
  const pathname = usePathname();
  const params = useObservationScope(false);
  const { t, locale } = useLocale();
  const observation = observationNavigation.some(item => matchesRoute(item.href, pathname));
  const diagnostic = diagnosticNavigation.some(item => matchesRoute(item.href, pathname));
  const items = observation ? observationNavigation : diagnostic ? diagnosticNavigation
    : workspaceNavigation.find(entry => entry.items.some(item => matchesRoute(item.href, pathname)))?.items;
  if (!items) return null;
  const quality = pathname === '/admin/usage-statistics' && params.get('view') === 'quality';

  return (
    <nav
      aria-label={observation ? (locale === 'zh-CN' ? '运行观测' : 'Runtime observation')
        : diagnostic ? t('admin.navigation.related_diagnostics') : t('admin.workspace_navigation', {}, 'Workspace sections')}
      data-ui={observation ? 'admin-observability-tabs' : diagnostic ? 'admin-diagnostic-navigation' : 'admin-workspace-navigation'}
      data-placement="header"
      data-admin-secondary-navigation="true"
      className="flex w-max max-w-full flex-wrap items-center justify-center gap-0.5"
    >
      {items.map(item => {
        const active = observation
          ? item.href.includes('?view=quality') ? quality : pathname === item.href && !quality
          : matchesRoute(item.href, pathname);
        return (
          <span key={item.href} className="inline-flex shrink-0 items-center">
            <Link
              href={observation || diagnostic ? adminScopedNavigationHref(item.href, params) : item.href}
              aria-current={active ? 'page' : undefined}
              title={observation || diagnostic ? adminNavigationWindowHint(item.href, params, locale) : undefined}
              className={cn(
                'inline-flex min-h-[var(--admin-compact-control-height)] items-center whitespace-nowrap border-b-2 px-2.5 py-1.5 text-sm font-semibold transition',
                active
                  ? 'border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-white'
              )}
            >
              {t(item.labelKey, {}, item.fallback)}
            </Link>
            {observation || diagnostic ? <AdminNavigationScopeHint href={item.href} params={params} /> : null}
          </span>
        );
      })}
    </nav>
  );
}
