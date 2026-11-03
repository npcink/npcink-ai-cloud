'use client';

import { useLocale } from '@/contexts/LocaleContext';
import { cn } from '@/lib/utils';

const KEY_CLASS =
  'rounded border border-slate-300 bg-white px-1 py-0.5 font-mono text-[0.65rem] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200';

export function AdminQueueKeyboardHint({ className }: { className?: string }) {
  const { t } = useLocale();
  return (
    <p
      data-ui="admin-queue-keyboard-hint"
      aria-label={t('admin.queue_keyboard_label', {}, 'Keyboard shortcuts')}
      className={cn(
        'hidden flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 md:flex',
        className
      )}
    >
      <kbd className={KEY_CLASS}>j</kbd>
      <kbd className={KEY_CLASS}>k</kbd>
      <span>{t('admin.queue_keyboard_move', {}, 'move')}</span>
      <span aria-hidden="true">·</span>
      <kbd className={KEY_CLASS}>Enter</kbd>
      <span>{t('admin.queue_keyboard_open', {}, 'open')}</span>
      <span aria-hidden="true">·</span>
      <kbd className={KEY_CLASS}>Esc</kbd>
      <span>{t('admin.queue_keyboard_close', {}, 'close')}</span>
    </p>
  );
}
