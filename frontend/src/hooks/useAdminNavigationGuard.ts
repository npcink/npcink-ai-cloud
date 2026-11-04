'use client';

import { useEffect, useRef } from 'react';

const POSITION_KEY = '__adminHistoryPosition';
type HistoryGuard = { block: (href: string, delta: number) => void };
let guard: HistoryGuard | null = null;
let position = 0;
let restoring = false;
let bypass = false;
let installed = false;

function browserHistoryPosition(): number | undefined {
  // Includes same-document entries created before the Admin layout mounted.
  const navigation = (window as Window & {
    navigation?: { currentEntry?: { index: number } };
  }).navigation;
  return navigation?.currentEntry?.index;
}

/** Track SPA entries without replacing Next's history state or router hooks. */
export function installAdminHistoryTracking() {
  if (installed) return;
  installed = true;
  position = browserHistoryPosition() ?? window.history.state?.[POSITION_KEY] ?? 0;
  window.history.replaceState({ ...window.history.state, [POSITION_KEY]: position }, '');
  const push = window.history.pushState.bind(window.history);
  const replace = window.history.replaceState.bind(window.history);
  window.history.pushState = (state, unused, url) => {
    const next = position + 1;
    push({ ...state, [POSITION_KEY]: next }, unused, url);
    position = next;
  };
  window.history.replaceState = (state, unused, url) => {
    replace({ ...state, [POSITION_KEY]: position }, unused, url);
  };
  // Capture runs before Next's popstate listener. Restore the original entry
  // before asking; cancel therefore leaves both URL and rendered draft intact.
  window.addEventListener('popstate', (event) => {
    const next = browserHistoryPosition() ?? event.state?.[POSITION_KEY];
    if (restoring) {
      restoring = false;
      return;
    }
    if (bypass) {
      bypass = false;
      if (typeof next === 'number') position = next;
      return;
    }
    if (typeof next !== 'number') return; // Cross-document exits use beforeunload.
    const delta = next - position;
    if (guard && delta !== 0) {
      event.stopImmediatePropagation();
      const href = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const activeGuard = guard;
      restoring = true;
      const onRestored = () => {
        window.removeEventListener('popstate', onRestored);
        activeGuard.block(href, delta);
      };
      window.addEventListener('popstate', onRestored, { once: true });
      window.history.go(-delta);
      return;
    }
    position = next;
  }, true);
}

export function useAdminNavigationGuard(
  dirty: boolean,
  onBlocked: (href: string) => void,
  onNavigate: (href: string) => void,
) {
  const pending = useRef<{ href: string; delta: number } | null>(null);
  const blockedRef = useRef(onBlocked);
  useEffect(() => { blockedRef.current = onBlocked; }, [onBlocked]);
  useEffect(() => {
    installAdminHistoryTracking();
    if (!dirty) return;
    const activeGuard: HistoryGuard = {
      block: (href, delta) => {
        pending.current = { href, delta };
        blockedRef.current(href);
      },
    };
    guard = activeGuard;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const anchorClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(target instanceof HTMLAnchorElement) || target.target === '_blank' || target.hasAttribute('download')) return;
      const destination = new URL(target.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname) return;
      event.preventDefault();
      event.stopPropagation();
      pending.current = null;
      blockedRef.current(`${destination.pathname}${destination.search}${destination.hash}`);
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', anchorClick, true);
    return () => {
      if (guard === activeGuard) guard = null;
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', anchorClick, true);
    };
  }, [dirty]);

  return {
    cancelNavigation: () => { pending.current = null; onBlocked(''); },
    confirmNavigation: (href: string) => {
      const navigation = pending.current;
      pending.current = null;
      if (navigation?.href === href) {
        bypass = true;
        window.history.go(navigation.delta);
      } else if (href) {
        onNavigate(href);
      }
    },
  };
}
