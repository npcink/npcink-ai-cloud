'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { z } from 'zod';
import {
  BackofficeDisclosure,
  BackofficePageHeader,
  BackofficePageStack,
  BackofficeSectionPanel,
} from '@/components/backoffice/BackofficeScaffold';
import { ConfirmModal, Modal } from '@/components/ui/Modal';
import { useLocale } from '@/contexts/LocaleContext';
import { useAdminNavigationGuard } from '@/hooks/useAdminNavigationGuard';
import { createApiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import { useNotices } from '@/features/admin/customer-notifications/use-notices';
import { links } from '@/features/admin/customer-notifications/contracts';

const client = createApiClient();
const accountsSchema = z.object({
  items: z.array(
    z.object({
      account: z.object({
        account_id: z.string(),
        name: z.string(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    }),
  ),
});
type AccountOption = { id: string; name: string };

function NoticeWorkspace({ accountId }: { accountId: string }) {
  const c = useNotices(accountId),
    { t } = useLocale(),
    router = useRouter();
  const [query, setQuery] = useState(accountId),
    [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [accountError, setAccountError] = useState(false),
    [searchBusy, setSearchBusy] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false),
    [exit, setExit] = useState(''),
    [confirmNew, setConfirmNew] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const userClosedCompose = useRef(false);
  const searchVersion = useRef(0);
  const v = c.draft?.values,
    detail = c.detail;
  const currentDetail = detail?.dispatch_id === v?.dispatch_id;
  const dirty = Boolean(
    v && (v.title || v.body || c.draft?.pending) && !(currentDetail && detail?.status === 'sent'),
  );
  const { cancelNavigation, confirmNavigation } = useAdminNavigationGuard(dirty, setExit, (href) =>
    router.push(href),
  );
  const locked = c.busy || c.blocked || Boolean(c.draft?.pending);
  const isOwnPreview = Boolean(
    currentDetail &&
      detail?.status === 'preview' &&
      detail.actor_kind === 'platform_admin' &&
      detail.actor_ref === c.actor,
  );

  useEffect(() => {
    if (!v || userClosedCompose.current) return;
    if (accountId || v.title || v.body || c.draft?.pending) setComposeOpen(true);
  }, [accountId, v, c.draft?.pending]);

  const openCompose = () => {
    userClosedCompose.current = false;
    if (dirty) setConfirmNew(true);
    else {
      c.reset();
      setComposeOpen(true);
    }
  };
  const closeCompose = () => {
    userClosedCompose.current = true;
    setComposeOpen(false);
  };

  const search = async () => {
    const version = ++searchVersion.current;
    setAccountError(false);
    setSearchBusy(true);
    try {
      const result = accountsSchema.parse(
        (
          await client.request<unknown>(
            `/api/admin/accounts?q=${encodeURIComponent(query)}&status=active&limit=20`,
          )
        ).data,
      );
      if (version === searchVersion.current)
        setAccounts(
          result.items.map((item) => ({
            id: item.account.account_id,
            name:
              typeof item.account.metadata?.operator_display_name === 'string'
                ? item.account.metadata.operator_display_name || item.account.name
                : item.account.name,
          })),
        );
    } catch {
      if (version === searchVersion.current) setAccountError(true);
    } finally {
      if (version === searchVersion.current) setSearchBusy(false);
    }
  };
  const linkLabel = (href: string) =>
    href === ''
      ? t('admin.notices.link_none')
      : href === '/portal/billing'
        ? t('portal.nav_billing')
        : href === '/portal/usage'
          ? t('portal.nav_usage')
          : href === '/portal/support'
            ? t('portal.nav_support_requests')
            : href === '/portal/account'
              ? t('portal.nav_account')
              : t('admin.notices.link_portal');

  const detailPanel = detail ? (
    <div className="space-y-3" data-ui="notice-preview">
      <h2 className="font-semibold">
        {t(detail.status === 'preview' ? 'admin.notices.preview_title' : 'admin.notices.result')}
      </h2>
      <p className="text-sm">
        {t('admin.notices.counts', {
          target: String(detail.target_count),
          ready: String(detail.ready_count),
          sent: String(detail.sent_count),
          skipped: String(detail.skipped_count),
          read: String(detail.read_count),
        })}
      </p>
      <h2 className="break-words font-semibold">{detail.title}</h2>
      <p className="whitespace-pre-wrap break-words text-sm">{detail.body}</p>
      <p className="text-sm">
        {t('admin.notices.link')}: {linkLabel(detail.link_href)}
      </p>
      {detail.status === 'preview' ? (
        <p className="text-sm">{t('admin.notices.preview_scope')}</p>
      ) : (
        <p className="text-sm">{t('admin.notices.delivery_scope')}</p>
      )}
      {isOwnPreview ? (
        <button
          type="button"
          className="btn btn-primary"
          disabled={c.busy || c.blocked || !detail.ready_count || c.draft?.pending === 'preview'}
          onClick={() => setConfirmSend(true)}
        >
          {t('admin.notices.send')}
        </button>
      ) : null}
      <div className="max-h-72 overflow-auto">
        <table className="w-full table-fixed text-left text-sm">
          <thead>
            <tr>
              <th className="w-[40%] py-1.5 pr-2 font-medium">{t('common.account')}</th>
              <th className="w-[35%] py-1.5 pr-2 font-medium">{t('admin.notices.recipient')}</th>
              <th className="w-[25%] py-1.5 font-medium">{t('common.status')}</th>
            </tr>
          </thead>
          <tbody>
            {detail.recipients.map((item) => (
              <tr
                className="border-t border-slate-100 dark:border-slate-800"
                key={item.account_id}
              >
                <td className="max-w-xs break-words py-2 pr-2">
                  {item.account_name}
                  <span className="block break-all text-xs text-slate-500">{item.account_id}</span>
                </td>
                <td className="break-all py-2 pr-2">{item.email || '—'}</td>
                <td className="py-2">
                  {item.status === 'skipped'
                    ? t(`admin.notices.reason_${item.reason}`)
                    : item.status === 'sent'
                      ? t(item.is_read ? 'admin.notices.read' : 'admin.notices.inbox')
                      : t('admin.notices.ready')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <BackofficeDisclosure summary={t('admin.notices.evidence')}>
        <p className="break-all text-sm">
          {detail.dispatch_id} · {detail.actor_ref} · {formatDate(detail.created_at)}
          {detail.sent_at ? ` · ${formatDate(detail.sent_at)}` : ''}
        </p>
      </BackofficeDisclosure>
    </div>
  ) : (
    <p className="text-sm text-slate-600 dark:text-slate-300" data-ui="notice-detail-empty">
      {t('admin.notices.detail_empty')}
    </p>
  );

  const composeForm =
    v && !(currentDetail && detail?.status === 'sent') ? (
      <form
        className="space-y-4"
        data-ui="notice-compose-form"
        onSubmit={(event) => {
          event.preventDefault();
          void c.submit('preview');
        }}
      >
        <fieldset
          disabled={locked || Boolean(currentDetail && detail?.status === 'sent')}
          className="space-y-4"
        >
          <legend className="mb-1 font-semibold">{t('admin.notices.compose')}</legend>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-4">
              <div>
                <label htmlFor="notice-audience" className="block text-sm">
                  {t('admin.notices.audience')}
                </label>
                <select
                  id="notice-audience"
                  className="input mt-1 w-full"
                  value={v.audience}
                  onChange={(event) =>
                    c.edit({ audience: event.target.value as 'selected' | 'all', account_ids: [] })
                  }
                >
                  <option value="selected">{t('admin.notices.selected')}</option>
                  <option value="all">{t('admin.notices.all')}</option>
                </select>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {t(v.audience === 'all' ? 'admin.notices.all_scope' : 'admin.notices.owner_scope')}
                </p>
              </div>
              {v.audience === 'selected' ? (
                <div className="space-y-2">
                  <div className="flex items-end gap-2">
                    <label className="min-w-0 flex-1 text-sm">
                      {t('admin.notices.search')}
                      <input
                        className="input mt-1 w-full"
                        value={query}
                        onChange={(event) => {
                          searchVersion.current += 1;
                          setQuery(event.target.value);
                          setAccounts([]);
                          setSearchBusy(false);
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={searchBusy}
                      onClick={() => void search()}
                    >
                      {t('common.search')}
                    </button>
                  </div>
                  {accountError ? <p role="alert">{t('admin.notices.search_failed')}</p> : null}
                  {accounts.length ? (
                    <ul className="max-h-44 overflow-auto divide-y divide-slate-100 dark:divide-slate-800">
                      {accounts.map((account) => (
                        <li
                          key={account.id}
                          className="flex items-center justify-between gap-3 py-2 text-sm"
                        >
                          <span className="break-all">
                            {account.name} · {account.id}
                          </span>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={
                              v.account_ids.includes(account.id) || v.account_ids.length >= 1000
                            }
                            onClick={() => c.edit({ account_ids: [...v.account_ids, account.id] })}
                          >
                            {t('admin.notices.add')}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {accounts.length === 20 ? (
                    <p className="text-sm">{t('admin.notices.search_limit')}</p>
                  ) : null}
                  <ul className="flex flex-wrap gap-2">
                    {v.account_ids.map((id) => (
                      <li key={id} className="flex items-center gap-2 text-sm">
                        <span>{accounts.find((account) => account.id === id)?.name || id}</span>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          aria-label={`${t('admin.notices.remove')} ${id}`}
                          onClick={() =>
                            c.edit({ account_ids: v.account_ids.filter((value) => value !== id) })
                          }
                        >
                          {t('admin.notices.remove')}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            <div className="space-y-4">
              <label className="block text-sm">
                {t('admin.notices.subject')}
                <input
                  required
                  maxLength={255}
                  className="input mt-1 w-full"
                  value={v.title}
                  onChange={(event) => c.edit({ title: event.target.value })}
                />
              </label>
              <label className="block text-sm">
                {t('admin.notices.body')}
                <textarea
                  required
                  maxLength={4000}
                  rows={5}
                  className="input mt-1 min-h-32 w-full"
                  value={v.body}
                  onChange={(event) => c.edit({ body: event.target.value })}
                />
              </label>
              <div>
                <label htmlFor="notice-link" className="block text-sm">
                  {t('admin.notices.link')}
                </label>
                <select
                  id="notice-link"
                  className="input mt-1 w-full"
                  value={v.link_href}
                  onChange={(event) =>
                    c.edit({ link_href: event.target.value as typeof v.link_href })
                  }
                >
                  {links.map((href) => (
                    <option value={href} key={href}>
                      {linkLabel(href)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <button
            type="submit"
            className={isOwnPreview ? 'btn btn-secondary' : 'btn btn-primary'}
            disabled={
              !v.title.trim() ||
              !v.body.trim() ||
              (v.audience === 'selected' && !v.account_ids.length)
            }
          >
            {c.busy ? t('common.loading') : t('admin.notices.preview')}
          </button>
        </fieldset>
      </form>
    ) : !v && !c.blocked ? (
      <p>{t('common.loading')}</p>
    ) : null;

  return (
    <BackofficePageStack data-ui="customer-notifications-workspace">
      <BackofficePageHeader
        title={t('admin.notices.page_title')}
        description={t('admin.notices.boundary')}
        secondaryAction={
          <button
            type="button"
            data-ui="notice-compose-trigger"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200/90 bg-white text-slate-700 transition hover:border-slate-300 hover:text-slate-950 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:text-white"
            disabled={Boolean(c.draft?.pending) || c.busy || c.blocked}
            aria-label={t('admin.notices.new')}
            title={t('admin.notices.new')}
            onClick={openCompose}
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
          </button>
        }
      />
      {c.blocked ? (
        <div role="alert">
          <p>{t('admin.notices.storage_blocked')}</p>
          {!c.draft ? (
            <button className="btn btn-secondary" onClick={c.discardCorrupt}>
              {t('admin.notices.clear_corrupt')}
            </button>
          ) : null}
        </div>
      ) : null}
      {c.error ? (
        <div role="alert" className="text-sm text-rose-700 dark:text-rose-300">
          {c.error}
        </div>
      ) : null}
      {c.draft?.pending ? (
        <div role="status" className="space-y-2 text-sm">
          <p>{t('admin.notices.unknown')}</p>
          <button
            className="btn btn-secondary"
            disabled={c.busy || c.blocked}
            onClick={() => void c.recover()}
          >
            {t('admin.notices.recover')}
          </button>
        </div>
      ) : null}
      {!detail && !c.draft?.pending && v?.title && composeOpen ? (
        <button
          className="btn btn-secondary"
          disabled={c.busy || c.blocked}
          onClick={() => void c.recover()}
        >
          {t('admin.notices.recover')}
        </button>
      ) : null}

      <div
        className="grid gap-4 lg:grid-cols-2 lg:items-start"
        data-ui="notices-two-column"
      >
        <BackofficeSectionPanel className="overflow-hidden !p-0" data-ui="notice-history-panel">
          <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <h2 className="font-semibold">{t('admin.notices.history')}</h2>
          </div>
          <div className="px-0 py-0">
            {c.historyError ? (
              <div role="alert" className="space-y-2 px-4 py-3">
                <p>{t('admin.notices.history_failed')}</p>
                <button
                  className="btn btn-secondary"
                  disabled={c.busy}
                  onClick={() => void c.loadHistory()}
                >
                  {t('common.retry')}
                </button>
              </div>
            ) : c.history ? (
              <>
                {!c.history.items.length ? (
                  <p className="px-4 py-3 text-sm">{t('admin.notices.empty')}</p>
                ) : (
                  <ul data-ui="notice-history-list" className="divide-y divide-slate-200/80 dark:divide-slate-800">
                    {c.history.items.map((item) => {
                      const inspectRow = () => {
                        if (c.busy || c.draft?.pending) return;
                        userClosedCompose.current = true;
                        setComposeOpen(false);
                        void c.inspect(item.dispatch_id);
                      };
                      const selected = detail?.dispatch_id === item.dispatch_id;
                      return (
                      <li
                        key={item.dispatch_id}
                        data-ui="notice-history-row"
                        className={
                          selected
                            ? 'bg-blue-50/65 dark:bg-blue-950/15'
                            : 'hover:bg-slate-50/70 dark:hover:bg-slate-950/35'
                        }
                      >
                        <button
                          type="button"
                          className="grid w-full gap-1 px-4 py-2.5 text-left disabled:opacity-50"
                          disabled={c.busy || Boolean(c.draft?.pending)}
                          aria-pressed={selected}
                          onClick={inspectRow}
                        >
                          <div className="flex min-w-0 items-start justify-between gap-2">
                            <span className="break-words text-sm font-semibold text-slate-950 dark:text-white [overflow-wrap:anywhere]">
                              {item.title}
                            </span>
                            <span className="shrink-0 text-xs font-medium text-slate-500 underline-offset-2 hover:underline dark:text-slate-400">
                              {t('admin.notices.details')}
                            </span>
                          </div>
                          <div
                            className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400"
                            data-ui="notice-history-metrics"
                          >
                            <span>
                              {item.status === 'preview'
                                ? t('admin.notices.not_sent')
                                : t('admin.notices.history_counts', {
                                    sent: String(item.sent_count),
                                    skipped: String(item.skipped_count),
                                    read: String(item.read_count),
                                  })}
                            </span>
                            <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                              ·
                            </span>
                            <span className="tabular-nums">{formatDate(item.sent_at || item.created_at)}</span>
                            <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                              ·
                            </span>
                            <span className="break-all">{item.actor_ref}</span>
                          </div>
                        </button>
                      </li>
                      );
                    })}
                  </ul>
                )}
                <div
                  data-ui="notice-history-pager"
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-200/80 px-4 py-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400"
                >
                  <span>
                    {c.history.total_count} {t('admin.notices.records')}
                  </span>
                  <button
                    type="button"
                    className="font-medium text-slate-600 underline-offset-2 hover:text-slate-950 hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline dark:text-slate-300 dark:hover:text-white"
                    disabled={c.offset === 0 || c.busy}
                    onClick={() => c.setOffset(c.offset - 20)}
                  >
                    {t('admin.notices.previous')}
                  </button>
                  <button
                    type="button"
                    className="font-medium text-slate-600 underline-offset-2 hover:text-slate-950 hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline dark:text-slate-300 dark:hover:text-white"
                    disabled={c.offset + 20 >= c.history.total_count || c.busy}
                    onClick={() => c.setOffset(c.offset + 20)}
                  >
                    {t('admin.notices.next')}
                  </button>
                </div>
              </>
            ) : (
              <p className="px-4 py-3">{t('common.loading')}</p>
            )}
          </div>
        </BackofficeSectionPanel>

        <BackofficeSectionPanel data-ui="notice-detail-panel">
          {composeOpen ? (
            <p className="text-sm text-slate-600 dark:text-slate-300" data-ui="notice-detail-empty">
              {t('admin.notices.detail_empty')}
            </p>
          ) : (
            detailPanel
          )}
        </BackofficeSectionPanel>
      </div>

      <Modal
        isOpen={composeOpen && !c.blocked}
        onClose={closeCompose}
        title={t('admin.notices.compose')}
        description={t('admin.notices.boundary')}
        size="2xl"
        closeLabel={t('common.close', {}, 'Close')}
        footer={
          <button type="button" className="btn btn-secondary" onClick={closeCompose}>
            {t('common.cancel')}
          </button>
        }
      >
        <div className="space-y-4" data-ui="notice-compose-modal">
          {composeForm}
          {detail && composeOpen ? detailPanel : null}
        </div>
      </Modal>

      <ConfirmModal
        isOpen={confirmSend}
        title={t('admin.notices.send')}
        message={t('admin.notices.confirm', { count: String(detail?.ready_count || 0) })}
        confirmLabel={t('admin.notices.send')}
        onClose={() => setConfirmSend(false)}
        onConfirm={() => {
          setConfirmSend(false);
          void c.submit('send');
        }}
      />
      <ConfirmModal
        isOpen={Boolean(exit)}
        title={t('admin.notices.leave')}
        message={t('admin.notices.leave_body')}
        onClose={() => {
          setExit('');
          cancelNavigation();
        }}
        onConfirm={() => {
          const target = exit;
          setExit('');
          confirmNavigation(target);
        }}
      />
      <ConfirmModal
        isOpen={confirmNew}
        title={t('admin.notices.new')}
        message={t('admin.notices.discard')}
        onClose={() => setConfirmNew(false)}
        onConfirm={() => {
          setConfirmNew(false);
          userClosedCompose.current = false;
          c.reset();
          setComposeOpen(true);
        }}
      />
    </BackofficePageStack>
  );
}
function RoutedWorkspace() {
  const params = useSearchParams(),
    accountId = params.get('account') || '';
  return <NoticeWorkspace key={accountId} accountId={accountId} />;
}
export default function CustomerNotificationsPage() {
  return (
    <Suspense>
      <RoutedWorkspace />
    </Suspense>
  );
}
