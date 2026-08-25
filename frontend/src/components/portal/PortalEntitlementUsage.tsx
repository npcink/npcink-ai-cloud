import { useCallback, useState } from 'react';
import type { Entitlements } from '@/lib/portal-client';
import { portalClient, type PortalAccountSiteKnowledgeUsagePayload } from '@/lib/portal-client';
import type { Locale } from '@/lib/i18n';
import { cn, formatDateOnly, formatNumber } from '@/lib/utils';
import { useDialogFocusManagement } from '@/hooks/useDialogFocusManagement';
import { formatPortalErrorMessage } from '@/lib/portal-error';

type TranslateFn = (key: string, params?: Record<string, string>, fallback?: string) => string;
type QuotaSummary = NonNullable<Entitlements['quota_summary']>;
type QuotaResource = NonNullable<QuotaSummary['resource_limits']>[number];
type EntitlementMetric = {
  key?: string;
  used?: number;
  limit?: number;
  remaining?: number;
  unlimited?: boolean;
  usage_ratio?: number;
  status?: string;
  package_remaining?: number;
  paid_remaining?: number;
  paid_next_expires_at?: string;
  total_remaining?: number;
};

type PortalEntitlementUsageProps = {
  quotaSummary?: QuotaSummary | null;
  t: TranslateFn;
  locale: Locale;
};

function quotaStatusTone(status: string | undefined): 'ok' | 'warning' | 'error' {
  if (status === 'limited') return 'error';
  if (status === 'near_limit') return 'warning';
  return 'ok';
}

function formatQuotaValue(
  value: unknown,
  options: { unlimited?: boolean; unlimitedLabel: string }
): string {
  if (options.unlimited) return options.unlimitedLabel;
  return formatNumber(Math.round(Number(value || 0)));
}

function humanizeKey(key: string): string {
  return String(key || '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function resourceLabel(key: string, t: TranslateFn): string {
  const labels: Record<string, string> = {
    ai_credits: t('portal.usage.package_credit_allowance_label', {}, 'Package AI credits'),
    active_sites: t('portal.usage.site_allowance_label', {}, 'Active sites'),
    vector_documents: t('portal.usage.resource_vector_documents', {}, 'Knowledge articles'),
  };
  return labels[key] || humanizeKey(key);
}

function normalizeMetrics(quotaSummary?: QuotaSummary | null): EntitlementMetric[] {
  if (!quotaSummary) return [];
  const visibleResourceKeys = new Set(['active_sites', 'vector_documents']);
  const metrics: EntitlementMetric[] = [];
  if (quotaSummary.ai_credits) {
    metrics.push({
      ...quotaSummary.ai_credits,
      key: quotaSummary.ai_credits.key || 'ai_credits',
    });
  }
  const resources = Array.isArray(quotaSummary.resource_limits)
    ? quotaSummary.resource_limits
    : [];
  resources.forEach((resource: QuotaResource) => {
    const key = String(resource.key || '');
    if (visibleResourceKeys.has(key)) {
      metrics.push({ ...resource, key });
    }
  });
  return metrics.filter((metric) => String(metric.key || '').trim());
}

export function PortalEntitlementUsage({
  quotaSummary,
  t,
  locale,
}: PortalEntitlementUsageProps) {
  const [siteKnowledgeUsage, setSiteKnowledgeUsage] = useState<PortalAccountSiteKnowledgeUsagePayload | null>(null);
  const [siteKnowledgeUsageOpen, setSiteKnowledgeUsageOpen] = useState(false);
  const [siteKnowledgeUsageLoading, setSiteKnowledgeUsageLoading] = useState(false);
  const [siteKnowledgeUsageError, setSiteKnowledgeUsageError] = useState('');
  const siteKnowledgeUsageDialogRef = useDialogFocusManagement<HTMLElement>(
    siteKnowledgeUsageOpen,
    () => setSiteKnowledgeUsageOpen(false),
  );
  const openSiteKnowledgeUsage = useCallback(async () => {
    setSiteKnowledgeUsageOpen(true);
    if (siteKnowledgeUsage) return;
    setSiteKnowledgeUsageLoading(true);
    setSiteKnowledgeUsageError('');
    try {
      const response = await portalClient.getAccountSiteKnowledgeUsage();
      setSiteKnowledgeUsage(response.data);
    } catch (err) {
      setSiteKnowledgeUsageError(formatPortalErrorMessage(err, t, t('error.failed_load')));
    } finally {
      setSiteKnowledgeUsageLoading(false);
    }
  }, [siteKnowledgeUsage, t]);
  const unlimitedLabel = t('common.unlimited', {}, 'Unlimited');
  const metrics = normalizeMetrics(quotaSummary);
  const title = t('portal.billing.current_entitlements_title', {}, 'Current package rights');
  const description = t(
    'portal.billing.current_entitlements_desc',
    {},
    'These are the main rights included in the current package.'
  );

  return (
    <section className="space-y-4" data-portal-entitlement-usage="included">
      <div>
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {t('portal.billing.package_rights_label', {}, 'Package rights')}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">
            {title}
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
            {description}
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
            {t(
              'portal.billing.account_shared_quota_note',
              {},
              'Site and knowledge limits are shared by every site on this account.'
            )}
          </p>
        </div>
      </div>

      {metrics.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {metrics.map((metric) => {
            const key = String(metric.key || '');
            const used = Number(metric.used || 0);
            const limit = Number(metric.limit || 0);
            const remaining = Number(metric.remaining || 0);
            const displayRemaining = Math.max(0, remaining);
            const exceeded = !metric.unlimited && limit > 0 ? Math.max(0, used - limit) : 0;
            const unlimited = Boolean(metric.unlimited);
            const ratio = unlimited
              ? 0
              : Math.min(100, Math.max(0, Number(metric.usage_ratio || 0) * 100));
            const tone = quotaStatusTone(metric.status);
            const limitLabel = formatQuotaValue(limit, { unlimited, unlimitedLabel });
            const usedLabel = formatQuotaValue(used, { unlimited: false, unlimitedLabel });
            const remainingLabel = formatQuotaValue(displayRemaining, { unlimited, unlimitedLabel });
            const isCredit = key === 'ai_credits';
            const paidExpiryDate = metric.paid_next_expires_at
              ? formatDateOnly(metric.paid_next_expires_at, locale)
              : '';

            return (
              <div
                key={key}
                className="rounded-xl border border-slate-200/80 bg-white/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/35"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950 dark:text-white">
                      {resourceLabel(key, t)}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      {t('portal.billing.entitlement_included_line', {}, 'Included in this package')}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-1 text-xs font-semibold',
                      tone === 'error'
                        ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-200'
                        : tone === 'warning'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200'
                    )}
                  >
                    {tone === 'error'
                      ? t('portal.home.filter_attention_only', {}, 'Needs attention')
                      : tone === 'warning'
                        ? t('portal.usage.headroom_watch', {}, 'Close to limit')
                        : t('portal.home.risk_level_normal', {}, 'Normal')}
                  </span>
                </div>

                {isCredit ? (
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    {[
                      {
                        label: t('portal.usage.package_remaining_label', {}, 'Package remaining'),
                        value: metric.package_remaining,
                      },
                      {
                        label: t('portal.usage.paid_remaining_label', {}, 'Paid credits'),
                        value: metric.paid_remaining,
                      },
                      {
                        label: t('portal.usage.total_remaining_label', {}, 'Total available'),
                        value: metric.total_remaining ?? remaining,
                      },
                    ].map((item) => (
                      <div key={item.label} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900/60">
                        <p className="text-xs text-slate-500 dark:text-slate-400">{item.label}</p>
                        <p className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">
                          {formatQuotaValue(item.value, { unlimited: false, unlimitedLabel })}
                        </p>
                      </div>
                    ))}
                    {paidExpiryDate ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400 sm:col-span-3">
                        {t(
                          'portal.usage.paid_credit_expiry_hint',
                          { date: paidExpiryDate },
                          `The next paid credit grant expires on ${paidExpiryDate}.`
                        )}
                      </p>
                    ) : null}
                  </div>
                ) : (
                <div className="mt-4 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-2xl font-semibold text-slate-950 dark:text-white">
                      {limitLabel}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {t('portal.usage.included_label', {}, 'Included')}
                    </p>
                  </div>
                  <p className="text-right text-sm text-slate-600 dark:text-slate-300">
                    {exceeded > 0
                      ? t(
                          'portal.usage.exceeded_label',
                          { count: formatNumber(Math.round(exceeded)) },
                          `Exceeded by ${formatNumber(Math.round(exceeded))}`
                        )
                      : `${t('portal.usage.remaining_ai_credits', {}, 'Remaining')}: ${remainingLabel}`}
                  </p>
                </div>
                )}

                {!unlimited && !isCredit ? (
                  <div className="mt-4">
                    <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          tone === 'error'
                            ? 'bg-red-500'
                            : tone === 'warning'
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                        )}
                        style={{ width: `${ratio}%` }}
                      />
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {usedLabel} / {limitLabel}
                      </p>
                      {key === 'vector_documents' ? (
                        <button type="button" className="text-xs font-semibold text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200" onClick={() => void openSiteKnowledgeUsage()}>
                          {t('portal.usage.site_knowledge_breakdown_action', {}, 'View site usage details')}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {t('portal.billing.no_feature_detail', {}, 'No package rights are available yet.')}
        </div>
      )}
      {siteKnowledgeUsageOpen ? (
        <div className="fixed inset-0 z-50">
          <button type="button" className="absolute inset-0 bg-slate-950/45" aria-label={t('common.close')} onClick={() => setSiteKnowledgeUsageOpen(false)} />
          <aside ref={siteKnowledgeUsageDialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="site-knowledge-usage-title" className="absolute left-1/2 top-1/2 flex max-h-[85vh] w-[min(92vw,42rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl bg-white shadow-2xl dark:bg-slate-950">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 dark:border-slate-800">
              <div>
                <h2 id="site-knowledge-usage-title" className="text-xl font-semibold text-slate-950 dark:text-white">{t('portal.usage.site_knowledge_breakdown_title', {}, 'Site knowledge usage')}</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('portal.usage.site_knowledge_breakdown_desc', {}, 'Indexed documents grouped by site on this account.')}</p>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSiteKnowledgeUsageOpen(false)}>{t('common.close')}</button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5">
              {siteKnowledgeUsageLoading ? <div className="space-y-3">{[0, 1, 2].map((item) => <div key={item} className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-900" />)}</div> : siteKnowledgeUsageError ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{siteKnowledgeUsageError}</div> : siteKnowledgeUsage ? (
                <>
                  <dl className="mb-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-900"><dt className="text-xs text-slate-500">{t('portal.usage.site_knowledge_total_label', {}, 'Account total')}</dt><dd className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">{formatNumber(siteKnowledgeUsage.total_indexed_document_count)}{siteKnowledgeUsage.indexed_document_limit > 0 ? ` / ${formatNumber(siteKnowledgeUsage.indexed_document_limit)}` : ''}</dd></div>
                    <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-900"><dt className="text-xs text-slate-500">{t('portal.usage.site_knowledge_limit_label', {}, 'Package limit')}</dt><dd className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">{siteKnowledgeUsage.indexed_document_limit > 0 ? formatNumber(siteKnowledgeUsage.indexed_document_limit) : t('common.unlimited', {}, 'Unlimited')}</dd></div>
                  </dl>
                  <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                    {siteKnowledgeUsage.sites.length ? siteKnowledgeUsage.sites.map((site) => {
                      const share = siteKnowledgeUsage.total_indexed_document_count > 0 ? Math.round((site.indexed_document_count / siteKnowledgeUsage.total_indexed_document_count) * 100) : 0;
                      return <div key={site.site_id} className="flex items-center justify-between gap-4 px-4 py-3"><div className="min-w-0"><p className="truncate font-medium text-slate-950 dark:text-white">{site.site_name}</p><p className="mt-1 text-xs text-slate-500">{share}% {t('portal.usage.site_knowledge_share_label', {}, 'of account total')}</p></div><strong className="shrink-0 text-slate-950 dark:text-white">{formatNumber(site.indexed_document_count)}</strong></div>;
                    }) : <p className="px-4 py-5 text-sm text-slate-500">{t('portal.usage.site_knowledge_empty', {}, 'No connected sites are available.')}</p>}
                  </div>
                </>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
