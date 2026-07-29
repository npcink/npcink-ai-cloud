'use client';

import Link from 'next/link';
import { PublicSiteShell } from '@/components/public/PublicSiteShell';
import { useLocale } from '@/contexts/LocaleContext';

export default function NotFoundPage() {
  const { locale } = useLocale();
  const zh = locale === 'zh-CN';

  return (
    <PublicSiteShell>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex min-h-[65vh] max-w-4xl items-center px-5 py-16 lg:px-8"
      >
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.26em] text-[#2357ff]">404</p>
          <h1 className="mt-5 text-4xl font-black tracking-[-0.045em] sm:text-5xl">
            {zh ? '没有找到这个页面' : 'This page could not be found'}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600 dark:text-slate-300">
            {zh
              ? '地址可能已更新，或者您打开了一个失效链接。可以返回首页，或前往帮助中心查找正确入口。'
              : 'The address may have changed, or the link is no longer valid. Return home or use Help to find the right destination.'}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/" className="btn btn-primary">
              {zh ? '返回首页' : 'Return home'}
            </Link>
            <Link href="/help" className="btn btn-secondary">
              {zh ? '打开帮助中心' : 'Open Help'}
            </Link>
            <Link href="/portal/login" className="btn btn-secondary">
              {zh ? '登录服务中心' : 'Sign in to the Portal'}
            </Link>
          </div>
        </div>
      </main>
    </PublicSiteShell>
  );
}
