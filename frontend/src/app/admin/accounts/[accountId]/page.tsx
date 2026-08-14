'use client';

import React, { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import Link from 'next/link';
import { AdminMutationReceipt, type AdminMutationReceiptPayload } from '@/components/admin/AdminMutationReceipt';
import { AdminAuditSummaryPanel } from '@/components/admin/AdminAuditSummaryPanel';
import { AdminDataTableFrame } from '@/components/admin/AdminDataTableFrame';
import { AdminInspectorDrawer } from '@/components/admin/AdminInspectorDrawer';
import { AdminRouteSkeleton } from '@/components/admin/AdminRouteSkeleton';
import { AdminWorkbenchDialog } from '@/components/admin/AdminWorkbenchDialog';
import { LoadingFallback } from '@/components/ui/LoadingFallback';
import { useParams, useSearchParams } from 'next/navigation';
import { BackofficeIdentifier } from '@/components/backoffice/BackofficeIdentifier';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';
import { ConfirmModal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import {
  BackofficeEmptyState,
  BackofficeDiagnosticNotice,
  BackofficeMetricStrip,
  BackofficePageHeader,
  BackofficePageStack,
  BackofficePrimaryPanel,
  BackofficeSectionPanel,
  BackofficeStackCard,
} from '@/components/backoffice/BackofficeScaffold';
import { useLocale } from '@/contexts/LocaleContext';
import {
  resolveCustomerPackageDisplay,
  translateCoverageStateLabel,
  translatePackageKindLabel,
  type CoverageState,
  type PackageKind,
} from '@/lib/customer-package-display';
import {
  useAccountSiteRuntime,
} from '@/features/admin/accounts/account-site-runtime';
import {
  useAccountCreditEvidence,
  type AccountCreditLedgerEntry,
  type AccountQuotaMetric,
} from '@/features/admin/accounts/account-credit-evidence';
import {
  creditBreakdownLabel,
  formatSignedCreditDelta,
  formatUsageRatio,
  metricToBudgetSummary,
  quotaMetricLabel,
  quotaMetricToneClass,
  quotaToneClass,
  summarizeBudget,
} from '@/features/admin/accounts/account-credit-presentation';
import { AccountOperatorProfileEditor } from '@/features/admin/accounts/AccountOperatorProfileEditor';
import {
  CustomerAccessPanel,
  type CustomerIdentityRelationshipState,
  type CustomerPrimaryIdentity,
} from '@/features/admin/accounts/CustomerAccessPanel';
import {
  accountDetailClient,
  useAccountOperatorProfile,
  type SavedAccountOperatorProfile,
} from '@/features/admin/accounts/account-operator-profile';
import { localizePackageAlias } from '@/lib/admin-plan-copy';
import { formatAdminCurrency } from '@/lib/currency';
import { cn, formatDate, formatNumber as formatInteger } from '@/lib/utils';
import { ApiError, resolveUiErrorMessage } from '@/lib/errors';
import { translateStatusLabel } from '@/lib/status-display';
import {
  ADMIN_QUEUE_PATHNAMES,
  ADMIN_RETURN_TO_PARAM,
  buildAdminAccountDetailPathname,
  buildAdminAccountSiteReturnTo,
  buildAdminNestedDetailHref,
  normalizeAdminReturnTo,
} from '@/lib/admin-return-context';

const ACCOUNTS_RETURN_CONTEXT_POLICY = {
  allowedPathnames: [ADMIN_QUEUE_PATHNAMES.accounts],
  fallback: ADMIN_QUEUE_PATHNAMES.accounts,
} as const;

interface AccountDetail {
  account_id: string;
  name: string;
  operator_display_name: string;
  operator_note: string;
  account_status_note: string;
  account_status_updated_at: string;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
  site_count: number;
  subscription_count: number;
  subscriptions: Array<{
    subscription_id: string;
    status: string;
    plan_id: string;
    plan_version_id?: string;
    current_period_start?: string;
    current_period_end: string;
    package_alias?: string;
    plan_kind?: string;
    display_package_label?: string;
    package_kind?: PackageKind;
    coverage_state?: CoverageState;
  }>;
  sites?: Array<{
    site_id: string;
    status?: string;
    name?: string;
  }>;
  primary_identity: CustomerPrimaryIdentity | null;
  identity_relationship_state: CustomerIdentityRelationshipState;
}

interface PackagePlanListItem {
  plan?: {
    plan_id?: string;
    name?: string;
    metadata?: Record<string, unknown>;
  };
  latest_version?: {
    plan_version_id?: string;
  } | null;
  tier_summary?: {
    package_alias?: string;
  } | null;
}

type QuickPackageOption = {
  tier_id: 'free' | 'pro' | 'plus' | 'agency';
  plan_id: string;
  plan_version_id: string;
};

type AccountDetailDrawer =
  | 'package'
  | 'agency'
  | 'credit-ledger'
  | 'subscription-repair'
  | null;

type QuotaDetailTab = 'resources' | 'components' | 'advanced';

const QUICK_PACKAGE_OPTIONS: QuickPackageOption[] = [
  { tier_id: 'free', plan_id: 'free', plan_version_id: 'free_v1' },
  { tier_id: 'plus', plan_id: 'plus', plan_version_id: 'plus_v1' },
  { tier_id: 'pro', plan_id: 'pro', plan_version_id: 'pro_v1' },
  { tier_id: 'agency', plan_id: 'agency', plan_version_id: 'agency_v1' },
];

type TopUpPackOption = {
  pack_id: 'pack_small' | 'pack_medium' | 'pack_large';
  label_key: string;
  fallback_label: string;
  points_label: string;
  ai_credits_increment: number;
  runs_increment: number;
  tokens_increment: number;
  cost_cny_increment: number;
  recommended_for_tiers: Array<'free' | 'pro' | 'plus' | 'agency'>;
};

const TOPUP_PACK_OPTIONS: TopUpPackOption[] = [
  {
    pack_id: 'pack_small',
    label_key: 'admin.account_detail.topup_pack_small',
    fallback_label: 'Small top-up',
    points_label: '10,000 points',
    ai_credits_increment: 10000,
    runs_increment: 10000,
    tokens_increment: 2000000,
    cost_cny_increment: 99,
    recommended_for_tiers: ['free', 'plus'],
  },
  {
    pack_id: 'pack_medium',
    label_key: 'admin.account_detail.topup_pack_medium',
    fallback_label: 'Medium top-up',
    points_label: '35,000 points',
    ai_credits_increment: 35000,
    runs_increment: 35000,
    tokens_increment: 7000000,
    cost_cny_increment: 349,
    recommended_for_tiers: ['pro', 'agency'],
  },
  {
    pack_id: 'pack_large',
    label_key: 'admin.account_detail.topup_pack_large',
    fallback_label: 'Large top-up',
    points_label: '150,000 points',
    ai_credits_increment: 150000,
    runs_increment: 150000,
    tokens_increment: 30000000,
    cost_cny_increment: 1499,
    recommended_for_tiers: ['agency'],
  },
];

const ACCOUNT_DETAIL_COMPARISON_TABLE_CLASS_NAME = 'w-full min-w-[48rem] text-left text-sm';

type AccountDetailApiPayload = {
  account?: {
    account_id?: string;
    name?: string;
    status?: string;
    metadata?: Record<string, unknown>;
    created_at?: string;
  };
  sites?: Array<{ site_id?: string; status?: string; name?: string }>;
  subscriptions?: Array<
    { subscription?: Record<string, unknown> } | Record<string, unknown>
  >;
  primary_identity?: Partial<CustomerPrimaryIdentity> | null;
  identity_relationship_state?: CustomerIdentityRelationshipState;
};

type AdminMutationPayload = {
  receipt?: AdminMutationReceiptPayload | null;
  status?: string;
  metadata?: Record<string, unknown>;
};

type PendingConfirmation = {
  title: string;
  message: string;
  confirmLabel: string;
  showSuspendReason?: boolean;
  variant?: 'default' | 'danger';
  onConfirm: () => void;
};

type AccountDetailTab = 'overview' | 'commercial' | 'credits' | 'sites' | 'access' | 'audit';

function selectPrimarySubscription(account: AccountDetail | null): AccountDetail['subscriptions'][number] | null {
  if (!account?.subscriptions.length) {
    return null;
  }
  return (
    account.subscriptions.find((subscription) =>
      ['active', 'trialing', 'past_due', 'suspended'].includes(subscription.status)
    ) || account.subscriptions[0]
  );
}

const MALFORMED_ACCOUNT_TEXT_RE = /Fatal error|Stack trace|Command line code|Uncaught ValueError|Path must not be empty/i;

function prettifyAccountId(accountId: string): string {
  if (MALFORMED_ACCOUNT_TEXT_RE.test(accountId)) {
    return '';
  }
  const stripped = accountId
    .replace(/^acct[_-]?/i, '')
    .replace(/^site[_-]?/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  if (!stripped) {
    return accountId;
  }
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

function resolveAccountTitle(
  account: AccountDetail,
  t: (key: string, vars?: Record<string, string>, fallback?: string) => string
): string {
  if (account.operator_display_name.trim()) {
    return account.operator_display_name.trim();
  }
  const rawName = account.name.trim();
  const isRawName =
    !rawName ||
    rawName === account.account_id ||
    /^acct[_-]/i.test(rawName) ||
    MALFORMED_ACCOUNT_TEXT_RE.test(rawName);
  if (!isRawName) {
    return rawName;
  }
  if (MALFORMED_ACCOUNT_TEXT_RE.test(`${account.account_id} ${rawName}`)) {
    return t('admin.accounts.malformed_account_label', undefined, 'Malformed account record');
  }
  return prettifyAccountId(account.account_id) || account.account_id;
}

function AccountDetailContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { t } = useLocale();
  const { success: showSuccessToast } = useToast();
  const { accountId } = params as { accountId: string };
  const returnTo = normalizeAdminReturnTo(
    searchParams.get(ADMIN_RETURN_TO_PARAM),
    ACCOUNTS_RETURN_CONTEXT_POLICY
  );
  
  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [accountStatusNotice, setAccountStatusNotice] = useState<string | null>(null);
  const [accountStatusError, setAccountStatusError] = useState<string | null>(null);
  const [accountStatusReceipt, setAccountStatusReceipt] = useState<AdminMutationReceiptPayload | null>(null);
  const [accountStatusPending, setAccountStatusPending] = useState<'suspend' | 'restore' | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [packageForm, setPackageForm] = useState({
    subscription_id: '',
    plan_id: '',
    plan_version_id: '',
    status: 'active',
    current_period_start_at: '',
    current_period_end_at: '',
  });
  const [packageActionNotice, setPackageActionNotice] = useState<string | null>(null);
  const [packageActionError, setPackageActionError] = useState<string | null>(null);
  const [packageActionReceipt, setPackageActionReceipt] = useState<AdminMutationReceiptPayload | null>(null);
  const [packageActionPending, setPackageActionPending] = useState<'change' | 'suspend' | 'cancel' | null>(null);
  const [topUpActionPending, setTopUpActionPending] = useState<string | null>(null);
  const [topUpDialogOpen, setTopUpDialogOpen] = useState(false);
  const [selectedTopUpPackId, setSelectedTopUpPackId] = useState<TopUpPackOption['pack_id'] | null>(null);
  const [agencyForm, setAgencyForm] = useState({
    amount_cny: '499',
    valid_days: '7',
    trial_ai_credit_limit: '20000',
  });
  const [agencyActionPending, setAgencyActionPending] = useState<'quote' | 'trial' | null>(null);
  const [agencyActionNotice, setAgencyActionNotice] = useState<string | null>(null);
  const [agencyActionError, setAgencyActionError] = useState<string | null>(null);
  const [creditAdjustmentForm, setCreditAdjustmentForm] = useState({
    event_type: 'grant',
    ai_credit_delta: '',
    reason: '',
    note: '',
  });
  const [creditAdjustmentPending, setCreditAdjustmentPending] = useState(false);
  const [creditAdjustmentOpen, setCreditAdjustmentOpen] = useState(false);
  const [quotaDetailsOpen, setQuotaDetailsOpen] = useState(false);
  const [quotaDetailTab, setQuotaDetailTab] = useState<QuotaDetailTab>('resources');
  const [activeDrawer, setActiveDrawer] = useState<AccountDetailDrawer>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [packagePlans, setPackagePlans] = useState<PackagePlanListItem[]>([]);
  const [nowMs] = useState(() => Date.now());
  const [activeDetailTab, setActiveDetailTab] = useState<AccountDetailTab>('overview');
  const accountRequestedRef = useRef(false);
  const packagePlansRequestedRef = useRef(false);
  const accountSiteIds =
    account?.sites?.map((site) => site.site_id).filter(Boolean) || [];
  const siteRuntimeQuery = useAccountSiteRuntime(
    accountId,
    accountSiteIds,
    activeDetailTab === 'audit'
  );
  const creditEvidenceQuery = useAccountCreditEvidence(
    accountId,
    activeDetailTab === 'credits'
  );
  const quotaSummary = creditEvidenceQuery.quotaSummary;
  const creditLedger = creditEvidenceQuery.creditLedger;
  const creditEvidencePending =
    activeDetailTab === 'credits' &&
    (creditEvidenceQuery.quotaQuery.isPending ||
      creditEvidenceQuery.ledgerQuery.isPending);
  const creditEvidenceError =
    creditEvidenceQuery.quotaQuery.isError ||
    creditEvidenceQuery.ledgerQuery.isError;
  const creditEvidenceReady =
    Boolean(quotaSummary) && Boolean(creditLedger) && !creditEvidenceError;
  const siteRuntimeData = siteRuntimeQuery.isError
    ? {}
    : siteRuntimeQuery.data?.items || {};
  const failedSiteRuntimeIds = siteRuntimeQuery.data?.failedSiteIds || [];
  const siteRuntimeEvidenceComplete =
    Boolean(siteRuntimeQuery.data) &&
    !siteRuntimeQuery.isError &&
    failedSiteRuntimeIds.length === 0;
  const handleOperatorProfileSaved = useCallback(
    (profile: SavedAccountOperatorProfile) => {
      setAccount((current) =>
        current
          ? {
              ...current,
              ...profile,
            }
          : current
      );
    },
    []
  );
  const operatorProfileController = useAccountOperatorProfile({
    account,
    errorFallback: t('error.failed_save'),
    savedNotice: t(
      'admin.account_detail.operator_profile_saved_notice',
      undefined,
      'Operator note has been saved.'
    ),
    onSaved: handleOperatorProfileSaved,
  });

  const loadPackagePlans = useCallback(async (force = false) => {
    if (!force && packagePlansRequestedRef.current) {
      return;
    }
    packagePlansRequestedRef.current = true;
    try {
      const payload = (await accountDetailClient.request<{ items?: PackagePlanListItem[] }>(
        '/api/admin/plans'
      )).data;
      setPackagePlans(Array.isArray(payload.items) ? payload.items : []);
    } catch (error) {
      packagePlansRequestedRef.current = false;
      if (error instanceof ApiError && error.statusCode > 0) {
        return;
      }
      setPackagePlans([]);
    }
  }, []);

  const loadAccount = useCallback(async (preferredSiteId = '', force = false) => {
    if (!force && accountRequestedRef.current) {
      return;
    }
    accountRequestedRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const payload = (await accountDetailClient.request<AccountDetailApiPayload>(
        `/api/admin/accounts/${accountId}`
      )).data;
      const accountData = payload.account || {};
      const accountMetadata =
        accountData.metadata && typeof accountData.metadata === 'object'
          ? (accountData.metadata as Record<string, unknown>)
          : {};
      const operatorDisplayName = String(accountMetadata.operator_display_name || '').trim();
      const operatorNote = String(accountMetadata.operator_note || '').trim();
      const accountStatusNote = String(accountMetadata.account_status_note || '').trim();
      const accountStatusUpdatedAt = String(accountMetadata.account_status_updated_at || '').trim();
      const sites = Array.isArray(payload.sites) ? payload.sites : [];
      const subscriptions = Array.isArray(payload.subscriptions) ? payload.subscriptions : [];
      const nextAccount: AccountDetail = {
        account_id: String(accountData.account_id || accountId),
        name: String(accountData.name || accountData.account_id || accountId),
        operator_display_name: operatorDisplayName,
        operator_note: operatorNote,
        account_status_note: accountStatusNote,
        account_status_updated_at: accountStatusUpdatedAt,
        status: String(accountData.status || 'unknown'),
        metadata: accountMetadata,
        created_at: String(accountData.created_at || ''),
        site_count: sites.length,
        subscription_count: subscriptions.length,
        sites: sites.map((site: { site_id?: string; status?: string; name?: string }) => ({
          site_id: String(site.site_id || ''),
          status: site.status || 'unknown',
          name: site.name || '',
        })),
        subscriptions: subscriptions.map((item: { subscription?: Record<string, unknown> } | Record<string, unknown>) => {
          const subscription =
            item && typeof item === 'object' && 'subscription' in item
              ? (((item as { subscription?: Record<string, unknown> }).subscription || {}) as Record<string, unknown>)
              : (item as Record<string, unknown>);
          const packageDisplay = resolveCustomerPackageDisplay(t, {
            planId: String(subscription.plan_id || ''),
            packageAlias: String(subscription.package_alias || ''),
            planKind: String(subscription.plan_kind || ''),
            packageKind: String(subscription.package_kind || ''),
            coverageState: String(subscription.coverage_state || ''),
          });
          return {
            subscription_id: String(subscription.subscription_id || ''),
            status: String(subscription.status || 'unknown'),
            plan_id: String(subscription.plan_id || ''),
            plan_version_id: String(subscription.plan_version_id || ''),
            current_period_start: String(subscription.current_period_start_at || ''),
            current_period_end: String(subscription.current_period_end_at || ''),
            package_alias: String(subscription.package_alias || ''),
            plan_kind: String(subscription.plan_kind || ''),
            display_package_label:
              String(subscription.display_package_label || '') || packageDisplay.display_package_label,
            package_kind: packageDisplay.package_kind,
            coverage_state: packageDisplay.coverage_state,
          };
        }),
        primary_identity: payload.primary_identity?.principal_id
          ? {
              principal_id: String(payload.primary_identity.principal_id),
              email: String(payload.primary_identity.email || ''),
              status: String(payload.primary_identity.status || ''),
              session_version: Number(payload.primary_identity.session_version || 1),
              last_login_at: payload.primary_identity.last_login_at,
              created_at: payload.primary_identity.created_at,
              membership_id: String(payload.primary_identity.membership_id || ''),
              membership_role: String(payload.primary_identity.membership_role || ''),
              membership_status: String(payload.primary_identity.membership_status || ''),
              qq_bound: Boolean(payload.primary_identity.qq_bound),
              qq_binding_count: Number(payload.primary_identity.qq_binding_count || 0),
            }
          : null,
        identity_relationship_state: payload.identity_relationship_state || 'missing',
      };
      setAccount(nextAccount);
      const defaultSubscription =
        nextAccount.subscriptions.find((subscription) =>
          ['active', 'trialing', 'past_due', 'suspended'].includes(subscription.status)
        ) || nextAccount.subscriptions[0];
      setPackageForm({
        subscription_id: defaultSubscription?.subscription_id || '',
        plan_id: defaultSubscription?.plan_id || '',
        plan_version_id: defaultSubscription?.plan_version_id || '',
        status:
          defaultSubscription?.status && defaultSubscription.status !== 'unknown'
            ? defaultSubscription.status
            : 'active',
        current_period_start_at: defaultSubscription?.current_period_start || '',
        current_period_end_at: defaultSubscription?.current_period_end || '',
      });
      const nextSiteOptions =
        nextAccount?.sites && nextAccount.sites.length > 0
          ? nextAccount.sites.map((site: { site_id: string; status?: string; name?: string }) => ({
              site_id: site.site_id,
              status: site.status || 'unknown',
              name: site.name || '',
            }))
          : [];

      const nextSiteId =
        (preferredSiteId && nextSiteOptions.some((site: { site_id: string }) => site.site_id === preferredSiteId)
          ? preferredSiteId
          : nextSiteOptions[0]?.site_id) || '';

      setSelectedSiteId(nextSiteId);

    } catch (err) {
      accountRequestedRef.current = false;
      setError(resolveUiErrorMessage(err, t('error.failed_load')));
    } finally {
      setIsLoading(false);
    }
  }, [accountId, t]);

  const handleChangePackage = async (quickPackage?: QuickPackageOption) => {
    const selectedPlanId = (quickPackage?.plan_id || packageForm.plan_id).trim();
    const selectedPlanVersionId = (quickPackage?.plan_version_id || packageForm.plan_version_id).trim();
    const selectedTierId = quickPackage?.tier_id || '';
    const selectedPackageAlias = selectedTierId
      ? localizePackageAlias(t, selectedTierId, selectedTierId)
      : selectedPackageOption?.label || '';

    if (!selectedPlanId || !selectedPlanVersionId) {
      setPackageActionError(
        t(
          'admin.account_detail.package_action_missing_fields',
          undefined,
          'A coverage package option and package version are required before changing coverage.'
        )
      );
      setPackageActionReceipt(null);
      return;
    }

    setPackageActionPending('change');
    setPackageActionError(null);
    setPackageActionNotice(null);
    setPackageActionReceipt(null);
    try {
      const payload = await accountDetailClient.request<AdminMutationPayload>(
        `/api/admin/accounts/${encodeURIComponent(accountId)}/subscription`, {
        method: 'POST',
        body: {
          subscription_id: packageForm.subscription_id || undefined,
          account_id: accountId,
          plan_id: selectedPlanId,
          plan_version_id: selectedPlanVersionId,
          status:
            packageForm.status === 'canceled' || packageForm.status === 'suspended'
              ? 'active'
              : packageForm.status || 'active',
          current_period_start_at: packageForm.current_period_start_at || null,
          current_period_end_at: packageForm.current_period_end_at || null,
          metadata: {
            source: quickPackage
              ? 'admin_account_detail_quick_package_switch'
              : 'admin_account_detail_package_switch',
            tier_id: selectedTierId || undefined,
            package_alias: selectedPackageAlias || undefined,
          },
        },
      });
      setPackageActionReceipt((payload.data?.receipt || null) as AdminMutationReceiptPayload | null);
      setPackageActionNotice(
        t(
          'admin.account_detail.package_changed_notice',
          undefined,
          quickPackage
            ? `Customer package coverage has been switched to ${selectedPackageAlias}.`
            : 'Customer package coverage has been updated.'
        )
      );
      await Promise.all([
        loadAccount(selectedSiteId, true),
        creditEvidenceQuery.invalidate(),
        siteRuntimeQuery.invalidate(),
      ]);
    } catch (err) {
      setPackageActionError(
        resolveUiErrorMessage(err, t('error.failed_save'))
      );
    } finally {
      setPackageActionPending(null);
    }
  };

  const handleCoverageMutation = async (action: 'suspend' | 'cancel') => {
    setPackageActionPending(action);
    setPackageActionError(null);
    setPackageActionNotice(null);
    setPackageActionReceipt(null);
    try {
      const payload = await accountDetailClient.request<AdminMutationPayload>(
        `/api/admin/accounts/${encodeURIComponent(accountId)}/subscription/${action}`,
        {
          method: 'POST',
          body: {},
        }
      );
      setPackageActionReceipt((payload.data?.receipt || null) as AdminMutationReceiptPayload | null);
      setPackageActionNotice(
        action === 'suspend'
          ? t(
              'admin.account_detail.coverage_suspended_notice',
              undefined,
              'Customer coverage has been suspended.'
            )
          : t(
              'admin.account_detail.coverage_canceled_notice',
              undefined,
              'Customer coverage has been canceled.'
            )
      );
      await Promise.all([
        loadAccount(selectedSiteId, true),
        creditEvidenceQuery.invalidate(),
        siteRuntimeQuery.invalidate(),
      ]);
    } catch (err) {
      setPackageActionError(
        resolveUiErrorMessage(err, t('error.failed_save'))
      );
    } finally {
      setPackageActionPending(null);
    }
  };

  const handleAgencyAction = async (action: 'quote' | 'trial') => {
    setAgencyActionPending(action);
    setAgencyActionNotice(null);
    setAgencyActionError(null);
    try {
      const endpoint = action === 'quote' ? 'agency-quotes' : 'agency-trial';
      const body = action === 'quote'
        ? {
            amount_cny: Number(agencyForm.amount_cny),
            valid_days: Number(agencyForm.valid_days),
            trial_enabled: true,
            trial_ai_credit_limit: Number(agencyForm.trial_ai_credit_limit),
          }
        : {
            trial_ai_credit_limit: Number(agencyForm.trial_ai_credit_limit),
          };
      await accountDetailClient.request<Record<string, unknown>>(
        `/api/admin/accounts/${encodeURIComponent(accountId)}/${endpoint}`,
        {
          method: 'POST',
          body,
        }
      );
      setAgencyActionNotice(
        action === 'quote'
          ? t('admin.account_detail.agency_quote_created', undefined, 'Agency quote is ready in the customer Portal.')
          : t('admin.account_detail.agency_trial_approved', undefined, 'Agency trial has been approved for 14 days.')
      );
      await Promise.all([
        loadAccount(selectedSiteId, true),
        creditEvidenceQuery.invalidate(),
        siteRuntimeQuery.invalidate(),
      ]);
    } catch (err) {
      setAgencyActionError(
        resolveUiErrorMessage(err, t('error.failed_save'))
      );
    } finally {
      setAgencyActionPending(null);
    }
  };

  const handleAccountStatusMutation = async (action: 'suspend' | 'restore') => {
    if (!account) {
      return;
    }
    setAccountStatusPending(action);
    setAccountStatusNotice(null);
    setAccountStatusError(null);
    setAccountStatusReceipt(null);
    try {
      const payload = await accountDetailClient.request<AdminMutationPayload>(
        `/api/admin/accounts/${encodeURIComponent(account.account_id)}/${action}`, {
        method: 'POST',
        body: {
          reason: action === 'suspend' ? suspendReason.trim() : '',
        },
      });
      setAccountStatusReceipt((payload.data?.receipt || null) as AdminMutationReceiptPayload | null);
      const nextStatus = String(payload.data?.status || (action === 'restore' ? 'active' : 'suspended'));
      const metadata = payload.data?.metadata && typeof payload.data.metadata === 'object'
        ? payload.data.metadata
        : {};
      setAccount((current) =>
        current
          ? {
              ...current,
              status: nextStatus,
              account_status_note: String(metadata.account_status_note || current.account_status_note || ''),
              account_status_updated_at: String(metadata.account_status_updated_at || current.account_status_updated_at || ''),
            }
          : current
      );
      setAccountStatusNotice(
        action === 'restore'
          ? t('admin.accounts.account_restored_notice', { account: accountTitle }, `${accountTitle} has been restored.`)
          : t('admin.accounts.account_suspended_notice', { account: accountTitle }, `${accountTitle} has been suspended.`)
      );
      await loadAccount(selectedSiteId, true);
    } catch (err) {
      setAccountStatusError(resolveUiErrorMessage(err, t('error.failed_save')));
    } finally {
      setAccountStatusPending(null);
      setSuspendReason('');
    }
  };

  const handleApplyTopUpPack = async (pack: TopUpPackOption): Promise<boolean> => {
    const subscriptionId = packageForm.subscription_id || selectPrimarySubscription(account)?.subscription_id || '';
    if (!subscriptionId) {
      setPackageActionError(
        t(
          'admin.account_detail.topup_missing_subscription',
          undefined,
          'A current subscription is required before applying a top-up pack.'
        )
      );
      setPackageActionReceipt(null);
      return false;
    }

    setTopUpActionPending(pack.pack_id);
    setPackageActionError(null);
    setPackageActionNotice(null);
    setPackageActionReceipt(null);
    try {
      const payload = await accountDetailClient.request<AdminMutationPayload>(
        `/api/admin/subscriptions/${encodeURIComponent(subscriptionId)}/topup`, {
        method: 'POST',
        body: {
          target_period_start_at: packageForm.current_period_start_at || null,
          target_period_end_at: packageForm.current_period_end_at || null,
          ai_credits_increment: pack.ai_credits_increment,
          runs_increment: pack.runs_increment,
          tokens_increment: pack.tokens_increment,
          cost_cny_increment: pack.cost_cny_increment,
          reason: 'operator_overage_buffer',
          note: `Applied ${pack.pack_id} from account coverage screen.`,
        },
      });
      setPackageActionReceipt((payload.data?.receipt || null) as AdminMutationReceiptPayload | null);
      setPackageActionNotice(
        t(
          'admin.account_detail.topup_pack_applied_notice',
          { pack: t(pack.label_key, undefined, pack.fallback_label) },
          `${pack.fallback_label} has been applied to the current period.`
        )
      );
      await Promise.all([
        loadAccount(selectedSiteId, true),
        creditEvidenceQuery.invalidate(),
        siteRuntimeQuery.invalidate(),
      ]);
      return true;
    } catch (err) {
      setPackageActionError(
        resolveUiErrorMessage(err, t('error.failed_save'))
      );
      return false;
    } finally {
      setTopUpActionPending(null);
    }
  };

  const handleApplyCreditAdjustment = async () => {
    const creditDelta = Number(creditAdjustmentForm.ai_credit_delta);
    if (!Number.isFinite(creditDelta) || creditDelta === 0) {
      setPackageActionError(
        t(
          'admin.account_detail.credit_adjustment_delta_required',
          undefined,
          'Enter a non-zero AI credit delta.'
        )
      );
      setPackageActionReceipt(null);
      return;
    }
    if (!creditAdjustmentForm.reason.trim()) {
      setPackageActionError(
        t(
          'admin.account_detail.credit_adjustment_reason_required',
          undefined,
          'Enter an operator reason before applying the credit adjustment.'
        )
      );
      setPackageActionReceipt(null);
      return;
    }

    setCreditAdjustmentPending(true);
    setPackageActionError(null);
    setPackageActionNotice(null);
    setPackageActionReceipt(null);
    try {
      const payload = await accountDetailClient.request<AdminMutationPayload>(
        `/api/admin/accounts/${encodeURIComponent(accountId)}/credit-ledger/adjustments`,
        {
          method: 'POST',
          body: {
            event_type: creditAdjustmentForm.event_type,
            ai_credit_delta: creditDelta,
            reason: creditAdjustmentForm.reason.trim(),
            note: creditAdjustmentForm.note.trim(),
          },
        }
      );
      setPackageActionReceipt((payload.data?.receipt || null) as AdminMutationReceiptPayload | null);
      setPackageActionNotice(
        t(
          'admin.account_detail.credit_adjustment_applied_notice',
          undefined,
          'AI credit adjustment has been written to the current ledger period.'
        )
      );
      setCreditAdjustmentForm((current) => ({
        event_type: current.event_type,
        ai_credit_delta: '',
        reason: '',
        note: '',
      }));
      setCreditAdjustmentOpen(false);
      await Promise.all([
        loadAccount(selectedSiteId, true),
        creditEvidenceQuery.invalidate(),
        siteRuntimeQuery.invalidate(),
      ]);
    } catch (err) {
      setPackageActionError(
        resolveUiErrorMessage(err, t('error.failed_save'))
      );
    } finally {
      setCreditAdjustmentPending(false);
    }
  };

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  useEffect(() => {
    if (activeDetailTab === 'commercial') {
      void loadPackagePlans();
    }
  }, [activeDetailTab, loadPackagePlans]);

  useEffect(() => {
    if (!accountStatusNotice) {
      return;
    }
    showSuccessToast(
      accountStatusNotice,
      t('admin.account_detail.account_status_updated_title', {}, 'Account status updated')
    );
    setAccountStatusNotice(null);
  }, [accountStatusNotice, showSuccessToast, t]);

  useEffect(() => {
    if (!packageActionNotice) {
      return;
    }
    showSuccessToast(
      packageActionNotice,
      t('admin.account_detail.commercial_operation_completed_title', {}, 'Commercial operation completed')
    );
    setPackageActionNotice(null);
  }, [packageActionNotice, showSuccessToast, t]);

  useEffect(() => {
    const activateTabFromHash = () => {
      if (window.location.hash === '#site-footprint') {
        setActiveDetailTab('sites');
        return;
      }
      if (window.location.hash === '#quota-posture') {
        setActiveDetailTab('credits');
        return;
      }
      if (window.location.hash === '#advanced-checks') {
        setActiveDetailTab('audit');
        return;
      }
      if (window.location.hash === '#account-audit') {
        setActiveDetailTab('audit');
        return;
      }
      if (window.location.hash === '#customer-access') {
        setActiveDetailTab('access');
        return;
      }
      if (window.location.hash === '#coverage-actions') {
        setActiveDetailTab('commercial');
      }
    };

    activateTabFromHash();
    window.addEventListener('hashchange', activateTabFromHash);
    return () => window.removeEventListener('hashchange', activateTabFromHash);
  }, []);

  if (isLoading) {
    return <AdminRouteSkeleton />;
  }

  if (error) {
    return (
      <BackofficePageStack>
        <BackofficePrimaryPanel
          eyebrow={t('admin.account_detail.primary_title', undefined, 'Current customer posture')}
          title={t('admin.account_detail.load_error_title', undefined, 'Customer detail is temporarily unavailable')}
          description={t('admin.account_detail.load_error_desc', undefined, 'Retry this bounded customer read without leaving the current operator route.')}
        >
          <BackofficeDiagnosticNotice
            message={error}
            retryLabel={t('common.retry')}
            onRetry={() => void loadAccount('', true)}
          />
        </BackofficePrimaryPanel>
      </BackofficePageStack>
    );
  }

  if (!account) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">{t('admin.account_not_found')}</h2>
          <Link href={returnTo} className="text-blue-600 hover:underline">
            ← {t('admin.back_to_accounts')}
          </Link>
        </div>
      </div>
    );
  }

  const siteOptions = account.sites && account.sites.length > 0
    ? account.sites.map((site) => ({
        site_id: site.site_id,
        status: site.status || 'unknown',
        name: site.name || '',
      }))
    : [];
  let accountDetailPathname = null;
  try {
    accountDetailPathname = buildAdminAccountDetailPathname(account.account_id);
  } catch {
    accountDetailPathname = null;
  }
  const accountSiteReturnTo = accountDetailPathname
    ? buildAdminAccountSiteReturnTo({
        parentPathname: accountDetailPathname,
        searchParams,
        accountsPolicy: ACCOUNTS_RETURN_CONTEXT_POLICY,
      })
    : ADMIN_QUEUE_PATHNAMES.accounts;
  const siteDetailHref = (siteId: string) => {
    if (!accountDetailPathname) return returnTo;
    try {
      return buildAdminNestedDetailHref({
        detailPathname: `/admin/sites/${encodeURIComponent(siteId)}`,
        returnTo: accountSiteReturnTo,
        policy: {
          parentPathname: accountDetailPathname,
          fallback: ADMIN_QUEUE_PATHNAMES.accounts,
        },
      });
    } catch {
      return returnTo;
    }
  };
  const trustedSiteRuntimeData = siteRuntimeEvidenceComplete
    ? siteRuntimeData
    : {};
  const siteRuntimeItems = Object.values(trustedSiteRuntimeData);
  const resourceMetricByKey = new Map((quotaSummary?.resource_limits || []).map((item) => [item.key, item]));
  const creditMetric = quotaSummary?.ai_credits || null;
  const runBudgetSummary = creditMetric
    ? metricToBudgetSummary(creditMetric)
    : summarizeBudget(trustedSiteRuntimeData, 'runs');
  const activeKeySiteCount = siteRuntimeItems.filter((item) => item.activeKeyCount > 0).length;
  const boundSitesMetric = resourceMetricByKey.get('bound_sites') || null;
  const vectorDocumentsMetric = resourceMetricByKey.get('vector_documents') || null;
  const concurrentRunsMetric = resourceMetricByKey.get('concurrent_runs') || null;
  const siteLimitValues = siteRuntimeItems.map((item) => Number(item.siteLimit || 0)).filter((value) => value > 0);
  const accountSiteLimit = boundSitesMetric && !boundSitesMetric.unlimited
    ? Number(boundSitesMetric.limit || 0)
    : siteLimitValues.length > 0
      ? Math.max(...siteLimitValues)
      : 0;
  const siteLimitUnlimited = accountSiteLimit <= 0;
  const siteUsageRatio = boundSitesMetric
    ? Number(boundSitesMetric.usage_ratio || 0)
    : siteLimitUnlimited
      ? 0
      : account.site_count / accountSiteLimit;
  const hasSiteLimitPressure = !siteLimitUnlimited && siteUsageRatio >= 0.8;
  const hasApiKeyGap =
    siteRuntimeEvidenceComplete &&
    account.site_count > 0 &&
    activeKeySiteCount < account.site_count;
  const quotaNeedsAttention =
    quotaSummary?.status === 'limited' ||
    quotaSummary?.status === 'near_limit' ||
    runBudgetSummary.overLimit ||
    runBudgetSummary.usageRatio >= 0.8 ||
    hasSiteLimitPressure ||
    hasApiKeyGap;

  const riskySubscriptions = account.subscriptions.filter((sub) => sub.status !== 'active');
  const primarySubscription = selectPrimarySubscription(account);
  const primaryPackage = resolveCustomerPackageDisplay(t, {
    planId: primarySubscription?.plan_id,
    packageAlias: primarySubscription?.package_alias,
    planKind: primarySubscription?.plan_kind,
    packageKind: primarySubscription?.package_kind,
    coverageState: primarySubscription?.coverage_state || (primarySubscription ? 'covered' : 'uncovered'),
  });
  const expiringSubscriptions = account.subscriptions.filter((sub) => {
    if (!sub.current_period_end) {
      return false;
    }
    const diff = new Date(sub.current_period_end).getTime() - nowMs;
    return diff >= 0 && diff <= 1000 * 60 * 60 * 24 * 30;
  });
  const uncoveredSiteCount =
    primaryPackage.coverage_state === 'uncovered' && account.site_count > 0 ? account.site_count : 0;
  const hasCoverageGap = uncoveredSiteCount > 0;
  const hasUncoveredCommercialPosture =
    primaryPackage.coverage_state === 'uncovered' || hasCoverageGap || (account.subscription_count === 0 && account.site_count > 0);
  const hasPaidCoverage =
    primaryPackage.package_kind === 'tier_package' && primaryPackage.coverage_state === 'covered';
  const hasFormalFreeCoverage =
    primaryPackage.package_kind === 'formal_free' && primaryPackage.coverage_state === 'covered';
  const postureTone =
    account.status === 'suspended' || riskySubscriptions.length > 0 || hasUncoveredCommercialPosture
      ? 'error'
      : 'ok';
  const postureTitle = (() => {
    if (account.status === 'suspended') {
      return t('admin.account_detail.suspended_title', undefined, 'Customer access is suspended');
    }
    if (hasUncoveredCommercialPosture) {
      return t('admin.account_detail.uncovered_posture_title', undefined, 'Uncovered commercial posture');
    }
    if (riskySubscriptions.length > 0) {
      return t('admin.account_detail.commercial_risk_title', undefined, 'Subscription follow-up is required');
    }
    if (hasFormalFreeCoverage) {
      return t('admin.account_detail.free_covered_title', undefined, 'Free but covered');
    }
    if (hasPaidCoverage) {
      return t('admin.account_detail.paid_covered_title', undefined, 'Covered by paid package');
    }
    return t('admin.account_detail.healthy_title', undefined, 'Customer posture is stable');
  })();
  const postureDescription = (() => {
    if (account.status === 'suspended') {
      return t('admin.account_detail.suspended_desc', undefined, 'Commercial or support review should happen before any new customer session starts from this customer.');
    }
    if (hasUncoveredCommercialPosture) {
      return t('admin.account_detail.uncovered_posture_desc', undefined, 'This customer has real uncovered posture. Keep it distinct from Free coverage and move directly into subscription/package follow-up.');
    }
    if (riskySubscriptions.length > 0) {
      return t('admin.account_detail.commercial_risk_desc', undefined, 'Subscription lifecycle is the main blocker; resolve coverage before treating this customer as stable.');
    }
    if (hasFormalFreeCoverage) {
      return t('admin.account_detail.free_covered_desc', undefined, 'This customer is explicitly covered by the formal Free package. Treat it as covered posture, not implicit fallback.');
    }
    if (hasPaidCoverage) {
      return t('admin.account_detail.paid_covered_desc', undefined, 'This customer is covered by a paid package. Use the current subscription record for package changes, suspension, or cancellation.');
    }
    return t('admin.account_detail.healthy_desc', undefined, 'Commercial coverage and site footprint are readable from this surface.');
  })();
  const nextStepDescription = account.status === 'suspended'
    ? t('admin.account_detail.next_step_suspended_desc', undefined, 'Keep support actions bounded until you confirm why the customer is suspended.')
    : primarySubscription && riskySubscriptions[0]
      ? t('admin.account_detail.next_step_subscription_desc', undefined, 'Coverage posture still needs operator attention. Use the bounded actions on this page before opening any deeper commercial detail.')
      : hasUncoveredCommercialPosture
        ? t('admin.account_detail.open_subscription_queue_desc', undefined, 'This customer has site footprint without readable package coverage, so keep the next decision on customer coverage and site impact first.')
        : t('admin.account_detail.open_primary_site_desc', undefined, 'The customer is stable; only open a site when you need lower-level runtime, key, or support detail.');
  const watchItems = [
    {
      label: t('common.package', undefined, 'Package'),
      value: primaryPackage.display_package_label,
      detail: `${translatePackageKindLabel(t, primaryPackage.package_kind)} · ${translateCoverageStateLabel(t, primaryPackage.coverage_state)}`,
      toneClassName:
        primaryPackage.coverage_state === 'uncovered'
          ? 'text-red-600 dark:text-red-400'
          : undefined,
    },
    {
      label: t('common.subscriptions'),
      value: riskySubscriptions.length > 0
        ? t('admin.account_detail.subscriptions_attention_value', { count: String(riskySubscriptions.length) }, `${riskySubscriptions.length} need follow-up`)
        : translateStatusLabel('ok', t),
      detail: expiringSubscriptions.length > 0
        ? t('admin.account_detail.expiring_subscriptions_desc', { count: String(expiringSubscriptions.length) }, `${expiringSubscriptions.length} renew within 30 days.`)
        : t('admin.account_detail.subscriptions_stable_desc', undefined, 'No expiring or unhealthy subscriptions are visible from this customer surface.'),
      toneClassName: riskySubscriptions.length > 0 ? 'text-red-600 dark:text-red-400' : undefined,
    },
    {
      label: t('common.sites'),
      value: formatInteger(account.site_count),
      detail: hasCoverageGap
        ? t('admin.account_detail.site_coverage_gap_desc', undefined, 'One or more sites exist without matching active subscription coverage.')
        : t('admin.account_detail.site_coverage_ready_desc', undefined, 'Site footprint is attached to current subscription coverage.'),
      toneClassName: hasCoverageGap ? 'text-red-600 dark:text-red-400' : undefined,
    },
  ];
  const quotaRecommendationItems = [
    runBudgetSummary.overLimit || runBudgetSummary.usageRatio >= 0.8
      ? t(
          'admin.account_detail.recommend_topup_runs',
          undefined,
          'Apply a top-up pack or move this account to a higher package before more AI credits are consumed.'
        )
      : '',
    hasSiteLimitPressure
      ? t(
          'admin.account_detail.recommend_site_limit',
          undefined,
          'Confirm the package site limit before binding another WordPress site to this customer.'
        )
      : '',
    hasApiKeyGap
      ? t(
          'admin.account_detail.recommend_key_gap',
          undefined,
          'Issue or restore active Cloud API key coverage for every bound site before trial traffic.'
        )
      : '',
    !quotaNeedsAttention
      ? t(
          'admin.account_detail.recommend_quota_stable',
          undefined,
          'Current quota posture is healthy. Keep this page as the account-level checkpoint before opening site detail.'
        )
      : '',
  ].filter(Boolean);
  const unlimitedLabel = t('common.unlimited', {}, 'Unlimited');
  const formatQuotaMetricValue = (metric: AccountQuotaMetric): string => {
    if (metric.unit === 'cny') {
      return formatAdminCurrency(metric.used);
    }
    return formatInteger(Math.round(Number(metric.used || 0)));
  };
  const formatQuotaMetricLimit = (metric: AccountQuotaMetric): string => {
    if (metric.unlimited) {
      return unlimitedLabel;
    }
    if (metric.unit === 'cny') {
      return formatAdminCurrency(metric.limit);
    }
    return formatInteger(Math.round(Number(metric.limit || 0)));
  };
  const resourceRows = quotaSummary?.resource_limits || [];
  const internalLimitRows = quotaSummary?.internal_limits || [];
  const creditLedgerItems = creditLedger?.items || [];
  const creditLedgerNetUsed = Number(
    creditLedger?.summary?.net_used_ai_credits ??
      quotaSummary?.ai_credit_ledger_summary?.net_used_ai_credits ??
      creditLedger?.summary?.total_ai_credits ??
      0
  );
  const creditLedgerGranted = Number(
    creditLedger?.summary?.granted_ai_credits ?? quotaSummary?.ai_credit_ledger_summary?.granted_ai_credits ?? 0
  );
  const creditLedgerCount = Number(creditLedger?.pagination?.total ?? creditLedger?.summary?.entry_count ?? 0);
  const packagePlanOptions = packagePlans
    .filter((item) => item.plan?.plan_id)
    .map((item) => {
      const packageDisplay = resolveCustomerPackageDisplay(t, {
        planId: item.plan?.plan_id,
        packageAlias:
          String(item.plan?.metadata?.package_alias || '') ||
          String(item.tier_summary?.package_alias || ''),
        formalPlanName: item.plan?.name,
        planKind: String(item.plan?.metadata?.plan_kind || ''),
      });
      return {
        plan_id: String(item.plan?.plan_id || ''),
        plan_version_id: String(item.latest_version?.plan_version_id || ''),
        label: packageDisplay.display_package_label,
      };
    });
  const selectedPackageOption = packagePlanOptions.find((item) => item.plan_id === packageForm.plan_id) || null;
  const currentTierId =
    primarySubscription?.package_alias === 'Free' || primarySubscription?.plan_id === 'free'
      ? 'free'
      : primarySubscription?.package_alias === 'Plus' || primarySubscription?.plan_id === 'plus'
        ? 'plus'
      : primarySubscription?.package_alias === 'Agency' || primarySubscription?.plan_id === 'agency'
        ? 'agency'
        : 'pro';
  const accountTitle = resolveAccountTitle(account, t);
  const hasAdvancedChecks = siteOptions.length > 0;
  const detailTabs: Array<{ id: AccountDetailTab; label: string; navLabel: string; detail: string; href: string }> = [
    {
      id: 'overview',
      label: t('admin.account_detail.overview_tab', undefined, 'Overview'),
      navLabel: t('admin.account_detail.overview_tab', undefined, 'Overview'),
      detail: translateStatusLabel(postureTone, t),
      href: '#account-overview',
    },
    {
      id: 'commercial',
      label: t('admin.account_detail.commercial_tab', undefined, 'Commercial'),
      navLabel: t('admin.account_detail.commercial_nav_label', undefined, 'Package'),
      detail: primaryPackage.display_package_label,
      href: '#coverage-actions',
    },
    {
      id: 'credits',
      label: t('admin.account_detail.credits_tab', undefined, 'Credits and usage'),
      navLabel: t('admin.account_detail.credits_nav_label', undefined, 'AI credits'),
      detail: creditEvidencePending
        ? t('common.loading')
        : creditEvidenceError
          ? t('common.error')
            : !creditEvidenceReady
              ? t('common.unknown')
            : quotaNeedsAttention
              ? t('admin.account_detail.attention_nav_label', undefined, 'Attention')
              : translateStatusLabel('ok', t),
      href: '#quota-posture',
    },
    {
      id: 'sites',
      label: t('admin.account_detail.sites_tab', undefined, 'Sites'),
      navLabel: t('admin.account_detail.sites_tab', undefined, 'Sites'),
      detail: formatInteger(account.site_count),
      href: '#site-footprint',
    },
    {
      id: 'access',
      label: t('admin.account_detail.access_tab', undefined, 'Access'),
      navLabel: t('admin.account_detail.access_tab', undefined, 'Access'),
      detail:
        account.identity_relationship_state === 'healthy'
          ? translateStatusLabel('ok', t)
          : t(
              `admin.accounts.identity_${account.identity_relationship_state}`,
              {},
              account.identity_relationship_state
            ),
      href: '#customer-access',
    },
    {
      id: 'audit',
      label: t('admin.account_detail.audit_tab', undefined, 'Audit'),
      navLabel: t('admin.account_detail.audit_tab', undefined, 'Audit'),
      detail: hasAdvancedChecks
        ? formatInteger(Object.keys(siteRuntimeData).length)
        : t('common.read_only', {}, 'Read only'),
      href: '#account-audit',
    },
  ];
  const topUpPackSelector = (
    <fieldset data-ui="account-topup-options" className="space-y-2">
      <legend className="sr-only">{t('admin.account_detail.topup_comparison_label', undefined, 'Top-up pack comparison')}</legend>
      {TOPUP_PACK_OPTIONS.map((pack) => {
        const label = t(pack.label_key, undefined, pack.fallback_label);
        const isRecommended = pack.recommended_for_tiers.includes(currentTierId);
        const isSelected = selectedTopUpPackId === pack.pack_id;
        return (
          <label
            key={pack.pack_id}
            className={cn(
              'grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-xl border px-4 py-3 transition sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:items-center',
              isSelected
                ? 'border-blue-500 bg-blue-50/60 ring-1 ring-blue-500/20 dark:border-blue-400 dark:bg-blue-950/25'
                : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/45'
            )}
          >
            <input
              type="radio"
              name="topup-pack"
              value={pack.pack_id}
              checked={isSelected}
              onChange={() => setSelectedTopUpPackId(pack.pack_id)}
              className="mt-1 h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500 sm:mt-0"
            />
            <span className="min-w-0">
              <span className="block font-semibold text-slate-950 dark:text-white">{label}</span>
              <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400 sm:hidden">
                {t('admin.current_period_only', {}, 'Current period only')}
              </span>
            </span>
            <span className="col-start-2 whitespace-nowrap text-sm font-medium text-slate-700 dark:text-slate-200 sm:col-start-auto">
              {pack.points_label}
            </span>
            <span className="col-start-2 sm:col-start-auto">
              {isRecommended ? (
                <BackofficeStatusBadge status="ok" label={t('admin.recommended', {}, 'Recommended')} />
              ) : (
                <span className="text-xs text-slate-500 dark:text-slate-400">{t('admin.current_period_only', {}, 'Current period only')}</span>
              )}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
  const openTopUpOptions = () => {
    setPackageActionError(null);
    setSelectedTopUpPackId(
      TOPUP_PACK_OPTIONS.find((pack) => pack.recommended_for_tiers.includes(currentTierId))?.pack_id
        || TOPUP_PACK_OPTIONS[0]?.pack_id
        || null
    );
    setTopUpDialogOpen(true);
  };
  const topUpDialog = (
    <AdminWorkbenchDialog
      open={topUpDialogOpen}
      title={t('admin.account_detail.topup_packs_label', undefined, 'Top-up packs')}
      titleId="account-topup-options-title"
      closeLabel={t('common.close', undefined, 'Close')}
      cancelLabel={t('common.cancel', undefined, 'Cancel')}
      saveLabel={t('admin.account_detail.confirm_topup_action', undefined, 'Apply top-up')}
      savingLabel={t('common.saving', {}, 'Saving...')}
      saving={topUpActionPending !== null}
      error={packageActionError || undefined}
      width="wide"
      density="compact"
      headerAccessory={<BackofficeStatusBadge status={quotaNeedsAttention ? 'warning' : 'ok'} label={quotaNeedsAttention ? translateStatusLabel('warning', t) : translateStatusLabel('ok', t)} />}
      footerNotice={t('admin.current_period_only', {}, 'Current period only')}
      onClose={() => {
        if (topUpActionPending !== null) return;
        setTopUpDialogOpen(false);
        setSelectedTopUpPackId(null);
      }}
      onSubmit={() => {
        const selectedPack = TOPUP_PACK_OPTIONS.find((pack) => pack.pack_id === selectedTopUpPackId);
        if (!selectedPack) return;
        void (async () => {
          const applied = await handleApplyTopUpPack(selectedPack);
          if (applied) {
            setTopUpDialogOpen(false);
            setSelectedTopUpPackId(null);
          }
        })();
      }}
    >
      <p className="text-sm text-slate-600 dark:text-slate-300">
        {t('admin.account_detail.topup_packs_desc', undefined, 'Add temporary current-period headroom without changing the customer package.')}
      </p>
      {topUpPackSelector}
    </AdminWorkbenchDialog>
  );
  const creditAdjustmentDialog = (
    <AdminWorkbenchDialog
      open={creditAdjustmentOpen}
      title={t('admin.account_detail.credit_adjustment_label', undefined, 'AI credit adjustment')}
      titleId="account-credit-adjustment-title"
      headerAccessory={<BackofficeStatusBadge status="warning" label={t('admin.audit_required', {}, 'Audit required')} />}
      error={packageActionError || undefined}
      saving={creditAdjustmentPending}
      closeLabel={t('common.close', undefined, 'Close')}
      cancelLabel={t('common.cancel', undefined, 'Cancel')}
      saveLabel={t('admin.account_detail.apply_credit_adjustment_action', undefined, 'Apply adjustment')}
      savingLabel={t('common.saving', {}, 'Saving...')}
      footerNotice={t('admin.account_detail.credit_adjustment_desc', undefined, 'A reason is required and the operation is audited.')}
      width="compact"
      density="compact"
      onClose={() => setCreditAdjustmentOpen(false)}
      onSubmit={() => void handleApplyCreditAdjustment()}
    >
      <div className="grid gap-3">
        <label className="text-sm">
          <span className="mb-2 block font-medium text-gray-700 dark:text-gray-300">
            {t('admin.account_detail.credit_adjustment_type_label', undefined, 'Entry type')}
          </span>
          <select
            value={creditAdjustmentForm.event_type}
            onChange={(event) => setCreditAdjustmentForm((current) => ({ ...current, event_type: event.target.value }))}
            className="input"
          >
            <option value="grant">{t('admin.account_detail.credit_adjustment_grant', undefined, 'Grant')}</option>
            <option value="adjustment">{t('admin.account_detail.credit_adjustment_adjustment', undefined, 'Adjustment')}</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-2 block font-medium text-gray-700 dark:text-gray-300">
            {t('admin.account_detail.credit_adjustment_delta_label', undefined, 'Credit delta')}
          </span>
          <input
            type="number"
            step="1"
            value={creditAdjustmentForm.ai_credit_delta}
            onChange={(event) => setCreditAdjustmentForm((current) => ({ ...current, ai_credit_delta: event.target.value }))}
            className="input"
            placeholder="+1000"
          />
        </label>
        <label className="text-sm">
          <span className="mb-2 block font-medium text-gray-700 dark:text-gray-300">
            {t('admin.account_detail.credit_adjustment_reason_label', undefined, 'Reason')}
          </span>
          <input
            type="text"
            value={creditAdjustmentForm.reason}
            onChange={(event) => setCreditAdjustmentForm((current) => ({ ...current, reason: event.target.value }))}
            className="input"
            placeholder={t('admin.account_detail.credit_adjustment_reason_placeholder', undefined, 'billing correction')}
          />
        </label>
        <label className="text-sm">
          <span className="mb-2 block font-medium text-gray-700 dark:text-gray-300">
            {t('admin.account_detail.credit_adjustment_note_label', undefined, 'Operator note')}
          </span>
          <input
            type="text"
            value={creditAdjustmentForm.note}
            onChange={(event) => setCreditAdjustmentForm((current) => ({ ...current, note: event.target.value }))}
            className="input"
            placeholder={t('admin.optional', {}, 'Optional')}
          />
        </label>
      </div>
    </AdminWorkbenchDialog>
  );
  const creditComponentsPanel = (
    <div
      data-ui="account-credit-components"
      className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/55 dark:border-slate-800 dark:bg-slate-950/35"
    >
      {(quotaSummary?.breakdown || []).length > 0 ? (
      <div className="divide-y divide-slate-200 px-4 text-sm dark:divide-slate-800">
        {(quotaSummary?.breakdown || []).map((item) => (
          <div key={item.key} className="flex items-start justify-between gap-4 py-3">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">{creditBreakdownLabel(item, t)}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {formatInteger(Math.round(Number(item.quantity || 0)))} {item.unit}
              </p>
            </div>
            <p className="text-right text-sm font-semibold text-gray-950 dark:text-white">
              {formatInteger(Math.round(Number(item.ai_credits || 0)))}
            </p>
          </div>
        ))}
      </div>
      ) : (
        <BackofficeEmptyState
          className="!rounded-none !border-0"
          title={t('admin.account_detail.credit_components_empty_title', undefined, 'No credit components')}
          description={t('admin.account_detail.credit_components_empty_desc', undefined, 'No component-level credit evidence is available for the current period.')}
        />
      )}
    </div>
  );
  const headerMetrics = [
    { label: t('common.sites'), value: formatInteger(account.site_count) },
    { label: t('common.status'), value: translateStatusLabel(account.status, t) },
    { label: t('common.subscriptions'), value: formatInteger(account.subscription_count) },
    ...(uncoveredSiteCount > 0
      ? [{
          label: t('admin.no_commercial_coverage', undefined, 'No commercial coverage'),
          value: formatInteger(uncoveredSiteCount),
          toneClassName: 'text-red-600 dark:text-red-400',
        }]
      : []),
    ...(expiringSubscriptions.length > 0
      ? [{
          label: t('admin.expiring_soon', undefined, 'Expiring Soon'),
          value: formatInteger(expiringSubscriptions.length),
          toneClassName: 'text-amber-700 dark:text-amber-300',
        }]
      : []),
  ];
  return (
    <BackofficePageStack className="!space-y-4">
      <BackofficePageHeader
        title={accountTitle}
        description={postureDescription}
        summaryItems={headerMetrics}
        secondaryAction={(
          <Link href={returnTo} className="btn btn-secondary">
            {t('admin.back_to_accounts')}
          </Link>
        )}
      />
      <div data-ui="account-detail-workspace" className="grid gap-5 xl:grid-cols-[12.5rem_minmax(0,1fr)] xl:items-start">
        <div
          role="tablist"
          aria-label={t('admin.account_detail.tabs_label', undefined, 'Customer detail sections')}
          data-ui="account-detail-section-nav"
          className="flex min-w-0 gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800 xl:sticky xl:top-20 xl:block xl:overflow-visible xl:border-b-0 xl:border-r xl:pr-4"
        >
          {detailTabs.map((tab) => {
            const isActive = activeDetailTab === tab.id;
            const isAttention =
              (tab.id === 'overview' && postureTone !== 'ok') ||
              (tab.id === 'credits' && (creditEvidenceError || quotaNeedsAttention)) ||
              (tab.id === 'access' && account.identity_relationship_state !== 'healthy');
            return (
              <a
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                aria-label={tab.label}
                href={tab.href}
                onClick={() => setActiveDetailTab(tab.id)}
                className={cn(
                  'min-w-[8.5rem] shrink-0 border-b-2 px-3 py-2.5 text-left transition hover:bg-slate-100 dark:hover:bg-slate-900 xl:flex xl:min-w-0 xl:items-center xl:justify-between xl:gap-3 xl:rounded-md xl:border-b-0 xl:border-l-[3px] xl:px-3 xl:py-2.5',
                  isActive
                    ? 'border-blue-600 bg-blue-50/45 text-blue-900 dark:border-blue-400 dark:bg-blue-950/20 dark:text-blue-100'
                    : 'border-transparent text-slate-600 dark:text-slate-300'
                )}
              >
                <span className="block whitespace-nowrap text-sm font-semibold">{tab.navLabel}</span>
                <span className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400 xl:mt-0 xl:justify-end">
                  {isAttention ? (
                    <span
                      className={cn(
                        'h-2 w-2 shrink-0 rounded-full',
                        tab.id === 'credits' && creditEvidenceError ? 'bg-red-500' : 'bg-amber-500'
                      )}
                      aria-hidden="true"
                    />
                  ) : null}
                  <span>{tab.detail}</span>
                </span>
              </a>
            );
          })}
        </div>
        <div className="min-w-0 space-y-5" data-ui="account-detail-section-content">
        {activeDetailTab === 'overview' ? (
          <>
            <BackofficeStackCard className="flex flex-col gap-4 bg-white/80 dark:bg-slate-950/55 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                  {t('admin.account_detail.access_status_title', undefined, 'Customer access status')}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <BackofficeStatusBadge status={account.status} label={translateStatusLabel(account.status, t)} />
                  <span className="text-sm text-slate-600 dark:text-slate-300">
                    {account.status === 'suspended'
                      ? t(
                          'admin.account_detail.access_status_suspended_desc',
                          undefined,
                          'Portal access and site actions are currently blocked for this customer.'
                        )
                      : t(
                          'admin.account_detail.access_status_active_desc',
                          undefined,
                          'Portal access follows this customer account membership.'
                        )}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSuspendReason('');
                  setPendingConfirmation({
                    title:
                      account.status === 'suspended'
                        ? t('admin.accounts.confirm_restore_title', {}, 'Confirm account restore')
                        : t('admin.accounts.confirm_suspend_title', {}, 'Confirm account suspension'),
                    message:
                      account.status === 'suspended'
                        ? t(
                            'admin.accounts.confirm_restore_desc',
                            { account: accountTitle },
                            `Restore ${accountTitle} to active access?`
                          )
                        : t(
                            'admin.accounts.confirm_suspend_desc',
                            { account: accountTitle },
                            `Suspend ${accountTitle}? Customer portal access and site actions will be blocked by account status.`
                          ),
                    confirmLabel:
                      account.status === 'suspended'
                        ? t('admin.accounts.restore_account_action', {}, 'Restore account')
                        : t('admin.accounts.suspend_account_action', {}, 'Suspend account'),
                    showSuspendReason: account.status !== 'suspended',
                    variant: account.status === 'suspended' ? 'default' : 'danger',
                    onConfirm: () =>
                      void handleAccountStatusMutation(
                        account.status === 'suspended' ? 'restore' : 'suspend'
                      ),
                  });
                }}
                className={cn(
                  'btn btn-secondary self-start whitespace-nowrap lg:self-auto',
                  account.status !== 'suspended' &&
                    'border-red-200 text-red-700 hover:border-red-300 dark:border-red-900/60 dark:text-red-200'
                )}
                disabled={accountStatusPending !== null}
              >
                {accountStatusPending
                  ? t('common.saving', {}, 'Saving...')
                  : account.status === 'suspended'
                    ? t('admin.accounts.restore_account_action', {}, 'Restore account')
                    : t('admin.accounts.suspend_account_action', {}, 'Suspend account')}
              </button>
            </BackofficeStackCard>
            {accountStatusError ? (
              <p className="text-sm text-red-600 dark:text-red-300">{accountStatusError}</p>
            ) : null}
            {account.account_status_note ? (
              <p className="text-sm text-amber-700 dark:text-amber-300">
                {t('admin.accounts.suspend_reason_label', {}, 'Suspension reason')}: {account.account_status_note}
              </p>
            ) : null}
            <AccountOperatorProfileEditor
              accountTitle={accountTitle}
              controller={operatorProfileController}
            />
            <details
              data-ui="account-identifiers"
              className="rounded-xl border border-slate-200 bg-white/70 dark:border-slate-800 dark:bg-slate-950/45"
            >
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                {t('admin.account_detail.customer_identifiers_title', undefined, 'Customer identifiers')}
              </summary>
              <div className="flex items-center justify-between gap-4 border-t border-slate-200 px-4 py-3 text-sm dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400">{t('admin.account_detail.account_id_label', undefined, 'Account ID')}</span>
                <BackofficeIdentifier value={account.account_id} className="text-xs text-slate-600 dark:text-slate-300" />
              </div>
            </details>
          </>
        ) : null}
        {activeDetailTab === 'commercial' ? (
        <div className="space-y-4">
          <div id="coverage-actions">
          {activeDetailTab === 'commercial' ? (
          <BackofficeStackCard className="overflow-hidden bg-white/80 p-0 dark:bg-slate-950/55">
            <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                  {t('admin.account_detail.current_coverage_title', undefined, 'Current coverage')}
                </p>
                <p className="mt-1 font-semibold text-gray-950 dark:text-white">{postureTitle}</p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{nextStepDescription}</p>
              </div>
              <BackofficeStatusBadge
                status={primarySubscription?.status || 'unknown'}
                label={translateStatusLabel(primarySubscription?.status || 'unknown', t)}
              />
            </div>
            <dl className="grid divide-y divide-slate-200 text-sm dark:divide-slate-800 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-5">
              {[
                {
                  label: t('common.package', {}, 'Package'),
                  value: primaryPackage.display_package_label,
                },
                {
                  label: t('admin.account_detail.coverage_type_label', undefined, 'Coverage type'),
                  value: translatePackageKindLabel(t, primaryPackage.package_kind),
                },
                {
                  label: t('admin.account_detail.coverage_state_label', undefined, 'Coverage'),
                  value: translateCoverageStateLabel(t, primaryPackage.coverage_state),
                },
                {
                  label: t('admin.period_end'),
                  value: primarySubscription?.current_period_end
                    ? formatDate(primarySubscription.current_period_end)
                    : t('common.not_found'),
                },
                {
                  label: t('admin.account_detail.next_step_label', undefined, 'Next focus'),
                  value: hasCoverageGap
                    ? t('admin.account_detail.next_focus_coverage', undefined, 'Customer coverage and site impact')
                    : t('admin.account_detail.next_focus_sites', undefined, 'Site footprint and runtime detail'),
                },
              ].map((item) => (
                <div key={item.label} className="min-w-0 px-4 py-3">
                  <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                    {item.label}
                  </dt>
                  <dd className="mt-1 truncate font-medium text-gray-950 dark:text-white" title={item.value}>
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          </BackofficeStackCard>
          ) : null}
          </div>
          <BackofficeStackCard>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
              {t('admin.account_detail.package_actions_eyebrow', undefined, 'Package actions')}
            </p>
            <h3 className="mt-3 text-lg font-semibold text-gray-950 dark:text-white">
              {activeDetailTab === 'commercial'
                ? t('admin.account_detail.commercial_actions_title', undefined, 'Package and Agency operations')
                : t('admin.account_detail.credit_actions_title', undefined, 'Top-up and credit adjustment')}
            </h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              {activeDetailTab === 'commercial'
                ? t(
                    'admin.account_detail.commercial_actions_desc',
                    undefined,
                    'Change the customer package or manage account-bound Agency quote and trial decisions.'
                  )
                : t(
                    'admin.account_detail.credit_actions_desc',
                    undefined,
                    'Add current-period headroom or write an audited adjustment without changing the package.'
                  )}
            </p>
            {activeDetailTab === 'commercial' ? (
            <>
            <div data-ui="account-package-collapsed" className="mt-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/45 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-950 dark:text-white">
                  {t('admin.account_detail.change_customer_package_label', undefined, 'Change customer package')}
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {primaryPackage.display_package_label} · {t('admin.account_detail.package_options_on_demand_desc', undefined, 'Compare package options only when a change is needed.')}
                </p>
              </div>
              <button type="button" className="btn btn-secondary whitespace-nowrap" onClick={() => setActiveDrawer('package')}>
                {t('admin.account_detail.open_package_options_action', undefined, 'Open package options')}
              </button>
            </div>
            <AdminInspectorDrawer
              open={activeDrawer === 'package'}
              title={t('admin.account_detail.change_customer_package_label', undefined, 'Change customer package')}
              titleId="account-package-options-title"
              eyebrow={t('admin.account_detail.package_actions_eyebrow', undefined, 'Package actions')}
              description={t('admin.account_detail.change_customer_package_desc', undefined, 'Switch this account to Free, Plus, Pro, or Agency. User workspace stays read-only.')}
              closeLabel={t('common.close', undefined, 'Close')}
              headerAccessory={<BackofficeStatusBadge status="ok" label={t('admin.operator_managed', {}, 'Operator managed')} />}
              onClose={() => setActiveDrawer(null)}
            >
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/30">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-700 dark:text-slate-300">
                    {t('admin.account_detail.change_customer_package_label', undefined, 'Change customer package')}
                  </p>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    {t(
                      'admin.account_detail.change_customer_package_desc',
                      undefined,
                      'Switch this account to Free, Plus, Pro, or Agency. User workspace stays read-only.'
                    )}
                  </p>
                </div>
                <BackofficeStatusBadge status="ok" label={t('admin.operator_managed', {}, 'Operator managed')} />
              </div>
              <AdminDataTableFrame
                title={t('admin.account_detail.change_customer_package_label', undefined, 'Change customer package')}
                resultLabel={t(
                  'admin.account_detail.package_option_count',
                  { count: formatInteger(QUICK_PACKAGE_OPTIONS.length) },
                  `${formatInteger(QUICK_PACKAGE_OPTIONS.length)} package options`
                )}
                dataUi="account-package-comparison"
                density="compact"
                headerVisibility="sr-only"
              >
                <table
                  className={ACCOUNT_DETAIL_COMPARISON_TABLE_CLASS_NAME}
                  aria-label={t('admin.account_detail.package_comparison_label', undefined, 'Customer package comparison')}
                >
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-950/45 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5">{t('common.package', {}, 'Package')}</th>
                      <th className="px-4 py-2.5">
                        {t('admin.account_detail.package_scope_label', undefined, 'Scope')}
                      </th>
                      <th className="px-4 py-2.5">{t('common.status')}</th>
                      <th className="px-4 py-2.5 text-right">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {QUICK_PACKAGE_OPTIONS.map((option) => {
                      const label = localizePackageAlias(t, option.tier_id, option.tier_id);
                      const isCurrent =
                        primarySubscription?.plan_id === option.plan_id ||
                        primarySubscription?.plan_version_id === option.plan_version_id ||
                        primaryPackage.display_package_label === label;
                      return (
                        <tr key={option.tier_id} className={cn(isCurrent && 'bg-emerald-50/55 dark:bg-emerald-950/10')}>
                          <td className="px-4 py-3 font-semibold text-slate-950 dark:text-white">{label}</td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                            {t('admin.account_detail.account_wide_scope', undefined, 'Customer account')}
                          </td>
                          <td className="px-4 py-3">
                            {isCurrent ? (
                              <BackofficeStatusBadge status="ok" label={t('common.current', {}, 'Current')} />
                            ) : (
                              <span className="text-slate-500 dark:text-slate-400">
                                {t('admin.account_detail.available_package_label', undefined, 'Available')}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              aria-label={`${label} · ${t('admin.account_detail.apply_package_action', undefined, 'Apply package')}`}
                              onClick={() => {
                                setActiveDrawer(null);
                                setPendingConfirmation({
                                  title: t('admin.account_detail.confirm_package_change_title', undefined, 'Confirm package change'),
                                  message: t(
                                    'admin.account_detail.confirm_package_change_desc',
                                    { package: label, account: account.name || account.account_id },
                                    `Change ${account.name || account.account_id} to ${label}? This updates the customer package immediately.`
                                  ),
                                  confirmLabel: t('admin.account_detail.confirm_package_change_action', undefined, 'Change package'),
                                  onConfirm: () => void handleChangePackage(option),
                                });
                              }}
                              className={cn('btn whitespace-nowrap', isCurrent ? 'btn-secondary' : 'btn-primary')}
                              disabled={packageActionPending !== null || isCurrent}
                            >
                              {isCurrent
                                ? t('common.current', {}, 'Current')
                                : t('admin.account_detail.apply_package_action', undefined, 'Apply package')}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </AdminDataTableFrame>
            </div>
            </AdminInspectorDrawer>
            <div className="mt-5 flex flex-col gap-3 border-t border-slate-200 pt-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-950 dark:text-white">
                  {t('admin.account_detail.agency_commerce_label', undefined, 'Agency quote and trial')}
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {t('admin.account_detail.agency_commerce_desc', undefined, 'Create a quote or approve the shared 14-day trial only when requested.')}
                </p>
              </div>
              <button type="button" className="btn btn-secondary whitespace-nowrap" onClick={() => setActiveDrawer('agency')}>
                {t('admin.account_detail.open_agency_operations_action', undefined, 'Open Agency operations')}
              </button>
            </div>
            <AdminInspectorDrawer
              open={activeDrawer === 'agency'}
              title={t('admin.account_detail.agency_commerce_label', undefined, 'Agency quote and trial')}
              titleId="account-agency-operations-title"
              eyebrow={t('admin.account_detail.package_actions_eyebrow', undefined, 'Package actions')}
              description={t('admin.account_detail.agency_commerce_desc', undefined, 'Create an account-bound quote for Portal payment or approve the single shared 14-day trial.')}
              closeLabel={t('common.close', undefined, 'Close')}
              headerAccessory={<BackofficeStatusBadge status="warning" label={t('common.approval_required', {}, 'Approval required')} />}
              onClose={() => setActiveDrawer(null)}
            >
              <div className="grid gap-4">
                <label className="text-sm text-slate-700 dark:text-slate-200">
                  <span className="mb-2 block text-xs font-medium text-slate-500 dark:text-slate-400">
                    {t('admin.account_detail.agency_amount_label', undefined, '30-day price (CNY)')}
                  </span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={agencyForm.amount_cny}
                    onChange={(event) => setAgencyForm((current) => ({ ...current, amount_cny: event.target.value }))}
                    className="input w-full"
                  />
                </label>
                <label className="text-sm text-slate-700 dark:text-slate-200">
                  <span className="mb-2 block text-xs font-medium text-slate-500 dark:text-slate-400">
                    {t('admin.account_detail.agency_valid_days_label', undefined, 'Quote validity (days)')}
                  </span>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={agencyForm.valid_days}
                    onChange={(event) => setAgencyForm((current) => ({ ...current, valid_days: event.target.value }))}
                    className="input w-full"
                  />
                </label>
                <label className="text-sm text-slate-700 dark:text-slate-200">
                  <span className="mb-2 block text-xs font-medium text-slate-500 dark:text-slate-400">
                    {t('admin.account_detail.agency_trial_credits_label', undefined, 'Trial credit limit')}
                  </span>
                  <input
                    type="number"
                    min="0"
                    max="20000"
                    step="100"
                    value={agencyForm.trial_ai_credit_limit}
                    onChange={(event) => setAgencyForm((current) => ({ ...current, trial_ai_credit_limit: event.target.value }))}
                    className="input w-full"
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={agencyActionPending !== null}
                  onClick={() => void handleAgencyAction('quote')}
                >
                  {agencyActionPending === 'quote'
                    ? t('common.saving', {}, 'Saving...')
                    : t('admin.account_detail.create_agency_quote_action', undefined, 'Create Agency quote')}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={agencyActionPending !== null}
                  onClick={() => void handleAgencyAction('trial')}
                >
                  {agencyActionPending === 'trial'
                    ? t('common.saving', {}, 'Saving...')
                    : t('admin.account_detail.approve_agency_trial_action', undefined, 'Approve 14-day trial')}
                </button>
              </div>
              {agencyActionNotice ? (
                <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">{agencyActionNotice}</p>
              ) : null}
              {agencyActionError ? (
                <p className="mt-3 text-sm text-red-700 dark:text-red-300">{agencyActionError}</p>
              ) : null}
            </AdminInspectorDrawer>
            </>
            ) : null}
            {packageActionError ? (
              <BackofficeStackCard
                data-ui="account-package-action-error"
                className="mt-4 border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
              >
                {packageActionError}
              </BackofficeStackCard>
            ) : null}
            {activeDetailTab === 'commercial' ? (
            <>
            <div className="mt-5 flex flex-col gap-3 border-t border-gray-200 pt-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {t('admin.account_detail.package_actions_reveal', undefined, 'Repair subscription record')}
                </p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {t('admin.account_detail.package_controls_desc', undefined, 'Use only for subscription-level repair work.')}
                </p>
              </div>
              <button type="button" className="btn btn-secondary whitespace-nowrap" onClick={() => setActiveDrawer('subscription-repair')}>
                {t('admin.account_detail.open_subscription_repair_action', undefined, 'Open subscription repair')}
              </button>
            </div>
            <AdminInspectorDrawer
              open={activeDrawer === 'subscription-repair'}
              title={t('admin.account_detail.package_actions_reveal', undefined, 'Repair subscription record')}
              titleId="account-subscription-repair-title"
              eyebrow={t('admin.account_detail.current_coverage_title', undefined, 'Current coverage')}
              description={t('admin.account_detail.package_controls_desc', undefined, 'Only open these fields for subscription-level repair work. Normal package changes should use the package table.')}
              closeLabel={t('common.close', undefined, 'Close')}
              headerAccessory={<BackofficeStatusBadge status="warning" label={t('admin.audit_required', {}, 'Audit required')} />}
              onClose={() => setActiveDrawer(null)}
            >
            <div data-ui="advanced-coverage-controls" className="space-y-5">
            <div className="flex flex-wrap gap-3">
                {primarySubscription ? (
                  <Link
                    href={`/admin/subscriptions/${primarySubscription.subscription_id}`}
                    className="text-xs font-medium text-gray-500 underline decoration-dotted underline-offset-4 transition hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    {t('admin.coverage_open_subscription_detail_action', {}, 'Inspect detail')} →
                  </Link>
                ) : null}
              </div>
            <div className="grid gap-3">
              <label className="text-sm">
                <span className="mb-2 block font-medium text-gray-700 dark:text-gray-300">
                  {t('admin.account_detail.coverage_package_option_label', undefined, 'Coverage package option')}
                </span>
                <select
                  value={packageForm.plan_id}
                  onChange={(event) =>
                    setPackageForm((current) => {
                      const selected = packagePlanOptions.find((item) => item.plan_id === event.target.value);
                      return {
                        ...current,
                        plan_id: event.target.value,
                        plan_version_id: selected?.plan_version_id || current.plan_version_id,
                      };
                    })
                  }
                  className="input"
                >
                  <option value="">{t('common.select', {}, 'Select')}</option>
                  {packagePlanOptions.map((item) => (
                    <option key={item.plan_id} value={item.plan_id}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <span className="mt-2 block text-xs text-slate-500 dark:text-slate-400">
                  {selectedPackageOption
                    ? t(
                        'admin.account_detail.coverage_package_option_auto_hint',
                        undefined,
                        'The matching package release is applied automatically on this surface.'
                      )
                    : t(
                        'admin.account_detail.coverage_package_option_empty_hint',
                        undefined,
                        'Choose a coverage package option first. The matching package release will be applied automatically.'
                      )}
                </span>
              </label>
              <label className="text-sm">
                <span className="mb-2 block font-medium text-gray-700 dark:text-gray-300">
                  {t('common.status')}
                </span>
                <select
                  value={packageForm.status}
                  onChange={(event) =>
                    setPackageForm((current) => ({ ...current, status: event.target.value }))
                  }
                  className="input"
                >
                  <option value="active">{translateStatusLabel('active', t)}</option>
                  <option value="trialing">{translateStatusLabel('trialing', t)}</option>
                  <option value="past_due">{translateStatusLabel('past_due', t)}</option>
                  <option value="suspended">{translateStatusLabel('suspended', t)}</option>
                  <option value="canceled">{translateStatusLabel('canceled', t)}</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-2 block font-medium text-gray-700 dark:text-gray-300">
                  {t('admin.account_detail.subscription_record_label', undefined, 'Subscription record')}
                </span>
                <input
                  type="text"
                  value={packageForm.subscription_id}
                  onChange={(event) =>
                    setPackageForm((current) => ({ ...current, subscription_id: event.target.value }))
                  }
                  className="input"
                  placeholder="sub_account_current"
                />
              </label>
              <label className="text-sm">
                <span className="mb-2 block font-medium text-gray-700 dark:text-gray-300">
                  {t('portal.period_start', {}, 'Period Start')}
                </span>
                <input
                  type="datetime-local"
                  value={packageForm.current_period_start_at ? packageForm.current_period_start_at.slice(0, 16) : ''}
                  onChange={(event) =>
                    setPackageForm((current) => ({ ...current, current_period_start_at: event.target.value }))
                  }
                  className="input"
                />
              </label>
              <label className="text-sm">
                <span className="mb-2 block font-medium text-gray-700 dark:text-gray-300">
                  {t('portal.period_end', {}, 'Period End')}
                </span>
                <input
                  type="datetime-local"
                  value={packageForm.current_period_end_at ? packageForm.current_period_end_at.slice(0, 16) : ''}
                  onChange={(event) =>
                    setPackageForm((current) => ({ ...current, current_period_end_at: event.target.value }))
                  }
                  className="input"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  setActiveDrawer(null);
                  setPendingConfirmation({
                    title: t('admin.account_detail.confirm_package_repair_title', undefined, 'Confirm subscription repair'),
                    message: t(
                      'admin.account_detail.confirm_package_repair_desc',
                      { account: account.name || account.account_id },
                      `Apply the subscription repair fields to ${account.name || account.account_id}?`
                    ),
                    confirmLabel: t('admin.account_detail.change_package_action', undefined, 'Change package'),
                    onConfirm: () => void handleChangePackage(),
                  });
                }}
                className="btn btn-secondary"
                disabled={packageActionPending !== null || topUpActionPending !== null}
              >
                {packageActionPending === 'change'
                  ? t('common.saving', {}, 'Saving...')
                  : t('admin.account_detail.change_package_action', undefined, 'Change package')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveDrawer(null);
                  setPendingConfirmation({
                    title: t('admin.account_detail.confirm_suspend_title', undefined, 'Confirm suspension'),
                    message: t(
                      'admin.account_detail.confirm_suspend_desc',
                      { account: account.name || account.account_id },
                      `Suspend current coverage for ${account.name || account.account_id}?`
                    ),
                    confirmLabel: t('admin.account_detail.suspend_coverage_action', undefined, 'Suspend coverage'),
                    variant: 'danger',
                    onConfirm: () => void handleCoverageMutation('suspend'),
                  });
                }}
                className="btn btn-secondary"
                disabled={packageActionPending !== null || topUpActionPending !== null || !primarySubscription}
              >
                {packageActionPending === 'suspend'
                  ? t('common.saving', {}, 'Saving...')
                  : t('admin.account_detail.suspend_coverage_action', undefined, 'Suspend coverage')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveDrawer(null);
                  setPendingConfirmation({
                    title: t('admin.account_detail.confirm_cancel_title', undefined, 'Confirm cancellation'),
                    message: t(
                      'admin.account_detail.confirm_cancel_desc',
                      { account: account.name || account.account_id },
                      `Cancel current coverage for ${account.name || account.account_id}?`
                    ),
                    confirmLabel: t('admin.account_detail.cancel_coverage_action', undefined, 'Cancel coverage'),
                    variant: 'danger',
                    onConfirm: () => void handleCoverageMutation('cancel'),
                  });
                }}
                className="btn btn-secondary"
                disabled={packageActionPending !== null || topUpActionPending !== null || !primarySubscription}
              >
                {packageActionPending === 'cancel'
                  ? t('common.saving', {}, 'Saving...')
                  : t('admin.account_detail.cancel_coverage_action', undefined, 'Cancel coverage')}
              </button>
            </div>
            <div className="space-y-4">
              {watchItems.map((item) => (
                <div key={item.label} className="flex items-start justify-between gap-4 border-b border-gray-200 pb-4 last:border-b-0 last:pb-0 dark:border-gray-800">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">{item.label}</p>
                    <p className={cn('mt-1 text-sm font-semibold text-gray-950 dark:text-white', item.toneClassName)}>
                      {item.value}
                    </p>
                  </div>
                  <p className="max-w-sm text-right text-sm text-gray-600 dark:text-gray-400">{item.detail}</p>
                </div>
              ))}
            </div>
            </div>
            </AdminInspectorDrawer>
            </>
            ) : null}
          </BackofficeStackCard>
        </div>
        ) : null}
      {activeDetailTab === 'credits' ? (
      <BackofficeSectionPanel id="quota-posture" className="!space-y-3 !p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-950 dark:text-white">
              {t('admin.account_detail.credit_operations_title', undefined, 'AI credit operations')}
            </h2>
            <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
              {t('admin.account_detail.credit_operations_desc', undefined, 'Review current-period headroom and open only the operation you need.')}
            </p>
          </div>
          <BackofficeStatusBadge
            status={
              creditEvidencePending
                ? 'pending'
                : creditEvidenceError
                  ? 'error'
                  : !creditEvidenceReady
                    ? 'unknown'
                    : quotaNeedsAttention
                      ? 'warning'
                      : 'ok'
            }
            label={
              creditEvidencePending
                ? t('common.loading')
                : creditEvidenceError
                  ? t('common.error')
                  : !creditEvidenceReady
                    ? t('common.unknown')
                    : quotaNeedsAttention
                      ? translateStatusLabel('warning', t)
                      : translateStatusLabel('ok', t)
            }
          />
        </div>

        <div
          data-ui="account-credit-operations"
          className={cn(
            'flex flex-col gap-2 rounded-xl border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between',
            quotaNeedsAttention
              ? 'border-amber-200 bg-amber-50/45 dark:border-amber-900 dark:bg-amber-950/15'
              : 'border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-950/35'
          )}
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-950 dark:text-white">
              {quotaNeedsAttention
                ? t('admin.account_detail.quota_attention_short', undefined, 'Quota needs attention')
                : t('admin.account_detail.credit_operations_label', undefined, 'Credit operations')}
            </p>
            {quotaNeedsAttention ? (
              <p className="mt-0.5 truncate text-xs text-slate-600 dark:text-slate-300">
                {t('admin.account_detail.topup_attention_desc', undefined, 'Compare current-period top-up options before usage is blocked.')}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={cn('btn whitespace-nowrap', quotaNeedsAttention ? 'btn-primary' : 'btn-secondary')}
                onClick={openTopUpOptions}
              >
                {t('admin.account_detail.open_topup_options_action', undefined, 'Open top-up options')}
              </button>
              <button
                type="button"
                className="btn btn-secondary whitespace-nowrap"
                onClick={() => {
                  setPackageActionError(null);
                  setCreditAdjustmentOpen(true);
                }}
              >
                {t('admin.account_detail.open_credit_adjustment_action', undefined, 'Adjust AI credits')}
              </button>
            </div>
            <span className="hidden h-6 w-px bg-slate-200 dark:bg-slate-700 lg:block" aria-hidden="true" />
            <div data-ui="account-credit-evidence-actions" className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-secondary whitespace-nowrap" onClick={() => setActiveDrawer('credit-ledger')}>
                {t('admin.account_detail.view_credit_ledger_action', { count: formatInteger(creditLedgerCount) }, `View ledger · ${formatInteger(creditLedgerCount)}`)}
              </button>
              <button
                type="button"
                className="btn btn-secondary whitespace-nowrap"
                onClick={() => {
                  setQuotaDetailTab('resources');
                  setQuotaDetailsOpen(true);
                }}
              >
                {t('admin.account_detail.open_quota_details_action', undefined, 'View quota details')}
              </button>
            </div>
          </div>
        </div>
        {topUpDialog}
        {creditAdjustmentDialog}

        {creditEvidencePending ? (
          <LoadingFallback />
        ) : creditEvidenceError || !creditEvidenceReady ? (
          <BackofficeDiagnosticNotice
            message={t(
              'admin.account_detail.load_error_desc',
              undefined,
              'Retry this bounded customer read without leaving the current operator route.'
            )}
            retryLabel={t('common.retry')}
            onRetry={() => {
              void Promise.all([
                creditEvidenceQuery.quotaQuery.refetch(),
                creditEvidenceQuery.ledgerQuery.refetch(),
              ]);
            }}
          />
        ) : (
          <>
          <div data-ui="account-credit-summary" className="overflow-hidden rounded-xl border border-slate-200 bg-white/80 dark:border-slate-800 dark:bg-slate-950/45">
            <BackofficeStackCard
              data-ui="account-credit-usage-summary"
              className="!rounded-none !border-0 !bg-transparent p-0"
            >
              <div className="grid divide-y divide-slate-200 text-sm dark:divide-slate-800 sm:grid-cols-[1.35fr_1fr_0.8fr] sm:divide-x sm:divide-y-0">
                <div className="px-4 py-3">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                    {t('admin.account_detail.ai_credits_label', undefined, 'AI credits')}
                  </p>
                  <p className={cn('mt-1 text-base font-semibold text-slate-950 dark:text-white', quotaToneClass(runBudgetSummary))}>
                    {formatInteger(Math.round(runBudgetSummary.used))} / {runBudgetSummary.unlimited ? unlimitedLabel : formatInteger(Math.round(runBudgetSummary.limit))}
                  </p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                    {t('admin.account_detail.quota_remaining_label', undefined, 'Remaining')}
                  </p>
                  <p className="mt-1 text-base font-semibold text-slate-950 dark:text-white">
                    {runBudgetSummary.unlimited ? unlimitedLabel : formatInteger(Math.round(runBudgetSummary.remaining))}
                  </p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                    {t('admin.account_detail.quota_usage_ratio_label', undefined, 'Usage')}
                  </p>
                  <p className={cn('mt-1 text-base font-semibold text-slate-950 dark:text-white', quotaToneClass(runBudgetSummary))}>
                    {formatUsageRatio(runBudgetSummary, unlimitedLabel)}
                  </p>
                </div>
              </div>
              <div className="h-1.5 bg-slate-200 dark:bg-slate-800">
                <div
                  className={cn(
                    'h-full',
                    runBudgetSummary.overLimit || runBudgetSummary.usageRatio >= 1
                      ? 'bg-red-500'
                      : runBudgetSummary.usageRatio >= 0.8
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                  )}
                  style={{ width: `${runBudgetSummary.unlimited ? 0 : Math.min(100, Math.max(0, runBudgetSummary.usageRatio * 100))}%` }}
                />
              </div>
            </BackofficeStackCard>

        <div data-ui="account-credit-support-rows" className="divide-y divide-slate-200 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          <BackofficeStackCard className="!rounded-none !border-0 !bg-transparent !px-3 !py-2.5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-950 dark:text-white">
                  {t('admin.account_detail.credit_ledger_title', undefined, 'Credit ledger detail')}
                </h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {t(
                    'admin.account_detail.credit_ledger_desc',
                    undefined,
                    'Current-period consume, grant, adjustment, and refund records from the AI credit ledger.'
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                <div className="text-left sm:text-right">
                <p className="text-sm font-semibold text-gray-950 dark:text-white">
                  {formatInteger(Math.round(creditLedgerNetUsed))}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t(
                    'admin.account_detail.credit_ledger_net_used_label',
                    { count: formatInteger(creditLedgerCount), granted: formatInteger(Math.round(creditLedgerGranted)) },
                    `Net used, ${formatInteger(creditLedgerCount)} records, ${formatInteger(Math.round(creditLedgerGranted))} granted`
                  )}
                </p>
                </div>
              </div>
            </div>
          </BackofficeStackCard>
          <AdminInspectorDrawer
            open={activeDrawer === 'credit-ledger'}
            title={t('admin.account_detail.credit_ledger_title', undefined, 'Credit ledger detail')}
            titleId="account-credit-ledger-title"
            eyebrow={t('admin.account_detail.quota_eyebrow', undefined, 'Quota posture')}
            description={t('admin.account_detail.credit_ledger_desc', undefined, 'Current-period consume, grant, adjustment, and refund records from the AI credit ledger.')}
            closeLabel={t('common.close', undefined, 'Close')}
            headerAccessory={<BackofficeStatusBadge status="ok" label={t('admin.account_detail.credit_ledger_record_count', { count: formatInteger(creditLedgerCount) }, `${formatInteger(creditLedgerCount)} records`)} />}
            onClose={() => setActiveDrawer(null)}
          >
            {creditLedgerItems.length > 0 ? (
              <div className="overflow-hidden rounded-[1rem] border border-slate-200 dark:border-slate-800">
                <div className="hidden grid-cols-[1.15fr_0.85fr_0.7fr_0.9fr] gap-3 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-950/45 dark:text-slate-400 sm:grid">
                  <span>{t('admin.account_detail.credit_ledger_source', undefined, 'Source')}</span>
                  <span>{t('admin.account_detail.credit_ledger_quantity', undefined, 'Quantity')}</span>
                  <span className="text-right">{t('admin.account_detail.credit_ledger_credits', undefined, 'Credits')}</span>
                  <span className="text-right">{t('admin.account_detail.credit_ledger_time', undefined, 'Time')}</span>
                </div>
                <div className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
                  {creditLedgerItems.map((entry) => (
                    <div
                      key={entry.ledger_entry_id || `${entry.source_type}-${entry.created_at}`}
                      className="grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-[1.15fr_0.85fr_0.7fr_0.9fr] sm:gap-3"
                    >
                      <div>
                        <p className="font-medium text-slate-950 dark:text-white">
                          {creditBreakdownLabel(
                            {
                              key: entry.source_type,
                              quantity: entry.quantity,
                              unit: entry.unit,
                              rate: Number(entry.rate || 0),
                              ai_credits: Math.abs(Number(entry.net_ai_credit_delta ?? entry.ai_credit_delta ?? 0)),
                            },
                            t
                          )}
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {entry.event_type || t('portal.usage.credit_ledger_default_event', {}, 'Usage event')}
                        </p>
                      </div>
                      <p className="text-slate-700 dark:text-slate-300">
                        {formatInteger(Math.round(Number(entry.quantity || 0)))} {entry.unit}
                      </p>
                      <p className="font-semibold text-slate-950 dark:text-white sm:text-right">
                        {formatSignedCreditDelta(Number(entry.net_ai_credit_delta ?? entry.ai_credit_delta ?? 0))}
                      </p>
                      <p className="text-slate-500 dark:text-slate-400 sm:text-right">
                        {entry.created_at ? formatDate(entry.created_at) : '-'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <BackofficeEmptyState
                title={t('admin.account_detail.credit_ledger_empty', undefined, 'No ledger records this period')}
                description={t(
                  'admin.account_detail.credit_ledger_empty_desc',
                  undefined,
                  'This account has no AI credit ledger entries in the current period.'
                )}
              />
            )}
          </AdminInspectorDrawer>

          <BackofficeStackCard className="!rounded-none !border-0 !bg-transparent !px-3 !py-2.5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-950 dark:text-white">
                  {t('admin.account_detail.resource_limits_title', undefined, 'Resource limits')}
                </h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {t(
                    'admin.account_detail.resource_limits_summary_desc',
                    { count: formatInteger(resourceRows.length) },
                    `${formatInteger(resourceRows.length)} limits · open only when checking capacity or a quota warning.`
                  )}
                </p>
              </div>
            </div>
          </BackofficeStackCard>
          <AdminWorkbenchDialog
            open={quotaDetailsOpen}
            title={t('admin.account_detail.quota_details_title', undefined, 'Quota details')}
            titleId="account-quota-details-title"
            closeLabel={t('common.close', undefined, 'Close')}
            cancelLabel={t('common.close', undefined, 'Close')}
            saveLabel={t('common.close', undefined, 'Close')}
            savingLabel={t('common.loading', undefined, 'Loading')}
            saving={false}
            footerNotice={t('admin.account_detail.resource_limits_drawer_desc', undefined, 'Review resource limits, credit components, and advanced evidence without extending the default page.')}
            hideFooterActions
            width="wide"
            density="compact"
            headerAccessory={<BackofficeStatusBadge status={quotaNeedsAttention ? 'warning' : 'ok'} label={quotaNeedsAttention ? translateStatusLabel('warning', t) : translateStatusLabel('ok', t)} />}
            onClose={() => setQuotaDetailsOpen(false)}
            onSubmit={() => undefined}
          >
            <div
              role="tablist"
              aria-label={t('admin.account_detail.quota_detail_tabs_label', undefined, 'Quota detail sections')}
              data-ui="account-quota-detail-tabs"
              className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800"
            >
              {([
                {
                  id: 'resources' as const,
                  label: t('admin.account_detail.resource_limits_title', undefined, 'Resource limits'),
                },
                {
                  id: 'components' as const,
                  label: `${t('admin.account_detail.credit_components_label', undefined, 'Credit components')} · ${formatInteger((quotaSummary?.breakdown || []).length)}`,
                },
                {
                  id: 'advanced' as const,
                  label: t('admin.account_detail.advanced_quota_information_title', undefined, 'Advanced information'),
                },
              ]).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={quotaDetailTab === tab.id}
                  className={cn(
                    'shrink-0 border-b-2 px-3 py-2 text-sm font-semibold transition',
                    quotaDetailTab === tab.id
                      ? 'border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-200'
                      : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  )}
                  onClick={() => setQuotaDetailTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {quotaDetailTab === 'resources' ? (
            <AdminDataTableFrame
              title={t('admin.account_detail.resource_limits_title', undefined, 'Resource limits')}
              resultLabel={t(
                'admin.account_detail.resource_limit_count',
                { count: formatInteger(resourceRows.length) },
                `${formatInteger(resourceRows.length)} resource limits`
              )}
              dataUi="account-resource-limits"
              density="compact"
              headerVisibility="sr-only"
            >
              <table
                className={ACCOUNT_DETAIL_COMPARISON_TABLE_CLASS_NAME}
                aria-label={t('admin.account_detail.resource_limits_table_label', undefined, 'Account resource limits')}
              >
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-950/45 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5">
                      {t('admin.account_detail.resource_column', undefined, 'Resource')}
                    </th>
                    <th className="px-4 py-2.5">
                      {t('admin.account_detail.resource_used_column', undefined, 'Used')}
                    </th>
                    <th className="px-4 py-2.5">
                      {t('admin.account_detail.resource_limit_column', undefined, 'Limit')}
                    </th>
                    <th className="px-4 py-2.5">
                      {t('admin.account_detail.quota_remaining_label', undefined, 'Remaining')}
                    </th>
                    <th className="px-4 py-2.5">{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {resourceRows.map((metric) => {
                    const remaining = metric.unlimited
                      ? unlimitedLabel
                      : metric.unit === 'cny'
                        ? formatAdminCurrency(Math.max(0, Number(metric.limit || 0) - Number(metric.used || 0)))
                        : formatInteger(Math.max(0, Math.round(Number(metric.limit || 0) - Number(metric.used || 0))));
                    return (
                      <tr key={metric.key}>
                        <td className="px-4 py-3 font-medium text-slate-950 dark:text-white">
                          {quotaMetricLabel(metric, t)}
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                          {formatQuotaMetricValue(metric)}
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                          {formatQuotaMetricLimit(metric)}
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{remaining}</td>
                        <td className="px-4 py-3">
                          <BackofficeStatusBadge
                            status={
                              metric.status === 'limited'
                                ? 'error'
                                : metric.status === 'near_limit'
                                  ? 'warning'
                                  : 'ok'
                            }
                            label={
                              metric.status === 'limited' && metric.key === 'active_api_key_sites'
                                ? t('admin.account_detail.key_coverage_gap_status', undefined, 'Key coverage gap')
                                : metric.status === 'limited'
                                  ? t('admin.account_detail.limit_reached_status', undefined, 'Limit reached')
                                : metric.status === 'near_limit'
                                  ? t('admin.account_detail.near_limit_status', undefined, 'Near limit')
                                  : translateStatusLabel('ok', t)
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </AdminDataTableFrame>
            ) : null}
            {quotaDetailTab === 'components' ? creditComponentsPanel : null}
            {quotaDetailTab === 'advanced' ? (
              <div data-ui="account-advanced-quota" className="rounded-xl border border-slate-200 bg-slate-50/55 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/35">
            {internalLimitRows.length > 0 ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                  {t('admin.account_detail.internal_guardrails_title', undefined, 'Internal guardrails')}
                </p>
                <div className="mt-3 space-y-2 text-sm text-gray-700 dark:text-gray-300">
                  {internalLimitRows.map((metric) => (
                    <div key={metric.key} className="flex items-center justify-between gap-4">
                      <span>{quotaMetricLabel(metric, t)}</span>
                      <span className={cn('font-semibold text-gray-950 dark:text-white', quotaMetricToneClass(metric))}>
                        {formatQuotaMetricValue(metric)} / {formatQuotaMetricLimit(metric)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className={cn('border-slate-200 dark:border-slate-800', internalLimitRows.length > 0 && 'mt-4 border-t pt-3')}>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                {t('admin.account_detail.operator_recommendations_title', undefined, 'Recommendations')}
              </p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-gray-700 dark:text-gray-300">
                {quotaRecommendationItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
              </div>
            ) : null}
          </AdminWorkbenchDialog>
        </div>
        </div>
          </>
        )}
      </BackofficeSectionPanel>
      ) : null}

      {activeDetailTab === 'sites' ? (
      <div id="site-footprint" className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <BackofficeSectionPanel className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
              {t('admin.site_coverage')}
            </p>
            <h2 className="mt-2 text-xl font-semibold text-gray-950 dark:text-white">
              {t('admin.account_detail.site_footprint_title', undefined, 'Site footprint')}
            </h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {t('admin.account_detail.site_footprint_desc', undefined, 'Use site coverage to decide whether the next operator step belongs on a site detail page or stays at the customer level.')}
            </p>
          </div>
          {siteOptions.length === 0 ? (
            <BackofficeEmptyState
              title={t('admin.account_detail.sites_empty_title', undefined, 'No sites on this customer')}
              description={t('admin.account_detail.sites_empty_desc', undefined, 'This customer does not have a connected site yet. Open the customer list or wait for site onboarding before making coverage changes.')}
              action={
                <Link href={returnTo} className="btn btn-secondary">
                  {t('common.accounts', undefined, 'Accounts')}
                </Link>
              }
            />
          ) : (
            <div className="space-y-3">
              <BackofficeMetricStrip
                columnsClassName="md:grid-cols-2 xl:grid-cols-2"
                items={[
                  { label: t('admin.active_sites'), value: formatInteger(siteOptions.length) },
                  {
                    label: t('admin.account_detail.user_site_workspace_metric', undefined, 'User site workspace'),
                    value: t('common.enabled', undefined, 'Enabled'),
                  },
                ]}
              />
              <div className="space-y-3">
                {siteOptions.map((site) => (
                  <BackofficeStackCard key={site.site_id} className="flex items-center justify-between gap-4">
                    <div>
                      <Link href={siteDetailHref(site.site_id)} className="font-mono text-sm font-semibold text-blue-600 hover:underline dark:text-blue-300">
                        <BackofficeIdentifier value={site.site_id} className="text-sm text-blue-600 dark:text-blue-300" />
                      </Link>
                      {site.name ? (
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{site.name}</p>
                      ) : null}
                    </div>
                    <BackofficeStatusBadge status={site.status} label={translateStatusLabel(site.status, t)} />
                  </BackofficeStackCard>
                ))}
              </div>
            </div>
          )}
        </BackofficeSectionPanel>
      </div>
      ) : null}

      {activeDetailTab === 'access' ? (
        <CustomerAccessPanel
          accountId={account.account_id}
          identity={account.primary_identity}
          relationshipState={account.identity_relationship_state}
          onAccessChanged={() => loadAccount(selectedSiteId, true)}
        />
      ) : null}

      {activeDetailTab === 'audit' ? (
        <div id="account-audit" className="space-y-6">
          <BackofficeSectionPanel className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                {t('admin.account_detail.audit_eyebrow', undefined, 'Audit')}
              </p>
              <h2 className="mt-2 text-xl font-semibold text-gray-950 dark:text-white">
                {t('admin.account_detail.audit_title', undefined, 'Recent customer operations')}
              </h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                {t('admin.account_detail.audit_desc', undefined, 'Review the latest governed customer and commercial operations before opening deeper evidence.')}
              </p>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <AdminMutationReceipt receipt={accountStatusReceipt} />
              <AdminMutationReceipt receipt={packageActionReceipt} />
            </div>
            <AdminAuditSummaryPanel
              title={t('admin.audit_summary.account_title', {}, 'Recent audit summary for this customer')}
              accountId={account.account_id}
            />
          </BackofficeSectionPanel>
        {hasAdvancedChecks ? (
        <BackofficeSectionPanel id="advanced-checks" data-ui="account-site-runtime-diagnostics">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                  {t('admin.account_detail.advanced_checks_eyebrow', undefined, 'Advanced checks')}
                </p>
                <h2 className="mt-2 text-xl font-semibold text-gray-950 dark:text-white">
                  {t('admin.provider_health_title', undefined, 'Model health & plan utilization')}
                </h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {t('admin.provider_health_desc', undefined, 'Per-site runtime health and cost utilization for this customer.')}
                </p>
              </div>
              <span className="text-sm font-medium text-blue-600 dark:text-blue-300">
                {t('common.view', {}, 'View')}
              </span>
          </summary>
          <div className="mt-5 space-y-3">
            {siteRuntimeQuery.isPending ? (
              <p
                role="status"
                data-ui="account-site-runtime-loading"
                className="text-sm text-gray-600 dark:text-gray-400"
              >
                {t('common.loading')}
              </p>
            ) : null}
            {siteRuntimeQuery.isError ? (
              <div data-ui="account-site-runtime-error">
                <BackofficeDiagnosticNotice
                  message={resolveUiErrorMessage(
                    siteRuntimeQuery.error,
                    t('error.failed_load')
                  )}
                  retryLabel={t('common.retry')}
                  onRetry={() => void siteRuntimeQuery.refetch()}
                />
              </div>
            ) : null}
            {failedSiteRuntimeIds.length > 0 ? (
              <div data-ui="account-site-runtime-partial-error">
                <BackofficeDiagnosticNotice
                  message={`${t('error.failed_load')}: ${failedSiteRuntimeIds.join(', ')}`}
                  retryLabel={t('common.retry')}
                  onRetry={() => void siteRuntimeQuery.refetch()}
                />
              </div>
            ) : null}
            {Object.entries(siteRuntimeData).map(([siteId, runtime]) => {
              const failureRate = runtime.totalRuns > 0
                ? Math.round((runtime.failedRuns / runtime.totalRuns) * 100)
                : 0;
              const healthStatus = failureRate >= 50 ? 'error' : failureRate >= 20 ? 'warning' : 'ok';
              const siteName = account?.sites?.find((s) => s.site_id === siteId)?.name || siteId;
              return (
                <BackofficeStackCard
                  key={siteId}
                  data-ui="account-site-runtime-card"
                  data-site-id={siteId}
                  className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link href={siteDetailHref(siteId)} className="font-mono text-sm font-semibold text-blue-600 hover:underline dark:text-blue-300">
                        <BackofficeIdentifier value={siteId} className="text-sm text-blue-600 dark:text-blue-300" />
                      </Link>
                      <BackofficeStatusBadge status={healthStatus} label={
                        healthStatus === 'ok'
                          ? t('admin.provider_healthy', undefined, 'Healthy')
                          : healthStatus === 'warning'
                            ? t('admin.provider_degraded', undefined, 'Degraded')
                            : t('admin.provider_unhealthy', undefined, 'Unhealthy')
                      } />
                    </div>
                    {siteName && siteName !== siteId ? (
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{siteName}</p>
                    ) : null}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3 sm:text-right">
                    <div>
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                        {t('admin.run_failure_rate', undefined, 'Failure rate')}
                      </p>
                      <p className={cn(
                        'mt-1 text-sm font-semibold',
                        failureRate >= 50 ? 'text-red-600 dark:text-red-400' : failureRate >= 20 ? 'text-amber-700 dark:text-amber-300' : 'text-gray-950 dark:text-white'
                      )}>
                        {failureRate}%
                      </p>
                    </div>
                    <div>
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                        {t('admin.cost_estimate', undefined, 'Cost estimate')}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-gray-950 dark:text-white">
                        {formatAdminCurrency(runtime.costEstimate)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                        {t('admin.tokens_used', undefined, 'Tokens used')}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-gray-950 dark:text-white">
                        {formatInteger(runtime.tokensTotal)}
                      </p>
                    </div>
                  </div>
                </BackofficeStackCard>
              );
            })}
          </div>
          </details>
        </BackofficeSectionPanel>
        ) : null}
        </div>
      ) : null}
        </div>
      </div>

      <ConfirmModal
        isOpen={Boolean(pendingConfirmation)}
        title={pendingConfirmation?.title}
        message={pendingConfirmation?.message || ''}
        confirmLabel={pendingConfirmation?.confirmLabel || t('common.confirm', {}, 'Confirm')}
        cancelLabel={t('common.cancel', {}, 'Cancel')}
        variant={pendingConfirmation?.variant || 'default'}
        onClose={() => setPendingConfirmation(null)}
        onConfirm={() => {
          pendingConfirmation?.onConfirm();
        }}
      >
        {pendingConfirmation?.showSuspendReason ? (
          <label className="block text-sm">
            <span className="mb-2 block font-medium text-gray-700 dark:text-gray-300">
              {t('admin.accounts.suspend_reason_label', {}, 'Suspension reason')}
            </span>
            <input
              type="text"
              value={suspendReason}
              onChange={(event) => setSuspendReason(event.target.value)}
              maxLength={200}
              placeholder={t('admin.accounts.suspend_reason_placeholder', {}, 'Optional short note for internal follow-up')}
              className="input"
            />
          </label>
        ) : null}
      </ConfirmModal>
    </BackofficePageStack>
  );
}

export default function AdminAccountDetailPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AccountDetailContent />
    </Suspense>
  );
}
