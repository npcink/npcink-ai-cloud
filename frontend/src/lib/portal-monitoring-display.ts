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

// Translate known evidence codes; never infer a live outage from a historical warning.
const CUSTOMER_ISSUE_GUIDANCE: Record<string, { kind: string; title: string; detail: string; wordpress?: boolean }> = {
  'site_monitoring.connection_credential_missing': {
    kind: 'credential', title: 'No active site connection credential', wordpress: true,
    detail: 'Cloud has no active connection credential for this site; Cloud requests may fail. Open WordPress admin, check the Cloud Addon connection and reconnect there. Then return here and recheck the status. If reconnecting fails, submit a ticket.',
  },
  'site_monitoring.api_key_expiring': {
    kind: 'expiry', title: 'Site connection credential expires soon', wordpress: true,
    detail: 'An active connection credential expires within 7 days. Open WordPress admin and check the Cloud Addon connection before expiry. If it offers no renewal or reconnect option, contact support; refreshing this page does not renew the credential.',
  },
  'site_monitoring.api_key_stale': {
    kind: 'unused', title: 'Site connection has not been used recently', wordpress: true,
    detail: 'The site credential has not been used for more than 7 days. This alone does not prove a disconnection. If this site is still in use, open WordPress admin and check the Cloud Addon connection, then recheck here. If it should be reporting but is not, submit a ticket.',
  },
  'plugin_observability.reporting_stale': {
    kind: 'stale', title: 'Site connection reports are out of date', wordpress: true,
    detail: 'Cloud has not received a recent connection report. This alone does not prove a disconnection. Open WordPress admin and check that Cloud Addon is active and connected, then return here and recheck. If reports remain out of date, submit a ticket.',
  },
  'plugin_observability.inactive': {
    kind: 'no_reports', title: 'No recent site connection reports', wordpress: true,
    detail: 'No connection reports were received in the monitoring period. Open WordPress admin and check that Cloud Addon is active and connected, then recheck here. If the site is in use but still has no reports, submit a ticket.',
  },
  'site_monitoring.no_activity': {
    kind: 'no_activity', title: 'No Cloud activity recorded for this site', wordpress: true,
    detail: 'The site has a connection credential, but Cloud has not recorded activity. Open WordPress admin and check the Cloud Addon connection. Return here to recheck; if a connected site still does not report activity, submit a ticket.',
  },
  'plugin_observability.latency_high': {
    kind: 'slow', title: 'Recent connection responses were slow',
    detail: 'Connection activity was slow during the monitoring period. Recheck to read the latest records. If WordPress operations are also slow or fail, submit a ticket with the operation and time. Historical slow records may remain after service improves.',
  },
  'site_monitoring.runtime_success_rate': {
    kind: 'runtime', title: 'Service success rate needs attention',
    detail: 'Some AI requests failed in the monitoring period. Historical failures do not confirm a current outage. If your WordPress task still fails, submit a ticket with the task and time. Recheck only reads the latest records; it does not retry AI requests.',
  },
  'site_monitoring.media_failures': {
    kind: 'media', title: 'Media processing failures were recorded',
    detail: 'Media processing failures were recorded in the monitoring period. New media processing is paused. If an existing result is affected, contact support with the item and time; rechecking does not restart processing.',
  },
  'plugin_observability.catalog_churn': {
    kind: 'catalog', title: 'Site capability information changed repeatedly', wordpress: true,
    detail: 'Repeated capability changes were recorded. In WordPress, check whether plugins were recently activated or deactivated, then recheck here. If changes continue without an intentional plugin change, submit a ticket.',
  },
};

const CONNECTION_ERROR_CODES = new Set([
  'plugin_observability.error_rate_high', 'plugin_observability.error_rate_elevated',
  'plugin_observability.plugin_error', 'plugin_observability.top_error',
]);

export function isPortalWordPressConnectionAction(item: PortalMonitoringOverviewAction | null): boolean {
  return Boolean(item && CUSTOMER_ISSUE_GUIDANCE[item.code]?.wordpress);
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
  const guidance = CUSTOMER_ISSUE_GUIDANCE[item.code];
  if (guidance) return t(`portal.monitoring.guidance_${guidance.kind}_title`, {}, guidance.title);
  if (CONNECTION_ERROR_CODES.has(item.code)) {
    return t('portal.monitoring.guidance_errors_title', {}, 'Recent connection errors were recorded');
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
  const guidance = CUSTOMER_ISSUE_GUIDANCE[item.code];
  if (guidance) return t(`portal.monitoring.guidance_${guidance.kind}_detail`, {}, guidance.detail);
  if (CONNECTION_ERROR_CODES.has(item.code)) {
    return t('portal.monitoring.guidance_errors_detail', {}, 'Connection errors were recorded during the monitoring period; this does not confirm an ongoing failure. Recheck to read the latest records. If a WordPress operation still fails, submit a ticket with the operation and time. Refreshing does not clear historical errors.');
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
    'The exact cause is not identified here. Recheck to read the latest records. If the warning remains or an operation fails, submit a ticket with the site name, operation and time.'
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

/** Missing plugin monitoring evidence is not a connection outage when runtime evidence succeeds. */
export function hasPortalRuntimeSuccessWithoutPluginReports(overview: PortalMonitoringOverviewSummary): boolean {
  return overview.window.hours === 24
    && overview.activity.runtime_runs_total > 0
    && overview.activity.runtime_success_rate === 1
    && overview.activity.plugin_events_total === 0
    && overview.activity.plugin_errors_total === 0
    && overview.action_required.some((item) => item.code === 'plugin_observability.inactive')
    && overview.action_required.every((item) =>
      item.code === 'plugin_observability.inactive'
      || ['quota', 'knowledge'].includes(getPortalMonitoringIssueCategory(item))
      || (isPortalPluginMissingAction(item) && !isPortalCustomerPluginMissingAction(item))
    );
}

export function isPortalActionableServiceIssue(
  item: PortalMonitoringOverviewAction,
  overview: PortalMonitoringOverviewSummary
): boolean {
  if (getPortalMonitoringIssueCategory(item) === 'knowledge') return false;
  if (isPortalPluginMissingAction(item) && !isPortalCustomerPluginMissingAction(item)) return false;
  if (item.code === 'plugin_observability.inactive' && hasPortalRuntimeSuccessWithoutPluginReports(overview)) return false;
  return true;
}

export function getPortalServiceOperationStatus(
  overview: PortalMonitoringOverviewSummary
): PortalServiceOperationStatus {
  if (overview.health.status === 'inactive') return 'inactive';

  // Quiet default: only actionable service/connection items drive customer status.
  // Soft component scores (e.g. runtime latency) without action_required stay silent.
  const serviceActions = overview.action_required.filter(
    (item) => getPortalMonitoringIssueCategory(item) !== 'quota' && isPortalActionableServiceIssue(item, overview)
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
