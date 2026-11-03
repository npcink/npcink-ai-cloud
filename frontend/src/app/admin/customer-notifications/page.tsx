'use client';
import Link from 'next/link';
import { Suspense, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { z } from 'zod';
import {
  BackofficeDisclosure,
  BackofficePageHeader,
  BackofficePageStack,
  BackofficeSectionPanel,
} from '@/components/backoffice/BackofficeScaffold';
import { ConfirmModal } from '@/components/ui/Modal';
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
  const isOwnPreview = Boolean(
    currentDetail &&
    detail?.status === 'preview' &&
    detail.actor_kind === 'platform_admin' &&
    detail.actor_ref === c.actor,
  );
  return (
    <BackofficePageStack data-ui="customer-notifications-workspace">
      <BackofficePageHeader
        title={t('admin.notices.title')}
        secondaryAction={
          <button
            className="btn btn-secondary"
            disabled={Boolean(c.draft?.pending) || c.busy || c.blocked}
            onClick={() => (dirty ? setConfirmNew(true) : c.reset())}
          >
            {t('admin.notices.new')}
          </button>
        }
      />
      <p className="text-sm text-slate-600 dark:text-slate-300">{t('admin.notices.boundary')}</p>
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
      {v && !(currentDetail && detail?.status === 'sent') ? (
        <BackofficeSectionPanel>
          <form
            className="max-w-3xl space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void c.submit('preview');
            }}
          >
            <fieldset
              disabled={locked || Boolean(currentDetail && detail?.status === 'sent')}
              className="space-y-4"
            >
              <legend className="mb-2 font-semibold">{t('admin.notices.compose')}</legend>
              <label htmlFor="notice-audience" className="block text-sm">
                {t('admin.notices.audience')}
              </label>
                <select id="notice-audience"
                  className="input mt-1 w-full"
                  value={v.audience}
                  onChange={(event) =>
                    c.edit({ audience: event.target.value as 'selected' | 'all', account_ids: [] })
                  }
                >
                  <option value="selected">{t('admin.notices.selected')}</option>
                  <option value="all">{t('admin.notices.all')}</option>
                </select>
              <p className="text-sm">
                {t(v.audience === 'all' ? 'admin.notices.all_scope' : 'admin.notices.owner_scope')}
              </p>
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
              <label htmlFor="notice-link" className="block text-sm">
                {t('admin.notices.link')}
              </label>
                <select id="notice-link"
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
          {!detail && !c.draft?.pending && v.title ? (
            <button
              className="btn btn-secondary mt-3"
              disabled={c.busy || c.blocked}
              onClick={() => void c.recover()}
            >
              {t('admin.notices.recover')}
            </button>
          ) : null}
        </BackofficeSectionPanel>
      ) : !v && !c.blocked ? (
        <p>{t('common.loading')}</p>
      ) : null}
      {detail ? (
        <BackofficeSectionPanel>
          <h2 className="mb-3 font-semibold">{t(detail.status === 'preview' ? 'admin.notices.preview_title' : 'admin.notices.result')}</h2>
          <div className="space-y-3" data-ui="notice-preview">
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
                disabled={
                  c.busy || c.blocked || !detail.ready_count || c.draft?.pending === 'preview'
                }
                onClick={() => setConfirmSend(true)}
              >
                {t('admin.notices.send')}
              </button>
            ) : null}
            <div className="max-h-72 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th>{t('common.account')}</th>
                    <th>{t('admin.notices.recipient')}</th>
                    <th>{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.recipients.map((item) => (
                    <tr
                      className="border-t border-slate-100 dark:border-slate-800"
                      key={item.account_id}
                    >
                      <td className="max-w-xs break-words py-2">
                        {item.account_name}
                        <span className="block break-all text-xs text-slate-500">
                          {item.account_id}
                        </span>
                      </td>
                      <td className="break-all py-2">{item.email || '—'}</td>
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
        </BackofficeSectionPanel>
      ) : null}
      <BackofficeSectionPanel>
        <h2 className="mb-3 font-semibold">{t('admin.notices.history')}</h2>
        {c.historyError ? (
          <div role="alert">
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
              <p className="text-sm">{t('admin.notices.empty')}</p>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th>{t('admin.notices.subject')}</th>
                      <th>{t('admin.notices.sender')}</th>
                      <th>{t('common.status')}</th>
                      <th>{t('admin.notices.time')}</th>
                      <th>{t('admin.notices.details')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.history.items.map((item) => (
                      <tr
                        key={item.dispatch_id}
                        className="border-t border-slate-100 dark:border-slate-800"
                      >
                        <td className="max-w-xs break-words py-3">{item.title}</td>
                        <td className="max-w-48 break-all py-3">{item.actor_ref}</td>
                        <td className="py-3">
                          {item.status === 'preview'
                            ? t('admin.notices.not_sent')
                            : t('admin.notices.history_counts', {
                                sent: String(item.sent_count),
                                skipped: String(item.skipped_count),
                                read: String(item.read_count),
                              })}
                        </td>
                        <td className="py-3">{formatDate(item.sent_at || item.created_at)}</td>
                        <td>
                          <button
                            className="btn btn-secondary btn-sm"
                            disabled={c.busy || Boolean(c.draft?.pending)}
                            onClick={() => void c.inspect(item.dispatch_id)}
                          >
                            {t('admin.notices.details')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-3 flex items-center gap-3 text-sm">
              <span>
                {c.history.total_count} {t('admin.notices.records')}
              </span>
              <button
                className="btn btn-secondary btn-sm"
                disabled={c.offset === 0 || c.busy}
                onClick={() => c.setOffset(c.offset - 20)}
              >
                {t('admin.notices.previous')}
              </button>
              <button
                className="btn btn-secondary btn-sm"
                disabled={c.offset + 20 >= c.history.total_count || c.busy}
                onClick={() => c.setOffset(c.offset + 20)}
              >
                {t('admin.notices.next')}
              </button>
            </div>
          </>
        ) : (
          <p>{t('common.loading')}</p>
        )}
      </BackofficeSectionPanel>
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
          c.reset();
        }}
      />
      <Link href="/admin/support-requests" className="text-sm underline">
        {t('admin.workspace_tab_tickets')}
      </Link>
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
