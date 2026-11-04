import { describe, expect, it } from 'vitest';

import type {
  PortalMonitoringOverviewAction,
  PortalMonitoringOverviewSummary,
} from '@/lib/portal-client';
import {
  getPortalCustomerIssueTitle,
  getPortalCustomerIssueDetail,
  hasPortalRuntimeSuccessWithoutPluginReports,
  isPortalActionableServiceIssue,
  isPortalWordPressConnectionAction,
  getPortalMonitoringIssueCategory,
  getPortalServiceOperationStatus,
  hasPortalQuotaPressure,
  isPortalCustomerPluginMissingAction,
  PORTAL_BASELINE_PLUGIN_SLUGS,
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
      'Recent connection errors were recorded'
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

  it('only surfaces Cloud Addon baseline as customer-facing plugin_missing', () => {
    expect(PORTAL_BASELINE_PLUGIN_SLUGS).toEqual(['npcink-cloud-addon']);
    const optionalOnly = action(
      'plugins',
      'plugin_observability.plugin_missing',
      'Expected plugin not reporting'
    );
    optionalOnly.detail = 'Missing plugin telemetry: npcink-governance-core, npcink-ai-client-adapter';
    expect(isPortalCustomerPluginMissingAction(optionalOnly)).toBe(false);

    const addonMissing = action(
      'plugins',
      'plugin_observability.plugin_missing',
      'Expected plugin not reporting'
    );
    addonMissing.detail = 'Missing plugin telemetry: npcink-cloud-addon';
    expect(isPortalCustomerPluginMissingAction(addonMissing)).toBe(true);
    expect(getPortalCustomerIssueTitle(addonMissing, translate)).toBe(
      'Cloud Addon is not reporting'
    );

    // Optional-only plugin_missing and soft component scores must stay silent.
    expect(getPortalServiceOperationStatus(overview({
      health: { status: 'warning', score: 80, summary: '', components_count: 1 },
      action_required: [optionalOnly],
      components: [{ component: 'plugins', status: 'warning', score: 80, summary: '' }],
    }))).toBe('active');
    expect(getPortalServiceOperationStatus(overview({
      health: { status: 'warning', score: 80, summary: '', components_count: 1 },
      action_required: [optionalOnly],
      components: [{ component: 'runtime', status: 'warning', score: 85, summary: '' }],
    }))).toBe('active');
  });

  it('distinguishes stale evidence, credential problems and slow responses with actionable guidance', () => {
    for (const [code, title, next, wordpress] of [
      ['plugin_observability.reporting_stale', 'Site connection reports are out of date', 'check that Cloud Addon is active and connected', true],
      ['site_monitoring.connection_credential_missing', 'No active site connection credential', 'reconnect there', true],
      ['site_monitoring.api_key_expiring', 'Site connection credential expires soon', 'does not renew the credential', true],
      ['plugin_observability.latency_high', 'Recent connection responses were slow', 'Historical slow records may remain', false],
    ] as const) {
      const item = action('connection', code, 'Untranslated technical evidence');
      expect(getPortalCustomerIssueTitle(item, translate)).toBe(title);
      expect(getPortalCustomerIssueDetail(item, translate)).toContain(next);
      expect(isPortalWordPressConnectionAction(item)).toBe(wordpress);
    }
  });

  it('keeps an unknown cause explicit and gives a support path without inventing a repair', () => {
    const item = action('connection', 'future.unknown', 'Private technical detail');
    expect(getPortalCustomerIssueDetail(item, translate)).toContain('exact cause is not identified');
    expect(getPortalCustomerIssueDetail(item, translate)).toContain('submit a ticket');
    expect(getPortalCustomerIssueDetail(item, translate)).not.toContain('Private technical detail');
    expect(isPortalWordPressConnectionAction(item)).toBe(false);
  });
  it('keeps missing reports visible as evidence without treating successful runtime as disconnected', () => {
    const noReports = action('plugins', 'plugin_observability.inactive', 'No plugin events');
    const working = overview({
      health: { status: 'warning', score: 85, summary: '', components_count: 6 },
      action_required: [noReports],
      activity: { ...overview().activity, runtime_runs_total: 15, runtime_success_rate: 1 },
    });
    expect(hasPortalRuntimeSuccessWithoutPluginReports(working)).toBe(true);
    expect(isPortalActionableServiceIssue(noReports, working)).toBe(false);
    expect(getPortalServiceOperationStatus(working)).toBe('active');
    for (const change of [
      { runtime_runs_total: 0 },
      { runtime_success_rate: 0.9 },
      { plugin_errors_total: 1 },
    ]) {
      const unconfirmed = { ...working, activity: { ...working.activity, ...change } };
      expect(isPortalActionableServiceIssue(noReports, unconfirmed)).toBe(true);
      expect(getPortalServiceOperationStatus(unconfirmed)).toBe('warning');
    }
    const credential = action('connection', 'site_monitoring.connection_credential_missing', 'No active key');
    expect(isPortalActionableServiceIssue(credential, working)).toBe(true);
    expect(hasPortalRuntimeSuccessWithoutPluginReports({ ...working, action_required: [noReports, credential] })).toBe(false);
    expect(isPortalActionableServiceIssue(noReports, { ...working, window: { ...working.window, hours: 168 } })).toBe(true);
  });

});
