import { describe, expect, it } from 'vitest';

import type {
  PortalMonitoringOverviewAction,
  PortalMonitoringOverviewSummary,
} from '@/lib/portal-client';
import {
  getPortalCustomerIssueTitle,
  getPortalMonitoringIssueCategory,
  getPortalServiceOperationStatus,
  hasPortalQuotaPressure,
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

function overview(
  overrides: Partial<PortalMonitoringOverviewSummary> = {}
): PortalMonitoringOverviewSummary {
  return {
    contract_version: 'magick-site-monitoring-overview-v1',
    site_id: 'site_test',
    generated_at: '2026-08-15T00:00:00Z',
    window: { hours: 24, start_at: '', end_at: '' },
    health: { status: 'ok', score: 100, summary: '', components_count: 1 },
    action_required: [],
    quota: {
      period_start_at: '',
      period_end_at: '',
      runs: { used: 10, limit: 100, remaining: 90, usage_ratio: 0.1, over_limit: false },
      tokens: { used: 0, limit: 0, remaining: 0, usage_ratio: 0, over_limit: false },
      cost: { used: 0, limit: 0, remaining: 0, usage_ratio: 0, over_limit: false },
      top_pressure: 'runs',
      summary: '',
    },
    activity: {
      last_seen_at: '',
      plugin_events_total: 0,
      plugin_errors_total: 0,
      media_jobs_total: 0,
      media_failed_total: 0,
      vector_searches_total: 0,
      vector_no_hit_total: 0,
      runtime_runs_total: 0,
      runtime_success_rate: 0,
      runtime_p95_latency_ms: 0,
    },
    components: [{ component: 'quota', status: 'ok', score: 100, summary: '' }],
    safety: {
      write_posture: 'suggestion_only',
      direct_wordpress_write: false,
      operator_review_required: true,
      automatic_repair_allowed: false,
      raw_payload_exposed: false,
    },
    ...overrides,
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

  it('does not treat a configured low-usage quota as pressure', () => {
    expect(hasPortalQuotaPressure(overview())).toBe(false);
    expect(hasPortalQuotaPressure(overview({
      quota: {
        ...overview().quota,
        runs: { used: 95, limit: 100, remaining: 5, usage_ratio: 0.95, over_limit: false },
      },
    }))).toBe(true);
  });

  it('preserves inactive health in the service-operation status', () => {
    expect(getPortalServiceOperationStatus(overview({
      health: { status: 'inactive', score: 0, summary: '', components_count: 1 },
    }))).toBe('inactive');
  });

  it('keeps quota-only pressure separate from service operation', () => {
    expect(getPortalServiceOperationStatus(overview({
      health: { status: 'error', score: 45, summary: '', components_count: 1 },
      action_required: [action('quota', 'site_monitoring.quota_runs', 'Quota pressure')],
      components: [{ component: 'quota', status: 'error', score: 45, summary: '' }],
    }))).toBe('active');
  });

  it('keeps knowledge warnings separate from service operation', () => {
    const knowledgeAction = action(
      'site_knowledge',
      'site_monitoring.vector_no_hit_pressure',
      'Knowledge search needs review'
    );

    expect(getPortalMonitoringIssueCategory(knowledgeAction)).toBe('knowledge');
    expect(getPortalServiceOperationStatus(overview({
      health: { status: 'warning', score: 70, summary: '', components_count: 2 },
      action_required: [knowledgeAction],
      components: [
        { component: 'api_key', status: 'ok', score: 100, summary: '' },
        { component: 'site_knowledge', status: 'warning', score: 70, summary: '' },
      ],
    }))).toBe('active');
  });
});
