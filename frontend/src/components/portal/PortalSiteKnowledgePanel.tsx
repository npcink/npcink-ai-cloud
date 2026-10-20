'use client';

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
  const indexedPages = Number(snapshot?.document_count ?? totals?.current_document_count ?? 0);
  const searchCount = Number(totals?.search_queries_total || 0);
  const noAnswerCount = Number(totals?.no_hit_total || 0);
  const lastUpdatedAt = snapshot?.last_indexed_at || totals?.last_index_job_finished_at || '';
  const hasKnowledge = indexedPages > 0 || Number(totals?.index_jobs_total || 0) > 0;
  const healthStatus = String(summary?.health?.status || '');
  const indexJobs = Number(totals?.index_jobs_total || 0);
  const indexSucceeded = Number(totals?.index_succeeded_total || 0);
  const indexFailed = Number(totals?.index_failed_total || 0);
  // Hard failure: empty index, or every recent index job failed with nothing succeeding.
  const hardUpdateFailure = Boolean(
    hasKnowledge
    && healthStatus === 'error'
    && (
      indexedPages === 0
      || (indexJobs > 0 && indexSucceeded === 0 && indexFailed > 0)
    )
  );
  const softUpdateIssue = Boolean(
    hasKnowledge && healthStatus === 'error' && !hardUpdateFailure
  );
  const needsAttention = Boolean(
    hasKnowledge && summary && healthStatus === 'warning'
  );
  const windowDays = Math.max(1, Math.round(Number(summary?.window?.hours || 168) / 24));
  const softFailedCount = Math.max(0, indexFailed);
  const softUpdateNote = softUpdateIssue
    ? (softFailedCount > 0
      ? t(
        'portal.vector_obs.soft_update_note',
        { days: String(windowDays), count: formatNumber(softFailedCount) },
        'In the last {{days}} days, {{count}} update(s) did not succeed. Indexed pages are still available.'
      )
      : t(
        'portal.vector_obs.soft_update_note_generic',
        { days: String(windowDays) },
        'In the last {{days}} days knowledge health dipped (slow or incomplete updates). Indexed pages are still available.'
      ))
    : '';
  // Soft issues stay usable — no mystery yellow 「更新异常」 badge.
  const statusLabel = !hasKnowledge
    ? t('portal.vector_obs.status_empty', {}, 'Not started')
    : hardUpdateFailure
      ? t('portal.vector_obs.status_error', {}, 'Update failed')
      : softUpdateIssue
        ? t('portal.vector_obs.status_usable', {}, 'Knowledge is usable')
        : needsAttention
          ? t('portal.vector_obs.status_attention', {}, 'Needs attention')
          : t('portal.vector_obs.status_ready', {}, 'Knowledge is ready');
  const displayedStatusLabel = error
    ? t('portal.home.package_pending_label', {}, 'To confirm')
    : summary
      ? statusLabel
      : t('common.loading');
  const statusTone = error || !hasKnowledge
    ? 'inactive'
    : hardUpdateFailure
      ? 'error'
      : needsAttention
        ? 'warning'
        : 'active';
  const showRefresh = Boolean(error || hardUpdateFailure || softUpdateIssue || needsAttention);
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
  const lastUpdatedDetailLabel = softUpdateNote
    ? `${updateHint} ${softUpdateNote}`
    : updateHint;

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
        {softUpdateIssue ? (
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

      {!isLoading && !error && summary && !hasKnowledge ? (
        <PortalCard className="text-sm leading-6 text-slate-600 dark:text-slate-300">
          {t(
            'portal.vector_obs.customer_empty_desc',
            {},
            'No pages have been added yet. Content changes will be updated automatically after the site is connected.'
          )}
        </PortalCard>
      ) : null}

      {!isLoading && !error && summary && hasKnowledge ? (
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
              detail: softUpdateNote ? (
                <>
                  <span className="block">{updateHint}</span>
                  <span
                    className="mt-1 block text-slate-500 dark:text-slate-400"
                    data-portal-site="knowledge-soft-note-help"
                  >
                    {softUpdateNote}
                  </span>
                </>
              ) : updateHint,
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
