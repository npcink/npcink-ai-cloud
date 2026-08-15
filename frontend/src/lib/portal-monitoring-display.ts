import type { PortalMonitoringOverviewAction } from '@/lib/portal-client';

type TranslateFn = (key: string, params?: Record<string, string>, fallback?: string) => string;

export type PortalMonitoringIssueCategory = 'connection' | 'quota' | 'service';

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
