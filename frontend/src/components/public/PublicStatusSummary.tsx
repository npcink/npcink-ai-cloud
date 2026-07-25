'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useLocale } from '@/contexts/LocaleContext';

type PublicHealthState = 'checking' | 'healthy' | 'unavailable';

export function PublicStatusSummary() {
  const { locale } = useLocale();
  const zh = locale === 'zh-CN';
  const [state, setState] = useState<PublicHealthState>('checking');

  useEffect(() => {
    let active = true;

    fetch('/api/health', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json() as { status?: string };
        if (!active) return;
        setState(response.ok && payload.status === 'healthy' ? 'healthy' : 'unavailable');
      })
      .catch(() => {
        if (active) setState('unavailable');
      });

    return () => {
      active = false;
    };
  }, []);

  const copy = state === 'healthy'
    ? {
        label: zh ? '公开入口运行正常' : 'Public entry is operational',
        detail: zh ? '官网公开入口当前可访问。' : 'The public website entry is currently reachable.',
        dot: 'bg-emerald-500',
        text: 'text-emerald-700 dark:text-emerald-400',
      }
    : state === 'unavailable'
      ? {
          label: zh ? '状态检查暂时不可用' : 'Status check is temporarily unavailable',
          detail: zh ? '可进入状态页重新检查并查看下一步。' : 'Open the status page to check again and review next steps.',
          dot: 'bg-amber-500',
          text: 'text-amber-700 dark:text-amber-400',
        }
      : {
          label: zh ? '正在检查公开入口' : 'Checking the public entry',
          detail: zh ? '正在获取最新可用性结果。' : 'Retrieving the latest availability result.',
          dot: 'bg-slate-400',
          text: 'text-slate-600 dark:text-slate-300',
        };

  return (
    <section
      aria-labelledby="public-status-title"
      className="border-b border-slate-200 bg-white dark:border-white/10 dark:bg-[#0d1625]"
    >
      <div className="mx-auto grid max-w-7xl gap-5 px-5 py-5 sm:grid-cols-[auto_1fr_auto] sm:items-center lg:px-8">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
          {zh ? '服务状态' : 'Service status'}
        </p>
        <div aria-live="polite">
          <p id="public-status-title" className={`flex items-center gap-3 text-sm font-bold ${copy.text}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${copy.dot}`} aria-hidden="true" />
            {copy.label}
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{copy.detail}</p>
        </div>
        <Link
          href="/status"
          className="w-fit text-sm font-bold text-[#2357ff] underline-offset-4 hover:underline"
        >
          {zh ? '查看完整状态 →' : 'View full status →'}
        </Link>
      </div>
    </section>
  );
}
