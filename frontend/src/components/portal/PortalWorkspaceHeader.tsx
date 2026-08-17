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
  metrics?: PortalWorkspaceMetric[];
  metricsColumnsClassName?: string;
  titleAccessory?: React.ReactNode;
  metadata?: React.ReactNode;
  contextPanel?: React.ReactNode;
  primaryAction?: React.ReactNode;
  secondaryActions?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
};

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
  metrics = [],
  metricsColumnsClassName = 'lg:grid-cols-4',
  titleAccessory,
  metadata,
  contextPanel,
  primaryAction,
  secondaryActions,
  actions,
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
  const hasHeaderAside = Boolean(contextPanel || resolvedActions);
  const summary = (
    <div
      className={cn(
        'grid gap-4 lg:items-start',
        contextPanel
          ? 'lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.75fr)]'
          : hasHeaderAside
            ? 'lg:grid-cols-[minmax(0,1fr)_auto]'
            : ''
      )}
    >
      <div className="min-w-0">
        {shouldShowEyebrow ? (
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
            {eyebrow}
          </p>
        ) : null}
        <div className={cn('flex flex-wrap items-center gap-2.5', shouldShowEyebrow ? 'mt-1.5' : '')}>
          <h1 className="text-2xl font-semibold leading-tight text-gray-950 dark:text-white md:text-[1.75rem]">
            {title}
          </h1>
          {titleAccessory}
        </div>
        {eyebrowInfo ? <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-300">{eyebrowInfo}</p> : null}
        {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-300">{description}</p> : null}
        {metadata ? <div className="mt-3">{metadata}</div> : null}
      </div>
      {hasHeaderAside ? (
        <div className="flex min-w-0 flex-col gap-3">
          {contextPanel}
          {resolvedActions ? <div className="flex flex-wrap gap-2 lg:justify-end">{resolvedActions}</div> : null}
        </div>
      ) : null}
    </div>
  );

  return (
    <section className="space-y-4 border-b border-slate-200/75 pb-4 dark:border-slate-800" data-portal-workspace-header={currentPage}>
      {summary}
      {metrics.length ? (
        <PortalMetricStrip items={metrics} columnsClassName={metricsColumnsClassName} variant="header" />
      ) : null}
      {onSiteChange && getVisiblePortalSites(sites).length > 1 ? (
        <div className="max-w-md">
          <label htmlFor={`portal-${currentPage}-site-selector`} className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
            {siteSelectorMode === 'filter'
              ? t('portal.site_filter_label', {}, 'Site filter')
              : t('portal.current_site', {}, 'Current site')}
          </label>
          <select
            id={`portal-${currentPage}-site-selector`}
            className="input"
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
            {getVisiblePortalSites(sites).map((site) => (
              <option key={site.site_id} value={site.site_id}>
                {getPortalSiteDisplayName(site)} ({getPortalSiteSecondaryLabel(site)})
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {children}
    </section>
  );
}
