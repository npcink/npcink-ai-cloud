'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PortalBreadcrumb } from '@/components/portal/PortalBreadcrumb';
import { PortalWorkspaceHeader } from '@/components/portal/PortalWorkspaceHeader';
import { PortalPageStack, PortalSection } from '@/components/portal/PortalScaffold';
import { PortalLoadingState, PortalErrorState, PortalEmptyState, PortalSignedOutState } from '@/components/portal/PortalPageState';
import { useLocale } from '@/contexts/LocaleContext';
import { useSession } from '@/hooks/useSession';
import { portalClient, publishPortalNotificationCount, type PortalNotificationInbox } from '@/lib/portal-client';
import { formatPortalErrorMessage } from '@/lib/portal-error';
import { formatDate } from '@/lib/utils';

const PAGE_SIZE = 20;

export default function PortalNotificationsPage() {
  const { t } = useLocale();
  const { isAuthenticated, isLoading } = useSession();
  const [offset, setOffset] = useState(0);
  const [inbox, setInbox] = useState<PortalNotificationInbox | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [writeError, setWriteError] = useState('');
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const version = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const response = await portalClient.getNotifications(PAGE_SIZE, offset);
      if (version !== generation.current) return;
      setInbox(response.data);
      publishPortalNotificationCount(response.data.unread_count);
    } catch (failure) {
      if (version !== generation.current) return;
      setError(formatPortalErrorMessage(failure, t, t('portal.notifications.load_failed')));
    } finally {
      if (version === generation.current) setLoading(false);
    }
  }, [offset, t]);

  useEffect(() => {
    if (isAuthenticated) void load();
    return () => { generation.current += 1; };
  }, [isAuthenticated, load]);

  const markRead = async (notificationId?: string) => {
    const version = generation.current;
    setBusy(true);
    setWriteError('');
    try {
      const response = notificationId
        ? await portalClient.markNotificationRead(notificationId)
        : await portalClient.markAllNotificationsRead();
      if (version !== generation.current) return;
      setInbox((current) => current ? {
        ...current,
        unread_count: response.data.unread_count,
        items: current.items.map((item) => !notificationId || item.notification_id === notificationId
          ? { ...item, is_read: true } : item),
      } : current);
      publishPortalNotificationCount(response.data.unread_count);
    } catch (failure) {
      if (version !== generation.current) return;
      setWriteError(formatPortalErrorMessage(failure, t, t('portal.notifications.write_failed')));
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) return <PortalLoadingState message={t('common.loading')} />;
  if (!isAuthenticated) return <PortalSignedOutState title={t('nav.sign_in')} description={t('portal.notifications.sign_in')} actionLabel={t('nav.sign_in')} />;

  return (
    <PortalPageStack>
      <PortalWorkspaceHeader
        currentPage="notifications"
        title={t('portal.notifications.title')}
        description={t('portal.notifications.description')}
        breadcrumb={<PortalBreadcrumb items={[{ label: t('portal.nav_account'), href: '/portal/account' }, { label: t('portal.notifications.title') }]} />}
        actionsPlacement="title-end"
        actions={<button type="button" className="btn btn-secondary btn-sm" disabled={busy || loading || !inbox?.unread_count || Boolean(error)} onClick={() => void markRead()}>{t('portal.notifications.read_all')}</button>}
      />
      {writeError ? <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{writeError}</p> : null}
      <PortalSection>
        {loading ? <PortalLoadingState compact message={t('common.loading')} /> : error ? (
          <PortalErrorState compact title={t('portal.notifications.load_failed')} description={error} retryLabel={t('common.retry')} onRetry={() => void load()} />
        ) : !inbox?.items.length ? (
          <PortalEmptyState compact title={t('portal.notifications.empty')} description={t('portal.notifications.description')} />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800" aria-label={t('portal.notifications.title')}>
            {inbox.items.map((item) => {
              const eventType = item.event_type === 'support_request_replied' ? 'support_request_replied' : 'unknown';
              const href = item.link_href && /^\/portal\/support\/[A-Za-z0-9_-]+$/.test(item.link_href) ? item.link_href : null;
              return (
                <li key={item.notification_id} data-notification-id={item.notification_id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="mb-1 text-xs text-slate-500">{t(`portal.notifications.event_${eventType}`)} · {formatDate(item.created_at)}</p>
                      <h2 className="break-words text-sm font-semibold text-slate-950 dark:text-white">{item.title}</h2>
                      {item.body ? <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600 dark:text-slate-300">{item.body}</p> : null}
                      {href ? <Link className="mt-2 inline-block text-sm text-blue-700 hover:underline dark:text-blue-300" href={href}>{t('portal.notifications.view_ticket')}</Link> : null}
                    </div>
                    {item.is_read ? <span className="text-xs text-slate-500">{t('portal.notifications.read')}</span> : <button className="btn btn-secondary btn-sm shrink-0" type="button" disabled={busy} onClick={() => void markRead(item.notification_id)}>{t('portal.notifications.mark_read')}</button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {!loading && !error && inbox && inbox.total_count > PAGE_SIZE ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm dark:border-slate-800">
            <span>{t('portal.notifications.range', { start: String(offset + 1), end: String(Math.min(offset + PAGE_SIZE, inbox.total_count)), total: String(inbox.total_count) })}</span>
            <div className="flex gap-2">
              <button className="btn btn-secondary btn-sm" disabled={busy || offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>{t('portal.notifications.previous')}</button>
              <button className="btn btn-secondary btn-sm" disabled={busy || offset + PAGE_SIZE >= inbox.total_count} onClick={() => setOffset(offset + PAGE_SIZE)}>{t('portal.notifications.next')}</button>
            </div>
          </div>
        ) : null}
      </PortalSection>
    </PortalPageStack>
  );
}
