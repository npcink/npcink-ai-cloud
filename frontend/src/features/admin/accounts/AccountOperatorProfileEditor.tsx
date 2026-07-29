'use client';

import type { FormEvent } from 'react';
import { useLocale } from '@/contexts/LocaleContext';
import type { AccountOperatorProfileController } from './account-operator-profile';

type AccountOperatorProfileEditorProps = {
  accountTitle: string;
  controller: AccountOperatorProfileController;
};

export function AccountOperatorProfileEditor({
  accountTitle,
  controller,
}: AccountOperatorProfileEditorProps) {
  const { t } = useLocale();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void controller.submit();
  };

  return (
    <details
      data-ui="operator-profile-editor"
      className="rounded-lg border border-slate-200/80 bg-white/75 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/40"
    >
      <summary className="cursor-pointer list-none text-sm font-semibold text-slate-800 dark:text-slate-100">
        {t(
          'admin.account_detail.edit_operator_profile',
          undefined,
          'Edit customer info'
        )}
        <span className="ml-3 font-normal text-slate-500 dark:text-slate-400">
          {t(
            'admin.account_detail.operator_profile_desc',
            undefined,
            'Internal display name and note; user workspace is not affected.'
          )}
        </span>
      </summary>
      <form
        onSubmit={handleSubmit}
        className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] md:items-end"
      >
        <label className="text-sm">
          <span className="mb-2 block font-medium text-gray-700 dark:text-gray-300">
            {t(
              'admin.accounts.operator_display_name_label',
              {},
              'Operator name'
            )}
          </span>
          <input
            type="text"
            value={controller.values.operator_display_name}
            onChange={(event) =>
              controller.setField(
                'operator_display_name',
                event.target.value
              )
            }
            placeholder={accountTitle}
            className="input"
          />
        </label>
        <label className="text-sm">
          <span className="mb-2 block font-medium text-gray-700 dark:text-gray-300">
            {t(
              'admin.accounts.operator_note_label',
              {},
              'Operator note'
            )}
          </span>
          <input
            type="text"
            value={controller.values.operator_note}
            onChange={(event) =>
              controller.setField('operator_note', event.target.value)
            }
            placeholder={t(
              'admin.accounts.operator_note_placeholder',
              {},
              'Internal follow-up note'
            )}
            className="input"
          />
        </label>
        <button
          type="submit"
          className="btn btn-secondary whitespace-nowrap"
          disabled={controller.isSaving}
        >
          {controller.isSaving
            ? t('common.saving', {}, 'Saving...')
            : t('common.save', {}, 'Save')}
        </button>
        {controller.notice ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-300 md:col-span-3">
            {controller.notice}
          </p>
        ) : null}
        {controller.error ? (
          <p className="text-sm text-red-600 dark:text-red-300 md:col-span-3">
            {controller.error}
          </p>
        ) : null}
      </form>
    </details>
  );
}
