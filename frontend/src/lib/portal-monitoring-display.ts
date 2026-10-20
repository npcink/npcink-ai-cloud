import type {
  PortalMonitoringOverviewAction,
  PortalMonitoringOverviewSummary,
} from '@/lib/portal-client';

type TranslateFn = (key: string, params?: Record<string, string>, fallback?: string) => string;

export type PortalMonitoringIssueCategory = 'connection' | 'quota' | 'knowledge' | 'service';
export type PortalServiceOperationStatus = 'active' | 'warning' | 'error' | 'inactive';

/** Customer Portal only yellow-warns when Cloud Addon baseline is missing. */
export const PORTAL_BASELINE_PLUGIN_SLUGS = ['npcink-cloud-addon'] as const;

export function getPortalMonitoringIssueCategory(
  item: PortalMonitoringOverviewAction
): PortalMonitoringIssueCategory {
  const raw = `${item.source || ''} ${item.code || ''} ${item.title || ''}`.toLowerCase();
  if (raw.includes('quota') || raw.includes('usage')) return 'quota';
  if (raw.includes('vector') || raw.includes('knowledge') || raw.includes('site_search')) {
    return 'knowledge';
  }
  if (
    raw.includes('connection')
    || raw.includes('plugin')
    || raw.includes('api_key')
    || raw.includes('activity')
  ) return 'connection';
  return 'service';
}

export function isPortalPluginMissingAction(
  item: PortalMonitoringOverviewAction | null | undefined
): boolean {
  if (!item) return false;
  return String(item.code || '').toLowerCase().includes('plugin_missing');
}

/** Parse plugin slugs from backend detail like "Missing plugin telemetry: a, b". */
export function extractMissingPluginSlugs(
  item: PortalMonitoringOverviewAction | null | undefined
): string[] {
  if (!item) return [];
  const detail = String(item.detail || '');
  const match = detail.match(/missing plugin telemetry:\s*(.+)$/i);
  const raw = match?.[1] || '';
  return raw
    .split(/[,，]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Baseline-only missing plugins that Portal should surface to customers. */
export function extractPortalBaselineMissingPluginSlugs(
  item: PortalMonitoringOverviewAction | null | undefined
): string[] {
  const baseline = new Set<string>(PORTAL_BASELINE_PLUGIN_SLUGS);
  return extractMissingPluginSlugs(item).filter((slug) => baseline.has(slug));
}

/**
 * Customer-facing plugin_missing: only when Cloud Addon baseline is among the gaps.
 * Optional Magick plugins must not drive Portal attention or service warning.
 */
export function isPortalCustomerPluginMissingAction(
  item: PortalMonitoringOverviewAction | null | undefined
): boolean {
  if (!isPortalPluginMissingAction(item)) return false;
  const baselineMissing = extractPortalBaselineMissingPluginSlugs(item);
  if (baselineMissing.length > 0) return true;
  // Unparseable detail: only surface if it clearly names the addon.
  const detail = String(item?.detail || '').toLowerCase();
  const namedOptionalOnly = (
    detail.includes('npcink-governance-core')
    || detail.includes('npcink-ai-client-adapter')
    || detail.includes('npcink-abilities-toolkit')
  ) && !detail.includes('npcink-cloud-addon');
  return !namedOptionalOnly && detail.includes('npcink-cloud-addon');
}

/** Recheck refreshes Cloud state; it does not install missing WP plugins. */
export function isPortalRecheckHelpfulForAction(
  item: PortalMonitoringOverviewAction | null | undefined
): boolean {
  if (!item) return true;
  if (isPortalCustomerPluginMissingAction(item)) return false;
  return true;
}

export function getPortalCustomerIssueTitle(
  item: PortalMonitoringOverviewAction,
  t: TranslateFn
): string {
  if (isPortalCustomerPluginMissingAction(item)) {
    return t(
      'portal.monitoring.attention_missing_title',
      {},
      'Cloud Addon is not reporting'
    );
  }
  const category = getPortalMonitoringIssueCategory(item);
  const raw = `${item.title || ''} ${item.code || ''}`.toLowerCase();
  if (category === 'connection') {
    return t('portal.monitoring.customer_issue_connection_activity', {}, 'Site connection needs attention');
  }
  if (category === 'quota') {
    return t('portal.monitoring.quota_pressure', {}, 'Usage pressure');
  }
  if (category === 'knowledge') {
    return t('portal.vector_obs.status_attention', {}, 'Knowledge status needs confirmation');
  }
  if (raw.includes('runtime') || raw.includes('success')) {
    return t('portal.monitoring.customer_issue_service_success', {}, 'Service success rate needs attention');
  }
  return t('portal.monitoring.customer_issue_general', {}, 'Service item needs attention');
}

export function getPortalCustomerIssueDetail(
  item: PortalMonitoringOverviewAction,
  t: TranslateFn
): string {
  if (isPortalCustomerPluginMissingAction(item)) {
    const plugins = extractPortalBaselineMissingPluginSlugs(item);
    const pluginList = plugins.length
      ? plugins.join(', ')
      : 'npcink-cloud-addon';
    return t(
      'portal.monitoring.attention_missing_detail_with_plugins',
      { plugins: pluginList },
      'Cloud is not receiving reports from: {{plugins}}. Recheck will not install them — confirm Cloud Addon is installed and active in WordPress, or contact support.'
    );
  }
  const category = getPortalMonitoringIssueCategory(item);
  if (category === 'quota') {
    return t(
      'portal.monitoring.quota_evidence_attention',
      {},
      'Usage is near or over the current package limit.'
    );
  }
  return t(
    'portal.monitoring.customer_issue_detail',
    {},
    'If this keeps showing, contact support and include the site name.'
  );
}

export function hasPortalQuotaPressure(
  overview: PortalMonitoringOverviewSummary
): boolean {
  const pressureKey = overview.quota.top_pressure;
  if (pressureKey === 'none') return false;
  const metric = overview.quota[pressureKey];
  return metric.over_limit || metric.usage_ratio >= 0.9;
}

export function getPortalServiceOperationStatus(
  overview: PortalMonitoringOverviewSummary
): PortalServiceOperationStatus {
  if (overview.health.status === 'inactive') return 'inactive';

  // Quiet default: only actionable service/connection items drive customer status.
  // Soft component scores (e.g. runtime latency) without action_required stay silent.
  const serviceActions = overview.action_required.filter(
    (item) => {
      if (['quota', 'knowledge'].includes(getPortalMonitoringIssueCategory(item))) return false;
      // Optional-plugin gaps must not paint service operation warning.
      if (isPortalPluginMissingAction(item) && !isPortalCustomerPluginMissingAction(item)) {
        return false;
      }
      return true;
    }
  );
  if (serviceActions.some((item) => item.severity === 'error')) return 'error';
  if (serviceActions.length > 0) return 'warning';
  return 'active';
}

export function hasPortalServiceAttention(
  overview: PortalMonitoringOverviewSummary
): boolean {
  return getPortalServiceOperationStatus(overview) !== 'active'
    || hasPortalQuotaPressure(overview);
}
