'use client';

import { useLocale } from '@/contexts/LocaleContext';

/** A confirmed auth step must leave a usable exit if navigation stalls. */
export function NavigationHandoff({ href }: { href: string }) {
  const { t } = useLocale();
  return <div role="status" className="mx-auto flex min-h-72 max-w-lg flex-col items-center justify-center gap-4 px-5 py-8 text-center">
    <p>{t('common.navigation_opening')}</p>
    <a href={href} className="btn btn-primary">{t('common.navigation_continue')}</a>
  </div>;
}
