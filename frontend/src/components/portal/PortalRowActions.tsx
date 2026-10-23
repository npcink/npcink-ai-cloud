'use client';

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Modal } from '@/components/ui/Modal';
import { useLocale } from '@/contexts/LocaleContext';
import { cn } from '@/lib/utils';

export type PortalRowActionConfirm = {
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

export type PortalRowActionItem = {
  id: string;
  label: string;
  onClick?: () => void;
  href?: string;
  /** Open href in a new tab (e.g. WordPress admin). */
  external?: boolean;
  disabled?: boolean;
  danger?: boolean;
  /** Render as a square icon control; `label` becomes title + aria-label. */
  iconOnly?: boolean;
  /**
   * Danger confirm dialog before onClick.
   * - omit / object → confirm (danger defaults to a confirm when description provided)
   * - false → skip; parent owns the dialog (e.g. lifecycle swap UI)
   */
  confirm?: false | PortalRowActionConfirm;
};

/** Shared glyphs for icon-only portal actions (aria comes from the control label). */
export function PortalActionIcon({ id, className = 'h-4 w-4' }: { id: string; className?: string }) {
  const common = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  };
  switch (id) {
    case 'connect-new':
      return (
        <svg {...common}>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    case 'ticket-new':
      return (
        <svg {...common}>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    case 'view-detail':
      return (
        <svg {...common}>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case 'connect-collapse':
      return (
        <svg {...common}>
          <path d="M5 12h14" />
        </svg>
      );
    case 'recheck':
      return (
        <svg {...common}>
          <path d="M21 12a9 9 0 1 1-2.6-6.3" />
          <path d="M21 3v6h-6" />
        </svg>
      );
    case 'attach':
      return (
        <svg {...common}>
          <path d="M21.4 11.6 12.1 20.9a5.5 5.5 0 0 1-7.8-7.8l9.9-9.9a3.5 3.5 0 0 1 5 5l-9.9 9.9a1.5 1.5 0 0 1-2.1-2.1l8.5-8.5" />
        </svg>
      );
    case 'view-plan':
      return (
        <svg {...common}>
          <path d="M21 8.5 12 3 3 8.5v7L12 21l9-5.5v-7Z" />
          <path d="M3 8.5 12 14l9-5.5" />
          <path d="M12 14v7" />
        </svg>
      );
    case 'view-site':
      return (
        <svg {...common}>
          <path d="M14 3h7v7" />
          <path d="M10 14 21 3" />
          <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
        </svg>
      );
    case 'rename':
      return (
        <svg {...common}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      );
    case 'wp-admin':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M7 15.5 9.2 8h1.7l2.2 7.5" />
          <path d="M8.2 13h3.5" />
          <path d="M14.2 8h1.6L18 15.5h-1.7l-.4-1.5h-2.2" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      );
  }
}

export type PortalRowActionsProps = {
  primary?: PortalRowActionItem | null;
  secondary?: PortalRowActionItem | null;
  /**
   * Extra text/outline actions shown when horizontal space allows
   * (e.g. Deactivate / Remove on desktop site rows).
   */
  inline?: PortalRowActionItem[];
  overflow?: PortalRowActionItem[];
  /** Accessible name for the ⋯ trigger. */
  moreLabel?: string;
  className?: string;
  /** data-* passthrough for contracts / tests on the overflow control. */
  overflowTestId?: string;
};

function actionNeedsConfirm(item: PortalRowActionItem): PortalRowActionConfirm | null {
  if (item.confirm === false || !item.confirm) return null;
  if (!item.confirm.description) return null;
  return item.confirm;
}

function RowActionControl({
  item,
  tier,
  onRequestConfirm,
}: {
  item: PortalRowActionItem;
  tier: 'primary' | 'secondary' | 'text' | 'text-danger' | 'menu' | 'menu-danger';
  onRequestConfirm: (item: PortalRowActionItem, confirm: PortalRowActionConfirm) => void;
}) {
  const iconOnly = Boolean(item.iconOnly) && tier !== 'menu' && tier !== 'menu-danger';
  const className = cn(
    tier === 'primary' && (iconOnly
      ? 'inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50 dark:bg-blue-500 dark:text-slate-950 dark:hover:bg-blue-400'
      : 'btn btn-primary btn-sm portal-row-action-btn'),
    tier === 'secondary' && (iconOnly
      ? 'inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/90 bg-white text-slate-700 transition hover:border-slate-300 hover:text-slate-950 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:text-white'
      : 'btn btn-outline btn-sm portal-row-action-btn'),
    tier === 'text' && 'portal-row-text-action text-sm font-medium text-slate-600 hover:text-slate-950 disabled:opacity-50 dark:text-slate-300 dark:hover:text-white',
    tier === 'text-danger' && 'portal-row-text-action text-sm font-medium text-rose-700 hover:text-rose-800 disabled:opacity-50 dark:text-rose-300 dark:hover:text-rose-200',
    tier === 'menu' && 'portal-row-menu-item',
    tier === 'menu-danger' && 'portal-row-menu-item portal-row-menu-item-danger',
    iconOnly && 'portal-row-action-icon'
  );

  const content = iconOnly ? <PortalActionIcon id={item.id} /> : item.label;
  const a11y = iconOnly
    ? { 'aria-label': item.label, title: item.label }
    : {};

  const run = useCallback(() => {
    if (item.disabled) return;
    const confirm = actionNeedsConfirm(item);
    if (confirm && item.onClick && !item.href) {
      onRequestConfirm(item, confirm);
      return;
    }
    item.onClick?.();
  }, [item, onRequestConfirm]);

  if (item.href) {
    if (item.external) {
      return (
        <a
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className={className}
          aria-disabled={item.disabled || undefined}
          {...a11y}
          onClick={(event) => {
            if (item.disabled) {
              event.preventDefault();
              return;
            }
            item.onClick?.();
          }}
        >
          {content}
        </a>
      );
    }
    return (
      <Link
        href={item.href}
        className={className}
        aria-disabled={item.disabled || undefined}
        {...a11y}
        onClick={(event) => {
          if (item.disabled) {
            event.preventDefault();
            return;
          }
          item.onClick?.();
        }}
      >
        {content}
      </Link>
    );
  }

  return (
    <button type="button" className={className} disabled={item.disabled} onClick={run} {...a11y}>
      {content}
    </button>
  );
}

export function PortalRowActions({
  primary,
  secondary,
  inline = [],
  overflow = [],
  moreLabel = 'More actions',
  className,
  overflowTestId,
}: PortalRowActionsProps) {
  const { t } = useLocale();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{
    item: PortalRowActionItem;
    confirm: PortalRowActionConfirm;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuPosition(null);
      return;
    }
    const update = () => {
      const button = menuButtonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      setMenuPosition({
        top: Math.round(rect.bottom + 8),
        right: Math.round(Math.max(8, window.innerWidth - rect.right)),
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [menuOpen]);

  const visibleInline = inline.filter(Boolean);
  const visibleOverflow = overflow.filter(Boolean);
  const hasOverflow = visibleOverflow.length > 0;

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const onRequestConfirm = useCallback((item: PortalRowActionItem, confirm: PortalRowActionConfirm) => {
    setMenuOpen(false);
    setPendingConfirm({ item, confirm });
  }, []);

  if (!primary && !secondary && visibleInline.length === 0 && !hasOverflow) return null;

  return (
    <>
      <div
        ref={rootRef}
        className={cn('portal-row-actions inline-flex max-w-full flex-nowrap items-center justify-end gap-1.5', className)}
        data-ui="portal-row-actions"
      >
        {primary ? <RowActionControl item={primary} tier="primary" onRequestConfirm={onRequestConfirm} /> : null}
        {secondary ? <RowActionControl item={secondary} tier="secondary" onRequestConfirm={onRequestConfirm} /> : null}
        {visibleInline.map((item) => (
          <RowActionControl
            key={item.id}
            item={item}
            tier={item.danger ? 'text-danger' : 'text'}
            onRequestConfirm={onRequestConfirm}
          />
        ))}
        {hasOverflow ? (
          <div className="relative inline-flex overflow-visible" data-portal-sites={overflowTestId || undefined}>
            <button
              type="button"
              ref={menuButtonRef}
              className="btn btn-outline btn-sm portal-row-action-btn portal-row-more-btn"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls={menuId}
              aria-label={moreLabel}
              title={moreLabel}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span aria-hidden="true">⋯</span>
            </button>
            {menuOpen && menuPosition ? (
              <div
                id={menuId}
                role="menu"
                data-portal-row-actions="overflow-menu"
                className="fixed z-[80] min-w-[11rem] max-w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
                style={{ top: menuPosition.top, right: menuPosition.right }}
              >
                {visibleOverflow.map((item) => (
                  <div key={item.id} role="none">
                    <RowActionControl
                      item={{
                        ...item,
                        onClick: () => {
                          setMenuOpen(false);
                          item.onClick?.();
                        },
                      }}
                      tier={item.danger ? 'menu-danger' : 'menu'}
                      onRequestConfirm={onRequestConfirm}
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <Modal
        isOpen={Boolean(pendingConfirm)}
        onClose={() => setPendingConfirm(null)}
        closeLabel={pendingConfirm?.confirm.cancelLabel || t('common.close', {}, 'Close')}
        title={pendingConfirm?.confirm.title || pendingConfirm?.item.label}
        description={pendingConfirm?.confirm.description}
        size="sm"
        className="portal-commercial-dialog rounded-[18px]"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setPendingConfirm(null)}
            >
              {pendingConfirm?.confirm.cancelLabel || t('common.cancel', {}, 'Cancel')}
            </button>
            <button
              type="button"
              className={cn('btn', pendingConfirm?.item.danger ? 'btn-danger' : 'btn-primary')}
              onClick={() => {
                const action = pendingConfirm?.item;
                setPendingConfirm(null);
                action?.onClick?.();
              }}
            >
              {pendingConfirm?.confirm.confirmLabel || pendingConfirm?.item.label}
            </button>
          </>
        }
      >
        <span className="sr-only">{pendingConfirm?.item.label}</span>
      </Modal>
    </>
  );
}
