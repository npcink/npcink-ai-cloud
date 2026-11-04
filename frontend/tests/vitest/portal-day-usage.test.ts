import { describe, expect, it } from 'vitest';
import { buildPortalDayTrend } from '@/lib/portal-day-usage';
import type { PortalCreditEventBucket } from '@/lib/portal-client';

describe('server-aggregated day trend', () => {
  it.each([
    ['2026-11-01T04:00:00Z', '2026-11-02T05:00:00Z', 25],
    ['2026-03-08T05:00:00Z', '2026-03-09T04:00:00Z', 23],
    ['2026-10-20T00:00:00Z', '2026-10-21T00:00:00Z', 24],
  ])('covers all hours from %s to %s', (start_at, end_at, hours) => {
    const lastHour = new Date(Date.parse(end_at) - 3600_000).toISOString();
    const bucket = { start_at: lastHour, end_at, consumed_ai_credits: 7, event_count: 2001 } as PortalCreditEventBucket;
    const result = buildPortalDayTrend({ start_at, end_at }, [bucket], 'site', end_at);
    expect(result.points).toHaveLength(hours);
    expect(result.points.at(-1)?.end_at).toBe(new Date(end_at).toISOString());
    expect(result.total_ai_credits).toBe(7);
    expect(result.entry_count).toBe(2001);
    expect(result.points.at(-1)?.entry_count).toBe(2001);
  });

  it('clips the current day at the server snapshot, including fractional-offset zones', () => {
    const result = buildPortalDayTrend(
      { start_at: '2026-11-01T18:15:00Z', end_at: '2026-11-02T18:15:00Z' }, [],
      'site', '2026-11-01T20:30:00Z',
    );
    expect(result.points).toHaveLength(3);
    expect(result.points[0].start_at).toBe('2026-11-01T18:15:00.000Z');
    expect(result.points.at(-1)?.end_at).toBe('2026-11-01T20:30:00.000Z');
  });
});
