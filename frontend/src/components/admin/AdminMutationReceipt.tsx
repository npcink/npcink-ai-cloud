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

export function AdminMutationReceipt({
  receipt,
  title,
}: {
  receipt: AdminMutationReceiptPayload | null | undefined;
  title?: string;
}) {
  const { t } = useLocale();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  if (!receipt) {
    return null;
  }
  const auditUnavailable = receipt.audit_state === 'unavailable';
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
      data-audit-state={receipt.audit_state || 'unspecified'}
      className={auditUnavailable
        ? 'border-amber-300 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/20'
        : 'border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/50 dark:bg-emerald-950/20'}
    >
      <p className={`text-[0.68rem] font-semibold uppercase tracking-[0.18em] ${auditUnavailable
        ? 'text-amber-800 dark:text-amber-200'
        : 'text-emerald-700 dark:text-emerald-300'}`}>
        {title || t('admin.receipt_latest', {}, 'Latest receipt')}
      </p>
      <p className="mt-2 text-sm font-semibold text-slate-950 dark:text-white">
        {receipt.effective_summary}
      </p>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
        <span>{receipt.event_kind}</span>
        <span>·</span>
        <span>{receipt.outcome}</span>
        <span>·</span>
        <BackofficeIdentifier
          value={receipt.scope_id}
          className="inline text-xs text-slate-600 dark:text-slate-300"
        />
      </div>
      {auditUnavailable ? (
        <p role="alert" className="mt-3 text-xs font-medium leading-5 text-amber-800 dark:text-amber-200">
          {t(
            'admin.receipt_audit_unavailable',
            {},
            'The operation succeeded, but audit evidence could not be persisted. Do not repeat the operation solely to create audit evidence.'
          )}
        </p>
      ) : receipt.audit_state === 'persisted' ? (
        <p role="status" className="mt-3 text-xs text-emerald-700 dark:text-emerald-300">
          {t('admin.receipt_audit_persisted', {}, 'Audit evidence persisted')}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <button
          type="button"
          className="font-medium text-blue-600 hover:underline dark:text-blue-300"
          onClick={() => void copyReceipt()}
        >
          {copyState === 'copied'
            ? t('admin.receipt_copied', {}, 'Receipt copied')
            : copyState === 'failed'
              ? t('admin.receipt_copy_failed', {}, 'Copy failed')
              : t('admin.receipt_copy', {}, 'Copy receipt')}
        </button>
        {auditTrailHref ? (
          <Link
            href={auditTrailHref}
            className="font-medium text-blue-600 hover:underline dark:text-blue-300"
          >
            {t('admin.receipt_view_audit', {}, 'View audit trail')}
          </Link>
        ) : null}
        {receipt.audit_event_id ? (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {t('admin.receipt_audit_event', { id: String(receipt.audit_event_id) }, 'Audit event #{{id}}')}
          </span>
        ) : null}
      </div>
    </BackofficeStackCard>
  );
}
