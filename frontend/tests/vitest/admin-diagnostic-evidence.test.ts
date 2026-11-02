import { describe, expect, it } from 'vitest';
import serializers from '../fixtures/admin-diagnostic-serializers.json';
import { readCoverageQueue } from '@/features/admin/coverage/evidence';
import { readAdminAuditEvidence } from '@/features/admin/audit/evidence';
import { normalizeRuntimeTelemetry } from '@/features/admin/observability/runtimeTelemetry';
import { readRuntimeRuns } from '@/features/admin/observability/run-evidence';

const coverageKey = 'status=all&sort=priority&offset=0&limit=10';
const auditKey = 'limit=10&offset=0&include_payload=false';
const telemetryKey = 'recent_minutes=1440&limit=25';
const runScope = { site: 'site_contract', capability: '', runId: '' };
const copy = <T,>(value: T): T => structuredClone(value);

describe('serializer-backed diagnostic evidence', () => {
  it('accepts actual serializers, real zeros, optional nulls and no-AI coverage', () => {
    expect(readCoverageQueue(serializers.coverage, coverageKey).items).toHaveLength(1);
    expect(readAdminAuditEvidence(serializers.audit, auditKey).items).toHaveLength(1);
    expect(normalizeRuntimeTelemetry(serializers.telemetry, telemetryKey).totals.runs).toBe(1);
    expect(normalizeRuntimeTelemetry(serializers.telemetryEmpty, telemetryKey).totals.runs).toBe(0);
    expect(readRuntimeRuns(serializers.runs, runScope).items).toHaveLength(1);
    const nonAI = copy(serializers.telemetryEmpty);
    Object.assign(nonAI.totals, { runs: 1, non_ai_zero_credit_runs: 1 });
    nonAI.alert_summary.status = 'ok';
    expect(normalizeRuntimeTelemetry(nonAI).totals.aiEvidenceRequiredRuns).toBe(0);
  });
  it.each([{}, null, { items: [] }, { items: null }])('rejects absent top-level evidence %j', value => {
    expect(() => readCoverageQueue(value, coverageKey)).toThrow();
    expect(() => readAdminAuditEvidence(value, auditKey)).toThrow();
    expect(() => normalizeRuntimeTelemetry(value, telemetryKey)).toThrow();
    expect(() => readRuntimeRuns(value, runScope)).toThrow();
  });
  it('isolates null/bad coverage account and evidence; keeps valid rows and honest source counts', () => {
    const data: any = copy(serializers.coverage);
    data.items.push(null, { ...data.items[0], account: null }, { ...data.items[0], evidence: null });
    data.summary.total = data.total = data.pagination.total = data.summary.visible = 4;
    data.summary.error = data.summary.needs_action = 4;
    const parsed = readCoverageQueue(data, coverageKey);
    expect(parsed.items).toHaveLength(1); expect(parsed.issues).toEqual(['items[2]', 'items[3]', 'items[4]']);
    expect(parsed.total).toBe(4);
  });
  it('rejects a missing page slice instead of treating declared records as an empty result', () => {
    const coverage = copy(serializers.coverage);
    coverage.items = []; coverage.summary.visible = 0; coverage.pagination.has_more = true;
    expect(() => readCoverageQueue(coverage, coverageKey)).toThrow();
    const audit = copy(serializers.audit);
    audit.items = []; audit.diagnostics.returned_count = 0;
    audit.pagination.has_more = true; audit.pagination.next_offset = 0;
    expect(() => readAdminAuditEvidence(audit, auditKey)).toThrow();
  });
  it('keeps all-invalid rows distinct from an empty result', () => {
    const coverage: any = copy(serializers.coverage); coverage.items = [null];
    expect(readCoverageQueue(coverage, coverageKey)).toMatchObject({ items: [], total: 1, issues: ['items[1]'] });
    const audit: any = copy(serializers.audit); audit.items = [null];
    expect(readAdminAuditEvidence(audit, auditKey)).toMatchObject({ items: [], total: 1, issues: ['items[1]'] });
  });
  it('retains nonempty partial rows with a visible page completeness issue', () => {
    const coverage = copy(serializers.coverage);
    coverage.total = coverage.pagination.total = coverage.summary.total = coverage.summary.error = coverage.summary.needs_action = 2;
    coverage.pagination.has_more = true;
    expect(readCoverageQueue(coverage, coverageKey)).toMatchObject({ items: [expect.any(Object)], issues: ['pagination.items'] });
    const audit = copy(serializers.audit);
    audit.total = audit.pagination.total = 2; audit.pagination.has_more = true; audit.pagination.next_offset = 1;
    expect(readAdminAuditEvidence(audit, auditKey)).toMatchObject({ items: [expect.any(Object)], issues: ['pagination.items'] });
  });
  it.each(['/admin/accounts/other#customer-access', 'https://example.com', '/admin/subscriptions/other', '/admin/accounts/acct_contract?x=1'])('rejects coverage action target %s', target => {
    const data = copy(serializers.coverage); data.items[0].action_href = target;
    expect(readCoverageQueue(data, coverageKey).issues).toHaveLength(1);
  });
  it('retains all real action branches with exact account/subscription ownership', () => {
    const accountActions = { repair_customer_access: '#customer-access', inspect_customer_access: '#customer-access',
      review_customer_status: '', inspect_when_needed: '', wait_for_site_onboarding: '', change_customer_package: '#coverage-actions',
      inspect_site_footprint: '#site-footprint', inspect_site_key_coverage: '#site-footprint' };
    for (const [action, hash] of Object.entries(accountActions)) {
      const data = copy(serializers.coverage); data.items[0].recommended_action = action;
      data.items[0].action_href = `/admin/accounts/acct_contract${hash}`;
      expect(readCoverageQueue(data, coverageKey).issues).toEqual([]);
    }
    for (const action of ['repair_subscription_lifecycle', 'review_renewal', 'inspect_billing_snapshot']) {
      const data: any = copy(serializers.coverage); data.items[0].recommended_action = action;
      data.items[0].primary_subscription = { account_id: 'acct_contract', subscription_id: 'sub_contract', status: 'active', current_period_end_at: null };
      data.items[0].action_href = '/admin/subscriptions/sub_contract';
      expect(readCoverageQueue(data, coverageKey).issues).toEqual([]);
      data.items[0].primary_subscription.account_id = 'acct_other';
      expect(readCoverageQueue(data, coverageKey).issues).toHaveLength(1);
    }
  });
  it.each(['site_id', 'account_id', 'actor_ref', 'scope_kind', 'scope_id', 'idempotency_key', 'event_kind', 'outcome', 'event_id'])('binds exact audit %s to actual rows', key => {
    const p = new URLSearchParams(auditKey); p.set(key, 'wrong');
    expect(readAdminAuditEvidence(serializers.audit, p.toString()).issues).toEqual(['items[1]']);
  });
  it('quarantines bad audit rows; strips payloads; rejects missing diagnostics and wrong pagination', () => {
    const data: any = copy(serializers.audit); data.items[0].payload = { secret: 'synthetic payload excluded' };
    expect(readAdminAuditEvidence(data, auditKey).items[0]).not.toHaveProperty('payload');
    data.items.push(null); data.total = data.pagination.total = data.diagnostics.returned_count = 2;
    expect(readAdminAuditEvidence(data, auditKey).issues).toEqual(['items[2]']);
    delete data.diagnostics; expect(() => readAdminAuditEvidence(data, auditKey)).toThrow();
    expect(() => readAdminAuditEvidence(serializers.audit, 'limit=10&offset=10')).toThrow();
  });
  it('binds audit precise RFC3339 instants without losing offsets or subsecond values', () => {
    expect(readAdminAuditEvidence(serializers.audit, auditKey + '&created_from=2026-11-02T06:00:00.001Z').issues).toHaveLength(1);
    expect(readAdminAuditEvidence(serializers.audit, auditKey + '&created_to=2026-11-02T05:59:59.999Z').issues).toHaveLength(1);
    expect(readAdminAuditEvidence(serializers.audit, auditKey + '&created_from=2026-11-02T14:00:00%2B08:00').issues).toEqual([]);
  });
  it.each(['runs', 'provider_calls', 'usage_meter_events', 'provider_call_run_coverage_rate', 'metered_run_coverage_rate', 'provider_evidence_pending_runs'])('never defaults missing/invalid required metric %s to zero', key => {
    for (const value of [undefined, null, -1, '0', NaN, Infinity]) {
      const data: any = copy(serializers.telemetry); data.totals[key] = value;
      expect(() => normalizeRuntimeTelemetry(data)).toThrow();
    }
  });
  it.each(['alert_summary', 'governance_gaps', 'usage_statistics', 'window', 'filters', 'evidence_limits'])('rejects missing block %s', key => {
    const data: any = copy(serializers.telemetry); delete data[key];
    expect(() => normalizeRuntimeTelemetry(data)).toThrow();
  });
  it('checks denominator/window/request identity while preserving pending and optional unknown gaps', () => {
    const data = copy(serializers.telemetry);
    expect(() => normalizeRuntimeTelemetry(data, telemetryKey + '&site_id=other')).toThrow();
    expect(() => normalizeRuntimeTelemetry(data, 'recent_minutes=60&limit=25')).toThrow();
    data.totals.provider_evidence_pending_runs = 2; expect(() => normalizeRuntimeTelemetry(data)).toThrow();
    const pending = copy(serializers.telemetry);
    Object.assign(pending.totals, { provider_evidence_required_runs: 0, provider_evidence_pending_runs: 1, provider_call_run_coverage_rate: 1 });
    pending.governance_gaps.runs_without_provider_call_count = 0;
    expect(normalizeRuntimeTelemetry(pending).totals.providerEvidencePendingRuns).toBe(1);
  });
  it('isolates provider failure and capability rows without discarding totals or claiming healthy', () => {
    const data: any = copy(serializers.telemetry); data.provider_failures = [null]; data.capability_groups.push(null);
    const parsed = normalizeRuntimeTelemetry(data);
    expect(parsed.totals.runs).toBe(1); expect(parsed.issues).toHaveLength(2);
  });
  it.each(['text', 'contract/rewrite', 'text.contract'])('matches capability OR semantics %s', capability => {
    expect(readRuntimeRuns(serializers.runs, { ...runScope, capability }).issues).toEqual([]);
  });
  it('rejects cross-site ordinary and exact runs, wrong capability, and malformed values locally', () => {
    for (const scope of [{ ...runScope, site: 'other' }, { ...runScope, runId: 'other' }, { ...runScope, capability: 'other' }]) {
      const parsed = readRuntimeRuns(serializers.runs, scope); expect(parsed.items).toEqual([]); expect(parsed.issues).toHaveLength(1);
    }
    const data: any = copy(serializers.runs); data.items.push(null, { ...data.items[0], duration_ms: '0' });
    expect(readRuntimeRuns(data, runScope).items).toHaveLength(1);
    expect(readRuntimeRuns(data, runScope).issues).toHaveLength(2);
  });
});
