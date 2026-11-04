import { describe, expect, it } from 'vitest';
import { readableIdentityName, siteIdentity } from '../../src/lib/identity-display';
import { auditActorLabel, auditEventLabel, auditOutcomeLabel, auditScopeLabel } from '../../src/lib/admin-audit-display';
import { translate } from '../../src/lib/i18n';
import { supportCustomerLabel, supportSiteLabel } from '../../src/features/admin/support-requests/display';

const zh = (key: string) => translate('zh-CN', key);

describe('readable identities retain honest fallbacks', () => {
  it('uses a site domain when the stored name is an identifier and rejects unusable URLs', () => {
    expect(siteIdentity('site_123', 'https://blog.example.test/posts', 'site_123', '未命名站点')).toBe('blog.example.test');
    expect(siteIdentity('', 'javascript:alert(1)', 'site_456', '未命名站点')).toBe('未命名站点 · site_456');
    expect(readableIdentityName('abc-account', 'abc-account')).toBe('');
    expect(siteIdentity('客户的博客', 'https://other.test', 'site_123', '未命名站点')).toBe('客户的博客');
  });
  it('keeps absent customer/site metadata distinguishable without inventing ownership', () => {
    const ticket = { account_id: 'acct_missing', account_name: 'acct_missing', email: 'owner@example.test', site_id: 'site_missing' };
    expect(supportCustomerLabel(ticket, '未命名客户')).toBe('owner@example.test');
    expect(supportSiteLabel(ticket, '未命名站点')).toBe('未命名站点 · site_missing');
    expect(supportCustomerLabel({ ...ticket, email: '' }, '未命名客户')).toContain('acct_missing');
  });
  it('translates known evidence and preserves different unknown codes and actors', () => {
    expect(auditEventLabel('customer_notification.sent', zh)).toBe('发送客户通知');
    expect(auditEventLabel('support_request.message_created', zh)).toBe('回复工单');
    expect(auditOutcomeLabel('succeeded', zh)).toBe('成功');
    expect(auditEventLabel('payment.refund_reconciliation.cadence', zh)).toBe('核对退款结果');
    expect(auditScopeLabel('worker', 'ops_cadence', zh)).toBe('系统任务 · 定时维护任务');
    expect(auditScopeLabel('ops_cadence', 'payment_refund_reconciliation', zh)).toBe('定时维护任务 · 核对退款结果');
    expect(auditActorLabel('system_worker', 'ops_cadence', zh)).toBe('系统任务 · 定时维护任务');
    expect(auditActorLabel('unknown', 'mystery', zh)).not.toContain('平台管理员');
    expect(auditActorLabel('platform_admin', 'admin_a', zh)).not.toBe(auditActorLabel('platform_admin', 'admin_b', zh));
    expect(auditEventLabel('future.event.one', zh)).toContain('future.event.one');
    expect(auditEventLabel('future.event.two', zh)).toContain('future.event.two');
    expect(auditOutcomeLabel('future-result', zh)).toContain('future-result');
  });
});
