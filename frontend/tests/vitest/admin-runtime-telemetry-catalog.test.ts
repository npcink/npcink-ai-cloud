import { describe, expect, it } from 'vitest';
import {
  formatRate,
  normalizeRuntimeTelemetry,
  statusTone,
} from '@/features/admin/observability/runtimeTelemetry';
import {
  issueAction,
  issueCount,
  issueEvidenceGuidance,
  issueOwner,
  issueTitle,
  runStatusLabel,
  severityLabel,
} from '@/features/admin/observability/runtimeIssueCatalog';

const identityT = (key: string, params?: Record<string, string>, fallback?: string) => {
  let value = fallback ?? key;
  if (params) {
    for (const [name, param] of Object.entries(params)) {
      value = value.replaceAll(`{{${name}}}`, param);
    }
  }
  return value;
};

function alert(code: string, severity: string, count: number) {
  return { code, severity, title: '', summary: '', count, capabilities: [], suggested_action: '', href: '' };
}

describe('normalizeRuntimeTelemetry alert ordering', () => {
  it('ranks severity first, then count, then code for stability', () => {
    const summary = normalizeRuntimeTelemetry({
      alert_summary: {
        status: 'warning',
        alerts: [
          alert('hosted_model.provider_errors', 'warning', 4),
          alert('hosted_model.failed_runs', 'warning', 9),
          alert('hosted_model.unmetered_runs', 'error', 1),
          alert('hosted_model.provider_call_gap', 'warning', 9),
        ],
      },
    });
    expect(summary.alertSummary.alerts.map((item) => item.code)).toEqual([
      'hosted_model.unmetered_runs',
      'hosted_model.failed_runs',
      'hosted_model.provider_call_gap',
      'hosted_model.provider_errors',
    ]);
  });

  it('keeps an empty alert list and defaults the status', () => {
    const summary = normalizeRuntimeTelemetry({});
    expect(summary.alertSummary.alerts).toEqual([]);
    expect(summary.alertSummary.status).toBe('inactive');
    expect(summary.totals.runs).toBe(0);
  });
});

describe('runtime issue catalog copy mappings', () => {
  it('maps known codes to localized titles and falls back to the server title', () => {
    expect(issueTitle({ code: 'hosted_model.unmetered_runs', title: '' }, identityT)).toBe('Usage records missing');
    expect(issueTitle({ code: 'future.code', title: 'Server title' }, identityT)).toBe('Server title');
    expect(issueTitle({ code: 'future.code', title: '' }, identityT)).toBe('future.code');
  });

  it('keeps owner, action, and evidence guidance keyed by diagnostic code', () => {
    expect(issueOwner({ code: 'hosted_model.provider_errors' }, identityT)).toBe('Maintenance engineer');
    expect(issueOwner({ code: 'hosted_model.unmetered_runs' }, identityT)).toBe('Technical support');
    expect(issueOwner({ code: 'unknown.code' }, identityT)).toBe('Platform administrator');
    expect(issueAction({ code: 'hosted_model.provider_errors', suggestedAction: '' }, identityT)).toBe('admin.troubleshooting.failures_title');
    expect(issueAction({ code: 'x', suggestedAction: 'inspect_metering_callback_or_usage_event_mapping' }, identityT))
      .toBe('Ask technical support to check usage event recording and request association for the affected functions.');
    expect(issueAction({ code: 'x', suggestedAction: 'unmapped_action' }, identityT))
      .toBe('Ask technical support to investigate this time window and diagnostic code.');
    expect(issueEvidenceGuidance({ code: 'hosted_model.provider_call_gap' }, identityT))
      .toContain('does not establish that the run failed');
    expect(issueEvidenceGuidance({ code: 'hosted_model.failed_runs' }, identityT))
      .toContain('runtime failures');
  });

  it('distinguishes call counts from run counts and run statuses', () => {
    // These catalog calls intentionally omit an inline fallback, so the
    // identity stub surfaces the dictionary key they resolve through.
    expect(issueCount({ code: 'hosted_model.provider_errors', count: 3 }, identityT)).toBe('admin.troubleshooting.count_calls');
    expect(issueCount({ code: 'hosted_model.failed_runs', count: 2 }, identityT)).toBe('admin.troubleshooting.count_runs');
    expect(runStatusLabel('SUCCEEDED', identityT)).toBe('admin.troubleshooting.run_succeeded');
    expect(runStatusLabel('FAILED', identityT)).toBe('admin.troubleshooting.run_failed');
    expect(runStatusLabel('RUNNING', identityT)).toBe('RUNNING');
  });

  it('keeps severity labels textual and rates rounded', () => {
    expect(severityLabel('critical', identityT)).toBe('Error');
    expect(severityLabel('warning', identityT)).toBe('Warning');
    expect(severityLabel('info', identityT)).toBe('Notice');
    expect(statusTone('Succeeded')).toBe('success');
    expect(formatRate(0.8333)).toBe('83%');
  });
});
