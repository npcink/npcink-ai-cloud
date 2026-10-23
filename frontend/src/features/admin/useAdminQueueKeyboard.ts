'use client';

import { useEffect, useState } from 'react';

type AdminQueueKeyboardOptions = {
  itemIds: readonly string[];
  focusedId: string;
  enabled?: boolean;
  onFocus: (id: string) => void;
  onOpen: (id: string) => void;
  onClose: () => void;
};

const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return true;
  if (target.tagName === 'INPUT') {
    return !NON_TEXT_INPUT_TYPES.has((target as HTMLInputElement).type.toLowerCase());
  }
  return false;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest('a, button, summary, input, select, textarea, [role="button"], [role="link"], [role="menuitem"]')
  );
}

const QUEUE_DRAWER_SELECTOR = '[data-ui="admin-context-drawer"], [data-ui="admin-inspector-drawer"]';

function hasBlockingDialog(): boolean {
  return Array.from(document.querySelectorAll('[role="dialog"]')).some(
    (node) => !node.closest(QUEUE_DRAWER_SELECTOR)
  );
}

function hasOpenQueueDrawer(): boolean {
  return Boolean(document.querySelector(QUEUE_DRAWER_SELECTOR));
}

/**
 * j/k move the queue focus, Enter opens the focused record in its detail view,
 * and Esc clears the focus. Queue drawers keep their own Escape handler, so
 * this hook leaves Escape alone while one is open.
 *
 * While the keyboard owns the selection the caller should keep the preview
 * drawer closed, otherwise it takes focus and Enter would activate its close
 * button instead of opening the record.
 */
export function useAdminQueueKeyboard({
  itemIds,
  focusedId,
  enabled = true,
  onFocus,
  onOpen,
  onClose,
}: AdminQueueKeyboardOptions): boolean {
  const [keyboardFocus, setKeyboardFocus] = useState(false);

  useEffect(() => {
    const releaseKeyboardFocus = () => setKeyboardFocus(false);
    document.addEventListener('pointerdown', releaseKeyboardFocus, true);
    return () => document.removeEventListener('pointerdown', releaseKeyboardFocus, true);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!enabled) return;
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (isTypingTarget(event.target)) return;
      if (hasBlockingDialog()) return;

      if (event.key === 'j' || event.key === 'k') {
        if (!itemIds.length) return;
        event.preventDefault();
        const currentIndex = itemIds.indexOf(focusedId);
        const nextIndex = event.key === 'j'
          ? Math.min(itemIds.length - 1, currentIndex + 1)
          : Math.max(0, currentIndex - 1);
        const nextId = itemIds[nextIndex];
        if (nextId && nextId !== focusedId) {
          setKeyboardFocus(true);
          onFocus(nextId);
        }
        return;
      }

      if (!focusedId) return;

      if (event.key === 'Enter') {
        if (isInteractiveTarget(event.target)) return;
        event.preventDefault();
        onOpen(focusedId);
        return;
      }

      if (event.key === 'Escape') {
        if (hasOpenQueueDrawer()) return;
        setKeyboardFocus(false);
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled, focusedId, itemIds, onClose, onFocus, onOpen]);

  return keyboardFocus;
}
