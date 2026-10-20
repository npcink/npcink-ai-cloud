import { useCallback, useState } from 'react';
import type { Entitlements } from '@/lib/portal-client';
import { portalClient, type PortalAccountSiteKnowledgeUsagePayload } from '@/lib/portal-client';
import type { Locale } from '@/lib/i18n';
import { PortalInfoHint } from '@/components/portal/PortalScaffold';
import { cn, formatDateOnly, formatNumber } from '@/lib/utils';
import { useDialogFocusManagement } from '@/hooks/useDialogFocusManagement';
import { formatPortalErrorMessage } from '@/lib/portal-error';
import { resolveBillingQuotaRowPresentation } from '@/lib/portal-billing-status';

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

const KNOWLEDGE_RESOURCE_KEYS: readonly string[] = ['vector_documents', 'media_images'];

type PortalEntitlementUsageProps = {
  quotaSummary?: QuotaSummary | null;
  t: TranslateFn;
  locale: Locale;
  /** When true, limited-row scream badges / red bars / overflow copy defer to the attention strip. */
  attentionSurfaceActive?: boolean;
  /** Opens package usage drawer (period usage / site usage entry). */
  onOpenUsage?: () => void;
};

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
    vector_documents: t('portal.usage.resource_vector_documents', {}, 'Text knowledge capacity'),
    media_images: t('portal.usage.resource_media_images', {}, 'Image knowledge capacity'),
  };
  return labels[key] || humanizeKey(key);
}

function normalizeMetrics(quotaSummary?: QuotaSummary | null): EntitlementMetric[] {
  if (!quotaSummary) return [];
  const visibleResourceKeys = new Set(['active_sites', 'vector_documents', 'media_images']);
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
  attentionSurfaceActive = false,
  onOpenUsage,
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
  const metricGroups = [
    {
      key: 'allowances',
      title: '',
      description: '',
      metrics: metrics.filter((metric) => !KNOWLEDGE_RESOURCE_KEYS.includes(String(metric.key))),
    },
    {
      key: 'knowledge',
      title: t('portal.usage.knowledge_capacity_title', {}, 'Knowledge capacity'),
      description: t('portal.usage.knowledge_capacity_detail', {}, 'Saved text and images have separate capacities that do not reset monthly. AI work uses execution allowances separately.'),
      metrics: metrics.filter((metric) => KNOWLEDGE_RESOURCE_KEYS.includes(String(metric.key))),
    },
  ].filter((group) => group.metrics.length > 0);
  const title = t('portal.billing.current_entitlements_title', {}, 'Current package rights');
  const description = t(
    'portal.billing.current_entitlements_desc',
    {},
    'These are the main rights included in the current package.'
  );

  const sharedQuotaNote = t(
    'portal.billing.account_shared_quota_note',
    {},
    'Site and knowledge limits are shared by every site on this account.'
  );
  const rightsHelpDetail = (
    <>
      <span className="block">{description}</span>
      <span className="mt-1 block text-slate-500 dark:text-slate-400">{sharedQuotaNote}</span>
    </>
  );

  return (
    <section className="space-y-3" data-portal-entitlement-usage="included">
      <div>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          {t('portal.billing.package_rights_label', {}, 'Package rights')}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
            {title}
          </h2>
          <PortalInfoHint
            label={title}
            aria-label={`${description} ${sharedQuotaNote}`}
            data-portal-billing="entitlements-help"
            detail={rightsHelpDetail}
          />
        </div>
      </div>

      {metrics.length > 0 ? (
        <div className="space-y-4">
          {metricGroups.map((group) => (
            <section key={group.key} data-portal-entitlement-group={group.key} aria-label={group.title || undefined}>
              {group.title ? (
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <h3 className="text-sm font-semibold text-slate-950 dark:text-white">{group.title}</h3>
                  {group.description ? (
                    <PortalInfoHint
                      label={group.title}
                      aria-label={group.description}
                      data-portal-billing="knowledge-capacity-help"
                      detail={group.description}
                    />
                  ) : null}
                </div>
              ) : null}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {group.metrics.map((metric) => {
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
                  const rowPresentation = resolveBillingQuotaRowPresentation({
                    status: metric.status,
                    attentionSurfaceActive,
                  });
                  const tone = rowPresentation.displayTone;
                  const limitLabel = formatQuotaValue(limit, { unlimited, unlimitedLabel });
                  const usedLabel = formatQuotaValue(used, { unlimited: false, unlimitedLabel });
                  const remainingLabel = formatQuotaValue(displayRemaining, { unlimited, unlimitedLabel });
                  const isCredit = key === 'ai_credits';
                  const isKnowledge = KNOWLEDGE_RESOURCE_KEYS.includes(key);
                  let metricBadgeLabel = '';
                  if (!rowPresentation.suppressAlarmBadge) {
                    if (rowPresentation.tone === 'warning') {
                      metricBadgeLabel = t('portal.usage.headroom_watch', {}, 'Close to limit');
                    } else if (rowPresentation.tone === 'error') {
                      metricBadgeLabel = t('portal.home.filter_attention_only', {}, 'Needs attention');
                      if (isKnowledge) {
                        metricBadgeLabel = exceeded > 0
                          ? t('portal.usage.capacity_exceeded', {}, 'Over limit')
                          : t('portal.usage.capacity_full', {}, 'Full');
                      }
                    }
                  }
                  const paidExpiryDate = metric.paid_next_expires_at
                    ? formatDateOnly(metric.paid_next_expires_at, locale)
                    : '';
                  const resourceDetail = key === 'vector_documents'
                    ? t('portal.usage.resource_vector_documents_detail', {}, 'Indexed articles, pages, and comments; images count separately.')
                    : key === 'media_images'
                      ? t('portal.usage.resource_media_images_detail', {}, 'Indexed media-library images, whether or not used in an article. Reusing the same site attachment adds no capacity.')
                      : t('portal.billing.entitlement_included_line', {}, 'Included in this package');
                  const overflowGuidance = isKnowledge && rowPresentation.tone === 'error' && !rowPresentation.suppressOverflowDetail
                    ? (key === 'media_images'
                      ? t('portal.usage.media_capacity_full_detail', {}, 'New image indexing is paused. Existing images remain usable and refreshable; AI work still needs execution allowances. Remove unneeded index entries or change the package.')
                      : t('portal.usage.text_capacity_full_detail', {}, 'New text indexing is paused. Existing text remains usable and updatable. Remove unneeded index entries or change the package.'))
                    : '';
                  const hintDetail = (
                    <>
                      <span className="block">{resourceDetail}</span>
                      {paidExpiryDate ? (
                        <span className="mt-1 block text-slate-500 dark:text-slate-400">
                          {t(
                            'portal.usage.paid_credit_expiry_hint',
                            { date: paidExpiryDate },
                            `The next paid credit grant expires on ${paidExpiryDate}.`
                          )}
                        </span>
                      ) : null}
                      {overflowGuidance ? (
                        <span className="mt-1 block text-amber-800 dark:text-amber-200">{overflowGuidance}</span>
                      ) : null}
                    </>
                  );
                  const secondaryStat = exceeded > 0
                    ? t(
                        'portal.usage.exceeded_label',
                        { count: formatNumber(Math.round(exceeded)) },
                        `Exceeded by ${formatNumber(Math.round(exceeded))}`
                      )
                    : (!isCredit
                      ? `${t('portal.usage.remaining_ai_credits', {}, 'Remaining')}: ${remainingLabel}`
                      : '');
                  const tileLabel = resourceLabel(key, t);

                  return (
                    <article
                      key={key}
                      data-portal-quota-resource={key}
                      className={cn(
                        'flex min-w-0 flex-col rounded-xl border border-slate-200/80 bg-white/80 p-3.5 dark:border-slate-800 dark:bg-slate-950/40',
                        group.metrics.length === 1 && 'md:col-span-2',
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="text-sm font-semibold text-slate-950 dark:text-white">
                          {tileLabel}
                        </p>
                        <PortalInfoHint
                          label={tileLabel}
                          aria-label={resourceDetail}
                          data-portal-billing={`quota-help-${key}`}
                          detail={hintDetail}
                        />
                        {metricBadgeLabel ? (
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[0.68rem] font-semibold',
                              tone === 'error'
                                ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-200'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200'
                            )}
                          >
                            {metricBadgeLabel}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        {isCredit ? (
                          <p className="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
                            {formatQuotaValue(metric.total_remaining ?? remaining, { unlimited: false, unlimitedLabel })}
                            <span className="ml-1.5 text-xs font-normal text-slate-500">
                              {t('portal.usage.total_remaining_label', {}, 'Total available')}
                            </span>
                          </p>
                        ) : (
                          <p className="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
                            {usedLabel}
                            <span className="text-base font-normal text-slate-500"> / {limitLabel}</span>
                          </p>
                        )}
                        {secondaryStat ? (
                          <p className="text-xs text-slate-500 dark:text-slate-400">{secondaryStat}</p>
                        ) : null}
                      </div>

                      {isCredit ? (
                        <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-200/70 pt-2.5 text-xs dark:border-slate-800">
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
                            <div key={item.label} className="inline-flex min-w-0 items-baseline gap-1.5">
                              <dt className="text-slate-500 dark:text-slate-400">{item.label}</dt>
                              <dd className="text-sm font-semibold text-slate-950 dark:text-white">
                                {formatQuotaValue(item.value, { unlimited: false, unlimitedLabel })}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}

                      {!unlimited && !isCredit ? (
                        <div className="mt-3">
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                            <div
                              className={cn(
                                'h-full rounded-full',
                                tone === 'error'
                                  ? 'bg-red-500'
                                  : tone === 'warning'
                                    ? 'bg-amber-500'
                                    : 'bg-slate-400'
                              )}
                              style={{ width: `${ratio}%` }}
                            />
                          </div>
                        </div>
                      ) : null}

                      {key === 'vector_documents' ? (
                        <div className="mt-auto pt-2.5">
                          <button
                            type="button"
                            className="text-xs font-semibold text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
                            onClick={() => {
                              if (onOpenUsage) onOpenUsage();
                              else void openSiteKnowledgeUsage();
                            }}
                            data-portal-billing="open-usage-from-knowledge"
                          >
                            {t('portal.usage.site_knowledge_breakdown_action', {}, 'View site usage details')}
                          </button>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
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
