import { describe, expect, it } from 'vitest';
import { readSupportPrefill, supportDraftTransition } from '@/lib/portal-support-prefill';
import { resolvePortalReturnTo } from '@/lib/portal-return-to';

describe('Addon support draft handoff', () => {
  const params = new URLSearchParams({ new: '1', topic: 'site', site: 'site_fixture',
    title: '知识库图片移除卡住', description: '图片移除尚未确认。\n\n{"issue":"media_withdrawal_blocked","operations":[{"id":"fixture-id"}]}' });
  it('preserves all four fields and line breaks through login and second-factor return encoding', () => {
    const target = `/portal/support?${params}`;
    const login = new URLSearchParams({ redirect: target });
    const secondFactor = new URLSearchParams({ redirect: resolvePortalReturnTo(login.get('redirect')) });
    expect(resolvePortalReturnTo(secondFactor.get('redirect'))).toBe(target);
    expect(readSupportPrefill(new URL(target, 'https://portal.invalid').searchParams)).toEqual({
      open: true, topic: 'site', siteId: 'site_fixture', title: params.get('title'), description: params.get('description'),
    });
  });
  it('accepts plain text only within the existing form bounds and never opens without new=1', () => {
    expect(readSupportPrefill(new URLSearchParams({ topic: 'unknown', title: 'ignored', description: 'ignored' })))
      .toEqual({ open: false, topic: 'general', siteId: '', title: '', description: '' });
    const draft = readSupportPrefill(new URLSearchParams({ new: '1', topic: 'SITE', title: 'x'.repeat(300), description: '<script>plain text</script>\n' + 'x'.repeat(5000) }));
    expect(draft.topic).toBe('site');
    expect(draft.title).toHaveLength(191);
    expect(draft.description).toHaveLength(4000);
    expect(draft.description.startsWith('<script>plain text</script>\n')).toBe(true);
  });
  const scope = { email: 'owner@example.test', contextSiteId: 'site_fixture', linkKey: params.toString() };
  it('initializes once and preserves manual edits, closed dialogs and submitted drafts on session refresh', () => {
    expect(supportDraftTransition(null, scope)).toBe('prefill');
    expect(supportDraftTransition(scope, { ...scope })).toBe('preserve');
    expect(supportDraftTransition(scope, { ...scope, linkKey: 'another-link' })).toBe('prefill');
  });
  it('clears drafts on account/site changes instead of reusing diagnostics in another context', () => {
    expect(supportDraftTransition(scope, { ...scope, email: 'other@example.test' })).toBe('clear');
    expect(supportDraftTransition(scope, { ...scope, contextSiteId: 'another-site' })).toBe('clear');
  });
});
