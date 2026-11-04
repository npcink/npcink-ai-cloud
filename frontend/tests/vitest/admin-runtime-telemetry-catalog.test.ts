import { translate } from '@/lib/i18n';
import serializers from '../fixtures/admin-diagnostic-serializers.json';
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
  issueImpact,
  issueVerification,
  providerFailureAction,
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
  return { code, severity, title: '', summary: '', count, capabilities: [], suggested_action: '', href: '', daily_counts: [] };
}

describe('normalizeRuntimeTelemetry alert ordering', () => {
  it('ranks severity first, then count, then code for stability', () => {
    const summary = normalizeRuntimeTelemetry({
      ...serializers.telemetry,
      alert_summary: {
        ...serializers.telemetry.alert_summary, status: 'warning', alert_count: 4,
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

  it('rejects missing evidence and accepts an actual empty serializer', () => {
    expect(() => normalizeRuntimeTelemetry({})).toThrow();
    const summary = normalizeRuntimeTelemetry(serializers.telemetryEmpty);
    expect(summary.alertSummary.alerts).toEqual([]);
    expect(summary.alertSummary.status).toBe('inactive');
    expect(summary.totals.runs).toBe(0);
  });

  it('keeps optional group gaps unavailable and discloses capped evidence', () => {
    const value = structuredClone(serializers.telemetry);
    delete (value.capability_groups[0] as { provider_call_gap_runs?: number }).provider_call_gap_runs;
    expect(normalizeRuntimeTelemetry(value).capabilityGroups[0].providerGapRuns).toBeNull();
    value.evidence_limits.provider_calls_truncated = true;
    expect(normalizeRuntimeTelemetry(value).sampleLimited).toBe(true);
    expect(normalizeRuntimeTelemetry(serializers.telemetryEmpty).totals.providerEvidenceRequiredRuns).toBe(0);
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
    expect(issueAction({ code: 'hosted_model.provider_errors', suggestedAction: '' }, identityT)).toBe('Inspect the failure details and next actions below.');
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


describe('runtime handling distinguishes outcomes and evidence', () => {
  const zh = (key: string) => translate('zh-CN', key);
  it('does not turn a failed attempt or missing evidence into a failed task or billing error', () => {
    expect(issueImpact({ code: 'hosted_model.provider_errors' }, zh)).toContain('任务可能通过其他尝试完成');
    expect(issueImpact({ code: 'hosted_model.provider_call_gap' }, zh)).toContain('不等于生成失败');
    expect(issueImpact({ code: 'hosted_model.unmetered_runs' }, zh)).toContain('不能证明生成失败、扣费错误');
    expect(issueImpact({ code: 'future.code' }, zh)).toContain('尚未分类');
    expect(issueEvidenceGuidance({ code: 'future.code' }, zh)).not.toContain('运行失败记录');
  });
  it('keeps parameter rejection separate from schema and timeout advice', () => {
    expect(providerFailureAction('invalid_request', zh)).toContain('请求参数');
    expect(providerFailureAction('invalid_request', zh)).toContain('不能证明密钥失效');
    expect(providerFailureAction('output_schema_invalid', zh)).toContain('后台设置无法修复');
    expect(providerFailureAction('timeout', zh)).toContain('不要直接重复执行');
    expect(providerFailureAction('future.reason', zh)).toContain('先定位原因');
  });
  it('requires fresh business evidence and the relevant recording checks to verify repairs', () => {
    expect(issueVerification({ code: 'hosted_model.provider_errors' }, zh)).toContain('下一次同类自然业务运行');
    expect(issueVerification({ code: 'hosted_model.failed_runs' }, zh)).toContain('都不能证明已恢复');
    expect(issueVerification({ code: 'hosted_model.provider_call_gap' }, zh)).toContain('仅有成功状态');
    expect(issueAction({ code: 'hosted_model.failed_runs', suggestedAction: 'unmapped_action' }, zh)).toContain('先查看失败运行的终态和错误码');
  });
});
