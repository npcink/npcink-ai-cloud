import { describe, expect, it } from 'vitest';

import type { PortalMonitoringOverviewAction } from '@/lib/portal-client';
import {
  getPortalCustomerIssueTitle,
  getPortalMonitoringIssueCategory,
} from '@/lib/portal-monitoring-display';

const translate = (
  _key: string,
  _params?: Record<string, string>,
  fallback = ''
) => fallback;

function action(
  source: string,
  code: string,
  title: string
): PortalMonitoringOverviewAction {
  return {
    source,
    code,
    title,
    severity: 'warning',
    detail: '',
    suggested_action: '',
  };
}

describe('Portal monitoring display categories', () => {
  it('keeps quota pressure separate from connection health', () => {
    const quotaAction = action(
      'quota',
      'site_monitoring.quota_runs',
      'Runs quota pressure is high'
    );

    expect(getPortalMonitoringIssueCategory(quotaAction)).toBe('quota');
    expect(getPortalCustomerIssueTitle(quotaAction, translate)).toBe('Usage pressure');
  });

  it('maps plugin and credential evidence to the customer connection category', () => {
    const pluginAction = action(
      'plugins',
      'plugin_observability.plugin_error',
      'Plugin error detected'
    );
    const credentialAction = action(
      'connection',
      'site_monitoring.connection_credential_missing',
      'No active Cloud connection credential'
    );

    expect(getPortalMonitoringIssueCategory(pluginAction)).toBe('connection');
    expect(getPortalMonitoringIssueCategory(credentialAction)).toBe('connection');
    expect(getPortalCustomerIssueTitle(pluginAction, translate)).toBe(
      'Site connection needs attention'
    );
  });

  it('keeps runtime degradation in the general service category', () => {
    const runtimeAction = action(
      'runtime',
      'site_monitoring.runtime_success_rate',
      'Runtime success rate dropped'
    );

    expect(getPortalMonitoringIssueCategory(runtimeAction)).toBe('service');
    expect(getPortalCustomerIssueTitle(runtimeAction, translate)).toBe(
      'Service success rate needs attention'
    );
  });
});
