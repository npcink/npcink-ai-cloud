'use client';

import Link from 'next/link';
import React from 'react';
import { cn } from '@/lib/utils';

export type PortalBreadcrumbItem = {
  label: string;
  href?: string;
};

type PortalBreadcrumbProps = {
  items: PortalBreadcrumbItem[];
  className?: string;
  'aria-label'?: string;
};

/**
 * Quiet portal trail: slash-separated text links above a workspace title.
 * Current page is plain text (no href). Empty items are skipped.
 */
export function PortalBreadcrumb({
  items,
  className,
  'aria-label': ariaLabel,
}: PortalBreadcrumbProps) {
  const visible = items.filter((item) => item.label.trim().length > 0);
  if (visible.length === 0) return null;

  return (
    <nav
      aria-label={ariaLabel}
      data-portal-breadcrumb=""
      className={cn('min-w-0', className)}
    >
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
        {visible.map((item, index) => {
          const isCurrent = !item.href;
          return (
            <li key={`${item.label}-${index}`} className="inline-flex min-w-0 max-w-full items-center gap-1.5">
              {index > 0 ? (
                <span className="shrink-0 text-slate-300 dark:text-slate-600" aria-hidden="true">
                  /
                </span>
              ) : null}
              {item.href ? (
                <Link
                  href={item.href}
                  className="truncate rounded-sm font-medium text-slate-600 transition hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:text-slate-300 dark:hover:text-white"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className="truncate font-medium text-slate-800 dark:text-slate-100"
                  aria-current={isCurrent ? 'page' : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
