/**
 * Pure helpers for quiet Portal billing / package attention surfaces.
 * Keep pressure labeling and CTA choice out of the page component so Vitest
 * can prove behavior without mounting the full Next client tree.
 */

export type BillingTranslateFn = (
  key: string,
  params?: Record<string, string>,
  fallback?: string
) => string;

export type BillingQuotaResource = {
  key?: string;
  used?: number;
  limit?: number;
  unlimited?: boolean;
  status?: string;
};

export type BillingQuotaSummary = {
  status?: string;
  ai_credits?: {
    status?: string;
    key?: string;
  } | null;
  resource_limits?: BillingQuotaResource[] | null;
};

export function findLimitedBillingResources(
  quotaSummary: BillingQuotaSummary | null | undefined
): BillingQuotaResource[] {
  return (quotaSummary?.resource_limits || []).filter((resource) => (
    !resource.unlimited
    && Number(resource.limit || 0) > 0
    && (resource.status === 'limited' || Number(resource.used || 0) > Number(resource.limit || 0))
  ));
}

export function billingPackageNeedsAttention(
  quotaSummary: BillingQuotaSummary | null | undefined,
  loadError?: string | null
): boolean {
  if (!quotaSummary || loadError) return false;
  return String(quotaSummary.status) === 'limited';
}

export function resolveBillingPressureCta(options: {
  quotaSummary: BillingQuotaSummary | null | undefined;
  t: BillingTranslateFn;
}): { href: string; label: string; kind: 'buy_credits' | 'upgrade' } {
  const creditNeedsAttention = options.quotaSummary?.ai_credits?.status === 'limited';
  if (creditNeedsAttention) {
    return {
      href: '/portal/account#package-options',
      kind: 'buy_credits',
      label: options.t('portal.usage.credit_pack_buy_action', {}, 'Buy credits'),
    };
  }
  return {
    href: '/portal/account#package-options',
    kind: 'upgrade',
    label: options.t('portal.billing.upgrade_action', {}, 'Upgrade package'),
  };
}

export function resolveBillingPackageStatusLabel(
  quotaSummary: BillingQuotaSummary | null | undefined,
  t: BillingTranslateFn
): string {
  if (quotaSummary?.ai_credits?.status === 'limited') {
    return t('portal.billing.package_status_credit_label', {}, 'AI credits unavailable');
  }
  const limitedResources = findLimitedBillingResources(quotaSummary);
  if (limitedResources.length > 1) {
    return t('portal.billing.package_status_multiple_label', {}, 'Multiple capacities need attention');
  }
  const limitedResource = limitedResources[0];
  if (limitedResource?.key === 'vector_documents') {
    return t('portal.billing.package_status_knowledge_label', {}, 'Text capacity needs attention');
  }
  if (limitedResource?.key === 'media_images') {
    return t('portal.billing.package_status_media_label', {}, 'Image capacity needs attention');
  }
  if (limitedResource?.key === 'active_sites' || limitedResource?.key === 'bound_sites') {
    return t('portal.billing.package_status_site_label', {}, 'Site limit exceeded');
  }
  if (limitedResource) {
    return t('portal.billing.package_status_capacity_label', {}, 'Package limit exceeded');
  }
  return t('common.ok', {}, 'OK');
}

export type BillingQuotaRowTone = 'ok' | 'warning' | 'error';

export function billingQuotaStatusTone(status: string | undefined): BillingQuotaRowTone {
  if (status === 'limited') return 'error';
  if (status === 'near_limit') return 'warning';
  return 'ok';
}

/**
 * When the package attention strip already names a limited quota cause,
 * entitlement rows for that same cause stay numerical: no scream badge,
 * no alarm-red progress, no duplicated overflow explainer under the row.
 * near_limit (watch) rows are not covered by the limited strip and keep amber.
 */
export function resolveBillingQuotaRowPresentation(options: {
  status?: string;
  attentionSurfaceActive?: boolean;
}): {
  tone: BillingQuotaRowTone;
  displayTone: BillingQuotaRowTone;
  suppressAlarmBadge: boolean;
  suppressOverflowDetail: boolean;
} {
  const tone = billingQuotaStatusTone(options.status);
  const coveredByAttention = Boolean(options.attentionSurfaceActive) && tone === 'error';
  return {
    tone,
    displayTone: coveredByAttention ? 'ok' : tone,
    suppressAlarmBadge: coveredByAttention,
    suppressOverflowDetail: coveredByAttention,
  };
}
