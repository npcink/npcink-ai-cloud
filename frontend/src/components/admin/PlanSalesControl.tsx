'use client';

import { useState } from 'react';
import { AdminMutationReceipt, type AdminMutationReceiptPayload } from '@/components/admin/AdminMutationReceipt';
import { useLocale } from '@/contexts/LocaleContext';
import { createApiClient } from '@/lib/api-client';
import { resolveUiErrorMessage } from '@/lib/errors';

const salesClient = createApiClient({ idempotencyPrefix: 'admin_plan_sales' });
const copy = {
  'zh-CN': {
    title: '套餐销售', active: '正在销售', retired: '已下架', publish: '上架',
    withdraw: '下架', saving: '保存中…', failed: '销售状态保存失败，请重试。',
    description: '下架后停止新购买和新试用，已创建订单及现有订阅继续有效。',
    changed: '销售状态已保存。',
  },
  en: {
    title: 'Package sales', active: 'On sale', retired: 'Withdrawn', publish: 'Put on sale',
    withdraw: 'Withdraw', saving: 'Saving…', failed: 'Could not save sales status. Retry.',
    description: 'Withdrawal stops new purchases and trials. Existing orders and subscriptions remain valid.',
    changed: 'Sales status saved.',
  },
};

export function PlanSalesControl({ planId, status, disabled, onSaved, onSavingChange }: {
  planId: string;
  status: string;
  disabled: boolean;
  onSaved: (status: string) => Promise<void>;
  onSavingChange: (saving: boolean) => void;
}) {
  const { locale } = useLocale();
  const text = copy[locale];
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<AdminMutationReceiptPayload | null>(null);
  const onSale = status === 'active';

  const save = async () => {
    if (saving || disabled) return;
    setSaving(true);
    onSavingChange(true);
    setError('');
    setReceipt(null);
    try {
      const result = (await salesClient.request<{ status: string; receipt: AdminMutationReceiptPayload }>(
        `/api/admin/plans/${encodeURIComponent(planId)}/sales`,
        { method: 'PATCH', body: { status: onSale ? 'retired' : 'active' } }
      )).data;
      setReceipt(result.receipt);
      await onSaved(result.status);
    } catch (cause) {
      setError(resolveUiErrorMessage(cause, text.failed));
    } finally {
      setSaving(false);
      onSavingChange(false);
    }
  };

  return (
    <section className="mb-4 border-b border-slate-200 pb-4 dark:border-slate-800" aria-label={text.title}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{text.title} · {onSale ? text.active : text.retired}</p>
        <button type="button" className="btn btn-secondary btn-sm" disabled={disabled || saving} onClick={() => void save()}>
          {saving ? text.saving : onSale ? text.withdraw : text.publish}
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{text.description}</p>
      {error ? <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      {receipt ? <p role="status" className="mt-2 text-sm">{text.changed}</p> : null}
      <AdminMutationReceipt receipt={receipt} />
    </section>
  );
}
