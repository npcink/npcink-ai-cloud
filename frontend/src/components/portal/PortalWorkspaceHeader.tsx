'use client';

import React from 'react';
import { PortalMetricStrip } from '@/components/portal/PortalScaffold';
import { useLocale } from '@/contexts/LocaleContext';
import {
  getPortalSiteDisplayName,
  getPortalSiteSecondaryLabel,
  getVisiblePortalSites,
} from '@/lib/portal-site-display';
import { cn } from '@/lib/utils';

export type PortalWorkspacePage =
  | 'keys'
  | 'usage'
  | 'billing'
  | 'audit'
  | 'monitoring'
  | 'record'
  | 'sites'
  | 'support'
  | 'account'
  | 'notifications'
  | 'home';

export type PortalWorkspaceMetric = {
  label: string;
  value: React.ReactNode;
  detail?: string;
  toneClassName?: string;
  size?: 'default' | 'compact';
};

type PortalWorkspaceSite = {
  site_id: string;
  name: string;
  site_url: string;
  platform_kind: string;
  status: string;
};

type PortalWorkspaceHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  eyebrowInfo?: string;
  currentPage: PortalWorkspacePage;
  selectedSiteId?: string;
  sites?: PortalWorkspaceSite[];
  onSiteChange?: (siteId: string) => void;
  siteSelectorMode?: 'context' | 'filter';
  /** 'inline' puts the site selector in the title/info group; 'below' keeps the legacy block under metrics. */
  siteSelectorPlacement?: 'below' | 'inline';
  metrics?: PortalWorkspaceMetric[];
  metricsColumnsClassName?: string;
  metricsLayout?: 'grid' | 'rail';
  /** Put rail metrics on the title row (right) instead of a full-width band below. */
  metricsPlacement?: 'below' | 'title-end';
  titleAccessory?: React.ReactNode;
  /** Quiet trail above the title (e.g. Service / My sites / current). */
  breadcrumb?: React.ReactNode;
  /**
   * When breadcrumb already carries the page name (ticket detail), keep an
   * accessible h1 but hide the large visual title to avoid duplicating the trail.
   */
  titleDisplay?: 'visible' | 'sr-only';
  metadata?: React.ReactNode;
  contextPanel?: React.ReactNode;
  primaryAction?: React.ReactNode;
  secondaryActions?: React.ReactNode;
  actions?: React.ReactNode;
  /**
   * Where to place actions when there is no contextPanel.
   * - `inline` (default): keep beside the title (billing / account quiet CTAs).
   * - `title-end`: push the actions cluster to the right edge of the title row
   *   (tickets: status filters + submit icon).
   */
  actionsPlacement?: 'inline' | 'title-end';
  children?: React.ReactNode;
};

/** True when ReactNode will paint something (null/false/empty string → false). */
function hasRenderableNode(node: React.ReactNode): boolean {
  if (node == null || typeof node === 'boolean') return false;
  if (typeof node === 'string' || typeof node === 'number') return String(node).trim().length > 0;
  if (Array.isArray(node)) return node.some(hasRenderableNode);
  return true;
}

export function PortalWorkspaceHeader({
  eyebrow = '',
  title,
  description,
  eyebrowInfo,
  currentPage,
  selectedSiteId = '',
  sites = [],
  onSiteChange,
  siteSelectorMode = 'context',
  siteSelectorPlacement = 'below',
  metrics = [],
  metricsColumnsClassName,
  metricsLayout = 'grid',
  metricsPlacement = 'below',
  titleAccessory,
  breadcrumb,
  titleDisplay = 'visible',
  metadata,
  contextPanel,
  primaryAction,
  secondaryActions,
  actions,
  actionsPlacement = 'inline',
  children,
}: PortalWorkspaceHeaderProps) {
  const { t } = useLocale();
  const resolvedActions =
    actions ?? (primaryAction || secondaryActions ? (
      <>
        {primaryAction}
        {secondaryActions}
      </>
    ) : null);
  const shouldShowEyebrow = Boolean(eyebrow.trim())
    && eyebrow.trim().toLowerCase() !== title.trim().toLowerCase();
  const hasContextPanel = hasRenderableNode(contextPanel);
  const hasActions = hasRenderableNode(resolvedActions);
  // Dual-column only for a real context panel. Actions alone stay in the title info group
  // so primary CTAs are not stranded across a wide empty gap.
  const hasHeaderAside = hasContextPanel;
  const showSiteSelector = Boolean(
    onSiteChange
    && (getVisiblePortalSites(sites).length > 1 || Boolean(selectedSiteId) || siteSelectorMode === 'filter')
  );
  const siteSelector = showSiteSelector && onSiteChange ? (
    <div className={cn(siteSelectorPlacement === 'inline' ? 'max-w-xs' : 'max-w-md')}>
      <label
        htmlFor={`portal-${currentPage}-site-selector`}
        className={cn(
          'mb-1.5 block font-medium text-slate-700 dark:text-slate-200',
          siteSelectorPlacement === 'inline' ? 'text-xs' : 'mb-2 text-sm'
        )}
      >
        {siteSelectorMode === 'filter'
          ? t('portal.site_filter_label', {}, 'Site filter')
          : t('portal.current_site', {}, 'Current site')}
      </label>
      <select
        id={`portal-${currentPage}-site-selector`}
        className={cn('input', siteSelectorPlacement === 'inline' && 'h-10 py-2 text-sm')}
        value={selectedSiteId}
        onChange={(event) => onSiteChange(event.target.value)}
      >
        {siteSelectorMode === 'filter' ? (
          <option value="">
            {t('portal.all_sites_option', {}, 'All sites')}
          </option>
        ) : !selectedSiteId ? (
          <option value="" disabled>
            {t('portal.select_site_placeholder', {}, 'Select a site')}
          </option>
        ) : null}
        {selectedSiteId && !getVisiblePortalSites(sites).some((site) => site.site_id === selectedSiteId) ? (
          <option value={selectedSiteId}>{t('portal.site_filter_unavailable', {}, 'Selected site is unavailable')}</option>
        ) : null}
        {getVisiblePortalSites(sites).map((site) => (
          <option key={site.site_id} value={site.site_id}>
            {getPortalSiteDisplayName(site)} ({getPortalSiteSecondaryLabel(site)})
          </option>
        ))}
      </select>
    </div>
  ) : null;

  const hasVisibleTitleChrome = titleDisplay !== 'sr-only'
    || Boolean(titleAccessory)
    || (hasActions && !hasContextPanel)
    || (metricsPlacement === 'title-end' && metrics.length > 0)
    || Boolean(description)
    || Boolean(eyebrowInfo)
    || Boolean(metadata)
    || (siteSelectorPlacement === 'inline' && Boolean(siteSelector));

  const summary = (
    <div
      className={cn(
        hasHeaderAside
          ? 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start'
          : 'block w-full'
      )}
      data-portal-header-layout={hasHeaderAside ? 'split' : 'stack'}
    >
      <div className="min-w-0 w-full">
        {shouldShowEyebrow ? (
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
            {eyebrow}
          </p>
        ) : null}
        <div
          className={cn(
            'flex w-full flex-wrap items-center gap-2.5',
            shouldShowEyebrow ? 'mt-1.5' : '',
            actionsPlacement === 'title-end' && !hasContextPanel && hasActions ? 'justify-between' : ''
          )}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            {titleDisplay === 'sr-only' ? null : (
              <h1 className="text-2xl font-semibold leading-tight text-gray-950 dark:text-white md:text-[1.75rem]">
                {title}
              </h1>
            )}
            {titleAccessory}
            {!hasContextPanel && hasActions && actionsPlacement === 'inline' ? (
              <div className="flex flex-wrap items-center gap-2">{resolvedActions}</div>
            ) : null}
          </div>
          {!hasContextPanel && hasActions && actionsPlacement === 'title-end' ? (
            <div
              className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2"
              data-portal-header-actions="title-end"
            >
              {resolvedActions}
            </div>
          ) : null}
          {metricsPlacement === 'title-end' && metrics.length > 0 ? (
            <div className="min-w-0 max-w-full sm:ml-auto" data-portal-header-metrics="title-end">
              <PortalMetricStrip
                items={metrics}
                columnsClassName={metricsColumnsClassName}
                variant="header"
                layout={metricsLayout}
              />
            </div>
          ) : null}
        </div>
        {eyebrowInfo ? <p className="mt-2 w-full text-sm leading-6 text-gray-600 dark:text-gray-300">{eyebrowInfo}</p> : null}
        {description ? <p className="mt-2 w-full max-w-none text-sm leading-6 text-gray-600 dark:text-gray-300">{description}</p> : null}
        {metadata || (siteSelectorPlacement === 'inline' && siteSelector) ? (
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            {metadata ? <div className="min-w-0 flex-1">{metadata}</div> : null}
            {siteSelectorPlacement === 'inline' ? siteSelector : null}
          </div>
        ) : null}
      </div>
      {hasHeaderAside ? (
        <div className={cn('flex min-w-0 flex-col gap-3', 'lg:max-w-[22rem]')}>
          {contextPanel}
          {hasActions ? <div className="flex flex-wrap gap-2 lg:justify-end">{resolvedActions}</div> : null}
        </div>
      ) : null}
    </div>
  );

  return (
    <section
      className={
        hasVisibleTitleChrome
          || (metricsPlacement === 'below' && metrics.length > 0)
          || (siteSelectorPlacement === 'below' && Boolean(siteSelector))
          || Boolean(children)
          ? 'portal-workspace-header space-y-[var(--portal-header-gap)] border-b border-slate-200/75 pb-[var(--portal-header-padding-bottom)] dark:border-slate-800'
          : 'portal-workspace-header border-b border-slate-200/75 pb-3 dark:border-slate-800'
      }
      data-portal-workspace-header={currentPage}
    >
      {hasRenderableNode(breadcrumb) ? (
        <div className="min-w-0" data-portal-header-breadcrumb="">
          {breadcrumb}
        </div>
      ) : null}
      {titleDisplay === 'sr-only' ? <h1 className="sr-only">{title}</h1> : null}
      {hasVisibleTitleChrome ? summary : null}
      {metricsPlacement === 'below' && metrics.length ? (
        <PortalMetricStrip items={metrics} columnsClassName={metricsColumnsClassName} variant="header" layout={metricsLayout} />
      ) : null}
      {siteSelectorPlacement === 'below' ? siteSelector : null}
      {children}
    </section>
  );
}
