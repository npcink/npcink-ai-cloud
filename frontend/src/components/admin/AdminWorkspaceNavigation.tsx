'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from '@/contexts/LocaleContext';
import { cn } from '@/lib/utils';
import { workspaceNavigation } from '@/features/admin/navigation';

const matchesRoute = (href: string, pathname: string) => pathname === href || pathname.startsWith(`${href}/`);

export function AdminWorkspaceNavigation() {
  const pathname = usePathname();
  const { t } = useLocale();
  const group = workspaceNavigation.find(entry => entry.items.some(item => matchesRoute(item.href, pathname)));
  if (!group) return null;
  return (
    <div data-ui="admin-workspace-navigation-block" className="mb-3">
      <nav
        aria-label={t('admin.workspace_navigation', {}, 'Workspace sections')}
        data-ui="admin-workspace-navigation"
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800"
      >
        {group.items.map(item => {
          const active = matchesRoute(item.href, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-[var(--admin-compact-control-height)] items-center border-b-2 px-3 py-2 text-sm font-semibold transition',
                active
                  ? 'border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-white'
              )}
            >
              {t(item.labelKey, {}, item.fallback)}
            </Link>
          );
        })}
      </nav>
      {group.noteKey ? (
        <p
          data-ui="admin-workspace-navigation-note"
          className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400"
        >
          {t(group.noteKey, {}, group.noteFallback)}
        </p>
      ) : null}
    </div>
  );
}
