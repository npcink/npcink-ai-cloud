'use client';

import { FormEvent, useState } from 'react';
import { useLocale } from '@/contexts/LocaleContext';
import {
  type CreateAccountFormErrors,
  type CreateAccountFormValues,
  validateCreateAccountForm,
} from './create-account-form-model';

type CreateAccountFormProps = {
  actionError: string;
  onSubmit: (values: CreateAccountFormValues) => Promise<void>;
};

export function CreateAccountForm({
  actionError,
  onSubmit,
}: CreateAccountFormProps) {
  const { t } = useLocale();
  const [errors, setErrors] = useState<CreateAccountFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const result = validateCreateAccountForm({
      account_id: String(fields.get('account_id') || ''),
      name: String(fields.get('name') || ''),
      primary_email: String(fields.get('primary_email') || ''),
      operator_display_name: String(fields.get('operator_display_name') || ''),
      operator_note: String(fields.get('operator_note') || ''),
      bind_default_free: fields.get('bind_default_free') === 'on',
    });
    if (!result.success) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setIsSubmitting(true);
    try {
      await onSubmit(result.data);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1.05fr)_minmax(0,1fr)_auto] xl:items-end"
    >
      <div className="text-sm">
        <label
          htmlFor="create-account-id"
          className="mb-2 block font-medium text-slate-700 dark:text-slate-300"
        >
          {t('admin.account_id', {}, 'Account ID')}
        </label>
        <input
          id="create-account-id"
          name="account_id"
          type="text"
          placeholder="acct_customer_free"
          className="input w-full"
          aria-invalid={Boolean(errors.account_id)}
          aria-describedby={
            errors.account_id ? 'create-account-id-error' : undefined
          }
        />
        {errors.account_id ? (
          <span
            id="create-account-id-error"
            role="alert"
            className="mt-1.5 block text-xs text-rose-700 dark:text-rose-300"
          >
            {t(
              'admin.accounts.validation_account_id_required',
              {},
              'Enter an Account ID.'
            )}
          </span>
        ) : null}
      </div>

      <div className="text-sm">
        <label
          htmlFor="create-account-name"
          className="mb-2 block font-medium text-slate-700 dark:text-slate-300"
        >
          {t('common.name', {}, 'Name')}
        </label>
        <input
          id="create-account-name"
          name="name"
          type="text"
          placeholder={t(
            'admin.accounts.customer_name_placeholder',
            {},
            'Customer Account'
          )}
          className="input w-full"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? 'create-account-name-error' : undefined}
        />
        {errors.name ? (
          <span
            id="create-account-name-error"
            role="alert"
            className="mt-1.5 block text-xs text-rose-700 dark:text-rose-300"
          >
            {t(
              'admin.accounts.validation_name_required',
              {},
              'Enter a customer name.'
            )}
          </span>
        ) : null}
      </div>

      <div className="text-sm">
        <label
          htmlFor="create-account-primary-email"
          className="mb-2 block font-medium text-slate-700 dark:text-slate-300"
        >
          {t('admin.accounts.primary_email_label', {}, 'Login email')}
        </label>
        <input
          id="create-account-primary-email"
          name="primary_email"
          type="email"
          autoComplete="email"
          placeholder="owner@example.com"
          className="input w-full"
          aria-invalid={Boolean(errors.primary_email)}
          aria-describedby={
            errors.primary_email ? 'create-account-primary-email-error' : undefined
          }
        />
        {errors.primary_email ? (
          <span
            id="create-account-primary-email-error"
            role="alert"
            className="mt-1.5 block text-xs text-rose-700 dark:text-rose-300"
          >
            {errors.primary_email === 'invalid'
              ? t(
                  'admin.accounts.validation_primary_email_invalid',
                  {},
                  'Enter a valid login email.'
                )
              : t(
                  'admin.accounts.validation_primary_email_required',
                  {},
                  'Enter the customer login email.'
                )}
          </span>
        ) : null}
      </div>

      <label className="text-sm">
        <span className="mb-2 block font-medium text-slate-700 dark:text-slate-300">
          {t(
            'admin.accounts.operator_display_name_label',
            {},
            'Operator name'
          )}
        </span>
        <input
          name="operator_display_name"
          type="text"
          placeholder={t(
            'admin.accounts.operator_display_name_placeholder',
            {},
            'Short name shown in admin lists'
          )}
          className="input w-full"
        />
      </label>

      <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
        {isSubmitting
          ? t('common.saving', {}, 'Saving...')
          : t(
              'admin.accounts.create_customer_account',
              {},
              'Create customer account'
            )}
      </button>

      <label className="text-sm md:col-span-2 xl:col-span-4">
        <span className="mb-2 block font-medium text-slate-700 dark:text-slate-300">
          {t('admin.accounts.operator_note_label', {}, 'Operator note')}
        </span>
        <input
          name="operator_note"
          type="text"
          placeholder={t(
            'admin.accounts.operator_note_placeholder',
            {},
            'Internal follow-up note'
          )}
          className="input w-full"
        />
      </label>

      <label className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-200 xl:col-span-1">
        <input type="checkbox" name="bind_default_free" defaultChecked />
        <span>
          {t(
            'admin.accounts.bind_default_free_label',
            {},
            'Bind formal Free package on create'
          )}
        </span>
      </label>

      {actionError ? (
        <p
          role="alert"
            className="text-sm text-rose-700 dark:text-rose-300 md:col-span-2 xl:col-span-5"
        >
          {actionError}
        </p>
      ) : null}
    </form>
  );
}
