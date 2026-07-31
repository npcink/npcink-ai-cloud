'use client';

import React, { FormEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AdminDataTableFrame } from '@/components/admin/AdminDataTableFrame';
import { AdminWorkbenchDialog } from '@/components/admin/AdminWorkbenchDialog';
import { BackofficeIdentifier } from '@/components/backoffice/BackofficeIdentifier';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';
import {
  BackofficeEmptyState,
  BackofficeLayer,
  BackofficePageStack,
  BackofficeSectionPanel,
  BackofficeSummaryStrip,
} from '@/components/backoffice/BackofficeScaffold';
import { LoadingFallback } from '@/components/ui/LoadingFallback';
import { ListPagination } from '@/components/ui/ListPagination';
import { useToast } from '@/components/ui/Toast';
import { useLocale } from '@/contexts/LocaleContext';
import {
  CreateAccountForm,
  useCreateAccountForm,
} from '@/features/admin/accounts/CreateAccountForm';
import {
  buildCreateAccountPayload,
} from '@/features/admin/accounts/create-account-form-model';
import {
  resolveCustomerPackageDisplay,
  type CoverageState,
  type PackageKind,
} from '@/lib/customer-package-display';
import { createApiClient } from '@/lib/api-client';
import { resolveUiErrorMessage } from '@/lib/errors';
import { formatDate, formatNumber as formatInteger } from '@/lib/utils';

type IdentityRelationshipState = 'healthy' | 'missing' | 'conflict' | 'access_disabled';
type AccountSort = 'display_name' | 'created_at';

interface PrimaryIdentity {
  principal_id: string;
  email: string;
  status: string;
  last_login_at?: string;
  membership_status: string;
}

interface Account {
  account_id: string;
  display_name: string;
  operator_note: string;
  status: string;
  created_at?: string;
  site_count: number;
  subscription_count: number;
  display_package_label: string;
  primary_identity: PrimaryIdentity | null;
  identity_relationship_state: IdentityRelationshipState;
}

interface AccountsApiItem {
  account?: {
    account_id?: string;
    name?: string;
    status?: string;
    created_at?: string;
    metadata?: Record<string, unknown>;
  };
  site_count?: number;
  active_subscription_count?: number;
  top_plan_id?: string;
  display_package_label?: string;
  package_alias?: string;
  plan_kind?: string;
  package_kind?: PackageKind;
  coverage_state?: CoverageState;
  primary_identity?: Partial<PrimaryIdentity> | null;
  identity_relationship_state?: IdentityRelationshipState;
}

interface AccountsListPayload {
  items?: AccountsApiItem[];
  total?: number;
  hidden_internal_total?: number;
}

interface CreatedAccountPayload {
  account_id?: string;
}

const MALFORMED_ACCOUNT_TEXT_RE = /Fatal error|Stack trace|Command line code|Uncaught ValueError|Path must not be empty/i;
const INTERNAL_TEST_ACCOUNT_RE = /(^|[_-])(smoke)([_-]|$)|codex_image_smoke|site_knowledge_smoke/i;
const ACCOUNT_SORTS = new Set<AccountSort>(['display_name', 'created_at']);
const PAGE_SIZE = 25;
const accountsClient = createApiClient({ idempotencyPrefix: 'admin_accounts' });

function isMalformedAccountText(value?: string): boolean {
  return MALFORMED_ACCOUNT_TEXT_RE.test(String(value || ''));
}

function prettifyAccountId(accountId: string): string {
  if (isMalformedAccountText(accountId)) return '';
  const stripped = accountId
    .replace(/^acct[_-]?/i, '')
    .replace(/^site[_-]?/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  if (!stripped) return accountId;
  return stripped
    .split(/\s+/)
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower === 'ai') return 'AI';
      if (lower === 'api') return 'API';
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

function normalizeAccount(
  item: AccountsApiItem,
  t: (key: string, params?: Record<string, string>, fallback?: string) => string
): Account | null {
  const account = item.account;
  if (!account?.account_id) return null;
  const metadata = account.metadata || {};
  const operatorDisplayName = String(metadata.operator_display_name || '').trim();
  const rawName = String(account.name || '').trim();
  const safeName =
    rawName && rawName !== account.account_id && !isMalformedAccountText(rawName) ? rawName : '';
  const packageDisplay = resolveCustomerPackageDisplay(t, {
    planId: item.top_plan_id,
    packageAlias: item.package_alias,
    planKind: item.plan_kind,
    packageKind: item.package_kind,
    coverageState: item.coverage_state,
  });
  const primaryIdentity = item.primary_identity?.principal_id
    ? {
        principal_id: String(item.primary_identity.principal_id),
        email: String(item.primary_identity.email || ''),
        status: String(item.primary_identity.status || ''),
        last_login_at: item.primary_identity.last_login_at,
        membership_status: String(item.primary_identity.membership_status || ''),
      }
    : null;

  return {
    account_id: account.account_id,
    display_name:
      operatorDisplayName ||
      safeName ||
      prettifyAccountId(account.account_id) ||
      t('admin.accounts.malformed_account_label', {}, 'Malformed account record'),
    operator_note: String(metadata.operator_note || '').trim(),
    status: String(account.status || 'inactive'),
    created_at: account.created_at,
    site_count: Number(item.site_count || 0),
    subscription_count: Number(item.active_subscription_count || 0),
    display_package_label:
      String(item.display_package_label || '') || packageDisplay.display_package_label,
    primary_identity: primaryIdentity,
    identity_relationship_state: item.identity_relationship_state || 'missing',
  };
}

function isInternalAccount(account: Account): boolean {
  const searchable = [account.account_id, account.display_name].join(' ');
  return isMalformedAccountText(searchable) || INTERNAL_TEST_ACCOUNT_RE.test(searchable);
}

function normalizeSort(value: string | null): AccountSort {
  return value && ACCOUNT_SORTS.has(value as AccountSort)
    ? (value as AccountSort)
    : 'display_name';
}

function normalizeOffset(value: string | null): number {
  const parsed = Number(value || 0);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function AccountsContent() {
  const { t } = useLocale();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const appliedQuery = searchParams.get('q') || '';
  const appliedStatus = searchParams.get('status') || '';
  const showInternalAccounts = searchParams.get('internal') === '1';
  const sort = normalizeSort(searchParams.get('sort'));
  const offset = normalizeOffset(searchParams.get('offset'));

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [total, setTotal] = useState(0);
  const [hiddenInternalTotal, setHiddenInternalTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [loadedRequestKey, setLoadedRequestKey] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [draftQuery, setDraftQuery] = useState(appliedQuery);
  const mountedRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const activeRequestKeyRef = useRef('');
  const requestSequenceRef = useRef(0);
  const createAccountForm = useCreateAccountForm();

  const requestKey = useMemo(() => {
    const params = new URLSearchParams();
    if (appliedQuery.trim()) params.set('q', appliedQuery.trim());
    if (appliedStatus) params.set('status', appliedStatus);
    if (!showInternalAccounts) params.set('exclude_internal', 'true');
    params.set('sort', sort);
    params.set('limit', String(PAGE_SIZE));
    if (offset > 0) params.set('offset', String(offset));
    return params.toString();
  }, [appliedQuery, appliedStatus, offset, showInternalAccounts, sort]);

  const updateDirectoryUrl = useCallback(
    (patch: Record<string, string | null>) => {
      const nextParams = new URLSearchParams(searchParamsKey);
      Object.entries(patch).forEach(([key, value]) => {
        const isDefault =
          (key === 'sort' && value === 'display_name') ||
          (key === 'offset' && value === '0');
        if (!value || isDefault) nextParams.delete(key);
        else nextParams.set(key, value);
      });
      const nextQuery = nextParams.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    },
    [pathname, router, searchParamsKey]
  );

  const loadAccounts = useCallback(
    async (force = false) => {
      if (!force && activeRequestKeyRef.current === requestKey) return;
      const sequence = requestSequenceRef.current + 1;
      requestSequenceRef.current = sequence;
      activeRequestKeyRef.current = requestKey;
      setLoadError('');
      if (force || hasLoadedRef.current) setIsRefreshing(true);
      else setIsLoading(true);

      try {
        const payload = (
          await accountsClient.request<AccountsListPayload>(`/api/admin/accounts?${requestKey}`)
        ).data;
        const normalized = (payload.items || [])
          .map((item) => normalizeAccount(item, t))
          .filter((item): item is Account => Boolean(item));
        if (mountedRef.current && requestSequenceRef.current === sequence) {
          setAccounts(normalized);
          setTotal(Number(payload.total ?? normalized.length));
          setHiddenInternalTotal(Number(payload.hidden_internal_total || 0));
          setLoadedAt(new Date());
          setLoadedRequestKey(requestKey);
          hasLoadedRef.current = true;
          setHasLoaded(true);
        }
      } catch (err) {
        if (mountedRef.current && requestSequenceRef.current === sequence) {
          setLoadError(resolveUiErrorMessage(err, t('error.failed_load')));
        }
      } finally {
        if (requestSequenceRef.current === sequence) {
          activeRequestKeyRef.current = '';
          if (mountedRef.current) {
            setIsLoading(false);
            setIsRefreshing(false);
          }
        }
      }
    },
    [requestKey, t]
  );

  useEffect(() => {
    mountedRef.current = true;
    void loadAccounts();
    return () => {
      mountedRef.current = false;
    };
  }, [loadAccounts]);

  useEffect(() => {
    setDraftQuery(appliedQuery);
  }, [appliedQuery]);

  const visibleAccounts = useMemo(
    () => (showInternalAccounts ? accounts : accounts.filter((account) => !isInternalAccount(account))),
    [accounts, showInternalAccounts]
  );
  const pageSummary = useMemo(
    () => ({
      active: visibleAccounts.filter((account) => account.status === 'active').length,
      loginReady: visibleAccounts.filter(
        (account) => account.identity_relationship_state === 'healthy'
      ).length,
      sites: visibleAccounts.reduce((sum, account) => sum + account.site_count, 0),
      subscriptions: visibleAccounts.reduce(
        (sum, account) => sum + account.subscription_count,
        0
      ),
    }),
    [visibleAccounts]
  );
  const isShowingRetainedResults = Boolean(
    loadError && loadedRequestKey && loadedRequestKey !== requestKey
  );

  const applySearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateDirectoryUrl({ q: draftQuery.trim() || null, offset: null });
  };

  const clearFilters = () => {
    setDraftQuery('');
    updateDirectoryUrl({
      q: null,
      status: null,
      internal: null,
      sort: null,
      offset: null,
    });
  };

  const closeCreateDialog = () => {
    if (isCreating) return;
    setIsCreateOpen(false);
    setActionError('');
    createAccountForm.reset();
  };

  const handleCreateAccount = async (fields: FormData) => {
    const validation = createAccountForm.validate(fields);
    if (!validation.success) return;
    const values = validation.data;
    setActionError('');
    setIsCreating(true);
    try {
      const response = await accountsClient.request<CreatedAccountPayload>('/api/admin/accounts', {
        method: 'POST',
        body: buildCreateAccountPayload(values),
      });
      const createdAccountId = String(response.data?.account_id || '').trim();
      if (!createdAccountId) {
        throw new Error(
          t(
            'admin.accounts.created_account_id_missing',
            {},
            'The customer was created, but the generated account ID was not returned.'
          )
        );
      }
      toast.success(
        values.bind_default_free
          ? t(
              'admin.accounts.onboarding_created_notice',
              {},
              'Customer account created and bound to the Free package.'
            )
          : t(
              'admin.accounts.account_created_notice',
              {},
              'Account created without automatic subscription coverage.'
            ),
        t('admin.accounts.account_created_title', {}, 'Customer created')
      );
      setIsCreateOpen(false);
      createAccountForm.reset();
      router.push(`/admin/accounts/${encodeURIComponent(createdAccountId)}`);
    } catch (err) {
      setActionError(resolveUiErrorMessage(err, t('error.failed_save')));
    } finally {
      setIsCreating(false);
    }
  };

  if (isLoading && !hasLoaded) return <LoadingFallback />;

  const hasFilters =
    Boolean(appliedQuery || appliedStatus || showInternalAccounts) || sort !== 'display_name';

  return (
    <BackofficePageStack className="space-y-5">
      <BackofficeLayer
        eyebrow={t('admin.accounts.directory_eyebrow', {}, 'Customer operations')}
        title={t('admin.accounts.list_title', {}, 'Customers')}
        description={t(
          'admin.accounts.list_desc',
          {},
          'Find a customer, create a customer, or open the customer record. Service problems are handled in Service status.'
        )}
        actions={(
          <>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setActionError('');
                createAccountForm.reset();
                setIsCreateOpen(true);
              }}
            >
              {t('admin.accounts.add_customer_action', {}, 'Add customer')}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void loadAccounts(true)}
              disabled={isRefreshing}
            >
              {isRefreshing ? t('common.loading', {}, 'Loading...') : t('common.refresh', {}, 'Refresh')}
            </button>
          </>
        )}
      />

      <BackofficeSummaryStrip
        items={[
          {
            label: t('admin.accounts.summary_customers', {}, 'Customers'),
            value: formatInteger(total),
          },
          {
            label: t('admin.accounts.summary_active', {}, 'Active accounts'),
            value: formatInteger(pageSummary.active),
          },
          {
            label: t('admin.accounts.summary_login_ready', {}, 'Login ready'),
            value: formatInteger(pageSummary.loginReady),
          },
          {
            label: t('common.sites', {}, 'Sites'),
            value: formatInteger(pageSummary.sites),
          },
          {
            label: t('common.subscriptions', {}, 'Subscriptions'),
            value: formatInteger(pageSummary.subscriptions),
          },
        ]}
      />

      <AdminWorkbenchDialog
        open={isCreateOpen}
        title={t('admin.accounts.create_title', {}, 'Add customer')}
        titleId="create-customer-dialog-title"
        saving={isCreating}
        closeLabel={t('common.close', {}, 'Close')}
        cancelLabel={t('common.cancel', {}, 'Cancel')}
        saveLabel={t('admin.accounts.create_customer_account', {}, 'Create customer')}
        savingLabel={t('common.saving', {}, 'Saving...')}
        footerNotice={t(
          'admin.accounts.create_desc',
          {},
          'Create one customer account, its owner login identity, and optional Free package in one audited service-plane action.'
        )}
        width="compact"
        onClose={closeCreateDialog}
        onSubmit={(fields) => void handleCreateAccount(fields)}
      >
        <p className="text-sm text-slate-600 dark:text-slate-300 md:col-span-2">
          {t(
            'admin.accounts.account_id_auto_desc',
            {},
            'Account ID is generated automatically after creation.'
          )}
        </p>
        <CreateAccountForm
          actionError={actionError}
          errors={createAccountForm.errors}
        />
      </AdminWorkbenchDialog>

      {loadError ? (
        <div
          role="alert"
          className="border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-200"
        >
          <p>{loadError}</p>
          {isShowingRetainedResults ? (
            <p className="mt-1 text-xs">
              {t(
                'admin.accounts.retained_results_notice',
                {},
                'Showing the last successfully loaded page; the requested directory filters were not applied.'
              )}
            </p>
          ) : null}
        </div>
      ) : null}

      <BackofficeSectionPanel className="overflow-hidden p-0">
        <div
          data-ui="customer-directory-toolbar"
          className="flex flex-col gap-3 border-b border-slate-200/80 px-4 py-4 dark:border-slate-800 lg:flex-row lg:items-end"
        >
          <form
            data-ui="customer-directory-search"
            className="flex min-w-0 gap-2 lg:w-full lg:max-w-2xl"
            onSubmit={applySearch}
          >
            <label className="min-w-0 flex-1">
              <span className="sr-only">{t('common.search', {}, 'Search')}</span>
              <input
                type="search"
                className="input w-full"
                value={draftQuery}
                placeholder={t(
                  'admin.accounts.search_placeholder',
                  {},
                  'Customer name, email, account ID, or note'
                )}
                onChange={(event) => setDraftQuery(event.target.value)}
              />
            </label>
            <button type="submit" className="btn btn-primary">
              {t('common.search', {}, 'Search')}
            </button>
          </form>
          <label className="lg:w-48">
            <span className="sr-only">{t('common.status', {}, 'Status')}</span>
            <select
              className="input w-full"
              value={appliedStatus}
              onChange={(event) =>
                updateDirectoryUrl({ status: event.target.value || null, offset: null })
              }
            >
              <option value="">{t('admin.accounts.all_statuses', {}, 'All account states')}</option>
              <option value="active">{t('status.active', {}, 'Active')}</option>
              <option value="inactive">{t('status.inactive', {}, 'Inactive')}</option>
              <option value="suspended">{t('status.suspended', {}, 'Suspended')}</option>
            </select>
          </label>
          <label className="lg:w-48">
            <span className="sr-only">{t('admin.accounts.sort_label', {}, 'Sort')}</span>
            <select
              className="input w-full"
              value={sort}
              onChange={(event) =>
                updateDirectoryUrl({
                  sort: normalizeSort(event.target.value),
                  offset: null,
                })
              }
            >
              <option value="display_name">
                {t('admin.accounts.sort_name', {}, 'Sort: customer name')}
              </option>
              <option value="created_at">
                {t('admin.accounts.sort_created', {}, 'Sort: recently created')}
              </option>
            </select>
          </label>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!hasFilters && !draftQuery}
            onClick={clearFilters}
          >
            {t('common.clear_filters', {}, 'Clear filters')}
          </button>
        </div>

        {hiddenInternalTotal > 0 ? (
          <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 bg-slate-50 px-4 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">
            <span>
              {t(
                'admin.accounts.hidden_internal_records_note',
                { count: formatInteger(hiddenInternalTotal) },
                `${formatInteger(hiddenInternalTotal)} test or malformed records are hidden.`
              )}
            </span>
            <button
              type="button"
              className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
              onClick={() =>
                updateDirectoryUrl({
                  internal: showInternalAccounts ? null : '1',
                  offset: null,
                })
              }
            >
              {showInternalAccounts
                ? t('admin.accounts.hide_internal_records', {}, 'Hide test records')
                : t('admin.accounts.show_internal_records', {}, 'Show test records')}
            </button>
          </div>
        ) : null}

        {visibleAccounts.length ? (
          <AdminDataTableFrame
            dataUi="customer-directory-table"
            density="compact"
            headerVisibility="sr-only"
            title={t('admin.accounts.list_title', {}, 'Customers')}
            resultLabel={t(
              'admin.accounts.result_count',
              {
                visible: formatInteger(visibleAccounts.length),
                total: formatInteger(total),
              },
              `${formatInteger(visibleAccounts.length)} on this page · ${formatInteger(total)} total`
            )}
            bodyClassName="overflow-x-auto"
            footer={(
              <ListPagination
                offset={offset}
                limit={PAGE_SIZE}
                total={total}
                isLoading={isRefreshing}
                onOffsetChange={(nextOffset) =>
                  updateDirectoryUrl({ offset: String(nextOffset) })
                }
              />
            )}
          >
            <table
              className="w-full min-w-[68rem] table-fixed border-collapse text-left text-sm"
              aria-label={t('admin.accounts.table_region_label', {}, 'Customer directory')}
            >
              <thead className="bg-slate-50/80 text-xs font-semibold text-slate-500 dark:bg-slate-950/40 dark:text-slate-400">
                <tr>
                  <th className="w-[18rem] px-4 py-3">{t('common.accounts', {}, 'Customer')}</th>
                  <th className="w-[18rem] px-4 py-3">
                    {t('admin.accounts.login_email_label', {}, 'Login email')}
                  </th>
                  <th className="w-[10rem] px-4 py-3">{t('common.status', {}, 'Status')}</th>
                  <th className="w-[12rem] px-4 py-3">{t('common.package', {}, 'Package')}</th>
                  <th className="w-[10rem] px-4 py-3">
                    {t('admin.accounts.service_footprint_label', {}, 'Service footprint')}
                  </th>
                  <th className="px-4 py-3 text-right">{t('common.actions', {}, 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleAccounts.map((account) => (
                  <tr
                    key={account.account_id}
                    data-ui="customer-directory-row"
                    className="border-t border-slate-200/80 align-middle dark:border-slate-800"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/accounts/${encodeURIComponent(account.account_id)}`}
                        className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
                      >
                        {account.display_name}
                      </Link>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        <BackofficeIdentifier value={account.account_id} />
                      </div>
                      {account.operator_note ? (
                        <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                          {account.operator_note}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                        {account.primary_identity?.email ||
                          t('admin.accounts.identity_missing_label', {}, 'Login identity missing')}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {account.primary_identity?.last_login_at
                          ? t(
                              'admin.accounts.last_login_value',
                              { date: formatDate(account.primary_identity.last_login_at) },
                              `Last login ${formatDate(account.primary_identity.last_login_at)}`
                            )
                          : t('admin.accounts.never_logged_in', {}, 'No recorded login')}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1.5">
                        <BackofficeStatusBadge
                          status={account.status}
                          label={t(`status.${account.status}`, {}, account.status)}
                        />
                        {account.identity_relationship_state !== 'healthy' ? (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {t(
                              `admin.accounts.identity_${account.identity_relationship_state}`,
                              {},
                              account.identity_relationship_state
                            )}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                      {account.display_package_label}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {t(
                          'admin.accounts.site_count_value',
                          { count: formatInteger(account.site_count) },
                          `${formatInteger(account.site_count)} sites`
                        )}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {t(
                          'admin.accounts.subscription_count_value',
                          { count: formatInteger(account.subscription_count) },
                          `${formatInteger(account.subscription_count)} subscriptions`
                        )}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/accounts/${encodeURIComponent(account.account_id)}`}
                        className="btn btn-primary btn-sm"
                      >
                        {t('common.details', {}, 'Details')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminDataTableFrame>
        ) : (
          <BackofficeEmptyState
            className="m-5 md:m-6"
            title={t('admin.accounts.no_match_title', {}, 'No customers match these filters')}
            description={t(
              'admin.accounts.no_match_desc',
              {},
              'Clear or adjust the customer search and account-state filter. No customer record has been changed.'
            )}
            action={
              hasFilters ? (
                <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>
                  {t('common.clear_filters', {}, 'Clear filters')}
                </button>
              ) : null
            }
          />
        )}
      </BackofficeSectionPanel>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        {t(
          'admin.accounts.directory_boundary',
          {},
          'This page is the customer directory. Open Service status for cross-customer problems, then resolve customer-specific work in the customer record.'
        )}
        {loadedAt
          ? ` · ${t('common.updated_at', {}, 'Updated')} ${formatDate(loadedAt.toISOString())}`
          : ''}
      </p>
    </BackofficePageStack>
  );
}

export default function AdminAccountsPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AccountsContent />
    </Suspense>
  );
}
