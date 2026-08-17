import { describe, expect, it } from 'vitest';
import { buildAdminOperatorWatchItems } from '@/lib/admin-operator-signals';

describe('buildAdminOperatorWatchItems', () => {
  it('preserves backend order and severity without recalculating operator policy', () => {
    const items = buildAdminOperatorWatchItems({
      items: [
        {
          code: 'commercial_subscription_attention',
          scope: 'commercial.subscription',
          severity: 'action_needed',
          value: 1,
          detailCode: 'commercial_subscription_attention',
          detailArgs: {},
        },
        {
          code: 'runtime_telemetry',
          scope: 'runtime.telemetry_coverage',
          severity: 'warn',
          value: 2,
          detailCode: 'runtime_telemetry',
          detailArgs: { alert_code: 'hosted_model.provider_call_gap' },
        },
      ],
      formatValue: (value) => `#${value}`,
      localize: (item) => ({ title: `title:${item.code}`, reason: `reason:${item.detailCode}` }),
    });

    expect(items.map((item) => item.scope)).toEqual([
      'commercial.subscription',
      'runtime.telemetry_coverage',
    ]);
    expect(items[0]).toMatchObject({
      severity: 'action-needed',
      value: '#1',
      title: 'title:commercial_subscription_attention',
    });
    expect(items[1]).toMatchObject({ severity: 'warn', value: '#2' });
  });

  it('renders an unavailable backend value without inventing a numeric signal', () => {
    const items = buildAdminOperatorWatchItems({
      items: [
        {
          code: 'operational_readiness_unknown',
          scope: 'runtime.operational_readiness',
          severity: 'warn',
          value: null,
          detailCode: 'operational_readiness_unknown',
          detailArgs: {},
        },
      ],
      formatValue: String,
      localize: () => ({ title: 'Readiness unknown', reason: 'Evidence unavailable.' }),
    });

    expect(items[0]).toEqual({
      title: 'Readiness unknown',
      scope: 'runtime.operational_readiness',
      severity: 'warn',
      reason: 'Evidence unavailable.',
      value: '?',
    });
  });
});
