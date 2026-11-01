'use client';

import Link from 'next/link';
import { useState } from 'react';
import { BackofficeIdentifier } from '@/components/backoffice/BackofficeIdentifier';
import { BackofficeStackCard } from '@/components/backoffice/BackofficeScaffold';
import { useLocale } from '@/contexts/LocaleContext';

export type AdminMutationReceiptPayload = {
  audit_event_id?: number;
  audit_state?: 'persisted' | 'unavailable' | 'not_applicable';
  event_kind: string;
  scope_kind: string;
  scope_id: string;
  outcome: string;
  effective_summary: string;
  audit_filters?: Record<string, string>;
};

export function buildAdminAuditTrailHref(
  receipt: AdminMutationReceiptPayload | null | undefined
): string | null {
  if (!receipt) {
    return null;
  }
  const params = new URLSearchParams();
  const eventId = Number(receipt.audit_event_id || 0);
  if (Number.isInteger(eventId) && eventId > 0) {
    params.set('event_id', String(eventId));
    params.set('focus', String(eventId));
    return `/admin/audit?${params.toString()}`;
  }

  const idempotencyKey = receipt.audit_filters?.idempotency_key?.trim();
  if (!idempotencyKey || !receipt.event_kind || !receipt.scope_kind || !receipt.scope_id) {
    return null;
  }
  params.set('idempotency_key', idempotencyKey);
  params.set('event_kind', receipt.event_kind);
  params.set('scope_kind', receipt.scope_kind);
  params.set('scope_id', receipt.scope_id);
  const outcome = receipt.audit_filters?.outcome?.trim();
  if (outcome) {
    params.set('outcome', outcome);
  }
  return `/admin/audit?${params.toString()}`;
}

export function buildAdminMutationReceiptText(receipt: AdminMutationReceiptPayload): string {
  const lines = [
    `event_kind: ${receipt.event_kind}`,
    `outcome: ${receipt.outcome}`,
    `scope_kind: ${receipt.scope_kind}`,
    `scope_id: ${receipt.scope_id}`,
    `summary: ${receipt.effective_summary}`,
  ];
  if (receipt.audit_event_id) {
    lines.push(`audit_event_id: ${receipt.audit_event_id}`);
  }
  if (receipt.audit_state) {
    lines.push(`audit_state: ${receipt.audit_state}`);
  }
  return lines.join('\n');
}

const SUCCESS_SUMMARIES = new Map([
  ['runtime_profiles.update', 'runtime_profiles'],
  ['provider_connection.save', 'provider_saved'],
  ['provider_connection.delete', 'provider_deleted'],
  ['provider_connection.test', 'provider_tested'],
  ['provider_connection.image_host_approve', 'image_host'],
  ['provider_connection.image_delivery_probe', 'image_delivery'],
  ['account.suspend', 'account_suspended'],
  ['account.restore', 'account_restored'],
  ['plan.upsert', 'plan_saved'],
  ['plan_offer.sales_status.update', 'plan_sales'],
  ['plan_version.publish', 'plan_published'],
  ['subscription.upsert', 'subscription_saved'],
  ['subscription.suspend', 'subscription_suspended'],
  ['subscription.cancel', 'subscription_canceled'],
  ['subscription.topup', 'subscription_topup'],
  ['portal_user.disable', 'user_access'],
  ['portal_user.batch_disable', 'user_batch'],
  ['credit_ledger.adjustment', 'credit_adjusted'],
  ['billing_snapshot.rebuild', 'billing_rebuilt'],
  ['subscription.billing_snapshot.rebuild', 'billing_rebuilt'],
  ['site_knowledge_vector_profile.save_and_verify', 'vector_verified'],
  ['site_knowledge_vector_profile.vector_store.save_and_verify', 'vector_store_verified'],
  ['site_knowledge_vector_profile.index.rebuild', 'vector_rebuild'],
]);

export function adminMutationReceiptSummaryKey(receipt: AdminMutationReceiptPayload): string {
  if (receipt.outcome === 'succeeded') {
    return `admin.receipt_result.${SUCCESS_SUMMARIES.get(receipt.event_kind) || 'succeeded'}`;
  }
  if (receipt.outcome === 'error' || receipt.outcome === 'failed') {
    return receipt.event_kind === 'provider_connection.test'
      ? 'admin.receipt_result.provider_test_failed'
      : 'admin.receipt_result.failed';
  }
  return receipt.outcome === 'partial' ? 'admin.receipt_result.partial' : 'admin.receipt_result.unknown';
}

export function AdminMutationReceipt({
  receipt,
  title,
  summary,
}: {
  receipt: AdminMutationReceiptPayload | null | undefined;
  title?: string;
  summary?: string;
}) {
  const { t } = useLocale();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  if (!receipt) {
    return null;
  }
  const auditUnavailable = receipt.audit_state === 'unavailable';
  const operationFailed = receipt.outcome === 'error' || receipt.outcome === 'failed';
  const needsAttention = auditUnavailable || receipt.outcome !== 'succeeded';
  const auditTrailAvailable = receipt.audit_state !== 'unavailable'
    && receipt.audit_state !== 'not_applicable';
  const auditTrailHref = auditTrailAvailable ? buildAdminAuditTrailHref(receipt) : null;

  async function copyReceipt() {
    if (!receipt) {
      return;
    }
    try {
      await navigator.clipboard.writeText(buildAdminMutationReceiptText(receipt));
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1800);
    } catch {
      setCopyState('failed');
    }
  }

  return (
    <BackofficeStackCard
      data-ui="admin-mutation-receipt"
      data-audit-state={receipt.audit_state || 'unspecified'}
      data-outcome={receipt.outcome}
      className={operationFailed
        ? 'border-rose-200 bg-rose-50/80 dark:border-rose-900/50 dark:bg-rose-950/20'
        : needsAttention
          ? 'border-amber-300 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/20'
          : 'border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/50 dark:bg-emerald-950/20'}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <p role={operationFailed || receipt.outcome === 'partial' ? 'alert' : 'status'} className="text-sm font-medium text-slate-950 dark:text-white">
          {summary || t(adminMutationReceiptSummaryKey(receipt))}
        </p>
        {auditTrailHref ? (
          <Link href={auditTrailHref} className="shrink-0 text-sm font-medium text-blue-600 hover:underline dark:text-blue-300">
            {t('admin.receipt_view_audit', {}, 'View change record')}
          </Link>
        ) : null}
      </div>
      {auditUnavailable ? (
        <p role="alert" className="mt-2 text-xs font-medium leading-5 text-amber-800 dark:text-amber-200">
          {t(
            'admin.receipt_audit_unavailable',
            {},
            'The operation record is unavailable. Check the result before submitting again.'
          )}
        </p>
      ) : null}
      <details className="mt-2 text-xs text-slate-600 dark:text-slate-300">
        <summary className="w-fit cursor-pointer hover:text-slate-950 dark:hover:text-white">
          {t('admin.receipt_details', {}, 'Operation details')}
        </summary>
        <div className="mt-3 grid gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
          <p className="font-semibold">{title || t('admin.receipt_latest', {}, 'Latest operation')}</p>
          <p className="break-words">{receipt.effective_summary}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <span className="break-all">{receipt.event_kind}</span>
            <span>{receipt.outcome}</span>
            <BackofficeIdentifier value={receipt.scope_id} className="inline text-xs text-slate-600 dark:text-slate-300" />
          </div>
          {receipt.audit_state === 'persisted' ? (
            <p>{t('admin.receipt_audit_persisted', {}, 'Change record saved')}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="font-medium text-blue-600 hover:underline dark:text-blue-300" onClick={() => void copyReceipt()}>
              {copyState === 'copied'
                ? t('admin.receipt_copied', {}, 'Details copied')
                : copyState === 'failed'
                  ? t('admin.receipt_copy_failed', {}, 'Copy failed')
                  : t('admin.receipt_copy', {}, 'Copy details')}
            </button>
            {receipt.audit_event_id ? (
              <span>{t('admin.receipt_audit_event', { id: String(receipt.audit_event_id) }, 'Record #{{id}}')}</span>
            ) : null}
          </div>
        </div>
      </details>
    </BackofficeStackCard>
  );
}
