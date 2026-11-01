'use client';

import { useLocale } from '@/contexts/LocaleContext';
import type { SiteOperationsController } from './site-operations';

export function SiteOperationRecovery({ controller, siteLabel }: { controller: SiteOperationsController; siteLabel: string }) {
  const { t } = useLocale();
  const actionLabels = {
    activate: t('admin.site_confirmation.action_activate'),
    set: t('admin.site_confirmation.action_set'),
    clear: t('admin.site_confirmation.action_clear'),
    reset: t('admin.site_confirmation.action_reset'),
  };
  return (
    <>
      {controller.intent ? (
        <div data-ui="site-operation-unconfirmed" role="status" className="space-y-2 text-sm text-amber-800 dark:text-amber-200">
          <p>{t('admin.site_confirmation.pending')}</p>
          <p className="[overflow-wrap:anywhere]">{t('common.site')}: {siteLabel}</p>
          <p>{actionLabels[controller.intent.action]}</p>
          <details>
            <summary className="cursor-pointer">{t('admin.site_confirmation.evidence')}</summary>
            <div className="max-h-24 overflow-auto [overflow-wrap:anywhere]">
              <p>{t('common.site')}: {controller.intent.site_id}</p>
              <p>{t('admin.customer_confirmation.operation')}: {controller.intent.operation_id}</p>
              {controller.intent.cooldown_until ? <p>UTC: {controller.intent.cooldown_until}</p> : null}
              {controller.intent.ownership_released_at ? <p>{t('admin.site_confirmation.released_utc')}: {controller.intent.ownership_released_at}</p> : null}
            </div>
          </details>
          {controller.error ? <p role="alert">{controller.error}</p> : null}
          <button className="btn btn-secondary" type="button" disabled={controller.busy} onClick={() => void controller.confirm()}>{t('admin.customer_confirmation.read_result')}</button>
        </div>
      ) : controller.error ? <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{controller.error}</p> : null}
      {controller.storageBlocked ? <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{t('admin.customer_confirmation.storage_blocked')}</p> : null}
    </>
  );
}
