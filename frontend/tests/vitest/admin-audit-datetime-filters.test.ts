import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { localDateTimeValue, serializeDateTimeFilter } from '@/features/admin/audit/datetime-filters';

// Submitted values are Chromium159 FormData values, not
// defaultValue strings: zero seconds and zero milliseconds are omitted.
describe('audit datetime-local exact RFC3339 round-trip', () => {
  beforeAll(() => vi.stubEnv('TZ', 'UTC'));
  afterAll(() => vi.unstubAllEnvs());
  it.each([
    ['2026-11-02T14:00:00.000001+08:00', '2026-11-02T06:00:00.000', '2026-11-02T06:00'],
    ['2026-11-02T14:00:01.000001+08:00', '2026-11-02T06:00:01.000', '2026-11-02T06:00:01'],
    ['2026-11-02T14:00:00.001001+08:00', '2026-11-02T06:00:00.001', '2026-11-02T06:00:00.001'],
    ['2026-11-02T01:00:00.000001-05:00', '2026-11-02T06:00:00.000', '2026-11-02T06:00'],
    ['2026-11-02T06:00:00.000Z', '2026-11-02T06:00:00.000', '2026-11-02T06:00'],
    ['2026-11-02T06:00:00.100001Z', '2026-11-02T06:00:00.100', '2026-11-02T06:00:00.1'],
    ['2026-11-02T06:00:00.010001Z', '2026-11-02T06:00:00.010', '2026-11-02T06:00:00.01'],
  ])('preserves unchanged %s despite the normalized form value', (original, displayed, submitted) => {
    expect(localDateTimeValue(original)).toBe(displayed);
    expect(serializeDateTimeFilter(submitted, original)).toBe(original);
  });

  it.each([
    ['2026-11-02T06:01', '2026-11-02T06:01:00.000Z'],
    ['2026-11-02T06:00:01', '2026-11-02T06:00:01.000Z'],
    ['2026-11-02T06:00:00.001', '2026-11-02T06:00:00.001Z'],
  ])('serializes an actual edit %s as the newly selected time', (submitted, expected) => {
    expect(serializeDateTimeFilter(submitted, '2026-11-02T14:00:00.000001+08:00')).toBe(expected);
  });

  it('serializes new filters and leaves missing or invalid initial values blank', () => {
    expect(serializeDateTimeFilter('2026-11-02T06:01', null)).toBe('2026-11-02T06:01:00.000Z');
    expect(localDateTimeValue(null)).toBe('');
    expect(localDateTimeValue('invalid')).toBe('');
  });
});
