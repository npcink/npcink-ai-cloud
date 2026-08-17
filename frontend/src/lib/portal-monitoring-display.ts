import type {
  PortalMonitoringOverviewAction,
  PortalMonitoringOverviewSummary,
} from '@/lib/portal-client';

type TranslateFn = (key: string, params?: Record<string, string>, fallback?: string) => string;

export type PortalMonitoringIssueCategory = 'connection' | 'quota' | 'service';
export type PortalServiceOperationStatus = 'active' | 'warning' | 'error' | 'inactive';

export function getPortalMonitoringIssueCategory(
  item: PortalMonitoringOverviewAction
): PortalMonitoringIssueCategory {
  const raw = `${item.source || ''} ${item.code || ''} ${item.title || ''}`.toLowerCase();
  if (raw.includes('quota') || raw.includes('usage')) return 'quota';
  if (
    raw.includes('connection')
    || raw.includes('plugin')
    || raw.includes('api_key')
    || raw.includes('activity')
  ) return 'connection';
  return 'service';
}

export function getPortalCustomerIssueTitle(
  item: PortalMonitoringOverviewAction,
  t: TranslateFn
): string {
  const category = getPortalMonitoringIssueCategory(item);
  const raw = `${item.title || ''} ${item.code || ''}`.toLowerCase();
  if (category === 'connection') {
    return t('portal.monitoring.customer_issue_connection_activity', {}, 'Site connection needs attention');
  }
  if (category === 'quota') {
    return t('portal.monitoring.quota_pressure', {}, 'Usage pressure');
  }
  if (raw.includes('runtime') || raw.includes('success')) {
    return t('portal.monitoring.customer_issue_service_success', {}, 'Service success rate needs attention');
  }
  return t('portal.monitoring.customer_issue_general', {}, 'Service item needs attention');
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

  const serviceActions = overview.action_required.filter(
    (item) => getPortalMonitoringIssueCategory(item) !== 'quota'
  );
  const serviceComponents = overview.components.filter(
    (component) => component.component !== 'quota'
  );
  if (
    serviceActions.some((item) => item.severity === 'error')
    || serviceComponents.some((component) => component.status === 'error')
  ) return 'error';
  if (
    serviceActions.length > 0
    || serviceComponents.some((component) => component.status === 'warning')
  ) return 'warning';
  return 'active';
}
