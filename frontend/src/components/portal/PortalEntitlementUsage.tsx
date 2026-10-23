import { useCallback, useRef, useState } from 'react';
import type { Entitlements } from '@/lib/portal-client';
import {
  portalClient,
  type PortalSiteKnowledgeUsagePayload,
  type PortalSiteKnowledgeUsageSourceType,
} from '@/lib/portal-client';
import type { Locale } from '@/lib/i18n';
import { PortalInfoHint } from '@/components/portal/PortalScaffold';
import { cn, formatDateOnly, formatNumber } from '@/lib/utils';
import { formatPortalErrorMessage } from '@/lib/portal-error';
import { resolveBillingQuotaRowPresentation } from '@/lib/portal-billing-status';
import { Modal } from '@/components/ui/Modal';

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
/** Resource keys whose per-site breakdown can be loaded from the live API today. */
const KNOWLEDGE_SITE_BREAKDOWN_FETCHABLE: ReadonlySet<string> = new Set(['vector_documents', 'media_images']);

const KNOWLEDGE_RESOURCE_SOURCE_TYPE: Record<string, PortalSiteKnowledgeUsageSourceType> = {
  vector_documents: 'text',
  media_images: 'media',
};

type PortalEntitlementUsageProps = {
  quotaSummary?: QuotaSummary | null;
  t: TranslateFn;
  locale: Locale;
  /** When true, limited-row scream badges / red bars / overflow copy defer to the attention strip. */
  attentionSurfaceActive?: boolean;
  /** Focuses the billing-page site list (pick a site for trend / records). */
  onOpenUsage?: () => void;
  /** Opens the light credit-sources dialog (grants / top-ups). */
  onOpenCreditSources?: () => void;
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
  onOpenCreditSources,
}: PortalEntitlementUsageProps) {
  // Shared knowledge breakdown dialog: one shell, typed by resource key.
  // Fetchable keys call GET /account/site-knowledge-usage?source_type=…;
  // reserved types (video/pdf later) stay on the quiet empty path until wired.
  const [siteKnowledgeUsageOpen, setSiteKnowledgeUsageOpen] = useState(false);
  const [siteKnowledgeBreakdownKey, setSiteKnowledgeBreakdownKey] = useState<string | null>(null);
  const [siteKnowledgeUsageByType, setSiteKnowledgeUsageByType] = useState<
    Partial<Record<string, PortalSiteKnowledgeUsagePayload>>
  >({});
  const [siteKnowledgeUsageLoading, setSiteKnowledgeUsageLoading] = useState(false);
  const [siteKnowledgeUsageError, setSiteKnowledgeUsageError] = useState('');
  const siteKnowledgeBreakdownRequestKeyRef = useRef<string | null>(null);
  const closeSiteKnowledgeUsage = useCallback(() => {
    siteKnowledgeBreakdownRequestKeyRef.current = null;
    setSiteKnowledgeUsageOpen(false);
    setSiteKnowledgeBreakdownKey(null);
    setSiteKnowledgeUsageError('');
    setSiteKnowledgeUsageLoading(false);
  }, []);
  const openSiteKnowledgeUsage = useCallback(async (resourceKey: string) => {
    const key = String(resourceKey || '').trim();
    if (!key) return;
    siteKnowledgeBreakdownRequestKeyRef.current = key;
    setSiteKnowledgeBreakdownKey(key);
    setSiteKnowledgeUsageOpen(true);
    setSiteKnowledgeUsageError('');
    // Types without a per-site API: do not call another type's endpoint (would show wrong numbers).
    if (!KNOWLEDGE_SITE_BREAKDOWN_FETCHABLE.has(key)) {
      setSiteKnowledgeUsageLoading(false);
      return;
    }
    if (siteKnowledgeUsageByType[key]) {
      setSiteKnowledgeUsageLoading(false);
      return;
    }
    const sourceType = KNOWLEDGE_RESOURCE_SOURCE_TYPE[key];
    if (!sourceType) {
      setSiteKnowledgeUsageLoading(false);
      return;
    }
    setSiteKnowledgeUsageLoading(true);
    try {
      const response = sourceType === 'text'
        ? await portalClient.getAccountSiteKnowledgeUsage()
        : await portalClient.getAccountSiteKnowledgeUsageByType(sourceType);
      if (siteKnowledgeBreakdownRequestKeyRef.current !== key) return;
      setSiteKnowledgeUsageByType((prev) => ({ ...prev, [key]: response.data }));
    } catch (err) {
      if (siteKnowledgeBreakdownRequestKeyRef.current !== key) return;
      setSiteKnowledgeUsageError(formatPortalErrorMessage(err, t, t('error.failed_load')));
    } finally {
      if (siteKnowledgeBreakdownRequestKeyRef.current === key) {
        setSiteKnowledgeUsageLoading(false);
      }
    }
  }, [siteKnowledgeUsageByType, t]);
  const unlimitedLabel = t('common.unlimited', {}, 'Unlimited');
  const metrics = normalizeMetrics(quotaSummary);
  const knowledgeCapacityDetail = t(
    'portal.usage.knowledge_capacity_detail',
    {},
    'Saved text and images have separate capacities that do not reset monthly. AI work uses execution allowances separately.',
  );
  const softSubtitle = t('portal.billing.quota_soft_subtitle', {}, 'Available in this package');
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
      <span className="mt-1 block text-slate-500 dark:text-slate-400">{knowledgeCapacityDetail}</span>
    </>
  );
  const includedLine = t('portal.billing.entitlement_included_line', {}, 'Included in this package');

  return (
    <section className="space-y-3" data-portal-entitlement-usage="included">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400" data-portal-billing="quota-soft-subtitle">
            {softSubtitle}
          </p>
          <PortalInfoHint
            label={softSubtitle}
            aria-label={`${description} ${sharedQuotaNote} ${knowledgeCapacityDetail}`}
            data-portal-billing="entitlements-help"
            detail={rightsHelpDetail}
          />
        </div>
        {onOpenUsage ? (
          <button
            type="button"
            className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline dark:text-slate-400 dark:hover:text-slate-200"
            onClick={() => onOpenUsage?.()}
            data-portal-billing="open-usage"
          >
            {t('portal.billing.view_period_usage', {}, 'View period usage')}
          </button>
        ) : null}
      </div>

      {metrics.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2" data-portal-entitlement-group="quota">
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
                  const baseResourceDetail = key === 'vector_documents'
                    ? t('portal.usage.resource_vector_documents_detail', {}, 'Indexed articles, pages, and comments; images count separately.')
                    : key === 'media_images'
                      ? t('portal.usage.resource_media_images_detail', {}, 'Indexed media-library images, whether or not used in an article. Reusing the same site attachment adds no capacity.')
                      : '';
                  const resourceDetail = isKnowledge
                    ? `${baseResourceDetail} ${knowledgeCapacityDetail}`
                    : baseResourceDetail;
                  const overflowGuidance = isKnowledge && rowPresentation.tone === 'error' && !rowPresentation.suppressOverflowDetail
                    ? (key === 'media_images'
                      ? t('portal.usage.media_capacity_full_detail', {}, 'New image indexing is paused. Existing images remain usable and refreshable; AI work still needs execution allowances. Remove unneeded index entries or change the package.')
                      : t('portal.usage.text_capacity_full_detail', {}, 'New text indexing is paused. Existing text remains usable and updatable. Remove unneeded index entries or change the package.'))
                    : '';
                  // Prefer no ⓘ over an empty「当前套餐包含」shell with no number/detail.
                  const hasUsefulHint = Boolean(
                    (resourceDetail && resourceDetail.trim() && resourceDetail.trim() !== includedLine)
                    || paidExpiryDate
                    || overflowGuidance
                  );
                  const hintDetail = hasUsefulHint ? (
                    <>
                      {resourceDetail ? <span className="block">{resourceDetail}</span> : null}
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
                  ) : null;
                  const periodUsed = isCredit
                    ? Math.max(0, Number(
                      quotaSummary?.ai_credit_ledger_summary?.consumed_ai_credits
                      ?? metric.used
                      ?? 0
                    ))
                    : 0;
                  const creditAvailable = isCredit
                    ? Math.max(0, Number(metric.total_remaining ?? remaining ?? 0))
                    : 0;
                  const creditDenom = periodUsed + creditAvailable;
                  const creditPeriodRatio = creditDenom > 0
                    ? Math.min(100, Math.max(0, (periodUsed / creditDenom) * 100))
                    : 0;
                  const creditUsedLabel = formatQuotaValue(periodUsed, { unlimited: false, unlimitedLabel });
                  const creditDenomLabel = formatQuotaValue(creditDenom, { unlimited: false, unlimitedLabel });
                  const creditAvailableLabel = formatQuotaValue(creditAvailable, { unlimited: false, unlimitedLabel });
                  const remainingPrefix = t('portal.usage.remaining_ai_credits', {}, 'Remaining');
                  const secondaryStat = exceeded > 0
                    ? t(
                        'portal.usage.exceeded_label',
                        { count: formatNumber(Math.round(exceeded)) },
                        `Exceeded by ${formatNumber(Math.round(exceeded))}`
                      )
                    : (isCredit
                      ? `${remainingPrefix}: ${creditAvailableLabel}`
                      : `${remainingPrefix}: ${remainingLabel}`);
                  const tileLabel = resourceLabel(key, t);
                  const barRatio = isCredit ? creditPeriodRatio : ratio;
                  const showProgressBar = isCredit || !unlimited;

                  const creditSourcesClickable = isCredit && Boolean(onOpenCreditSources);
                  const knowledgeBreakdownClickable = isKnowledge;
                  const cardClickable = creditSourcesClickable || knowledgeBreakdownClickable;
                  const openCreditSourcesDialog = () => onOpenCreditSources?.();
                  const openKnowledgeBreakdown = () => { void openSiteKnowledgeUsage(key); };
                  const activateCard = creditSourcesClickable
                    ? openCreditSourcesDialog
                    : knowledgeBreakdownClickable
                      ? openKnowledgeBreakdown
                      : undefined;
                  const cardAriaLabel = creditSourcesClickable
                    ? t('portal.usage.sources_title', {}, 'Credit sources')
                    : knowledgeBreakdownClickable
                      ? t(
                          `portal.usage.site_knowledge_breakdown_title_${key}`,
                          {},
                          t('portal.usage.site_knowledge_breakdown_title', {}, 'Site knowledge usage'),
                        )
                      : undefined;
                  const cardBillingAttr = creditSourcesClickable
                    ? 'open-credit-sources'
                    : knowledgeBreakdownClickable
                      ? 'open-usage-from-knowledge'
                      : undefined;

                  return (
                    <article
                      key={key}
                      data-portal-quota-resource={key}
                      data-portal-billing={cardBillingAttr}
                      role={cardClickable ? 'button' : undefined}
                      tabIndex={cardClickable ? 0 : undefined}
                      aria-label={cardAriaLabel}
                      className={cn(
                        'flex min-w-0 flex-col rounded-xl border border-slate-200/80 bg-white/80 p-3.5 dark:border-slate-800 dark:bg-slate-950/40',
                        cardClickable
                          && 'cursor-pointer transition hover:border-blue-300/80 hover:bg-blue-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 dark:hover:border-blue-700/60 dark:hover:bg-blue-950/20',
                      )}
                      onClick={activateCard}
                      onKeyDown={cardClickable
                        ? (event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              activateCard?.();
                            }
                          }
                        : undefined}
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="text-sm font-semibold text-slate-950 dark:text-white">
                          {tileLabel}
                        </p>
                        {hintDetail ? (
                          <span
                            className="inline-flex"
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => event.stopPropagation()}
                          >
                            <PortalInfoHint
                              label={tileLabel}
                              aria-label={typeof resourceDetail === 'string' ? resourceDetail : tileLabel}
                              data-portal-billing={`quota-help-${key}`}
                              detail={hintDetail}
                            />
                          </span>
                        ) : null}
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
                          <p className="text-xl font-semibold tracking-tight text-slate-950 dark:text-white" data-portal-billing="credits-period-used">
                            {creditUsedLabel}
                            <span className="text-base font-normal text-slate-500"> / {creditDenomLabel}</span>
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

                      {showProgressBar ? (
                        <div
                          className="mt-3"
                          data-portal-billing={isCredit ? 'credits-period-progress' : undefined}
                        >
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
                              style={{ width: `${barRatio}%` }}
                            />
                          </div>
                        </div>
                      ) : null}

                      {isCredit ? (() => {
                        const packageRemaining = Number(metric.package_remaining ?? 0);
                        const paidRemaining = Number(metric.paid_remaining ?? 0);
                        const showPaid = paidRemaining > 0;
                        const showPackage = showPaid || Math.round(packageRemaining) !== Math.round(creditAvailable);
                        const breakdownItems = [
                          ...(showPackage ? [{
                            label: t('portal.usage.package_remaining_label', {}, 'Package remaining'),
                            value: packageRemaining,
                          }] : []),
                          ...(showPaid ? [{
                            label: t('portal.usage.paid_remaining_label', {}, 'Paid credits'),
                            value: paidRemaining,
                          }] : []),
                        ];
                        if (breakdownItems.length === 0) return null;
                        return (
                          <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-200/70 pt-2.5 text-xs dark:border-slate-800">
                            {breakdownItems.map((item) => (
                              <div key={item.label} className="inline-flex min-w-0 items-baseline gap-1.5">
                                <dt className="text-slate-500 dark:text-slate-400">{item.label}</dt>
                                <dd className="text-sm font-semibold text-slate-950 dark:text-white">
                                  {formatQuotaValue(item.value, { unlimited: false, unlimitedLabel })}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        );
                      })() : null}

                    </article>
                  );
                })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {t('portal.billing.no_feature_detail', {}, 'No package rights are available yet.')}
        </div>
      )}

      {(() => {
        if (!siteKnowledgeBreakdownKey) return null;
        const breakdownKey = siteKnowledgeBreakdownKey;
        const breakdownFetchable = KNOWLEDGE_SITE_BREAKDOWN_FETCHABLE.has(breakdownKey);
        const siteKnowledgeUsage = siteKnowledgeUsageByType[breakdownKey] || null;
        const breakdownMetric = metrics.find((metric) => String(metric.key || '') === breakdownKey);
        const fallbackUsed = Math.max(0, Math.round(Number(breakdownMetric?.used || 0)));
        const fallbackLimit = Math.max(0, Math.round(Number(breakdownMetric?.limit || 0)));
        // Prefer the quota flag for non-fetchable types; text payload may also carry indexed_document_limit.
        const fallbackUnlimited = Boolean(breakdownMetric?.unlimited);
        const legacyTextPayload = siteKnowledgeUsage && 'total_indexed_document_count' in siteKnowledgeUsage
          ? (siteKnowledgeUsage as { total_indexed_document_count?: number; indexed_document_limit?: number; sites?: Array<{ site_id: string; site_name: string; indexed_document_count?: number; used?: number }> })
          : null;
        const rawSiteRows = (() => {
          if (!siteKnowledgeUsage) return [];
          const items = Array.isArray(siteKnowledgeUsage.items) ? siteKnowledgeUsage.items : null;
          const sites = Array.isArray(legacyTextPayload?.sites) ? legacyTextPayload.sites : null;
          if (items && items.length) return items;
          if (sites && sites.length) return sites;
          // Honest empty from API (e.g. media with no indexed images).
          return items || sites || [];
        })();
        const siteRows = rawSiteRows.map((row) => ({
          site_id: String(row.site_id || ''),
          site_name: String(row.site_name || ''),
          used: Math.max(0, Math.round(Number(
            ('used' in row && row.used != null)
              ? row.used
              : ('indexed_document_count' in row ? row.indexed_document_count : 0) || 0
          ))),
        }));
        const totalCount = siteKnowledgeUsage
          ? Math.max(0, Math.round(Number(
              siteKnowledgeUsage.total_used
              ?? legacyTextPayload?.total_indexed_document_count
              ?? 0
            )))
          : fallbackUsed;
        // Limits stay on entitlements for media/video/pdf; text may still echo indexed_document_limit.
        const apiLimit = legacyTextPayload?.indexed_document_limit;
        const totalLimit = apiLimit != null ? Math.max(0, Math.round(Number(apiLimit || 0))) : fallbackLimit;
        const totalUnlimited = siteKnowledgeUsage && apiLimit != null
          ? totalLimit <= 0
          : fallbackUnlimited;
        const breakdownTitle = t(
          `portal.usage.site_knowledge_breakdown_title_${breakdownKey}`,
          {},
          t('portal.usage.site_knowledge_breakdown_title', {}, 'Site knowledge usage'),
        );
        const breakdownDesc = t(
          `portal.usage.site_knowledge_breakdown_desc_${breakdownKey}`,
          {},
          t('portal.usage.site_knowledge_breakdown_desc', {}, 'Indexed documents grouped by site on this account.'),
        );
        const showQuietNoBreakdown = !breakdownFetchable;
        const showBody = !siteKnowledgeUsageLoading && !siteKnowledgeUsageError
          && (Boolean(siteKnowledgeUsage) || showQuietNoBreakdown);

        return (
          <Modal
            isOpen={siteKnowledgeUsageOpen}
            onClose={closeSiteKnowledgeUsage}
            closeLabel={t('common.close', {}, 'Close')}
            title={breakdownTitle}
            description={breakdownDesc}
            size="xl"
            className="rounded-[18px] shadow-[0_16px_44px_rgba(15,23,42,0.14)]"
          >
            <div data-portal-knowledge-breakdown={breakdownKey}>
              {siteKnowledgeUsageLoading ? (
                <div className="space-y-3">{[0, 1, 2].map((item) => <div key={item} className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-900" />)}</div>
              ) : siteKnowledgeUsageError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{siteKnowledgeUsageError}</div>
              ) : showBody ? (
                <>
                  <dl className="mb-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-900">
                      <dt className="text-xs text-slate-500">{t('portal.usage.site_knowledge_total_label', {}, 'Account total')}</dt>
                      <dd className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">
                        {formatNumber(totalCount)}
                        {!totalUnlimited ? ` / ${formatNumber(totalLimit)}` : ''}
                      </dd>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-900">
                      <dt className="text-xs text-slate-500">{t('portal.usage.site_knowledge_limit_label', {}, 'Package limit')}</dt>
                      <dd className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">
                        {totalUnlimited
                          ? t('common.unlimited', {}, 'Unlimited')
                          : formatNumber(totalLimit)}
                      </dd>
                    </div>
                  </dl>
                  <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                    {showQuietNoBreakdown ? (
                      <p className="px-4 py-5 text-sm text-slate-500 dark:text-slate-400" data-portal-knowledge-breakdown-empty="quiet">
                        {t('portal.usage.site_knowledge_no_site_breakdown', {}, 'Per-site details are not available yet.')}
                      </p>
                    ) : siteRows.length ? (
                      siteRows.map((site) => {
                        const share = totalCount > 0
                          ? Math.round((site.used / totalCount) * 100)
                          : 0;
                        return (
                          <div key={site.site_id} className="flex items-center justify-between gap-4 px-4 py-3">
                            <div className="min-w-0">
                              <p className="truncate font-medium text-slate-950 dark:text-white">{site.site_name}</p>
                              <p className="mt-1 text-xs text-slate-500">{share}% {t('portal.usage.site_knowledge_share_label', {}, 'of account total')}</p>
                            </div>
                            <strong className="shrink-0 text-slate-950 dark:text-white">{formatNumber(site.used)}</strong>
                          </div>
                        );
                      })
                    ) : (
                      <p className="px-4 py-5 text-sm text-slate-500" data-portal-knowledge-breakdown-empty="api">
                        {t('portal.usage.site_knowledge_empty', {}, 'No connected sites are available.')}
                      </p>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </Modal>
        );
      })()}
    </section>
  );
}
