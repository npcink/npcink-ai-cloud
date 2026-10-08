'use client';

import { AdminHelpTip } from './AdminHelpTip';
import { useLocale } from '@/contexts/LocaleContext';
import { adminNavigationWindowHint, adminScopedNavigationHref } from '@/features/admin/navigation';

type Props = { href: string; params: Pick<URLSearchParams, 'get'> };
/** Important scope changes remain visible; the reason is available by focus or tap. */
export function AdminNavigationScopeHint({ href, params }: Props) {
  const { locale } = useLocale();
  const hint = adminNavigationWindowHint(href, params, locale);
  if (!hint) return null;
  const hours = Number(new URL(adminScopedNavigationHref(href, params), 'https://admin.invalid').searchParams.get('window'));
  const period = locale === 'zh-CN' ? `近 ${hours / 24} 天` : `Last ${hours / 24} days`;
  return <span data-ui="admin-navigation-scope-change" className="inline-flex items-center text-xs font-normal text-slate-500 dark:text-slate-400">
    <span>{period}</span><AdminHelpTip label={hint}>{hint}</AdminHelpTip>
  </span>;
}
