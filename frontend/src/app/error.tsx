'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { PublicSiteShell } from '@/components/public/PublicSiteShell';
import { useLocale } from '@/contexts/LocaleContext';

export default function RouteErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { locale } = useLocale();
  const zh = locale === 'zh-CN';

  useEffect(() => {
    console.error('Public route rendering failed', {
      digest: error.digest || '',
    });
  }, [error]);

  return (
    <PublicSiteShell>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex min-h-[65vh] max-w-4xl items-center px-5 py-16 lg:px-8"
      >
        <div role="alert">
          <p className="text-xs font-bold uppercase tracking-[0.26em] text-red-600">
            {zh ? '页面加载失败' : 'Page error'}
          </p>
          <h1 className="mt-5 text-4xl font-black tracking-[-0.045em] sm:text-5xl">
            {zh ? '暂时无法显示这个页面' : 'This page is temporarily unavailable'}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600 dark:text-slate-300">
            {zh
              ? '您的操作尚未完成。请先重试；如果问题持续，可以返回首页或打开帮助中心。'
              : 'Your action was not completed. Try again first; if the problem continues, return home or open Help.'}
          </p>
          {error.digest ? (
            <p className="mt-3 text-xs text-slate-500">
              {zh ? '支持参考：' : 'Support reference: '}{error.digest}
            </p>
          ) : null}
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" className="btn btn-primary" onClick={reset}>
              {zh ? '重新加载' : 'Try again'}
            </button>
            <Link href="/" className="btn btn-secondary">
              {zh ? '返回首页' : 'Return home'}
            </Link>
            <Link href="/help" className="btn btn-secondary">
              {zh ? '打开帮助中心' : 'Open Help'}
            </Link>
          </div>
        </div>
      </main>
    </PublicSiteShell>
  );
}
