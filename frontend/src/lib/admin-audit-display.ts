import { shortIdentity } from './identity-display';

type Translate = (key: string, params?: Record<string, string>, fallback?: string) => string;
const events: Record<string, string> = {
  'customer_notification.previewed': 'notice_preview', 'customer_notification.sent': 'notice_sent',
  'worker.heartbeat': 'heartbeat', 'payment.order_expiration.cadence': 'order_expiration',
  'payment_order.expiration.cadence': 'order_expiration',
  'payment_order.cancel': 'order_cancel', 'payment.order.create': 'order_create',
  'payment.succeeded': 'payment_succeeded', 'payment.order.paid': 'payment_succeeded',
  'payment.refund.request': 'refund_request', 'payment.refund.succeeded': 'refund_succeeded',
  'refund.succeeded': 'refund_succeeded', 'payment.credit_pack_order.paid': 'credit_pack_paid',
  'payment.credit_pack_order.create': 'credit_pack_create', 'payment.credit_pack_catalog.update': 'credit_pack_update',
  'account.upsert': 'customer_update', 'account.operator_profile.update': 'customer_update',
  'subscription.bind': 'subscription_bind', 'subscription.upsert': 'subscription_update',
  'subscription.suspend': 'coverage_suspend', 'subscription.cancel': 'coverage_cancel',
  'subscription_order.create': 'subscription_create', 'subscription_order.cancel': 'subscription_cancel',
  'subscription_order.activate': 'subscription_activate', 'subscription.topup': 'subscription_topup',
  'subscription.billing_snapshot.rebuild': 'snapshot_rebuild', 'billing_snapshot.rebuild': 'snapshot_rebuild',
  'plan.upsert': 'plan_update', 'plan_version.publish': 'plan_publish',
  'portal_user.disable': 'customer_disable', 'platform_admin_grant.upsert': 'admin_grant',
  'platform_admin_grant.delete': 'admin_revoke', 'support_request.created': 'ticket_create',
  'support_request.updated': 'ticket_update', 'support_request.message_created': 'ticket_reply',
  'support_request.attachment_created': 'ticket_attachment',
};

export function auditEventLabel(value: string | undefined, t: Translate): string {
  const code = value || '';
  return events[code] ? t(`admin.readability.event_${events[code]}`)
    : `${t('admin.readability.unmapped_event')} · ${code || t('common.unknown')}`;
}

export function auditOutcomeLabel(value: string | undefined, t: Translate): string {
  const code = value || '';
  const key = ({ succeeded: 'success', success: 'success', ok: 'success', failed: 'failed', error: 'failed',
    partial: 'partial', blocked: 'blocked', denied: 'blocked' } as Record<string, string>)[code];
  return key ? t(`admin.readability.outcome_${key}`) : `${t('common.unknown')} · ${code || '—'}`;
}

export function auditActorLabel(kind: string | undefined, ref: string | undefined, t: Translate): string {
  const role = kind === 'platform_admin' ? t('portal.role_platform_admin')
    : kind === 'user' || kind === 'customer' ? t('common.account')
    : kind === 'system_worker' ? t('admin.readability.system_task')
    : kind === 'payment_gateway' ? t('admin.readability.payment_gateway')
    : t('admin.notices.sender_unknown');
  const source = ({ ops_cadence: 'scheduled_tasks', runtime_queue: 'runtime_queue',
    callback_dispatch: 'callback_queue' } as Record<string, string>)[ref || ''];
  // A role is not a unique person: keep a distinguishable reference visible.
  return `${role} · ${source && kind === 'system_worker' ? t(`admin.readability.${source}`) : shortIdentity(ref || kind || '—')}`;
}

export function auditScopeLabel(kind: string | undefined, id: string | undefined, t: Translate): string {
  const label = ({ account: 'common.account', site: 'admin.audit_workspace.site_id',
    subscription: 'admin.audit_workspace.subscription_id', platform: 'portal.role_platform_admin' } as Record<string, string>)[kind || ''];
  return `${label ? t(label) : kind || t('common.unknown')} · ${shortIdentity(id || '—')}`;
}
