'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { LoadingFallback } from '@/components/ui/LoadingFallback';
import { BackofficeIdentifier } from '@/components/backoffice/BackofficeIdentifier';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';
import {
  BackofficeMetricStrip,
  BackofficePageStack,
  BackofficePrimaryPanel,
  BackofficeSectionPanel,
  BackofficeStackCard,
} from '@/components/backoffice/BackofficeScaffold';
import { useLocale } from '@/contexts/LocaleContext';
import { translateExternalCommercialRole } from '@/lib/admin-display';
import { resolveUiErrorMessage } from '@/lib/errors';
import { formatDate, formatNumber as formatInteger } from '@/lib/utils';

type AdminMemberItem = {
  member_ref: string;
  email?: string;
  identity_type?: string;
  role?: string;
  status?: string;
  invite_state?: string;
  accessible_site_count?: number;
  sites_needing_follow_up_count?: number;
  dev_baseline?: boolean;
  has_coverage_follow_up?: boolean;
  never_logged_in?: boolean;
  disabled_mapped?: boolean;
  last_login_at?: string;
  primary_account_id?: string;
  primary_follow_up_site_id?: string;
  single_covered_subscription_id?: string;
  accounts?: Array<{
    account_id?: string;
    account_name?: string;
    highlight_site_id?: string;
    highlight_subscription_id?: string;
  }>;
};

type AdminMembersPayload = {
  summary?: {
    total?: number;
    members_needing_coverage_follow_up?: number;
    never_logged_in_members?: number;
    disabled_mapped_members?: number;
    members_on_dev_baseline?: number;
  };
  items?: AdminMemberItem[];
};

function AdminMembersContent() {
  const { t } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedView = searchParams.get('view') || 'all';
  const [payload, setPayload] = useState<AdminMembersPayload | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setError('');

    fetch('/api/admin/members', { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(t('error.failed_load'));
        }
        const body = await response.json();
        if (alive) {
          setPayload(body.data as AdminMembersPayload);
        }
      })
      .catch((err) => {
        if (alive) {
          setError(resolveUiErrorMessage(err instanceof Error ? err.message : null, t('error.failed_load')));
        }
      });

    return () => {
      alive = false;
    };
  }, [t]);

  if (error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="max-w-md text-center">
          <h2 className="mb-4 text-2xl font-bold text-red-600">{t('common.error')}</h2>
          <p className="mb-6 text-gray-600 dark:text-gray-400">{error}</p>
          <button onClick={() => window.location.reload()} className="btn btn-primary">
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  if (!payload) {
    return <LoadingFallback />;
  }

  const members = payload.items || [];
  const visibleMembers =
    selectedView === 'coverage'
      ? members.filter((member) => member.has_coverage_follow_up || Number(member.sites_needing_follow_up_count || 0) > 0)
      : selectedView === 'pending_cleanup'
        ? members.filter((member) => member.never_logged_in || member.disabled_mapped || member.invite_state === 'pending')
        : members;

  const setView = (view: string) => {
    router.push(view === 'all' ? '/admin/members' : `/admin/members?view=${view}`);
  };

  return (
    <BackofficePageStack>
      <BackofficePrimaryPanel
        eyebrow={t('admin.operator_surface', {}, 'Operator surface')}
        title={t('admin.members_support_access_title', {}, 'Support access queue')}
        description={t(
          'admin.members_support_access_desc',
          {},
          'Review portal access, coverage-risk members, and cleanup candidates without changing the customer coverage truth.'
        )}
        aside={
          <div className="w-full xl:w-[40rem]">
            <BackofficeMetricStrip
              columnsClassName="md:grid-cols-4"
              items={[
                { label: t('common.members', {}, 'Members'), value: formatInteger(Number(payload.summary?.total || members.length)), size: 'compact' },
                {
                  label: t('admin.coverage_risks', {}, 'Coverage risks'),
                  value: formatInteger(Number(payload.summary?.members_needing_coverage_follow_up || 0)),
                  size: 'compact',
                },
                {
                  label: t('admin.pending_invites', {}, 'Pending invites'),
                  value: formatInteger(Number(payload.summary?.never_logged_in_members || 0)),
                  size: 'compact',
                },
                {
                  label: t('admin.disabled_members', {}, 'Disabled members'),
                  value: formatInteger(Number(payload.summary?.disabled_mapped_members || 0)),
                  size: 'compact',
                },
              ]}
            />
          </div>
        }
      >
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setView('all')} className={selectedView === 'all' ? 'btn btn-primary' : 'btn btn-secondary'}>
            {t('admin.members_filter_all', {}, 'All members')}
          </button>
          <button type="button" onClick={() => setView('coverage')} className={selectedView === 'coverage' ? 'btn btn-primary' : 'btn btn-secondary'}>
            {t('admin.members_filter_coverage', {}, 'Coverage risks')}
          </button>
          <button
            type="button"
            onClick={() => setView('pending_cleanup')}
            className={selectedView === 'pending_cleanup' ? 'btn btn-primary' : 'btn btn-secondary'}
          >
            {t('admin.members_filter_pending_cleanup', {}, 'Pending access cleanup')}
          </button>
        </div>
      </BackofficePrimaryPanel>

      <BackofficeSectionPanel className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
            {t('admin.member_directory', {}, 'Member directory')}
          </p>
          <h2 className="mt-2 text-xl font-semibold text-gray-950 dark:text-white">
            {t('admin.member_directory', {}, 'Member directory')}
          </h2>
        </div>
        <div className="space-y-3">
          {visibleMembers.map((member) => {
            const firstAccount = member.accounts?.[0] || null;
            const accountId = member.primary_account_id || firstAccount?.account_id || '';
            const siteId = member.primary_follow_up_site_id || firstAccount?.highlight_site_id || '';
            const subscriptionId = member.single_covered_subscription_id || firstAccount?.highlight_subscription_id || '';
            return (
              <BackofficeStackCard key={member.member_ref} className="space-y-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <BackofficeIdentifier value={member.member_ref} className="text-sm font-semibold text-slate-950 dark:text-white" />
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{member.email || member.member_ref}</p>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                      {t('admin.product_role', {}, 'Product role')}: {translateExternalCommercialRole(member.identity_type || member.role || '', t)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <BackofficeStatusBadge status={member.status || 'unknown'} label={member.status || t('common.unknown')} />
                    {member.has_coverage_follow_up ? (
                      <BackofficeStatusBadge status="error" label={t('admin.coverage_follow_up_required', {}, 'Coverage follow-up required')} />
                    ) : null}
                    {member.dev_baseline ? (
                      <BackofficeStatusBadge status="warning" label={t('admin.dev_baseline', {}, 'Dev baseline')} />
                    ) : null}
                    {member.disabled_mapped ? (
                      <BackofficeStatusBadge status="warning" label={t('admin.disabled_mapping', {}, 'Disabled mapping')} />
                    ) : null}
                  </div>
                </div>
                <div className="grid gap-2 text-sm md:grid-cols-3">
                  <span className="rounded-2xl border border-slate-200/80 px-3 py-2 dark:border-slate-800">
                    {t('common.sites', {}, 'Sites')}: <strong>{formatInteger(Number(member.accessible_site_count || 0))}</strong>
                  </span>
                  <span className="rounded-2xl border border-slate-200/80 px-3 py-2 dark:border-slate-800">
                    {t('admin.sites_needing_follow_up', {}, 'Sites needing follow-up')}: <strong>{formatInteger(Number(member.sites_needing_follow_up_count || 0))}</strong>
                  </span>
                  <span className="rounded-2xl border border-slate-200/80 px-3 py-2 dark:border-slate-800">
                    {t('common.last_seen', {}, 'Last seen')}: <strong>{member.last_login_at ? formatDate(member.last_login_at) : t('common.not_found')}</strong>
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {accountId ? (
                    <Link href={`/admin/accounts/${accountId}`} className="btn btn-secondary btn-sm">
                      {t('common.account', {}, 'Account')}
                    </Link>
                  ) : null}
                  {siteId ? (
                    <Link href={`/admin/sites/${siteId}`} className="btn btn-secondary btn-sm">
                      {t('common.site', {}, 'Site')}
                    </Link>
                  ) : null}
                  {subscriptionId ? (
                    <Link href={`/admin/subscriptions/${subscriptionId}`} className="btn btn-secondary btn-sm">
                      {t('common.subscription', {}, 'Subscription')}
                    </Link>
                  ) : null}
                </div>
              </BackofficeStackCard>
            );
          })}
        </div>
      </BackofficeSectionPanel>
    </BackofficePageStack>
  );
}

export default function AdminMembersPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AdminMembersContent />
    </Suspense>
  );
}
