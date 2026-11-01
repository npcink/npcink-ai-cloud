import { describe, expect, it } from 'vitest';
import { normalizeSiteUtc, readSiteConfirmation, readSiteWrite, requireSiteDetail, type SiteAction, type SiteIntent } from '@/features/admin/sites/site-operation-model';

const released = '2026-07-01T12:34:56.123456Z';
const until = '2026-12-01T12:34:56.654321Z';
const site = { site_id: 'site_a', account_id: 'acct_a', name: '', status: 'archived', ownership_released_at: released, relink_cooldown_until: until };
const intent = (action: SiteAction): SiteIntent => ({ site_id: 'site_a', account_id: 'acct_a', operation_id: 'op_a', action, input_utc: until, cooldown_until: action === 'set' ? until : null, ownership_released_at: released });
const confirmation = (action: SiteAction) => ({ site_id: 'site_a', operation_id: 'op_a', action, state: 'confirmed', site, receipt: { site_id: 'site_a', operation_id: 'op_a', action, audit_event_id: 4, resolved_cooldown_until: until }, site_relink_policy: { enabled: true, default_cooldown_days: 90, ownership_released_at: released, cooldown_until: until, cross_account_relink_ready: false } });

describe('required site projection', () => {
  it.each([{}, { site: null }, { site: [] }, { site: { ...site, site_id: 'other' } }, { site: { ...site, status: '' } }, { site: { ...site, status: 'arbitrary' } }, { site, account: { account_id: 'wrong' } }])('rejects unsafe primary data %j', payload => {
    expect(() => requireSiteDetail(payload, 'site_a')).toThrow();
  });
  it('keeps legal optional account/subscription/stat omissions', () => {
    for (const payload of [{ site }, { site, account: null }, { site, account: { account_id: 'acct_a' } }]) expect(requireSiteDetail(payload, 'site_a')).toBe(site);
    expect(requireSiteDetail({ site: { site_id: 'unbound', status: 'provisioning', account_id: '' } }, 'unbound')).toBeTruthy();
  });
});
it('normalizes timezone equivalence without dropping server microseconds', () => {
  expect(normalizeSiteUtc(until)).toBe(normalizeSiteUtc(until.replace('Z', '+00:00')));
  expect(normalizeSiteUtc('2026-12-01T20:34:56.654321+08:00')).toBe(normalizeSiteUtc(until));
  expect(normalizeSiteUtc('2026-12-01T12:34:56.654322Z')).not.toBe(normalizeSiteUtc(until));
  for (const value of ['2026-02-30T00:00:00Z', '2026-12-01T12:34', null, 42]) expect(() => normalizeSiteUtc(value)).toThrow();
});
it('activation needs the actual active target and owner', () => {
  const submitted = intent('activate');
  expect(readSiteWrite({ ...site, status: 'active' }, submitted).site.status).toBe('active');
  for (const value of [{}, site, { ...site, site_id: 'wrong', status: 'active' }, { ...site, account_id: 'wrong', status: 'active' }]) expect(() => readSiteWrite(value, submitted)).toThrow();
});
it.each(['set', 'clear', 'reset'] as const)('%s matches the exact persisted result and current site', action => {
  const value = confirmation(action);
  expect(readSiteConfirmation(value, intent(action))?.policy?.cooldown_until).toBe(until);
  expect(readSiteConfirmation({ ...value, state: 'unconfirmed', site: null, receipt: null }, intent(action))).toBeNull();
  for (const patch of [
    { operation_id: 'wrong' }, { action: 'activate' }, { site: { ...site, site_id: 'wrong' } }, { site: { ...site, account_id: 'wrong' } },
    { site: { ...site, ownership_released_at: '2026-07-02T12:34:56.123456Z' } },
    { receipt: { ...value.receipt, audit_event_id: {} } }, { receipt: { ...value.receipt, action: 'activate' } },
    { receipt: { ...value.receipt, resolved_cooldown_until: '2026-12-01T12:34:56.654322Z' } },
    { site_relink_policy: { ...value.site_relink_policy, enabled: null } },
  ]) expect(() => readSiteConfirmation({ ...value, ...patch }, intent(action))).toThrow();
  const direct = { ...site, action, policy_enabled: true, default_cooldown_days: 90, cross_account_relink_ready: false };
  expect(readSiteWrite(direct, intent(action)).policy?.cooldown_until).toBe(until);
  expect(() => readSiteWrite({ ...direct, action: 'wrong' }, intent(action))).toThrow();
});
it('set requires the original exact UTC even with a valid audit receipt', () => {
  const value = confirmation('set');
  expect(() => readSiteConfirmation(value, { ...intent('set'), cooldown_until: '2026-12-02T12:34:56.654321Z' })).toThrow();
});
