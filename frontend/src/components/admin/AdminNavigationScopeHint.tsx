'use client';

import { AdminHelpTip } from './AdminHelpTip';
import { useLocale } from '@/contexts/LocaleContext';
import { adminNavigationWindowHint, adminNavigationWindowHours } from '@/features/admin/navigation';

type Props = { href: string; params: Pick<URLSearchParams, 'get'> };
/** Important scope changes remain visible; the reason is available by focus or tap. */
export function AdminNavigationScopeHint({ href, params }: Props) {
  const { locale, t } = useLocale();
  const hint = adminNavigationWindowHint(href, params, locale);
  if (!hint) return null;
  const hours = adminNavigationWindowHours(href, params);
  if (hours === null) return null;
  const period = t('admin.navigation.window_period', { days: String(hours / 24) });
  return <span data-ui="admin-navigation-scope-change" className="inline-flex items-center text-xs font-normal text-slate-500 dark:text-slate-400">
    <span>{period}</span><AdminHelpTip label={hint}>{hint}</AdminHelpTip>
  </span>;
}
