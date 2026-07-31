'use client';

import React, { FormEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BackofficeIdentifier } from '@/components/backoffice/BackofficeIdentifier';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';
import { AdminMutationReceipt, type AdminMutationReceiptPayload } from '@/components/admin/AdminMutationReceipt';
import {
  BackofficeEmptyState,
  BackofficeLayer,
  BackofficePageStack,
  BackofficeSectionPanel,
  BackofficeSummaryStrip,
} from '@/components/backoffice/BackofficeScaffold';
import { LoadingFallback } from '@/components/ui/LoadingFallback';
import { ListPagination } from '@/components/ui/ListPagination';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useLocale } from '@/contexts/LocaleContext';
import { CreateAccountForm } from '@/features/admin/accounts/CreateAccountForm';
import {
  buildCreateAccountPayload,
  type CreateAccountFormValues,
} from '@/features/admin/accounts/create-account-form-model';
import {
  resolveCustomerPackageDisplay,
  translateCoverageStateLabel,
  translatePackageKindLabel,
  type CoverageState,
  type PackageKind,
} from '@/lib/customer-package-display';
import { createApiClient } from '@/lib/api-client';
import { resolveUiErrorMessage } from '@/lib/errors';
import { cn, formatDate, formatNumber as formatInteger } from '@/lib/utils';

interface Account {
  account_id: string;
  name: string;
  display_name: string;
  operator_note: string;
  account_status_note: string;
  account_status_updated_at: string;
  status: string;
  site_count: number;
  subscription_count: number;
  top_plan?: string;
  display_package_label: string;
  package_kind: PackageKind;
  coverage_state: CoverageState;
  coverage_follow_up_required: boolean;
  nearest_expiry?: string;
  primary_identity: PrimaryIdentity | null;
  identity_relationship_state: IdentityRelationshipState;
}

type IdentityRelationshipState = 'healthy' | 'missing' | 'conflict' | 'access_disabled';

interface PrimaryIdentity {
  principal_id: string;
  email: string;
  status: string;
  session_version: number;
  last_login_at?: string;
  created_at?: string;
  membership_id: string;
  membership_role: string;
  membership_status: string;
  qq_bound: boolean;
  qq_binding_count: number;
}

interface AccountsApiItem {
  account?: {
    account_id?: string;
    name?: string;
    status?: string;
    metadata?: Record<string, unknown>;
  };
  site_count?: number;
  active_subscription_count?: number;
  top_plan_id?: string;
  display_package_label?: string;
  package_kind?: PackageKind;
  coverage_state?: CoverageState;
  coverage_follow_up_required?: boolean;
  package_alias?: string;
  plan_kind?: string;
  nearest_expiry_at?: string | null;
  primary_identity?: Partial<PrimaryIdentity> | null;
  identity_relationship_state?: IdentityRelationshipState;
}

interface AccountsListPayload {
  items?: AccountsApiItem[];
  total?: number;
  hidden_internal_total?: number;
}

interface IdentityAuditPayload {
  items?: Array<{
    event_id: number;
    event_kind: string;
    outcome: string;
    created_at?: string;
  }>;
  summary?: {
    events?: number;
    registration_events?: number;
    disable_events?: number;
    succeeded?: number;
    failed?: number;
    latest_disable_reason?: string;
  };
}

interface IdentityDisablePayload {
  receipt?: AdminMutationReceiptPayload | null;
}

type AccountSort = 'risk' | 'display_name' | 'created_at';
type AccountRisk = 'critical' | 'warning' | 'monitor' | 'stable';

const MALFORMED_ACCOUNT_TEXT_RE = /Fatal error|Stack trace|Command line code|Uncaught ValueError|Path must not be empty/i;
const INTERNAL_TEST_ACCOUNT_RE = /(^|[_-])(smoke)([_-]|$)|codex_image_smoke|site_knowledge_smoke/i;
const ACCOUNT_SORTS = new Set<AccountSort>(['risk', 'display_name', 'created_at']);
const EXPIRY_ACTION_WINDOW_DAYS = 14;
const PAGE_SIZE = 25;
const accountsClient = createApiClient({ idempotencyPrefix: 'admin_accounts' });

function isMalformedAccountText(value?: string): boolean {
  return MALFORMED_ACCOUNT_TEXT_RE.test(String(value || ''));
}

function prettifyAccountId(accountId: string): string {
  if (isMalformedAccountText(accountId)) return '';
  const stripped = accountId.replace(/^acct[_-]?/i, '').replace(/^site[_-]?/i, '').replace(/[_-]+/g, ' ').trim();
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

function isRawAccountName(value: string, accountId: string): boolean {
  const trimmed = value.trim();
  return !trimmed || trimmed === accountId || /^acct[_-]/i.test(trimmed) || isMalformedAccountText(trimmed);
}

function isHiddenByDefaultAccount(account: Account): boolean {
  const searchable = [account.account_id, account.name, account.display_name].join(' ');
  return isMalformedAccountText(searchable) || INTERNAL_TEST_ACCOUNT_RE.test(searchable);
}

function normalizeAccount(
  item: AccountsApiItem,
  t: (key: string, params?: Record<string, string>, fallback?: string) => string
): Account | null {
  const account = item.account;
  if (!account?.account_id) return null;
  const metadata = account.metadata || {};
  const operatorDisplayName = String(metadata.operator_display_name || '').trim();
  const operatorNote = String(metadata.operator_note || '').trim();
  const accountStatusNote = String(metadata.account_status_note || '').trim();
  const accountStatusUpdatedAt = String(metadata.account_status_updated_at || '').trim();
  const rawName = String(account.name || '').trim();
  const safeName = rawName && !isRawAccountName(rawName, account.account_id) ? rawName : '';
  const fallbackDisplayName = isMalformedAccountText(`${account.account_id} ${rawName}`)
    ? t('admin.accounts.malformed_account_label', {}, 'Malformed account record')
    : prettifyAccountId(account.account_id);
  const packageDisplay = resolveCustomerPackageDisplay(t, {
    planId: item.top_plan_id,
    packageAlias: item.package_alias,
    planKind: item.plan_kind,
    packageKind: item.package_kind,
    coverageState: item.coverage_state,
  });

  return {
    account_id: account.account_id,
    name: safeName || rawName || account.account_id,
    display_name: operatorDisplayName || safeName || fallbackDisplayName || account.account_id,
    operator_note: operatorNote,
    account_status_note: accountStatusNote,
    account_status_updated_at: accountStatusUpdatedAt,
    status: account.status || 'inactive',
    site_count: Number(item.site_count || 0),
    subscription_count: Number(item.active_subscription_count || 0),
    top_plan: item.top_plan_id || '',
    display_package_label: item.display_package_label || packageDisplay.display_package_label,
    package_kind: packageDisplay.package_kind,
    coverage_state: packageDisplay.coverage_state,
    coverage_follow_up_required: Boolean(item.coverage_follow_up_required),
    nearest_expiry: item.nearest_expiry_at || undefined,
    primary_identity: item.primary_identity?.principal_id
      ? {
          principal_id: String(item.primary_identity.principal_id),
          email: String(item.primary_identity.email || ''),
          status: String(item.primary_identity.status || ''),
          session_version: Number(item.primary_identity.session_version || 1),
          last_login_at: item.primary_identity.last_login_at,
          created_at: item.primary_identity.created_at,
          membership_id: String(item.primary_identity.membership_id || ''),
          membership_role: String(item.primary_identity.membership_role || ''),
          membership_status: String(item.primary_identity.membership_status || ''),
          qq_bound: Boolean(item.primary_identity.qq_bound),
          qq_binding_count: Number(item.primary_identity.qq_binding_count || 0),
        }
      : null,
    identity_relationship_state: item.identity_relationship_state || 'missing',
  };
}

function daysUntil(raw?: string): number | null {
  if (!raw) return null;
  const ms = new Date(raw).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.ceil(ms / 86400000);
}

function accountRisk(account: Account): AccountRisk {
  const remaining = daysUntil(account.nearest_expiry);
  if (
    account.identity_relationship_state === 'missing' ||
    account.identity_relationship_state === 'conflict' ||
    account.identity_relationship_state === 'access_disabled'
  ) {
    return 'critical';
  }
  if (account.status === 'suspended') return 'critical';
  if (
    account.coverage_follow_up_required ||
    (account.coverage_state === 'uncovered' && account.site_count > 0) ||
    (account.subscription_count === 0 && account.site_count > 0) ||
    (remaining !== null && remaining >= 0 && remaining <= EXPIRY_ACTION_WINDOW_DAYS)
  ) {
    return 'warning';
  }
  if (account.status !== 'active' || account.site_count === 0) return 'monitor';
  return 'stable';
}

function riskToneClassName(risk: AccountRisk): string {
  if (risk === 'critical') {
    return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-200';
  }
  if (risk === 'warning') {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-200';
  }
  if (risk === 'stable') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-200';
  }
  return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/25 dark:text-blue-200';
}

function normalizeSort(value: string | null): AccountSort {
  return value && ACCOUNT_SORTS.has(value as AccountSort) ? (value as AccountSort) : 'risk';
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
  const appliedStatus = searchParams.get('status') || '';
  const appliedQuery = searchParams.get('q') || '';
  const appliedExpiresBefore = searchParams.get('expires_before') || '';
  const appliedCoverageState = searchParams.get('coverage_state') || '';
  const appliedPackageKind = searchParams.get('package_kind') || '';
  const appliedTopPlanId = searchParams.get('top_plan_id') || '';
  const showInternalAccounts = searchParams.get('internal') === '1';
  const sort = normalizeSort(searchParams.get('sort'));
  const offset = normalizeOffset(searchParams.get('offset'));
  const focusedAccountId = searchParams.get('focus') || '';

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [total, setTotal] = useState(0);
  const [hiddenInternalTotal, setHiddenInternalTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [identityAudit, setIdentityAudit] = useState<IdentityAuditPayload | null>(null);
  const [identityAuditTarget, setIdentityAuditTarget] = useState<Account | null>(null);
  const [identityAuditOpen, setIdentityAuditOpen] = useState(false);
  const [identityAuditLoading, setIdentityAuditLoading] = useState(false);
  const [identityAuditError, setIdentityAuditError] = useState('');
  const [disableAccessOpen, setDisableAccessOpen] = useState(false);
  const [disableAccessTarget, setDisableAccessTarget] = useState<Account | null>(null);
  const [disableReason, setDisableReason] = useState('');
  const [disableError, setDisableError] = useState('');
  const [isDisablingAccess, setIsDisablingAccess] = useState(false);
  const [identityActionReceipt, setIdentityActionReceipt] = useState<{
    accountId: string;
    receipt: AdminMutationReceiptPayload;
  } | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [loadedRequestKey, setLoadedRequestKey] = useState('');
  const [draftFilters, setDraftFilters] = useState({
    q: appliedQuery,
    expires_before: appliedExpiresBefore,
    top_plan_id: appliedTopPlanId,
  });
  const mountedRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const activeRequestKeyRef = useRef('');
  const requestSequenceRef = useRef(0);

  const requestKey = useMemo(() => {
    const params = new URLSearchParams();
    if (appliedQuery.trim()) params.set('q', appliedQuery.trim());
    if (appliedStatus) params.set('status', appliedStatus);
    if (appliedExpiresBefore) params.set('expires_before', appliedExpiresBefore);
    if (appliedCoverageState) params.set('coverage_state', appliedCoverageState);
    if (appliedPackageKind) params.set('package_kind', appliedPackageKind);
    if (appliedTopPlanId) params.set('top_plan_id', appliedTopPlanId);
    if (!showInternalAccounts) params.set('exclude_internal', 'true');
    params.set('sort', sort);
    params.set('limit', String(PAGE_SIZE));
    if (offset > 0) params.set('offset', String(offset));
    return params.toString();
  }, [appliedCoverageState, appliedExpiresBefore, appliedPackageKind, appliedQuery, appliedStatus, appliedTopPlanId, offset, showInternalAccounts, sort]);

  const updateQueueUrl = useCallback((patch: Record<string, string | null>) => {
    const nextParams = new URLSearchParams(searchParamsKey);
    Object.entries(patch).forEach(([key, value]) => {
      const isDefault = (key === 'sort' && value === 'risk') || (key === 'offset' && value === '0');
      if (!value || isDefault) nextParams.delete(key);
      else nextParams.set(key, value);
    });
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [pathname, router, searchParamsKey]);

  const loadAccounts = useCallback(async (force = false) => {
    if (!force && activeRequestKeyRef.current === requestKey) return;
    const sequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = sequence;
    activeRequestKeyRef.current = requestKey;
    setLoadError('');
    if (force || hasLoadedRef.current) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const payload = (await accountsClient.request<AccountsListPayload>(`/api/admin/accounts?${requestKey}`)).data;
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
  }, [requestKey, t]);

  useEffect(() => {
    mountedRef.current = true;
    void loadAccounts();
    return () => {
      mountedRef.current = false;
    };
  }, [loadAccounts]);

  useEffect(() => {
    setDraftFilters({ q: appliedQuery, expires_before: appliedExpiresBefore, top_plan_id: appliedTopPlanId });
  }, [appliedExpiresBefore, appliedQuery, appliedTopPlanId]);

  const visibleAccounts = useMemo(
    () => (showInternalAccounts ? accounts : accounts.filter((account) => !isHiddenByDefaultAccount(account))),
    [accounts, showInternalAccounts]
  );
  const selectedAccount = visibleAccounts.find((account) => account.account_id === focusedAccountId) || visibleAccounts[0] || null;
  const pageSummary = useMemo(() => {
    const summary = { critical: 0, warning: 0, monitor: 0, stable: 0 };
    visibleAccounts.forEach((account) => {
      summary[accountRisk(account)] += 1;
    });
    return summary;
  }, [visibleAccounts]);

  const applyDraftFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateQueueUrl({
      q: draftFilters.q.trim() || null,
      expires_before: draftFilters.expires_before || null,
      top_plan_id: draftFilters.top_plan_id.trim() || null,
      offset: null,
      focus: null,
    });
  };

  const clearFilters = () => {
    setDraftFilters({ q: '', expires_before: '', top_plan_id: '' });
    updateQueueUrl({
      q: null,
      status: null,
      expires_before: null,
      coverage_state: null,
      package_kind: null,
      top_plan_id: null,
      internal: null,
      sort: null,
      offset: null,
      focus: null,
    });
  };

  const handleCreateAccount = async (values: CreateAccountFormValues) => {
    setActionError('');
    try {
      await accountsClient.request<Record<string, unknown>>('/api/admin/accounts', {
        method: 'POST',
        body: buildCreateAccountPayload(values),
      });
      toast.success(
        values.bind_default_free
          ? t('admin.accounts.onboarding_created_notice', {}, 'Customer account created and bound to the Free package.')
          : t('admin.accounts.account_created_notice', {}, 'Account created without automatic subscription coverage.'),
        t('admin.accounts.account_created_title', {}, 'User created')
      );
      setIsCreateOpen(false);
      await loadAccounts(true);
    } catch (err) {
      setActionError(resolveUiErrorMessage(err, t('error.failed_save')));
    }
  };

  const loadIdentityAudit = async (account: Account) => {
    const principalId = account.primary_identity?.principal_id;
    if (!principalId) return;
    setIdentityAudit(null);
    setIdentityAuditError('');
    setIdentityAuditTarget(account);
    setIdentityAuditOpen(true);
    setIdentityAuditLoading(true);
    try {
      const payload = (
        await accountsClient.request<IdentityAuditPayload>(
          `/api/admin/portal-users/${encodeURIComponent(principalId)}/audit?limit=50`
        )
      ).data;
      setIdentityAudit(payload);
    } catch (err) {
      setIdentityAuditError(
        resolveUiErrorMessage(
          err,
          t('admin.accounts.identity_audit_load_failed', {}, 'Failed to load identity audit.')
        )
      );
    } finally {
      setIdentityAuditLoading(false);
    }
  };

  const disableCustomerAccess = async (account: Account) => {
    const principalId = account.primary_identity?.principal_id;
    const reason = disableReason.trim();
    if (!principalId || !reason || isDisablingAccess) return;
    setDisableError('');
    setIsDisablingAccess(true);
    try {
      const payload = (
        await accountsClient.request<IdentityDisablePayload>(
        `/api/admin/portal-users/${encodeURIComponent(principalId)}/disable`,
        {
          method: 'POST',
          body: { reason },
        }
        )
      ).data;
      setIdentityActionReceipt(
        payload.receipt
          ? { accountId: account.account_id, receipt: payload.receipt }
          : null
      );
      toast.success(
        t(
          'admin.accounts.identity_disabled_notice',
          { user: account.primary_identity?.email || principalId },
          '{{user}} access was disabled and active sessions were revoked.'
        ),
        t('admin.accounts.identity_disabled_title', {}, 'Customer access disabled')
      );
      setDisableAccessOpen(false);
      setDisableAccessTarget(null);
      setDisableReason('');
      await loadAccounts(true);
    } catch (err) {
      setDisableError(
        resolveUiErrorMessage(
          err,
          t('admin.accounts.identity_disable_failed', {}, 'Failed to disable customer access.')
        )
      );
    } finally {
      setIsDisablingAccess(false);
    }
  };

  if (loadError && !hasLoaded) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div role="alert" className="max-w-md text-center">
          <h2 className="mb-4 text-2xl font-bold text-rose-600">{t('common.error')}</h2>
          <p className="mb-6 text-slate-600 dark:text-slate-400">{loadError}</p>
          <button type="button" onClick={() => void loadAccounts(true)} className="btn btn-primary">
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }
  if (isLoading && !hasLoaded) return <LoadingFallback />;

  const hasFilters = Boolean(appliedQuery || appliedStatus || appliedExpiresBefore || appliedCoverageState || appliedPackageKind || appliedTopPlanId || showInternalAccounts || sort !== 'risk');
  const isShowingRetainedResults = Boolean(loadError && loadedRequestKey && loadedRequestKey !== requestKey);

  return (
    <BackofficePageStack className="space-y-5">
      <BackofficeLayer
        eyebrow={t('admin.accounts.workspace_eyebrow', {}, 'Customer operations')}
        title={t('admin.accounts.list_title', {}, 'Users')}
        description={t(
          'admin.accounts.workspace_desc',
          {},
          'Prioritize customer coverage and access risk, then open one customer record for commercial, site, credit, or audit work.'
        )}
        actions={(
          <>
            <button type="button" className="btn btn-primary" onClick={() => setIsCreateOpen((value) => !value)}>
              {isCreateOpen ? t('common.close', {}, 'Close') : t('admin.accounts.add_user', {}, 'Add user')}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => void loadAccounts(true)} disabled={isRefreshing}>
              {isRefreshing ? t('common.loading', {}, 'Loading...') : t('admin.accounts.refresh_action', {}, 'Refresh customers')}
            </button>
          </>
        )}
      />

      {loadError ? (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-200 sm:flex-row sm:items-center sm:justify-between">
          <span>
            {loadError}
            {isShowingRetainedResults ? (
              <span className="mt-1 block text-xs">
                {t('admin.accounts.retained_results_notice', {}, 'Showing the last successfully loaded page; it may not match the current filters.')}
              </span>
            ) : null}
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadAccounts(true)}>
            {t('common.retry')}
          </button>
        </div>
      ) : null}

      <BackofficeSummaryStrip
        items={[
          { label: t('admin.accounts.page_critical_metric', {}, 'Page critical'), value: formatInteger(pageSummary.critical), toneClassName: pageSummary.critical ? 'text-rose-600 dark:text-rose-300' : undefined },
          { label: t('admin.accounts.page_warning_metric', {}, 'Page warning'), value: formatInteger(pageSummary.warning), toneClassName: pageSummary.warning ? 'text-amber-600 dark:text-amber-300' : undefined },
          { label: t('admin.accounts.page_monitor_metric', {}, 'Page monitor'), value: formatInteger(pageSummary.monitor) },
          { label: t('admin.accounts.page_stable_metric', {}, 'Page stable'), value: formatInteger(pageSummary.stable) },
          { label: t('common.updated_at', {}, 'Updated'), value: loadedAt ? formatDate(loadedAt.toISOString()) : t('common.unknown', {}, 'Unknown') },
        ]}
      />

      {isCreateOpen ? (
        <BackofficeSectionPanel className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {t('admin.accounts.create_eyebrow', {}, 'Create customer')}
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">
              {t('admin.accounts.create_customer_account', {}, 'Create customer account')}
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {t('admin.accounts.create_desc', {}, 'Create one customer account, its owner login identity, and optional Free package in one audited service-plane action.')}
            </p>
          </div>
          <CreateAccountForm
            actionError={actionError}
            onSubmit={handleCreateAccount}
          />
        </BackofficeSectionPanel>
      ) : null}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(20rem,0.72fr)]">
        <BackofficeSectionPanel className="overflow-hidden p-0">
          <div className="space-y-4 border-b border-slate-200/80 px-5 py-5 dark:border-slate-800 md:px-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
                  {t('admin.accounts.table_title', {}, 'Users and current packages')}
                </h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {t('admin.accounts.queue_desc_v2', {}, 'Service filters and risk ordering are applied before pagination by the customer service API.')}
                </p>
              </div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400" role="status">
                {t('admin.accounts.result_count', { visible: formatInteger(visibleAccounts.length), total: formatInteger(total) }, `${formatInteger(visibleAccounts.length)} on this page · ${formatInteger(total)} total`)}
              </p>
            </div>

            <div className="flex flex-wrap gap-2" aria-label={t('admin.accounts.status_filter_label', {}, 'Customer status')}>
              {['', 'active', 'inactive', 'suspended'].map((status) => (
                <button
                  key={status || 'all'}
                  type="button"
                  aria-pressed={appliedStatus === status}
                  onClick={() => updateQueueUrl({ status: status || null, offset: null, focus: null })}
                  className={cn(
                    'cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition',
                    appliedStatus === status
                      ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200'
                      : 'border-slate-200/80 bg-white/80 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-slate-600'
                  )}
                >
                  {status ? t(`status.${status}`, undefined, status) : t('common.all', {}, 'All')}
                </button>
              ))}
            </div>

            <form onSubmit={applyDraftFilters} className="grid gap-3 md:grid-cols-2 2xl:grid-cols-[minmax(12rem,1.15fr)_minmax(9rem,0.72fr)_minmax(9rem,0.72fr)_minmax(9rem,0.72fr)_auto]">
              <label className="text-sm text-slate-700 dark:text-slate-200">
                <span className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">{t('admin.accounts.search_label', {}, 'Search')}</span>
                <input type="search" value={draftFilters.q} onChange={(event) => setDraftFilters((current) => ({ ...current, q: event.target.value }))} placeholder={t('admin.accounts.search_placeholder', {}, 'Name, email, account ID, package, or note')} className="input w-full" />
              </label>
              <label className="text-sm text-slate-700 dark:text-slate-200">
                <span className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">{t('admin.coverage_state', {}, 'Coverage state')}</span>
                <select value={appliedCoverageState} onChange={(event) => updateQueueUrl({ coverage_state: event.target.value || null, offset: null, focus: null })} className="input w-full">
                  <option value="">{t('common.all')}</option>
                  <option value="covered">{t('admin.coverage_state_covered', {}, 'Covered')}</option>
                  <option value="uncovered">{t('admin.coverage_state_uncovered', {}, 'Uncovered')}</option>
                </select>
              </label>
              <label className="text-sm text-slate-700 dark:text-slate-200">
                <span className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">{t('admin.package_kind', {}, 'Package kind')}</span>
                <select value={appliedPackageKind} onChange={(event) => updateQueueUrl({ package_kind: event.target.value || null, offset: null, focus: null })} className="input w-full">
                  <option value="">{t('common.all')}</option>
                  <option value="formal_free">{t('admin.plan_package_alias_free', {}, 'Free')}</option>
                  <option value="tier_package">{t('admin.tier_template_binding', {}, 'Tier-bound plan')}</option>
                </select>
              </label>
              <label className="text-sm text-slate-700 dark:text-slate-200">
                <span className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">{t('admin.accounts.sort_label', {}, 'Sort')}</span>
                <select value={sort} onChange={(event) => updateQueueUrl({ sort: normalizeSort(event.target.value), offset: null, focus: null })} className="input w-full">
                  <option value="risk">{t('admin.accounts.sort_risk', {}, 'Highest risk')}</option>
                  <option value="display_name">{t('admin.accounts.sort_name', {}, 'Customer name')}</option>
                  <option value="created_at">{t('admin.accounts.sort_created', {}, 'Recently created')}</option>
                </select>
              </label>
              <div className="flex items-end gap-2 md:col-span-2 2xl:col-span-1">
                <button type="submit" className="btn btn-primary flex-1 2xl:flex-none">{t('admin.accounts.apply_filters', {}, 'Apply')}</button>
                <button type="button" className="btn btn-secondary flex-1 2xl:flex-none" disabled={!hasFilters && !draftFilters.q && !draftFilters.expires_before && !draftFilters.top_plan_id} onClick={clearFilters}>
                  {t('common.clear_filters', {}, 'Clear filters')}
                </button>
              </div>
            </form>

            <details>
              <summary className="cursor-pointer text-sm font-medium text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white">
                {t('admin.accounts.more_filters', {}, 'More filters')}
              </summary>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <label className="text-sm">
                  <span className="mb-2 block font-medium text-slate-700 dark:text-slate-300">{t('admin.expires_before')}</span>
                  <input type="date" value={draftFilters.expires_before} onChange={(event) => setDraftFilters((current) => ({ ...current, expires_before: event.target.value }))} className="input w-full" />
                </label>
                <label className="text-sm">
                  <span className="mb-2 block font-medium text-slate-700 dark:text-slate-300">{t('admin.top_plan', {}, 'Top plan')}</span>
                  <input type="text" value={draftFilters.top_plan_id} onChange={(event) => setDraftFilters((current) => ({ ...current, top_plan_id: event.target.value }))} placeholder="free" className="input w-full" />
                </label>
              </div>
            </details>

            {hiddenInternalTotal > 0 ? (
              <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300 sm:flex-row sm:items-center sm:justify-between">
                <span>{t('admin.accounts.hidden_internal_records_note', { count: formatInteger(hiddenInternalTotal) }, `${formatInteger(hiddenInternalTotal)} smoke or malformed records are hidden by default.`)}</span>
                <button type="button" className="btn btn-secondary btn-sm self-start sm:self-auto" onClick={() => updateQueueUrl({ internal: showInternalAccounts ? null : '1', offset: null, focus: null })}>
                  {showInternalAccounts ? t('admin.accounts.hide_internal_records', {}, 'Hide test records') : t('admin.accounts.show_internal_records', { count: formatInteger(hiddenInternalTotal) }, `Show test records (${formatInteger(hiddenInternalTotal)})`)}
                </button>
              </div>
            ) : null}
          </div>

          {visibleAccounts.length ? (
            <div role="list" aria-label={t('admin.accounts.table_region_label', {}, 'Customer list')}>
              {visibleAccounts.map((account) => {
                const risk = accountRisk(account);
                const remaining = daysUntil(account.nearest_expiry);
                const isSelected = selectedAccount?.account_id === account.account_id;
                const riskReason =
                  account.identity_relationship_state === 'missing'
                    ? t('admin.accounts.reason_identity_missing', {}, 'This customer has no login identity and requires repair.')
                    : account.identity_relationship_state === 'conflict'
                      ? t('admin.accounts.reason_identity_conflict', {}, 'This customer has conflicting identity memberships and requires repair.')
                      : account.identity_relationship_state === 'access_disabled'
                        ? t('admin.accounts.reason_identity_disabled', {}, 'The customer login identity or owner membership is disabled.')
                  : account.status === 'suspended'
                    ? t('admin.accounts.reason_suspended', {}, 'Customer access is suspended and requires an operator decision.')
                    : account.coverage_follow_up_required || (account.coverage_state === 'uncovered' && account.site_count > 0)
                      ? t('admin.accounts.reason_uncovered', {}, 'This customer has site footprint without active package coverage.')
                      : account.subscription_count === 0 && account.site_count > 0
                        ? t('admin.accounts.reason_no_subscription', {}, 'Sites exist but no active subscription is carrying service coverage.')
                        : remaining !== null && remaining >= 0 && remaining <= EXPIRY_ACTION_WINDOW_DAYS
                          ? t('admin.accounts.reason_expiring', {}, 'The nearest subscription period ends within 14 days.')
                          : account.site_count === 0
                            ? t('admin.accounts.reason_no_sites', {}, 'The customer record has no connected site footprint yet.')
                            : t('admin.accounts.reason_stable', {}, 'Customer access, package coverage, and site footprint are currently stable.');
                return (
                  <article
                    key={account.account_id}
                    role="listitem"
                    data-ui="account-queue-item"
                    className={cn(
                      'grid gap-4 border-b border-slate-200/80 px-5 py-5 transition last:border-b-0 dark:border-slate-800 md:grid-cols-[minmax(10rem,0.85fr)_minmax(13rem,1.15fr)] md:items-center md:px-6 2xl:grid-cols-[minmax(11rem,1fr)_minmax(13rem,1.3fr)_minmax(9rem,0.8fr)_auto]',
                      isSelected ? 'bg-blue-50/65 dark:bg-blue-950/15' : 'hover:bg-slate-50/70 dark:hover:bg-slate-950/35'
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-semibold text-slate-950 dark:text-white">{account.display_name}</h3>
                        {account.status !== 'active' ? <BackofficeStatusBadge status={account.status} label={t(`status.${account.status}`, undefined, account.status)} /> : null}
                      </div>
                      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400"><BackofficeIdentifier value={account.account_id} /></div>
                      <p className="mt-1 truncate text-xs text-slate-600 dark:text-slate-300">
                        {account.primary_identity?.email || t('admin.accounts.identity_missing_label', {}, 'Login identity missing')}
                      </p>
                      {account.operator_note ? <p className="mt-2 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">{account.operator_note}</p> : null}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold', riskToneClassName(risk))}>{t(`admin.accounts.risk_${risk}`, undefined, risk)}</span>
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{account.display_package_label}</span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{riskReason}</p>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-slate-600 dark:text-slate-300 lg:grid-cols-1">
                      <div className="flex justify-between gap-3"><dt>{t('common.sites', {}, 'Sites')}</dt><dd className="font-semibold tabular-nums text-slate-950 dark:text-white">{formatInteger(account.site_count)}</dd></div>
                      <div className="flex justify-between gap-3"><dt>{t('common.subscriptions', {}, 'Subscriptions')}</dt><dd className="font-semibold tabular-nums text-slate-950 dark:text-white">{formatInteger(account.subscription_count)}</dd></div>
                      <div className="flex justify-between gap-3"><dt>{t('admin.coverage_state', {}, 'Coverage')}</dt><dd className="font-semibold text-slate-950 dark:text-white">{translateCoverageStateLabel(t, account.coverage_state)}</dd></div>
                      <div className="flex justify-between gap-3"><dt>{t('admin.nearest_expiry')}</dt><dd className="font-semibold text-slate-950 dark:text-white">{remaining === null ? t('common.not_available', {}, 'N/A') : remaining >= 0 ? t('admin.days_until_end', { days: String(remaining) }) : t('admin.accounts.days_past_end', { days: String(Math.abs(remaining)) }, `${Math.abs(remaining)} days past end`)}</dd></div>
                    </dl>
                    <div className="flex flex-wrap gap-2 md:justify-end">
                      <button type="button" className="btn btn-secondary btn-sm" aria-pressed={isSelected} aria-controls="account-inspector" onClick={() => updateQueueUrl({ focus: account.account_id })}>{t('admin.accounts.inspect_action', {}, 'Inspect')}</button>
                      <Link href={`/admin/accounts/${account.account_id}`} className="btn btn-primary btn-sm whitespace-nowrap">{t('common.details', {}, 'Details')}</Link>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <BackofficeEmptyState
              className="m-5 md:m-6"
              title={t('admin.accounts.no_match_title', {}, 'No customers match these filters')}
              description={t('admin.accounts.no_match_desc', {}, 'Clear or adjust the customer, package, coverage, status, and expiry filters. No customer record has been changed.')}
              action={hasFilters ? <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>{t('common.clear_filters', {}, 'Clear filters')}</button> : null}
            />
          )}

          <ListPagination offset={offset} limit={PAGE_SIZE} total={total} isLoading={isRefreshing} onOffsetChange={(nextOffset) => updateQueueUrl({ offset: String(nextOffset), focus: null })} />
        </BackofficeSectionPanel>

        <aside id="account-inspector" className="xl:sticky xl:top-24" aria-live="polite">
          <BackofficeSectionPanel className="space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{t('admin.accounts.inspector_eyebrow', {}, 'Inspector')}</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">{t('admin.accounts.inspector_title', {}, 'Current customer focus')}</h2>
              </div>
              {selectedAccount ? <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold', riskToneClassName(accountRisk(selectedAccount)))}>{t(`admin.accounts.risk_${accountRisk(selectedAccount)}`, undefined, accountRisk(selectedAccount))}</span> : null}
            </div>
            {selectedAccount ? (
              <div className="space-y-5">
                <div>
                  <p className="text-base font-semibold text-slate-950 dark:text-white">{selectedAccount.display_name}</p>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400"><BackofficeIdentifier value={selectedAccount.account_id} full /></div>
                </div>
                <dl className="grid gap-2 text-sm text-slate-600 dark:text-slate-300">
                  {[
                    [t('common.status'), t(`status.${selectedAccount.status}`, undefined, selectedAccount.status)],
                    [t('admin.accounts.login_email_label', {}, 'Login email'), selectedAccount.primary_identity?.email || t('admin.accounts.identity_missing_label', {}, 'Login identity missing')],
                    [t('admin.accounts.identity_status_label', {}, 'Login access'), selectedAccount.identity_relationship_state === 'healthy' ? t('admin.accounts.identity_healthy_label', {}, 'Active owner') : t(`admin.accounts.identity_${selectedAccount.identity_relationship_state}`, undefined, selectedAccount.identity_relationship_state)],
                    [t('admin.accounts.last_login_label', {}, 'Last login'), selectedAccount.primary_identity?.last_login_at ? formatDate(selectedAccount.primary_identity.last_login_at) : t('common.not_available', {}, 'N/A')],
                    ['QQ', selectedAccount.primary_identity?.qq_bound ? t('admin.accounts.qq_bound_label', {}, 'Bound') : t('admin.accounts.qq_unbound_label', {}, 'Not bound')],
                    [t('common.package', {}, 'Package'), selectedAccount.display_package_label],
                    [t('admin.package_kind', {}, 'Package kind'), translatePackageKindLabel(t, selectedAccount.package_kind)],
                    [t('admin.coverage_state', {}, 'Coverage'), translateCoverageStateLabel(t, selectedAccount.coverage_state)],
                    [t('common.sites', {}, 'Sites'), formatInteger(selectedAccount.site_count)],
                    [t('common.subscriptions', {}, 'Subscriptions'), formatInteger(selectedAccount.subscription_count)],
                    [t('admin.nearest_expiry'), selectedAccount.nearest_expiry ? formatDate(selectedAccount.nearest_expiry) : t('common.not_available', {}, 'N/A')],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4 border-b border-slate-200/70 pb-2 last:border-b-0 dark:border-slate-800"><dt>{label}</dt><dd className="text-right font-semibold text-slate-950 dark:text-white">{value}</dd></div>
                  ))}
                </dl>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/admin/accounts/${selectedAccount.account_id}`} className="btn btn-primary btn-sm">{t('common.details', {}, 'Details')}</Link>
                  <Link href={`/admin/coverage?q=${encodeURIComponent(selectedAccount.account_id)}`} className="btn btn-secondary btn-sm">{t('admin.accounts.open_service_status_action', {}, 'Open service status')}</Link>
                  {selectedAccount.primary_identity ? (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadIdentityAudit(selectedAccount)}>
                      {t('admin.accounts.identity_audit_action', {}, 'Identity audit')}
                    </button>
                  ) : null}
                </div>
                {(selectedAccount.operator_note || selectedAccount.account_status_note) ? (
                  <details className="border-t border-slate-200/80 pt-4 text-sm dark:border-slate-800">
                    <summary className="cursor-pointer font-semibold text-slate-800 dark:text-slate-100">{t('admin.accounts.internal_context_title', {}, 'Internal context')}</summary>
                    <div className="mt-3 space-y-2 text-slate-600 dark:text-slate-300">
                      {selectedAccount.operator_note ? <p>{selectedAccount.operator_note}</p> : null}
                      {selectedAccount.account_status_note ? <p>{selectedAccount.account_status_note}</p> : null}
                    </div>
                  </details>
                ) : null}
                <details className="border-t border-slate-200/80 pt-4 text-sm dark:border-slate-800">
                  <summary className="cursor-pointer font-semibold text-slate-800 dark:text-slate-100">{t('admin.accounts.related_surfaces_title', {}, 'Related surfaces')}</summary>
                  <div className="mt-3 flex flex-col items-start gap-2">
                    <Link href="/admin/subscriptions" className="text-blue-700 hover:underline dark:text-blue-300">{t('admin.coverage_open_subscription_queue_action', {}, 'Open subscription risk')}</Link>
                  </div>
                </details>
                {selectedAccount.primary_identity?.status === 'active' ? (
                  <details className="border-t border-rose-200/80 pt-4 text-sm dark:border-rose-900/50">
                    <summary className="cursor-pointer font-semibold text-rose-700 dark:text-rose-300">
                      {t('admin.accounts.access_actions_title', {}, 'Access actions')}
                    </summary>
                    <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      {t('admin.accounts.disable_access_boundary', {}, 'Disabling access revokes login sessions, the owner membership, and QQ quick-login bindings. It does not delete the customer account.')}
                    </p>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm mt-3"
                      onClick={() => {
                        setDisableError('');
                        setDisableReason('');
                        setDisableAccessTarget(selectedAccount);
                        setDisableAccessOpen(true);
                      }}
                    >
                      {t('admin.accounts.disable_access_action', {}, 'Disable login access')}
                    </button>
                  </details>
                ) : null}
                <AdminMutationReceipt
                  receipt={
                    identityActionReceipt?.accountId === selectedAccount.account_id
                      ? identityActionReceipt.receipt
                      : null
                  }
                />
                <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{t('admin.accounts.inspector_boundary', {}, 'Customer account, login identity, owner membership, service coverage, and audit context are projected here. Payment, entitlement, and WordPress writes remain outside this surface.')}</p>
              </div>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-300">{t('admin.accounts.inspector_empty', {}, 'No customer is visible on this page.')}</p>
            )}
          </BackofficeSectionPanel>
        </aside>
      </div>

      <Modal
        isOpen={identityAuditOpen}
        onClose={() => {
          setIdentityAuditOpen(false);
          setIdentityAuditTarget(null);
        }}
        title={t('admin.accounts.identity_audit_title', {}, 'Identity audit')}
        description={identityAuditTarget?.primary_identity?.email || identityAuditTarget?.primary_identity?.principal_id}
        size="lg"
      >
        {identityAuditLoading ? (
          <LoadingFallback />
        ) : identityAuditError ? (
          <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{identityAuditError}</p>
        ) : (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {[
                [t('admin.accounts.audit_events_label', {}, 'Events'), String(identityAudit?.summary?.events || 0)],
                [t('admin.accounts.audit_registration_label', {}, 'Registrations'), String(identityAudit?.summary?.registration_events || 0)],
                [t('admin.accounts.audit_disable_label', {}, 'Disables'), String(identityAudit?.summary?.disable_events || 0)],
                [t('admin.accounts.audit_failed_label', {}, 'Failed'), String(identityAudit?.summary?.failed || 0)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800">
                  <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
                  <dd className="mt-1 font-semibold text-slate-950 dark:text-white">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="space-y-2">
              {(identityAudit?.items || []).length ? (identityAudit?.items || []).map((event) => (
                <div key={event.event_id} className="flex items-center justify-between gap-4 border-b border-slate-200/70 pb-2 text-sm last:border-b-0 dark:border-slate-800">
                  <div>
                    <p className="font-medium text-slate-950 dark:text-white">{event.event_kind}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{event.created_at ? formatDate(event.created_at) : t('common.unknown', {}, 'Unknown')}</p>
                  </div>
                  <BackofficeStatusBadge status={event.outcome} label={event.outcome} />
                </div>
              )) : (
                <p className="text-sm text-slate-600 dark:text-slate-300">{t('admin.accounts.no_identity_audit_events', {}, 'No identity audit events are recorded.')}</p>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={disableAccessOpen}
        onClose={() => {
          if (!isDisablingAccess) {
            setDisableAccessOpen(false);
            setDisableAccessTarget(null);
          }
        }}
        closeOnOverlay={!isDisablingAccess}
        showCloseButton={!isDisablingAccess}
        title={t('admin.accounts.disable_access_title', {}, 'Disable customer login access')}
        description={disableAccessTarget?.primary_identity?.email || disableAccessTarget?.primary_identity?.principal_id}
        footer={(
          <>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={isDisablingAccess}
              onClick={() => {
                setDisableAccessOpen(false);
                setDisableAccessTarget(null);
              }}
            >
              {t('common.cancel', {}, 'Cancel')}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={isDisablingAccess || !disableReason.trim() || !disableAccessTarget}
              onClick={() => {
                if (disableAccessTarget) void disableCustomerAccess(disableAccessTarget);
              }}
            >
              {isDisablingAccess ? t('common.saving', {}, 'Saving...') : t('admin.accounts.confirm_disable_access', {}, 'Confirm disable')}
            </button>
          </>
        )}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {t('admin.accounts.disable_access_desc', {}, 'This immediately invalidates customer sessions and revokes active owner and QQ access. The customer account and commercial records remain intact.')}
          </p>
          <label className="block text-sm">
            <span className="mb-2 block font-medium text-slate-700 dark:text-slate-300">{t('admin.accounts.disable_reason_label', {}, 'Reason')}</span>
            <textarea
              value={disableReason}
              onChange={(event) => {
                setDisableReason(event.target.value);
                if (disableError) setDisableError('');
              }}
              className="input min-h-24 w-full"
              maxLength={500}
              disabled={isDisablingAccess}
            />
          </label>
          {disableError ? <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{disableError}</p> : null}
        </div>
      </Modal>
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
