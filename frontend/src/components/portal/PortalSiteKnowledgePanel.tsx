'use client';

import Link from 'next/link';
import { PortalActionIcon } from '@/components/portal/PortalRowActions';
import {
  PortalCard,
  PortalInfoHint,
  PortalMetricStrip,
  PortalSection,
} from '@/components/portal/PortalScaffold';
import { PortalStatusBadge, PortalStatusInline } from '@/components/portal/PortalStatusBadge';
import { useLocale } from '@/contexts/LocaleContext';
import type { PortalVectorObservabilitySummary } from '@/lib/portal-client';
import { formatDate, formatNumber } from '@/lib/utils';
import { PortalLoadingState } from '@/components/portal/PortalPageState';

type PortalSiteKnowledgePanelProps = {
  summary: PortalVectorObservabilitySummary | null;
  isLoading?: boolean;
  error?: string;
  onRetry?: () => void;
};

export function PortalSiteKnowledgePanel({
  summary,
  isLoading = false,
  error = '',
  onRetry,
}: PortalSiteKnowledgePanelProps) {
  const { t } = useLocale();
  const totals = summary?.totals || null;
  const snapshot = summary?.index_snapshots?.[0] || null;
  // Describe the observed index, not a production performance guarantee or
  // a claim that an old index snapshot is the current runtime configuration.
  const localPreviewIndex = process.env.NEXT_PUBLIC_ENV === 'development'
    && snapshot?.vector_backend === 'postgres_json'
    && snapshot?.embedding_provider === 'ollama-m4-embedding';
  const indexedPages = Number(snapshot?.document_count ?? totals?.current_document_count ?? 0);
  const searchCount = Number(totals?.search_queries_total || 0);
  const noAnswerCount = Number(totals?.no_hit_total || 0);
  // A finished attempt may have failed; only the index snapshot proves an update.
  const lastUpdatedAt = snapshot?.last_indexed_at || '';
  const lastAttemptAt = totals?.last_index_job_finished_at || '';
  const hasKnowledge = indexedPages > 0 || Number(totals?.index_jobs_total || 0) > 0;
  const healthStatus = String(summary?.health?.status || '');
  const indexJobs = Number(totals?.index_jobs_total || 0);
  const indexSucceeded = Number(totals?.index_succeeded_total || 0);
  const indexFailed = Number(totals?.index_failed_total || 0);
  const failedSearches = Number(totals?.search_failed_total || 0);
  const highNoHitRate = searchCount > 0 && Number(totals?.no_hit_rate || 0) >= 0.25;
  const slowSearches = searchCount > 0 && Number(totals?.p95_search_latency_ms || 0) >= 1200;
  const searchNeedsAttention = failedSearches > 0 || highNoHitRate || slowSearches;
  // Report observed failures independently of the aggregate health score.
  const hardUpdateFailure = Boolean(
    indexFailed > 0
    && (
      indexedPages === 0
      || (indexJobs > 0 && indexSucceeded === 0)
    )
  );
  const softUpdateIssue = Boolean(
    indexedPages > 0 && indexFailed > 0 && !hardUpdateFailure
  );
  const needsAttention = Boolean(
    summary && (
      hardUpdateFailure || searchNeedsAttention || healthStatus === 'error'
      || (healthStatus === 'warning' && !softUpdateIssue)
    )
  );
  const windowDays = Math.max(1, Math.round(Number(summary?.window?.hours || 168) / 24));
  const slowOnlyWarning = needsAttention
    && indexFailed === 0 && failedSearches === 0
    && !highNoHitRate && slowSearches;
  const warningReasons = [
    indexFailed > 0 ? t('portal.vector_obs.warning_updates', { count: formatNumber(indexFailed) }, '{{count}} knowledge update(s) failed.') : '',
    failedSearches > 0 ? t('portal.vector_obs.warning_searches', { count: formatNumber(failedSearches) }, '{{count}} search(es) failed.') : '',
    highNoHitRate
      ? t('portal.vector_obs.warning_no_hits', { count: formatNumber(noAnswerCount), total: formatNumber(searchCount) }, '{{count}} of {{total}} searches found no related content.') : '',
    slowSearches
      ? t('portal.vector_obs.warning_slow', { seconds: (Number(totals?.p95_search_latency_ms || 0) / 1000).toFixed(1) }, '95% of searches finished within {{seconds}} seconds.') : '',
  ].filter(Boolean);

  // Only a partial update issue without other faults belongs in metric help.
  const softUpdateNote = softUpdateIssue && !needsAttention
    ? t(
        'portal.vector_obs.soft_update_note',
        { days: String(windowDays), count: formatNumber(indexFailed) },
        'In the last {{days}} days, {{count}} update(s) did not succeed. Indexed pages are still available.'
      )
    : '';
  let statusLabel = t('portal.vector_obs.status_pending', {}, 'To confirm');
  if (hardUpdateFailure) {
    statusLabel = t('portal.vector_obs.status_error', {}, 'Update failed');
  } else if (failedSearches > 0) {
    statusLabel = t('portal.vector_obs.status_search_failed', {}, 'Searches failed');
  } else if (slowOnlyWarning) {
    statusLabel = localPreviewIndex
      ? t('portal.vector_obs.status_local_slow', {}, 'Development searches were slow')
      : t('portal.vector_obs.status_slow', {}, 'Searches were slow');
  } else if (needsAttention) {
    statusLabel = t('portal.vector_obs.status_attention', {}, 'Needs attention');
  } else if (!hasKnowledge) {
    statusLabel = t('portal.vector_obs.status_empty', {}, 'Not started');
  } else if (softUpdateIssue || healthStatus === 'inactive') {
    statusLabel = t('portal.vector_obs.status_usable', {}, 'Knowledge is usable');
  } else if (healthStatus === 'ok') {
    statusLabel = t('portal.vector_obs.status_ready', {}, 'Knowledge is ready');
  }
  const displayedStatusLabel = error
    ? t('portal.home.package_pending_label', {}, 'To confirm')
    : summary
      ? statusLabel
      : t('common.loading');
  const statusTone = error
    ? 'neutral'
    : hardUpdateFailure || failedSearches > 0
      ? 'error'
      : needsAttention
        ? 'warning'
        : healthStatus === 'ok' && hasKnowledge && !softUpdateIssue
          ? 'active'
          : 'neutral';
  const showRefresh = Boolean(error || hardUpdateFailure || softUpdateIssue || needsAttention
    || (summary && hasKnowledge && !['ok', 'inactive'].includes(healthStatus)));
  let nextStep: string;
  if (hardUpdateFailure) {
    nextStep = t('portal.vector_obs.update_failed_next', {}, 'Check the failed content update in the WordPress Cloud Addon. If it still fails, contact support with the page and time. Refresh only reads status; it does not retry updates or clear historical records.');
  } else if (failedSearches > 0) {
    nextStep = t('portal.vector_obs.search_failed_next', {}, 'If searches are still failing, contact support with an example and time. Refresh only reads status; it does not rerun searches or clear historical records.');
  } else if (slowOnlyWarning) {
    nextStep = localPreviewIndex
      ? t('portal.vector_obs.warning_next_local_slow', {}, 'Local development: the latest index uses the local search setup. Its response time does not represent the hosted vector services planned for launch. Continue checking search results; latency is a development task and does not require reconnecting or resyncing the site.')
      : t('portal.vector_obs.warning_next_slow', {}, 'You can continue using site knowledge. If searches still feel slow, contact support with the search and time. Reconnecting the site or resyncing content is not needed solely for this latency notice.');
  } else {
    nextStep = t('portal.vector_obs.warning_next', {}, 'Check Saved pages and Last updated below against the content you expect to use. If pages are missing or outdated, check the Cloud Addon connection in WordPress. If searches still fail or cannot find existing content, submit a ticket with an example and time. Refresh only reads status; it does not resync content or clear historical records.');
  }
  const knowledgeDesc = t(
    'portal.vector_obs.customer_desc',
    {},
    'Site knowledge helps AI use this site\'s pages. Content changes are updated automatically.'
  );
  const knowledgeScopeNote = t(
    'portal.vector_obs.site_scope_note',
    {},
    'The figures below describe this site only. Account-wide limits are shown under Billing.'
  );
  const refreshLabel = t('common.refresh', {}, 'Refresh');
  const updateHint = t(
    'portal.vector_obs.update_hint',
    {},
    'Content changes are updated automatically from the connected WordPress site.'
  );
  const helpAria = [knowledgeDesc, knowledgeScopeNote].filter(Boolean).join(' ');
  const attemptNote = lastAttemptAt ? t(
    'portal.vector_obs.last_attempt',
    { time: formatDate(lastAttemptAt) },
    'Latest update attempt finished: {{time}}. This does not establish when content was successfully updated.'
  ) : '';
  const lastUpdatedDetailLabel = [updateHint, softUpdateNote,
    needsAttention && indexFailed > 0 ? '' : attemptNote].filter(Boolean).join(' ');

  return (
    <PortalSection
      id="site-knowledge"
      className="scroll-mt-24 space-y-3 p-3 md:px-4 md:py-3"
      data-portal-site="site-knowledge"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
          {t('portal.vector_obs.title', {}, 'Site knowledge')}
        </h2>
        <PortalInfoHint
          label={t('portal.vector_obs.title', {}, 'Site knowledge')}
          aria-label={helpAria}
          data-portal-site="knowledge-help"
          detail={(
            <>
              <span className="block">{knowledgeDesc}</span>
              <span className="mt-1 block text-slate-500 dark:text-slate-400">{knowledgeScopeNote}</span>
            </>
          )}
        />
        {softUpdateIssue && !needsAttention ? (
          <PortalStatusInline
            label={displayedStatusLabel}
            className="normal-case tracking-normal"
          />
        ) : (
          <PortalStatusBadge
            status={statusTone}
            label={displayedStatusLabel}
            className="normal-case tracking-normal"
          />
        )}
        {onRetry && showRefresh ? (
          <button
            type="button"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200/90 bg-white text-slate-700 transition hover:border-slate-300 hover:text-slate-950 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:text-white"
            onClick={onRetry}
            disabled={isLoading}
            aria-label={refreshLabel}
            title={refreshLabel}
            data-portal-site="knowledge-refresh"
          >
            <PortalActionIcon id="recheck" />
          </button>
        ) : null}
      </div>

      {isLoading ? (
        <PortalLoadingState message={t('common.loading')} compact />
      ) : null}

      {error ? (
        <PortalCard className="border-amber-200 bg-amber-50/70 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
          {t(
            'portal.vector_obs.load_failed',
            {},
            'Site knowledge status could not be loaded. Try again later.'
          )}
        </PortalCard>
      ) : null}

      {!isLoading && !error && summary && needsAttention ? (
        <div className="space-y-2 text-sm leading-6 text-slate-600 dark:text-slate-300" data-portal-site="knowledge-guidance">
          <p>
            {t('portal.vector_obs.warning_period', { days: String(windowDays) }, 'In the last {{days}} days:')}{' '}
            {warningReasons.join(' ') || t('portal.vector_obs.warning_unknown', {}, 'Knowledge health needs review; the exact cause is not identified here.')}
          </p>
          {hardUpdateFailure || failedSearches > 0 ? (
            <p>{indexedPages > 0
              ? t('portal.vector_obs.saved_pages_preserved', { count: formatNumber(indexedPages) }, '{{count}} indexed pages are retained.')
              : t('portal.vector_obs.no_saved_pages', {}, 'No pages are indexed yet.')}</p>
          ) : null}
          {indexFailed > 0 && attemptNote ? <p>{attemptNote}</p> : null}
          {slowOnlyWarning ? (
            <p>{t('portal.vector_obs.warning_slow_successes', { queries: formatNumber(searchCount), updates: formatNumber(indexJobs) }, 'No failed searches or knowledge updates were recorded ({{queries}} searches, {{updates}} updates).')}</p>
          ) : null}
          {slowOnlyWarning && totals?.last_search_finished_at ? (
            <p>{t('portal.vector_obs.warning_last_search', { time: formatDate(totals.last_search_finished_at) }, 'Last recorded search: {{time}}. These historical figures do not establish current response time.')}</p>
          ) : null}
          <p>{nextStep}</p>
          <Link className="btn btn-secondary btn-sm" href={`/portal/support?new=1&topic=site&site=${encodeURIComponent(summary.site_id)}`}>
            {t('portal.site_attention_contact_support', {}, 'Contact support')}
          </Link>
        </div>
      ) : null}

      {!isLoading && !error && summary && !hasKnowledge && !needsAttention ? (
        <PortalCard className="text-sm leading-6 text-slate-600 dark:text-slate-300">
          {t(
            'portal.vector_obs.customer_empty_desc',
            {},
            'No pages have been added yet. Content changes will be updated automatically after the site is connected.'
          )}
        </PortalCard>
      ) : null}

      {!isLoading && !error && summary && (hasKnowledge || searchCount > 0) ? (
        <PortalMetricStrip
          layout="grid"
          variant="header"
          items={[
            {
              label: t('portal.vector_obs.indexed', {}, 'Saved pages'),
              value: formatNumber(indexedPages),
              detail: t(
                'portal.vector_obs.indexed_detail',
                {},
                'Pages currently available to site knowledge.'
              ),
              detailDisplay: 'hint',
            },
            {
              label: t('portal.vector_obs.last_indexed', {}, 'Last updated'),
              value: lastUpdatedAt
                ? formatDate(lastUpdatedAt)
                : t('portal.home.package_pending_label', {}, 'To confirm'),
              detail: (
                <>
                  <span className="block">{updateHint}</span>
                  {softUpdateNote ? <span
                    className="mt-1 block text-slate-500 dark:text-slate-400"
                    data-portal-site="knowledge-soft-note-help"
                  >
                    {softUpdateNote}
                  </span> : null}
                  {attemptNote && !(needsAttention && indexFailed > 0) ? <span className="mt-1 block text-slate-500 dark:text-slate-400">{attemptNote}</span> : null}
                </>
              ),
              detailLabel: lastUpdatedDetailLabel,
              detailDisplay: 'hint',
              hintProps: {
                'data-portal-site': 'knowledge-last-updated-help',
                ...(softUpdateNote ? { 'data-portal-knowledge-soft': '1' } : {}),
              },
              hintPanelProps: softUpdateNote
                ? { 'data-portal-site': 'knowledge-soft-note-help' }
                : undefined,
              size: 'compact',
            },
            {
              label: t(
                'portal.vector_obs.recent_usage',
                { days: String(windowDays) },
                'Recent use'
              ),
              value: t(
                'portal.vector_obs.search_count',
                { count: formatNumber(searchCount) },
                '{{count}} searches'
              ),
              detail: t(
                'portal.vector_obs.no_answer_detail',
                { count: formatNumber(noAnswerCount) },
                '{{count}} could not find related content.'
              ),
              detailDisplay: 'hint',
              size: 'compact',
            },
          ]}
        />
      ) : null}
    </PortalSection>
  );
}
