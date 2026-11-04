import { shortIdentity } from './identity-display';

type Translate = (key: string, params?: Record<string, string>, fallback?: string) => string;
const workers: Record<string, string> = {
  ops_cadence: 'scheduled_tasks', runtime_queue: 'runtime_queue', callback_dispatch: 'callback_queue',
};
const cadenceTasks: Record<string, string> = {
  retention_cleanup: 'retention_cleanup', plugin_observability_cleanup: 'plugin_cleanup',
  usage_rollup: 'usage_rollup', site_knowledge_observability_cleanup: 'knowledge_cleanup',
  editor_assist_quality_detection: 'quality_detection', router_diagnostics_summary: 'router_summary',
  latency_probe_summary: 'latency_summary', alert_provider_degradation: 'provider_alert',
  provider_health_scan: 'provider_scan', artifact_cleanup: 'artifact_cleanup',
  artifact_inventory_reconciliation: 'artifact_reconciliation',
  payment_order_expiration: 'order_expiration', payment_refund_reconciliation: 'refund_reconciliation',
};
const events: Record<string, string> = {
  'customer_notification.previewed': 'notice_preview', 'customer_notification.sent': 'notice_sent',
  'worker.heartbeat': 'heartbeat', 'payment.order_expiration.cadence': 'order_expiration',
  'payment.refund_reconciliation.cadence': 'refund_reconciliation',
  'runtime.retention_cleanup.cadence': 'retention_cleanup',
  'plugin_observability.retention_cleanup.cadence': 'plugin_cleanup',
  'usage.rollup_cadence': 'usage_rollup',
  'site_knowledge.observability_retention_cleanup.cadence': 'knowledge_cleanup',
  'editor_assist.quality_detection.cadence': 'quality_detection',
  'router.diagnostics_summary_cadence': 'router_summary', 'latency.probe_summary_cadence': 'latency_summary',
  'alert.provider_degradation_cadence': 'provider_alert', 'provider.health_scan_cadence': 'provider_scan',
  'runtime.artifact_cleanup.cadence': 'artifact_cleanup',
  'runtime.artifact_inventory_reconciliation.cadence': 'artifact_reconciliation',
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
  const source = workers[ref || ''];
  // A role is not a unique person: keep a distinguishable reference visible.
  return `${role} · ${source && kind === 'system_worker' ? t(`admin.readability.${source}`) : shortIdentity(ref || kind || '—')}`;
}

export function auditScopeLabel(kind: string | undefined, id: string | undefined, t: Translate): string {
  const label = ({ account: 'common.account', site: 'admin.audit_workspace.site_id',
    subscription: 'admin.audit_workspace.subscription_id', platform: 'portal.role_platform_admin',
    worker: 'admin.readability.system_task', ops_cadence: 'admin.readability.scheduled_tasks' } as Record<string, string>)[kind || ''];
  const task = kind === 'ops_cadence' ? cadenceTasks[id || ''] : undefined;
  const worker = kind === 'worker' ? workers[id || ''] : undefined;
  const target = task ? t(`admin.readability.event_${task}`)
    : worker ? t(`admin.readability.${worker}`) : shortIdentity(id || '—');
  return `${label ? t(label) : kind || t('common.unknown')} · ${target}`;
}
