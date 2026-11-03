import { describe, expect, it } from 'vitest';
import { adminMutationReceiptSummaryKey, buildAdminAuditTrailHref, buildAdminMutationReceiptText, type AdminMutationReceiptPayload } from '@/components/admin/AdminMutationReceipt';
import { translate } from '@/lib/i18n';

const receipt: AdminMutationReceiptPayload = {
  event_kind: 'runtime_profiles.update', outcome: 'succeeded',
  scope_kind: 'runtime_profile_catalog', scope_id: 'wordpress_ai_connector',
  effective_summary: 'Hosted runtime profiles were updated.', audit_event_id: 721,
};

describe('operator receipt results', () => {
  it('explains saved configuration without claiming a successful model call', () => {
    const key = adminMutationReceiptSummaryKey(receipt);
    expect(translate('zh-CN', key)).toBe('用途配置已保存，后续调用将按新配置选择模型。');
    expect(translate('en', key)).toContain('Future calls');
  });

  it.each(['error', 'failed', 'partial', 'pending', 'future_outcome'])('does not call %s successful for a known save event', (outcome) => {
    const key = adminMutationReceiptSummaryKey({ ...receipt, outcome });
    expect(key).not.toContain('runtime_profiles');
    expect(translate('zh-CN', key)).not.toContain('已保存');
    expect(translate('en', key)).not.toBe(key);
  });

  it('distinguishes a failed connection test from saving a connection', () => {
    const key = adminMutationReceiptSummaryKey({ ...receipt, event_kind: 'provider_connection.test', outcome: 'error' });
    expect(translate('zh-CN', key)).toContain('连接测试失败');
  });

  it('uses a localized generic result for future events without exposing server prose', () => {
    for (const event_kind of ['future.operation', 'toString', '__proto__']) {
      const key = adminMutationReceiptSummaryKey({ ...receipt, event_kind });
      expect(translate('zh-CN', key)).toBe('操作已完成。');
    }
  });

  it('preserves raw details and exact audit navigation independently of display copy', () => {
    expect(buildAdminMutationReceiptText({ ...receipt, audit_state: 'unavailable' })).toContain('audit_state: unavailable');
    expect(buildAdminMutationReceiptText(receipt)).toContain(receipt.effective_summary);
    expect(buildAdminAuditTrailHref(receipt)).toBe('/admin/audit?event_id=721&focus=721');
    expect(buildAdminAuditTrailHref({ ...receipt, audit_event_id: undefined })).toBeNull();
  });
});
