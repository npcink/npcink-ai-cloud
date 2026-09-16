'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useLocale } from '@/contexts/LocaleContext';
import { AdminObservationWindow } from '@/components/admin/AdminObservationWindow';
import { normalizeObservationWindow } from '@/features/admin/observability/window';
import { cn } from '@/lib/utils';

export function AdminObservabilityTabs() {
  const { locale } = useLocale();
  const pathname = usePathname();
  const params = useSearchParams();
  const quality = pathname === '/admin/usage-statistics' && params.get('view') === 'quality';
  const tabs = [
    ['/admin/usage-statistics', '使用统计', 'Usage statistics', !quality && pathname === '/admin/usage-statistics'],
    ['/admin/media-observability', '媒体观测', 'Media observability', pathname === '/admin/media-observability'],
    ['/admin/vector-observability', '向量观测', 'Vector observability', pathname === '/admin/vector-observability'],
    ['/admin/usage-statistics?view=quality', '编辑质量证据', 'Editorial quality evidence', quality],
  ] as const;
  const hrefWithScope = (href: string) => {
    const [route, query] = href.split('?');
    const next = new URLSearchParams(query);
    next.set('window', String(normalizeObservationWindow(params.get('window'))));
    if (params.get('site')) next.set('site', params.get('site')!);
    return `${route}?${next}`;
  };
  return <div data-ui="admin-observability-toolbar" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
    <nav aria-label={locale === 'zh-CN' ? '运行观测' : 'Runtime observation'} data-ui="admin-observability-tabs" className="flex flex-wrap gap-1">
      {tabs.map(([href, zh, en, active]) => <Link key={href} href={hrefWithScope(href)} aria-current={active ? 'page' : undefined} className={cn('border-b-2 px-3 py-2 text-sm font-semibold transition', active ? 'border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-white')}>{locale === 'zh-CN' ? zh : en}</Link>)}
    </nav>
    <AdminObservationWindow />
  </div>;
}
