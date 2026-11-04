import { expect, it } from 'vitest';
import { readDetail, summarySchema, type NoticeValues } from '@/features/admin/customer-notifications/contracts';
const values: NoticeValues = {
  dispatch_id: `notice_${'a'.repeat(32)}`, title: 'Maintenance', body: 'Tonight',
  audience: 'selected', account_ids: ['acct_one'], link_href: '/portal/usage',
};
function detail() {
  return {
    ...values, status: 'preview', actor_kind: 'platform_admin', actor_ref: 'admin-one',
    created_at: '2026-11-03T05:00:00Z', sent_at: null, target_count: 1, ready_count: 1,
    sent_count: 0, skipped_count: 0, read_count: 0, failed_count: 0,
    recipients: [{ account_id: 'acct_one', account_name: 'Customer', principal_id: 'owner_one',
      email: 'one@example.test', status: 'ready', reason: '', is_read: false }],
  };
}
it('binds recovery to the exact content, audience, recipient and operator', () => {
  expect(readDetail(detail(), values, 'admin-one').ready_count).toBe(1);
  for (const patch of [
    { title: 'Different' }, { body: 'Different' }, { audience: 'all' },
    { dispatch_id: `notice_${'b'.repeat(32)}` }, { actor_ref: 'admin-two' },
    { link_href: '/portal/billing' },
  ]) expect(() => readDetail({ ...detail(), ...patch }, values, 'admin-one')).toThrow();
  const changed = detail();
  changed.recipients[0].account_id = 'acct_two';
  expect(() => readDetail(changed, values, 'admin-one')).toThrow();
});
it('rejects inconsistent delivery receipts instead of confirming a send', () => {
  for (const patch of [
    { sent_count: 1 }, { read_count: 1 }, { target_count: 0 },
    { status: 'sent' }, { sent_at: '2026-11-03T06:00:00Z' },
  ]) expect(() => readDetail({ ...detail(), ...patch })).toThrow();
  expect(() => readDetail({ ...detail(), recipients: [
    { ...detail().recipients[0], is_read: true },
  ] })).toThrow();
});
it('rejects impossible history counts', () => {
  expect(summarySchema.safeParse(detail()).success).toBe(true);
  expect(summarySchema.safeParse({ ...detail(), target_count: 2 }).success).toBe(false);
  expect(summarySchema.safeParse({ ...detail(), read_count: 1 }).success).toBe(false);
});
