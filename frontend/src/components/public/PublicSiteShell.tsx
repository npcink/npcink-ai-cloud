'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { LocaleSwitcher } from '@/components/ui/LocaleSwitcher';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useLocale } from '@/contexts/LocaleContext';
import { portalClient } from '@/lib/portal-client';
import {
  PUBLIC_FOOTER_NAV_ITEMS,
  PUBLIC_HEADER_NAV_ITEMS,
  publicNavigationLabel,
} from '@/lib/public-navigation';

export function PublicSiteShell({ children }: { children: ReactNode }) {
  const { locale } = useLocale();
  const zh = locale === 'zh-CN';
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [portalAuthenticated, setPortalAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;

    void portalClient.getSession().then(
      () => {
        if (mounted) setPortalAuthenticated(true);
      },
      () => {
        // A public visitor is expected to receive a session error. Keep the
        // signed-out entry visible for auth failures and temporary API errors.
        if (mounted) setPortalAuthenticated(false);
      }
    );

    return () => {
      mounted = false;
    };
  }, []);

  const portalHref = portalAuthenticated ? '/portal' : '/portal/login';
  const portalLabel = portalAuthenticated
    ? (zh ? '进入服务中心' : 'Open Portal')
    : (zh ? '登录服务中心' : 'Sign in');

  return (
    <div className="min-h-screen bg-[#f6f7f9] text-[#101828] dark:bg-[#09101c] dark:text-slate-50">
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-[60] bg-[#101828] px-4 py-3 text-sm font-bold text-white focus:not-sr-only"
      >
        {zh ? '跳到主要内容' : 'Skip to main content'}
      </a>
      <header
        data-public-header
        className="sticky top-0 z-40 border-b border-slate-200/70 bg-[#f6f7f9]/90 backdrop-blur-xl dark:border-white/10 dark:bg-[#09101c]"
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
          <Link href="/" className="group flex shrink-0 items-center gap-3" aria-label="Npcink AI Cloud">
            <span className="grid h-8 w-8 place-items-center bg-[#2357ff] text-sm font-black text-white transition-transform group-hover:-rotate-3">
              N
            </span>
            <span className="hidden whitespace-nowrap text-sm font-extrabold tracking-[0.18em] sm:inline">
              NPCINK AI CLOUD
            </span>
          </Link>

          <nav
            data-public-desktop-nav
            className="hidden items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300 lg:flex"
          >
            {PUBLIC_HEADER_NAV_ITEMS.map((item) => (
              <Link key={item.id} href={item.href} className="transition-colors hover:text-[#2357ff]">
                {publicNavigationLabel(item, locale)}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 sm:flex">
              <LocaleSwitcher />
              <ThemeToggle />
            </div>
            <Link
              href={portalHref}
              className="hidden h-10 items-center whitespace-nowrap bg-[#101828] px-5 text-sm font-bold text-white transition-colors hover:bg-[#2357ff] dark:bg-white dark:text-[#101828] dark:hover:bg-[#9eb3ff] sm:inline-flex"
            >
              {portalLabel}
            </Link>
            <button
              type="button"
              data-public-mobile-menu
              className="inline-flex h-10 w-10 items-center justify-center border border-slate-300 text-slate-700 transition hover:border-[#2357ff] hover:text-[#2357ff] dark:border-slate-700 dark:text-slate-200 lg:hidden"
              aria-controls="public-mobile-nav"
              aria-expanded={mobileNavOpen}
              aria-label={mobileNavOpen ? (zh ? '关闭菜单' : 'Close menu') : (zh ? '打开菜单' : 'Open menu')}
              onClick={() => setMobileNavOpen((current) => !current)}
            >
              {mobileNavOpen ? (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
        <div
          id="public-mobile-nav"
          className={mobileNavOpen ? 'border-t border-slate-200 bg-white dark:border-white/10 dark:bg-[#09101c] lg:hidden' : 'hidden'}
        >
          <nav className="mx-auto grid max-w-7xl gap-1 px-5 py-4 text-sm font-bold">
            {PUBLIC_HEADER_NAV_ITEMS.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="px-3 py-3 text-slate-700 hover:bg-slate-100 hover:text-[#2357ff] dark:text-slate-200 dark:hover:bg-white/5"
                onClick={() => setMobileNavOpen(false)}
              >
                {publicNavigationLabel(item, locale)}
              </Link>
            ))}
            <Link
              href={portalHref}
              className="mt-2 bg-[#101828] px-3 py-3 text-center text-white dark:bg-white dark:text-[#101828] sm:hidden"
              onClick={() => setMobileNavOpen(false)}
            >
              {portalLabel}
            </Link>
            <div className="mt-3 flex items-center gap-2 border-t border-slate-200 px-3 pt-4 dark:border-white/10 sm:hidden">
              <LocaleSwitcher />
              <ThemeToggle />
            </div>
          </nav>
        </div>
      </header>

      {children}

      <footer className="border-t border-slate-200 bg-white dark:border-white/10 dark:bg-[#070c14]">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 sm:grid-cols-[1fr_auto] lg:px-8">
          <div>
            <p className="text-sm font-extrabold tracking-[0.18em]">NPCINK AI CLOUD</p>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500 [text-wrap:pretty] dark:text-slate-400">
              {zh
                ? '为 WordPress 提供托管 AI 运行、用量记录和服务诊断。内容确认与发布仍由站点管理员完成。'
                : 'Hosted AI runtime, usage evidence, and service diagnostics for WordPress. Site owners retain final review and publishing control.'}
            </p>
          </div>
          <nav className="flex flex-wrap content-start gap-x-6 gap-y-3 text-sm text-slate-600 dark:text-slate-300">
            {PUBLIC_FOOTER_NAV_ITEMS.map((item) => (
              <Link key={item.id} href={item.href} className="hover:text-[#2357ff]">
                {publicNavigationLabel(item, locale)}
              </Link>
            ))}
          </nav>
        </div>
        <div className="border-t border-slate-200 px-5 py-5 text-center text-xs text-slate-500 dark:border-white/10 dark:text-slate-500">
          © {new Date().getFullYear()} Npcink AI Cloud
        </div>
      </footer>
    </div>
  );
}
