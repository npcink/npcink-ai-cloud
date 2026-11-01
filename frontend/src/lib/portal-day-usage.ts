import type { PortalCreditEventDay, PortalCreditEventBucket, PortalCreditTrendPayload } from './portal-client';

/** Fill empty hours using the server's actual day bounds, including 23/25-hour days. */
export function buildPortalDayTrend(
  day: Pick<PortalCreditEventDay, 'start_at' | 'end_at'>,
  buckets: PortalCreditEventBucket[],
  siteId: string,
  generatedAt: string,
): PortalCreditTrendPayload {
  const start = Date.parse(day.start_at);
  const end = Math.min(Date.parse(day.end_at), Date.parse(generatedAt));
  const byStart = new Map(buckets.map((bucket) => [Date.parse(bucket.start_at), bucket]));
  const points = [];
  for (let hour = Math.floor(start / 3600_000) * 3600_000; hour < end; hour += 3600_000) {
    const from = Math.max(hour, start);
    const bucket = byStart.get(from);
    points.push({
      start_at: new Date(from).toISOString(),
      end_at: new Date(Math.min(hour + 3600_000, end)).toISOString(),
      ai_credits: Number(bucket?.consumed_ai_credits || 0),
      entry_count: Number(bucket?.event_count || 0),
    });
  }
  return {
    contract_version: 'portal-credit-trend-v1', generated_at: generatedAt,
    site_id: siteId, window: '24h', bucket_seconds: 3600,
    start_at: day.start_at, end_at: new Date(end).toISOString(),
    total_ai_credits: points.reduce((sum, point) => sum + point.ai_credits, 0),
    entry_count: points.reduce((sum, point) => sum + point.entry_count, 0), points,
  };
}
