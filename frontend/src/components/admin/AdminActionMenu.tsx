'use client';

import {
  autoUpdate,
  flip,
  FloatingFocusManager,
  FloatingPortal,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useListNavigation,
  useRole,
} from '@floating-ui/react';
import { useRef, useState } from 'react';

export type AdminActionMenuItem = {
  key: string;
  label: string;
  href?: string;
  external?: boolean;
  disabled?: boolean;
  tone?: 'default' | 'danger';
  onSelect?: () => void;
};

type AdminActionMenuProps = {
  triggerLabel: string;
  items: AdminActionMenuItem[];
  dataUi?: string;
  disabled?: boolean;
  triggerClassName?: string;
};

const DEFAULT_ITEM_CLASS =
  'flex min-h-9 w-full items-center justify-between gap-3 px-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-950 focus:bg-slate-50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-200 dark:hover:bg-slate-900 dark:hover:text-white dark:focus:bg-slate-900';

const DANGER_ITEM_CLASS =
  'flex min-h-9 w-full items-center px-3 text-left text-sm font-semibold text-rose-700 transition hover:bg-rose-50 focus:bg-rose-50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:text-rose-300 dark:hover:bg-rose-950/30 dark:focus:bg-rose-950/30';

export function AdminActionMenu({
  triggerLabel,
  items,
  dataUi,
  disabled = false,
  triggerClassName = '',
}: AdminActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const {
    refs: { setReference, setFloating },
    floatingStyles,
    context,
  } = useFloating({
    open,
    onOpenChange(nextOpen) {
      setOpen(nextOpen);
      setActiveIndex(nextOpen ? 0 : null);
    },
    placement: 'bottom-end',
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
  });
  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'menu' });
  const navigation = useListNavigation(context, {
    listRef: itemRefs,
    activeIndex,
    onNavigate: setActiveIndex,
    loop: true,
  });
  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([
    click,
    dismiss,
    role,
    navigation,
  ]);

  function selectItem(item: AdminActionMenuItem) {
    if (item.disabled) return;
    setOpen(false);
    item.onSelect?.();
  }

  return (
    <div data-ui={dataUi} className="shrink-0 text-left">
      <button
        ref={setReference}
        type="button"
        className={triggerClassName}
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        {...getReferenceProps()}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open ? (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false} initialFocus={0} returnFocus>
            <div
              ref={setFloating}
              className="z-[100] w-44 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-800 dark:bg-slate-950"
              style={floatingStyles}
              {...getFloatingProps()}
            >
              {items.map((item, index) => {
                const itemClassName = item.tone === 'danger' ? DANGER_ITEM_CLASS : DEFAULT_ITEM_CLASS;
                const separatedClassName = item.tone === 'danger' && index > 0
                  ? 'mt-1 border-t border-slate-200 pt-1 dark:border-slate-800'
                  : '';
                const sharedProps = getItemProps({
                  onClick: () => selectItem(item),
                });
                return (
                  <div key={item.key} className={separatedClassName}>
                    {item.href ? (
                      <a
                        ref={(element) => {
                          itemRefs.current[index] = element;
                        }}
                        role="menuitem"
                        tabIndex={activeIndex === index ? 0 : -1}
                        className={itemClassName}
                        href={item.href}
                        target={item.external ? '_blank' : undefined}
                        rel={item.external ? 'noreferrer noopener' : undefined}
                        {...sharedProps}
                      >
                        <span>{item.label}</span>
                        {item.external ? <span aria-hidden="true" className="text-xs text-slate-400">↗</span> : null}
                      </a>
                    ) : (
                      <button
                        ref={(element) => {
                          itemRefs.current[index] = element;
                        }}
                        role="menuitem"
                        type="button"
                        tabIndex={activeIndex === index ? 0 : -1}
                        className={itemClassName}
                        disabled={item.disabled}
                        {...sharedProps}
                      >
                        {item.label}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      ) : null}
    </div>
  );
}
