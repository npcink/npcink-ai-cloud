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
  const sendButton = useRef<HTMLButtonElement>(null);
  const restoreSendFocus = useRef(false);
  useEffect(() => {
    if (!confirmSend && restoreSendFocus.current) {
      restoreSendFocus.current = false;
      sendButton.current?.focus();
    }
  }, [confirmSend]);
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
      <h3 className="break-words text-lg font-semibold" data-ui="notice-subject">{detail.title}</h3>
      <p className="text-sm text-slate-600 dark:text-slate-300" data-ui="notice-sender">
        {t('admin.notices.sender')}: {t(detail.actor_kind === 'platform_admin'
          ? 'portal.role_platform_admin' : 'admin.notices.sender_unknown')}
      </p>
      <dl className="flex flex-wrap gap-x-6 gap-y-2 border-y border-slate-200 py-3 text-sm dark:border-slate-800" data-ui="notice-result-metrics">
        {[
          ['admin.notices.accounts_count', detail.target_count],
          ...(detail.status === 'preview' ? [['admin.notices.ready_count', detail.ready_count]] as const : []),
          ['admin.notices.inbox_count', detail.sent_count],
          ['admin.notices.skipped_count', detail.skipped_count],
          ['admin.notices.read_count', detail.read_count],
        ].map(([label, count]) => (
          <div key={label} className="flex items-baseline gap-2">
            <dt className="text-slate-600 dark:text-slate-300">{t(String(label))}</dt>
            <dd className="font-semibold tabular-nums">{count}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-slate-600 dark:text-slate-300">
        {t(detail.status === 'preview' ? 'admin.notices.preview_scope' : 'admin.notices.inbox_scope')}
      </p>
      <section className="space-y-2 py-1" aria-label={t('admin.notices.content')}>
        <h3 className="text-sm font-semibold">{t('admin.notices.content')}</h3>
        <p className="max-w-prose whitespace-pre-wrap break-words text-sm leading-6">{detail.body}</p>
        <p className="text-xs text-slate-600 dark:text-slate-300">
          {t('admin.notices.link')}: {linkLabel(detail.link_href)}
        </p>
      </section>
      {isOwnPreview ? (
        <button
          type="button"
          ref={sendButton}
          className="btn btn-primary"
          disabled={c.busy || c.blocked || !detail.ready_count || c.draft?.pending === 'preview'}
          onClick={() => setConfirmSend(true)}
        >
          {t('admin.notices.send')}
        </button>
      ) : null}
      <h3 className="text-sm font-semibold">{t('admin.notices.recipients_title')}</h3>
      <div className="max-h-72 overflow-auto">
        <table className="w-full table-fixed text-left text-sm">
          <thead>
            <tr>
              <th className="w-[40%] py-1.5 pr-2 font-medium">{t('admin.notices.customer')}</th>
              <th className="w-[35%] py-1.5 pr-2 font-medium">{t('admin.notices.recipient')}</th>
              <th className="w-[25%] py-1.5 font-medium">{t('common.status')}</th>
            </tr>
          </thead>
          <tbody>
            {detail.recipients.map((item, index) => (
              <tr
                className="border-t border-slate-100 dark:border-slate-800"
                key={item.account_id}
              >
                <td className="max-w-xs break-words py-2 pr-2">
                  {item.account_name.trim() && item.account_name !== item.account_id
                    ? item.account_name
                    : t('admin.notices.unnamed_customer', { number: String(index + 1) })}
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
      <BackofficeDisclosure
        summary={t('admin.notices.evidence')}
        className="rounded-none border-0 border-t bg-transparent dark:bg-transparent"
        summaryClassName="px-0 py-3 text-xs md:px-0"
        contentClassName="space-y-3 border-0 px-0 pb-0 pt-0 md:p-0"
      >
        <dl className="grid gap-3 text-xs sm:grid-cols-2">
          {[
            ['admin.notices.batch_id', detail.dispatch_id],
            ['admin.notices.sender_ref', detail.actor_ref],
            ['admin.notices.sender_kind', detail.actor_kind],
            ['admin.notices.created_at', formatDate(detail.created_at)],
            ...(detail.sent_at ? [['admin.notices.sent_at', formatDate(detail.sent_at)]] : []),
          ].map(([label, value]) => (
            <div key={label} className="min-w-0 space-y-1">
              <dt className="text-slate-500 dark:text-slate-400">{t(label)}</dt>
              <dd className="select-text break-all">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="max-h-72 space-y-3 overflow-auto text-xs" data-ui="notice-recipient-identifiers">
          <h4 className="font-medium">{t('admin.notices.customer_identifiers')}</h4>
          {detail.recipients.map((item, index) => (
            <dl key={item.account_id} className="space-y-1">
              <dt className="break-words text-slate-500 dark:text-slate-400">
                {index + 1}. {item.account_name.trim() && item.account_name !== item.account_id
                  ? item.account_name
                  : t('admin.notices.unnamed_customer', { number: String(index + 1) })}
                {item.email ? ` · ${item.email}` : ''}
              </dt>
              <dd className="select-text break-all">{item.account_id}</dd>
            </dl>
          ))}
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300">{t('admin.notices.transaction_scope')}</p>
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

  const feedback = (
    <>
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
    </>
  );

  return (
    <BackofficePageStack data-ui="customer-notifications-workspace">
      <BackofficePageHeader
        density="compact"
        title={t('admin.notices.page_title')}
        description={t('admin.notices.boundary')}
        secondaryAction={
          <button
            type="button"
            data-ui="notice-compose-trigger"
            className="btn btn-secondary gap-2"
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
            {t('admin.notices.new')}
          </button>
        }
      />
      {!composeOpen ? feedback : null}

      <div
        className="grid gap-4 xl:grid-cols-[var(--admin-diagnostic-queue-width)_minmax(0,1fr)] xl:items-start"
        data-ui="notices-two-column"
      >
        <BackofficeSectionPanel className="min-w-0 overflow-hidden !rounded-lg !p-0 !shadow-none" data-ui="notice-history-panel">
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
                            ? 'bg-blue-50/65 shadow-[inset_3px_0_0_0_currentColor] text-blue-700 dark:bg-blue-950/15 dark:text-blue-300'
                            : 'hover:bg-slate-50/70 dark:hover:bg-slate-950/35'
                        }
                      >
                        <button
                          type="button"
                          className="grid w-full cursor-pointer gap-1 px-4 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={c.busy || Boolean(c.draft?.pending)}
                          aria-pressed={selected}
                          aria-controls="notice-detail-panel"
                          onClick={inspectRow}
                        >
                          <div className="flex min-w-0 items-start justify-between gap-2">
                            <span className="break-words text-sm font-semibold text-slate-950 dark:text-white [overflow-wrap:anywhere]">
                              {item.title}
                            </span>
                            <span className="shrink-0 text-xs font-medium text-blue-700 underline-offset-2 hover:underline dark:text-blue-300">
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
                  {c.history.total_count > 20 || c.offset > 0 ? <>
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
                  </> : null}
                </div>
              </>
            ) : (
              <p className="px-4 py-3">{t('common.loading')}</p>
            )}
          </div>
        </BackofficeSectionPanel>

        <BackofficeSectionPanel className="min-w-0 !rounded-lg !p-4 !shadow-none md:!p-5" data-ui="notice-detail-panel" id="notice-detail-panel">
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
        isOpen={composeOpen && !confirmSend && !confirmNew && !exit}
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
          {feedback}
          {composeForm}
          {detail && composeOpen ? detailPanel : null}
        </div>
      </Modal>

      <ConfirmModal
        isOpen={confirmSend}
        title={t('admin.notices.send')}
        message={t('admin.notices.confirm', { count: String(detail?.ready_count || 0) })}
        confirmLabel={t('admin.notices.send')}
        onClose={() => {
          restoreSendFocus.current = true;
          setConfirmSend(false);
        }}
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
