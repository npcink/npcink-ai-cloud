'use client';

import { useLocale } from '@/contexts/LocaleContext';
import { formatDate } from '@/lib/utils';

export function formatSiteRemovalDate(date: Date): string {
  const offset = new Intl.DateTimeFormat('en', { timeZoneName: 'shortOffset' })
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')?.value;
  return `${formatDate(date)} (${offset})`;
}

export function PortalSiteRemovalSummary({
  siteName,
  siteUrl,
  relinkNotice,
  error,
}: {
  siteName: string;
  siteUrl: string;
  relinkNotice: string;
  error: string;
}) {
  const { t } = useLocale();

  return (
    <div className="space-y-5 text-sm leading-6 text-slate-600 dark:text-slate-300" data-portal-sites="removal-summary">
      <section>
        <h3 className="mb-2 font-medium text-slate-950 dark:text-white">
          {t('portal.site_removal_target', {}, 'Site')}
        </h3>
        <p className="break-words text-base font-semibold text-slate-950 dark:text-white">{siteName}</p>
        <p className="break-all">
          {siteUrl || t('portal.site_url_missing_short', {}, 'Site URL not configured')}
        </p>
      </section>
      <section>
        <h3 className="mb-2 font-medium text-slate-950 dark:text-white">
          {t('portal.site_removal_effects', {}, 'After removal')}
        </h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>{t('portal.site_removal_service', {}, 'Cloud service for this site will stop.')}</li>
          <li>{t('portal.site_removal_keys', {}, 'Active keys for this site will be revoked.')}</li>
          <li>{t('portal.site_removal_same_account', {}, 'This account may reconnect immediately.')}</li>
          <li>{relinkNotice}</li>
          <li>{t('portal.site_removal_credits', {}, 'Free service and credits remain with this account.')}</li>
        </ul>
      </section>
      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}
    </div>
  );
}
