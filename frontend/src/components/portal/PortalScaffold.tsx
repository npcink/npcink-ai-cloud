'use client';

import React from 'react';
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
} from '@floating-ui/react';
import { useLocale } from '@/contexts/LocaleContext';
import { cn } from '@/lib/utils';

type PortalFrameProps = React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode;
  variant?: 'default' | 'portal';
};

type PortalMetricItem = {
  label: string;
  value: React.ReactNode;
  /** Optional leading glyph for compact rails (home icon+number). */
  icon?: React.ReactNode;
  detail?: React.ReactNode;
  /** Plain-text for aria when detail is not a string. */
  detailLabel?: string;
  detailDisplay?: 'visible' | 'hint';
  /** Extra attrs on the ⓘ trigger (test hooks / soft-note flag). */
  hintProps?: React.HTMLAttributes<HTMLSpanElement> & Record<string, string | number | boolean | undefined>;
  hintPanelProps?: React.HTMLAttributes<HTMLDivElement> & Record<string, string | number | boolean | undefined>;
  toneClassName?: string;
  size?: 'default' | 'compact';
};

type PortalMetricStripProps = {
  items: PortalMetricItem[];
  /** Optional override. When omitted, columns adapt to `items.length` (no empty cells). */
  columnsClassName?: string;
  variant?: 'default' | 'portal' | 'header';
  /**
   * `rail` = compact left-aligned label+value groups (home).
   * `grid` = equal column strip (default / billing-style summaries).
   */
  layout?: 'grid' | 'rail';
};

type PortalPrimaryPanelProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  descriptionDisplay?: 'visible' | 'hint';
  aside?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
  summary?: React.ReactNode;
  contentClassName?: string;
  summaryClassName?: string;
};

type PortalEmptyStateProps = {
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
  diagnosticCode?: string;
};

type PortalInfoHintProps = Omit<React.HTMLAttributes<HTMLSpanElement>, 'detail'> & {
  detail?: React.ReactNode;
  label?: string;
  className?: string;
  /** Optional attrs for the open panel (test hooks). */
  panelProps?: React.HTMLAttributes<HTMLDivElement> & Record<string, string | number | boolean | undefined>;
  'data-portal-site'?: string;
  'data-portal-knowledge-soft'?: string;
};

/**
 * Contained ⓘ popover for portal quiet defaults.
 * Help copy mounts only while open (FloatingPortal) so it never leaks into card body flow.
 */
export function PortalInfoHint({
  detail,
  label,
  className,
  panelProps,
  ...triggerRest
}: PortalInfoHintProps) {
  const { t } = useLocale();
  const [open, setOpen] = React.useState(false);
  const tooltipId = React.useId();
  const {
    refs: { setReference, setFloating },
    floatingStyles,
    context,
  } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'bottom-start',
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip({ padding: 12 }), shift({ padding: 12 })],
  });
  const hover = useHover(context, { move: false, restMs: 80 });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'tooltip' });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss, role]);

  if (detail == null || detail === false || detail === '') {
    return null;
  }

  const ariaDetail = typeof detail === 'string' ? detail : undefined;
  const moreInfo = t('common.more_info', {}, 'More info');

  return (
    <>
      <span
        ref={setReference}
        tabIndex={0}
        aria-describedby={open ? tooltipId : undefined}
        aria-label={ariaDetail ? `${label || moreInfo}: ${ariaDetail}` : (label || moreInfo)}
        className={cn(
          'portal-info-hint inline-flex h-5 w-5 shrink-0 cursor-help items-center justify-center rounded-full text-xs leading-none text-slate-400 transition hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:text-slate-500 dark:hover:text-slate-300',
          className
        )}
        data-portal-info-hint="trigger"
        {...triggerRest}
        {...getReferenceProps()}
      >
        ⓘ
      </span>
      {open ? (
        <FloatingPortal>
          <div
            ref={setFloating}
            id={tooltipId}
            role="tooltip"
            className="portal-info-tooltip z-[100] w-64 max-w-[min(18rem,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-normal leading-5 text-slate-600 shadow-md dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            style={floatingStyles}
            data-portal-info-hint="panel"
            {...panelProps}
            {...getFloatingProps()}
          >
            {detail}
          </div>
        </FloatingPortal>
      ) : null}
    </>
  );
}

/** Adaptive grid columns from metric count — never pads empty cells for alignment. */
export function portalMetricColumnsClassName(count: number): string {
  if (count <= 1) return 'grid-cols-1';
  if (count === 2) return 'grid-cols-1 md:grid-cols-2';
  if (count === 3) return 'grid-cols-1 md:grid-cols-3';
  // 4+: two on tablet, four on wide; extra items wrap rather than invent empty slots
  return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4';
}

export function PortalPageStack({ children, className, variant: _variant, ...props }: PortalFrameProps) {
  return <div className={cn('space-y-[var(--portal-page-gap)]', className)} {...props}>{children}</div>;
}

export function PortalSection({ children, className, variant: _variant, ...props }: PortalFrameProps) {
  return (
    <div
      className={cn('rounded-[var(--portal-section-radius)] border border-slate-200/80 bg-white p-[var(--portal-section-padding)] shadow-none dark:border-slate-800 dark:bg-slate-950 md:p-[var(--portal-section-padding-wide)]', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function PortalCard({ children, className, variant: _variant, ...props }: PortalFrameProps) {
  return (
    <div
      className={cn('rounded-[var(--portal-card-radius)] border border-slate-200/75 bg-white px-[var(--portal-card-padding-inline)] py-[var(--portal-card-padding-block)] shadow-none dark:border-slate-800 dark:bg-slate-950', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function PortalMetricStrip({
  items,
  columnsClassName,
  variant = 'default',
  layout = 'grid',
}: PortalMetricStripProps) {
  const headerVariant = variant === 'header';
  const railLayout = layout === 'rail';

  if (railLayout) {
    return (
      <div
        className={cn(
          'flex flex-wrap items-baseline gap-x-5 gap-y-2 rounded-xl border border-slate-200/75 bg-white/75 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-950/55',
          headerVariant && 'shadow-none'
        )}
        data-portal-metrics="rail"
      >
        {items.map((item, index) => (
          <div
            key={item.label}
            className={cn(
              'flex min-w-0 max-w-full items-center gap-1.5',
              index > 0 && 'sm:border-l sm:border-slate-200/80 sm:pl-5 dark:sm:border-slate-800'
            )}
            title={
              item.detail && item.detailDisplay !== 'hint' && typeof item.detail === 'string'
                ? item.detail
                : item.label
            }
          >
            {item.icon ? (
              <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-slate-500 dark:text-slate-400" aria-hidden="true">
                {item.icon}
              </span>
            ) : null}
            <span className={cn('text-sm font-semibold tabular-nums text-gray-950 dark:text-white', item.toneClassName)}>
              {item.value}
            </span>
            {item.icon ? (
              <span className="sr-only">{item.label}</span>
            ) : (
              <span className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">
                {item.label}
                {item.detail && item.detailDisplay === 'hint' ? (
                  <PortalInfoHint
                    className="ml-1"
                    label={item.label}
                    detail={item.detail}
                    panelProps={item.hintPanelProps}
                    aria-label={
                      item.detailLabel
                      || (typeof item.detail === 'string' ? `${item.label}: ${item.detail}` : item.label)
                    }
                    {...(item.hintProps || {})}
                  />
                ) : null}
              </span>
            )}
          </div>
        ))}
      </div>
    );
  }

  const resolvedColumns = columnsClassName ?? portalMetricColumnsClassName(items.length);
  return (
    <div className={cn(
      'grid',
      resolvedColumns,
      headerVariant
        ? 'overflow-hidden rounded-xl border border-slate-200/75 bg-white/75 divide-y divide-slate-200/75 dark:border-slate-800 dark:bg-slate-950/55 dark:divide-slate-800 md:divide-x md:divide-y-0'
        : 'gap-3'
    )}>
      {items.map((item) => {
        const primitiveValue = typeof item.value === 'string' || typeof item.value === 'number'
          ? String(item.value)
          : '';
        const compact = item.size === 'compact'
          || Boolean(primitiveValue && (primitiveValue.length > 10 || /[-/：:]/.test(primitiveValue)));
        return (
          <div
            key={item.label}
            className={cn(
              headerVariant
                ? 'min-w-0 px-4 py-3'
                : 'rounded-xl border border-slate-200/75 bg-white px-4 py-3 shadow-none dark:border-slate-800 dark:bg-slate-950'
            )}
          >
            <p className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
              <span>{item.label}</span>
              {item.detail && item.detailDisplay === 'hint' ? (
                <PortalInfoHint
                  label={item.label}
                  detail={item.detail}
                  panelProps={item.hintPanelProps}
                  aria-label={
                    item.detailLabel
                    || (typeof item.detail === 'string' ? `${item.label}: ${item.detail}` : item.label)
                  }
                  {...(item.hintProps || {})}
                />
              ) : null}
            </p>
            <p className={cn(
              'font-semibold text-gray-950 dark:text-white',
              headerVariant ? 'mt-1.5' : 'mt-2',
              compact || headerVariant ? 'text-base leading-6' : 'text-[1.45rem] leading-8',
              item.toneClassName
            )}>
              {item.value}
            </p>
            {item.detail && item.detailDisplay !== 'hint' ? (
              <p className={cn('text-xs leading-5 text-gray-500 dark:text-gray-400', headerVariant ? 'mt-1.5' : 'mt-2')}>
                {item.detail}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function PortalPrimaryPanel({
  eyebrow,
  title,
  description,
  descriptionDisplay = 'visible',
  aside,
  actions,
  className,
  children,
  summary,
  contentClassName,
  summaryClassName,
}: PortalPrimaryPanelProps) {
  const hasAside = aside != null && aside !== false && aside !== true
    && !(typeof aside === 'string' && !aside.trim());
  return (
    <section className={cn('glass-panel overflow-hidden rounded-[var(--portal-panel-radius)] p-0', className)}>
      <div className={cn('px-[var(--portal-panel-padding-inline)] py-[var(--portal-panel-padding-block)] md:px-[var(--portal-panel-padding-inline-wide)] md:py-[var(--portal-panel-padding-block-wide)]', contentClassName)}>
        <div className={cn(
          'flex flex-col gap-4',
          hasAside && 'xl:flex-row xl:items-start xl:justify-between'
        )}>
          <div className="space-y-3">
            {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700 dark:text-blue-300">{eyebrow}</p> : null}
            <div className="flex max-w-3xl items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-gray-950 dark:text-white md:text-[2rem]">{title}</h1>
              {description && descriptionDisplay === 'hint' ? <PortalInfoHint detail={description} /> : null}
            </div>
            {description && descriptionDisplay !== 'hint' ? <p className="max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-300">{description}</p> : null}
          </div>
          {hasAside ? <div className="shrink-0">{aside}</div> : null}
        </div>
        {actions ? <div className="mt-6 flex flex-wrap gap-3">{actions}</div> : null}
        {children ? <div className="mt-5 space-y-4">{children}</div> : null}
      </div>
      {summary ? <div className={cn('border-t border-slate-200/80 bg-slate-50/70 px-5 py-5 dark:border-slate-800 dark:bg-slate-950/35 md:px-7 md:py-6', summaryClassName)}>{summary}</div> : null}
    </section>
  );
}

export function PortalScaffoldEmptyState({ title, description, action, className, diagnosticCode }: PortalEmptyStateProps) {
  const { t } = useLocale();
  return (
    <PortalCard className={cn('py-8 text-center', className)}>
      <div className="mx-auto max-w-xl">
        <h2 className="text-lg font-semibold text-slate-950 dark:text-white">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p>
        {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
        {diagnosticCode ? (
          <details className="mt-5 text-xs text-slate-500 dark:text-slate-400">
            <summary className="cursor-pointer font-medium">{t('common.diagnostic_code', {}, 'Diagnostic code')}</summary>
            <code className="mt-2 inline-block rounded-lg bg-slate-50 px-2 py-1 dark:bg-slate-900/70">{diagnosticCode}</code>
          </details>
        ) : null}
      </div>
    </PortalCard>
  );
}
