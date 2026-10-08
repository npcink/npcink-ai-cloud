'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

function helpPosition(rect: DOMRect) {
  return {
    left: Math.max(8, Math.min(rect.left, window.innerWidth - Math.min(320, window.innerWidth - 16) - 8)),
    top: rect.bottom + 8,
  };
}

/** Short, non-interactive help; long evidence belongs in AdminInspectorDrawer. */
export function AdminHelpTip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinned = useRef(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const open = position !== null;
  const cancelHide = () => { if (timer.current) clearTimeout(timer.current); };
  const hide = () => { cancelHide(); pinned.current = false; setPosition(null); };
  const show = () => {
    cancelHide();
    const rect = trigger.current?.getBoundingClientRect();
    if (rect) setPosition(helpPosition(rect));
  };
  const scheduleHide = () => {
    cancelHide();
    if (!pinned.current) timer.current = setTimeout(() => {
      if (document.activeElement !== trigger.current) setPosition(null);
    }, 150);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useLayoutEffect(() => {
    if (!position || !trigger.current || !bubble.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const height = bubble.current.getBoundingClientRect().height;
    const below = rect.bottom + 8;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 8) : below;
    if (top !== position.top) setPosition({ ...position, top });
  }, [position]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: KeyboardEvent) => { if (event.key === 'Escape') { pinned.current = false; setPosition(null); } };
    const outside = (event: MouseEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !bubble.current?.contains(event.target as Node)) {
        pinned.current = false; setPosition(null);
      }
    };
    const move = () => {
      const rect = trigger.current?.getBoundingClientRect();
      // Keyboard focus may scroll the trigger into view after onFocus opens help.
      // Keep focused, visible help anchored; ordinary scrolling still dismisses it.
      if (document.activeElement === trigger.current && rect && rect.bottom > 0 && rect.top < window.innerHeight) {
        setPosition(previous => previous ? helpPosition(rect) : null);
      } else {
        pinned.current = false; setPosition(null);
      }
    };
    document.addEventListener('keydown', dismiss);
    document.addEventListener('mousedown', outside);
    window.addEventListener('scroll', move, true);
    window.addEventListener('resize', move);
    return () => {
      document.removeEventListener('keydown', dismiss);
      document.removeEventListener('mousedown', outside);
      window.removeEventListener('scroll', move, true);
      window.removeEventListener('resize', move);
    };
  }, [open]);
  return <>
    <button ref={trigger} type="button" aria-label={label} aria-expanded={open} aria-describedby={open ? id : undefined}
      data-ui="admin-help-tip-trigger" onMouseEnter={show} onMouseLeave={scheduleHide} onFocus={show}
      onBlur={scheduleHide} onClick={() => { if (pinned.current) hide(); else { pinned.current = true; show(); } }}
      className="ml-1 inline-flex h-6 w-6 shrink-0 cursor-help items-center justify-center rounded align-middle text-xs font-normal leading-none text-slate-400 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:text-slate-200">
      <span aria-hidden="true">ⓘ</span>
    </button>
    {position ? createPortal(<div ref={bubble} id={id} role="tooltip" onMouseEnter={cancelHide} onMouseLeave={scheduleHide}
      style={{ ...position, width: 'min(20rem, calc(100vw - 1rem))' }}
      className="fixed z-50 max-h-[calc(100vh-1rem)] overflow-y-auto rounded-[var(--admin-compact-radius)] border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600 shadow-md dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
      {children}
    </div>, document.body) : null}
  </>;
}
