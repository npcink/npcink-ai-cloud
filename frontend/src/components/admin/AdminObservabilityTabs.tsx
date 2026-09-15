'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

const tabs = [
  ['/admin/usage-statistics', '使用统计'],
  ['/admin/media-observability', '媒体观测'],
  ['/admin/vector-observability', '向量观测'],
] as const;

export function AdminObservabilityTabs() {
  const pathname = usePathname();
  const params = useSearchParams();
  const quality = pathname === '/admin/usage-statistics' && params.get('view') === 'quality';
  const tabs = [
    ['/admin/usage-statistics', '使用统计'],
    ['/admin/media-observability', '媒体观测'],
    ['/admin/vector-observability', '向量观测'],
    ['/admin/usage-statistics?view=quality', '编辑质量证据'],
  ] as const;
  return <nav aria-label="运行观测" data-ui="admin-observability-tabs" className="mb-5 flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
    {tabs.map(([href, label]) => <Link key={href} href={href} aria-current={(href.includes('view=quality') ? quality : pathname === href) ? 'page' : undefined} className={cn('border-b-2 px-3 py-2 text-sm font-semibold transition', (href.includes('view=quality') ? quality : pathname === href) ? 'border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-white')}>{label}</Link>)}
  </nav>;
}
