'use client';

import { useCallback, useState } from 'react';
import { useLocale } from '@/contexts/LocaleContext';
import {
  type CreateAccountFormErrors,
  validateCreateAccountForm,
} from './create-account-form-model';

type CreateAccountFormProps = {
  actionError: string;
  errors: CreateAccountFormErrors;
};

export function CreateAccountForm({
  actionError,
  errors,
}: CreateAccountFormProps) {
  const { t } = useLocale();

  return (
    <div className="grid gap-4 md:grid-cols-2">
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

      <label className="text-sm md:col-span-2">
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

      <label className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-200 md:col-span-2">
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
          className="text-sm text-rose-700 dark:text-rose-300 md:col-span-2"
        >
          {actionError}
        </p>
      ) : null}
    </div>
  );
}

export function useCreateAccountForm() {
  const [errors, setErrors] = useState<CreateAccountFormErrors>({});

  const validate = useCallback((fields: FormData) => {
    const result = validateCreateAccountForm({
      name: String(fields.get('name') || ''),
      primary_email: String(fields.get('primary_email') || ''),
      operator_display_name: String(fields.get('operator_display_name') || ''),
      operator_note: String(fields.get('operator_note') || ''),
      bind_default_free: fields.get('bind_default_free') === 'on',
    });
    setErrors(result.success ? {} : result.errors);
    return result;
  }, []);

  const reset = useCallback(() => setErrors({}), []);

  return { errors, reset, validate };
}
