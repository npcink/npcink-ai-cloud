'use client';

import type { ReactNode } from 'react';
import { useLocale } from '@/contexts/LocaleContext';
import { cn } from '@/lib/utils';
import { PortalIdentifier } from './PortalIdentifier';

type PortalLoadingStateProps = {
  message: string;
  /** Shorter skeleton for embedded panels / lists (avoids huge blank regions). */
  compact?: boolean;
};

type PortalSignedOutStateProps = {
  title: string;
  description: string;
  actionLabel: string;
  actionHref?: string;
};

type PortalErrorStateProps = {
  title: string;
  description: string;
  retryLabel: string;
  onRetry: () => void;
  recoveryLabel?: string;
  recoveryHref?: string;
  supportReference?: string;
  compact?: boolean;
};

type PortalEmptyStateProps = {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  actionButton?: ReactNode;
  diagnosticCode?: string;
  compact?: boolean;
};

type PortalPageStateProps = {
  status: 'loading' | 'empty' | 'error' | 'ready';
  loadingMessage?: string;
  empty?: Omit<PortalEmptyStateProps, 'compact'> & { compact?: boolean };
  error?: Omit<PortalErrorStateProps, 'compact'> & { compact?: boolean };
  compact?: boolean;
  children?: ReactNode;
  className?: string;
};

export function PortalLoadingState({ message, compact = false }: PortalLoadingStateProps) {
  return (
    <div
      className={cn(compact ? 'min-h-[12rem] py-4' : 'min-h-[60vh] py-6')}
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-portal-page-state="loading"
    >
      <p className="mb-4 text-sm font-medium text-slate-600 dark:text-slate-300">{message}</p>
      <div className="space-y-5 motion-safe:animate-pulse" aria-hidden="true">
        <div className="h-8 w-44 rounded-xl bg-slate-200/80 dark:bg-slate-800" />
        <div className={cn('grid gap-3', compact ? 'md:grid-cols-2' : 'md:grid-cols-3')}>
          <div className={cn('rounded-2xl bg-slate-200/70 dark:bg-slate-800/80', compact ? 'h-20' : 'h-28')} />
          <div className={cn('rounded-2xl bg-slate-200/70 dark:bg-slate-800/80', compact ? 'h-20' : 'h-28')} />
          {compact ? null : <div className="h-28 rounded-2xl bg-slate-200/70 dark:bg-slate-800/80" />}
        </div>
        {compact ? null : <div className="h-64 rounded-2xl bg-slate-200/60 dark:bg-slate-800/70" />}
      </div>
    </div>
  );
}

export function PortalSignedOutState({
  title,
  description,
  actionLabel,
  actionHref = '/portal/login',
}: PortalSignedOutStateProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" data-portal-page-state="signed-out">
      <div className="max-w-md text-center">
        <h2 className="mb-4 text-2xl font-bold">{title}</h2>
        <p className="mb-6 text-gray-600 dark:text-gray-400">{description}</p>
        <a href={actionHref} className="btn btn-primary">
          {actionLabel}
        </a>
      </div>
    </div>
  );
}

export function PortalErrorState({
  title,
  description,
  retryLabel,
  onRetry,
  recoveryLabel,
  recoveryHref,
  supportReference,
  compact = false,
}: PortalErrorStateProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-center',
        compact ? 'min-h-[12rem] py-6' : 'min-h-[60vh]'
      )}
      data-portal-page-state="error"
      role="alert"
    >
      <div className="max-w-md text-center">
        <h2 className={cn('font-bold', compact ? 'mb-2 text-lg' : 'mb-4 text-2xl')}>{title}</h2>
        <p className={cn('text-gray-600 dark:text-gray-400', compact ? 'mb-4 text-sm' : 'mb-6')}>{description}</p>
        <div className="flex flex-wrap justify-center gap-3">
          {recoveryLabel && recoveryHref ? (
            <a href={recoveryHref} className="btn btn-primary">
              {recoveryLabel}
            </a>
          ) : null}
          <button
            type="button"
            onClick={onRetry}
            className={recoveryLabel && recoveryHref ? 'btn btn-secondary' : 'btn btn-primary'}
          >
            {retryLabel}
          </button>
        </div>
        <PortalErrorReference reference={supportReference} />
      </div>
    </div>
  );
}

export function PortalErrorReference({ reference }: { reference?: string }) {
  const { t } = useLocale();
  if (!reference) return null;
  return (
    <details className="mt-4 text-sm" data-portal-error="support-reference">
      <summary className="cursor-pointer font-medium">
        {t('portal.support_information', {}, 'Support information')}
      </summary>
      <PortalIdentifier value={reference} full className="mt-2 block break-all" />
    </details>
  );
}

export function PortalEmptyState({
  title,
  description,
  actionLabel,
  actionHref,
  actionButton,
  diagnosticCode,
  compact = false,
}: PortalEmptyStateProps) {
  const { t } = useLocale();
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-[1.4rem] border border-dashed border-slate-300/80 bg-slate-50/70 px-6 text-center dark:border-slate-700 dark:bg-slate-950/30',
        compact ? 'min-h-[10rem] py-6' : 'min-h-[16rem] py-10'
      )}
      data-portal-page-state="empty"
    >
      <div className="max-w-lg">
        <h2 className={cn('font-semibold text-slate-950 dark:text-white', compact ? 'text-lg' : 'text-xl')}>{title}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p>
        {actionButton ? (
          <div className="mt-5">{actionButton}</div>
        ) : actionLabel && actionHref ? (
          <a href={actionHref} className="btn btn-primary mt-5">
            {actionLabel}
          </a>
        ) : null}
        {diagnosticCode ? (
          <details className="mt-5 text-xs text-slate-500 dark:text-slate-400">
            <summary className="cursor-pointer font-medium">{t('common.diagnostic_code', {}, 'Diagnostic code')}</summary>
            <code className="mt-2 inline-block rounded-lg bg-white/80 px-2 py-1 dark:bg-slate-900/70">
              {diagnosticCode}
            </code>
          </details>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Single entry for loading / empty / error / ready so pages never leave blank space as state.
 */
export function PortalPageState({
  status,
  loadingMessage,
  empty,
  error,
  compact = false,
  children,
  className,
}: PortalPageStateProps) {
  if (status === 'loading') {
    return (
      <div className={className}>
        <PortalLoadingState message={loadingMessage || 'Loading'} compact={compact} />
      </div>
    );
  }
  if (status === 'error' && error) {
    return (
      <div className={className}>
        <PortalErrorState {...error} compact={error.compact ?? compact} />
      </div>
    );
  }
  if (status === 'empty' && empty) {
    return (
      <div className={className}>
        <PortalEmptyState {...empty} compact={empty.compact ?? compact} />
      </div>
    );
  }
  return <div className={className}>{children}</div>;
}

export function PortalSiteSwitchingNotice({ message }: { message: string }) {
  return (
    <div
      className="rounded-[1.1rem] border border-blue-200 bg-blue-50/80 px-4 py-3 text-sm font-medium text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200"
      data-portal-page-state="notice"
      role="status"
    >
      {message}
    </div>
  );
}
