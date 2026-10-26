'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from '@/contexts/LocaleContext';
import { cn } from '@/lib/utils';
import { workspaceNavigation } from '@/features/admin/navigation';

const matchesRoute = (href: string, pathname: string) => pathname === href || pathname.startsWith(`${href}/`);

type AdminWorkspaceNavigationProps = {
  /** `header` = shell top bar (between breadcrumb and ⌘K). `content` = narrow fallback + freeze note. */
  variant?: 'content' | 'header';
};

export function AdminWorkspaceNavigation({ variant = 'content' }: AdminWorkspaceNavigationProps) {
  const pathname = usePathname();
  const { t } = useLocale();
  const group = workspaceNavigation.find(entry => entry.items.some(item => matchesRoute(item.href, pathname)));
  if (!group) return null;

  const tabLinks = group.items.map(item => {
    const active = matchesRoute(item.href, pathname);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'inline-flex min-h-[var(--admin-compact-control-height)] items-center border-b-2 px-2.5 py-1.5 text-sm font-semibold transition whitespace-nowrap',
          active
            ? 'border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300'
            : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-white'
        )}
      >
        {t(item.labelKey, {}, item.fallback)}
      </Link>
    );
  });

  if (variant === 'header') {
    return (
      <nav
        aria-label={t('admin.workspace_navigation', {}, 'Workspace sections')}
        data-ui="admin-workspace-navigation"
        data-placement="header"
        className="hidden min-w-0 flex-1 items-center justify-center gap-0.5 overflow-x-auto lg:flex"
      >
        {tabLinks}
      </nav>
    );
  }

  const note = group.noteKey ? (
    <p
      data-ui="admin-workspace-navigation-note"
      className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400 lg:mt-0"
    >
      {t(group.noteKey, {}, group.noteFallback)}
    </p>
  ) : null;

  // Narrow: keep content-row tabs. Wide: tabs live in the shell header; only the freeze note stays here.
  if (!note) {
    return (
      <div data-ui="admin-workspace-navigation-block" className="mb-3 lg:hidden">
        <nav
          aria-label={t('admin.workspace_navigation', {}, 'Workspace sections')}
          data-ui="admin-workspace-navigation"
          data-placement="content"
          className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800"
        >
          {tabLinks}
        </nav>
      </div>
    );
  }

  return (
    <div data-ui="admin-workspace-navigation-block" className="mb-3">
      <nav
        aria-label={t('admin.workspace_navigation', {}, 'Workspace sections')}
        data-ui="admin-workspace-navigation"
        data-placement="content"
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 lg:hidden"
      >
        {tabLinks}
      </nav>
      {note}
    </div>
  );
}
