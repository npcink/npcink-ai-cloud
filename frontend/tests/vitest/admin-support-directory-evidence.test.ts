import { describe, expect, it } from 'vitest';
import { isSupportRequestOverdue, matchesSupportRequestQuery, readSupportDirectory } from '@/features/admin/support-requests/directory-evidence';
import realDirectory from '../fixtures/admin-support-directory-serializer.json';
import { supportTicket } from '../fixtures/admin-support-detail';

const key = 'limit=10&sort=risk';
const asOf = new Date('2026-11-02T00:00:00Z');
const summary = { open: 0, in_progress: 0, critical: 0, warning: 0, monitor: 0,
  stable: 0, waiting_for_operator: 0, waiting_for_customer: 0, overdue: 0 };
function directory(items: unknown[] = []) {
  return { items, summary, pagination: { limit: 10, offset: 0, total: items.length, has_more: false } };
}
describe('real support directory evidence', () => {
  it('accepts the checked real Python serializer fixture', () => {
    const parsed = readSupportDirectory(realDirectory, key);
    expect(parsed.issues).toEqual([]); expect(parsed.items[0].request_id).toBe('sr_reply');
  });
  it('accepts empty lists, all zero counts, null dates and omitted optional dates', () => {
    expect(readSupportDirectory(directory(), key)).toEqual({ ...directory(), issues: [] });
    const item = { ...supportTicket(), created_at: null, updated_at: null, waiting_since: null, resolved_at: null };
    expect(readSupportDirectory(directory([item]), key).items[0].created_at).toBeUndefined();
    expect(readSupportDirectory(directory([supportTicket()]), key).issues).toEqual([]);
  });
  it.each([{}, null, { items: [] }, { ...directory(), items: null }, { ...directory(), summary: {} },
    { ...directory(), pagination: {} }, { ...directory(), summary: { ...summary, open: null } },
    { ...directory(), summary: { ...summary, overdue: -1 } },
    { ...directory(), pagination: { ...directory().pagination, total: '0' } },
    { ...directory(), pagination: { ...directory().pagination, offset: 10 } },
    { ...directory(), pagination: { ...directory().pagination, has_more: true } },
    { ...directory(), pagination: { ...directory().pagination, limit: 20 } }])('rejects malformed envelope %#', value => {
    expect(() => readSupportDirectory(value, key)).toThrow();
  });
  it('isolates null, invalid enums, missing identities, bad dates and duplicate targets in server order', () => {
    const rows = [supportTicket('first'), null, { ...supportTicket('bad'), priority: null },
      { ...supportTicket('bad2'), status: 'other' }, { ...supportTicket('bad3'), request_id: '' },
      { ...supportTicket('bad4'), account_id: '' }, { ...supportTicket('bad5'), topic: 'other' },
      { ...supportTicket('bad6'), created_at: 'bad-time' }, supportTicket('first'), supportTicket('last')];
    const parsed = readSupportDirectory(directory(rows), key);
    expect(parsed.items.map(item => item.request_id)).toEqual(['first', 'last']);
    expect(parsed.issues).toEqual(['items[2]', 'items[3]', 'items[4]', 'items[5]', 'items[6]', 'items[7]', 'items[8]', 'items[9]']);
    expect(parsed.pagination.total).toBe(10);
  });
  it('rejects row filter mismatch without guessing a different scope', () => {
    expect(readSupportDirectory(directory([supportTicket()]), key + '&status=closed').issues).toEqual(['items[1]']);
    expect(readSupportDirectory(directory([supportTicket()]), key + '&topic=site').issues).toEqual(['items[1]']);
  });
  it('binds waiting-for-operator and overdue to the backend scopes', () => {
    const old = { ...supportTicket(), waiting_on: 'operator', waiting_since: '2026-10-30T00:00:00Z' };
    const boundary = { ...old, request_id: 'boundary', waiting_since: '2026-10-31T00:00:00Z' };
    const recent = { ...old, request_id: 'recent', waiting_since: '2026-10-31T00:00:01Z' };
    const missing = { ...old, request_id: 'missing', waiting_since: null };
    expect(isSupportRequestOverdue(old, asOf)).toBe(true);
    expect(isSupportRequestOverdue(boundary, asOf)).toBe(true);
    expect(isSupportRequestOverdue(recent, asOf)).toBe(false);
    expect(isSupportRequestOverdue(missing, asOf)).toBe(false);
    const payload = directory([old, boundary, recent, missing]);
    expect(readSupportDirectory(payload, key + '&attention=overdue', asOf).items.map(item => item.request_id)).toEqual(['sr_synthetic', 'boundary']);
    expect(readSupportDirectory(payload, key + '&attention=overdue', asOf).issues).toEqual(['items[3]', 'items[4]']);
    expect(readSupportDirectory(payload, key + '&attention=waiting_for_operator', asOf).issues).toEqual([]);
  });
  it('binds q to the backend request, email, title, account and site fields', () => {
    const fields = [
      ['request id', { request_id: 'SR-Needle' }],
      ['email', { email: 'Needle@example.com' }],
      ['title', { title: 'Needle title' }],
      ['account', { account_id: 'acct-needle' }],
      ['site', { site_id: 'site-needle' }],
    ] as const;
    for (const [name, override] of fields) {
      const row = { ...supportTicket(), ...override };
      expect(matchesSupportRequestQuery(row, '  NEEDLE  '), name).toBe(true);
      expect(readSupportDirectory(directory([row]), key + '&q=NEEDLE').issues, name).toEqual([]);
    }
    const miss = supportTicket();
    expect(matchesSupportRequestQuery(miss, 'no-match')).toBe(false);
    expect(readSupportDirectory(directory([miss]), key + '&q=no-match').issues).toEqual(['items[1]']);
    expect(readSupportDirectory(directory([miss]), key).issues).toEqual([]);
  });
  it.each(['low', 'normal', 'high', 'critical', 'urgent'])('accepts existing %s priority', priority => {
    expect(readSupportDirectory(directory([{ ...supportTicket(), priority }]), key).issues).toEqual([]);
  });
});
