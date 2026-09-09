'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { AdminInspectorDrawer } from '@/components/admin/AdminInspectorDrawer';
import { AdminDataTableFrame } from '@/components/admin/AdminDataTableFrame';
import { LoadingFallback } from '@/components/ui/LoadingFallback';
import { useToast } from '@/components/ui/Toast';
import { useLocale } from '@/contexts/LocaleContext';
import {
  BackofficeEmptyState,
  BackofficePageHeader,
  BackofficePageStack,
  BackofficeSectionPanel,
  BackofficeStackCard,
} from '@/components/backoffice/BackofficeScaffold';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';
import { BackofficeFilterPill } from '@/components/backoffice/BackofficeFilterPill';
import { BackofficeIdentifier } from '@/components/backoffice/BackofficeIdentifier';
import { BackofficeTag } from '@/components/backoffice/BackofficeTag';
import { AnalyticsBarChart, AnalyticsLineChart } from '@/components/ui/EChartsWrapper';
import { createApiClient } from '@/lib/api-client';
import { resolveUiErrorMessage } from '@/lib/errors';
import { formatDate, formatNumber as formatInteger } from '@/lib/utils';

const pluginObservabilityClient = createApiClient({ idempotencyPrefix: 'plugin_observability' });

type PluginObservabilityTotals = {
  eventsTotal: number;
  okTotal: number;
  errorTotal: number;
  successRate: number;
  avgLatencyMs: number;
  lastSeenAt: string;
  activeSiteCount: number;
  activePluginCount: number;
};

type EventKindItem = {
  eventKind: string;
  eventsTotal: number;
  errorTotal: number;
  successRate: number;
  avgLatencyMs: number;
  lastSeenAt: string;
};

type PluginItem = {
  pluginSlug: string;
  eventsTotal: number;
  okTotal: number;
  errorTotal: number;
  successRate: number;
  avgLatencyMs: number;
  lastSeenAt: string;
  eventKinds: EventKindItem[];
};

type SiteItem = {
  siteId: string;
  siteName: string;
  siteUrl: string;
  eventsTotal: number;
  errorTotal: number;
  okTotal: number;
  successRate: number;
  avgLatencyMs: number;
  pluginCount: number;
  lastSeenAt: string;
  health: HealthSummary;
};

type ErrorItem = {
  siteId: string | null;
  pluginSlug: string;
  eventKind: string;
  errorCode: string;
  count: number;
  lastSeenAt: string;
};

type RecentErrorItem = {
  siteId: string;
  pluginSlug: string;
  eventKind: string;
  errorCode: string;
  status: string;
  abilityId: string;
  proposalId: string;
  route: string;
  receivedAt: string;
};

type TimelinePoint = {
  bucketStartAt: string;
  bucketEndAt: string;
  bucketHours: number;
  eventsTotal: number;
  okTotal: number;
  errorTotal: number;
  successRate: number;
  avgLatencyMs: number;
};

type HealthSummary = {
  status: string;
  score: number;
  summary: string;
  reasons: string[];
};

type AttentionItem = {
  attentionKey: string;
  severity: string;
  code: string;
  title: string;
  detail: string;
  suggestedAction: string;
  workflowStatus: string;
  siteId: string;
  pluginSlug: string;
  eventKind: string;
  errorCode: string;
  state: {
    mutedUntil: string;
    operatorNote: string;
    updatedAt: string;
  } | null;
};

type AttentionWorkflow = {
  active: number;
  acknowledged: number;
  muted: number;
  resolved: number;
  total: number;
  needsAttention: number;
};

type ObservabilityDigest = {
  periodLabel: string;
  windowHours: number;
  headline: string;
  bullets: string[];
  topPluginSlug: string;
  topErrorCode: string;
};

type PluginObservabilityData = {
  generatedAt: string;
  totals: PluginObservabilityTotals;
  health: HealthSummary;
  attention: AttentionItem[];
  attentionWorkflow: AttentionWorkflow;
  digest: ObservabilityDigest;
  plugins: PluginItem[];
  sites: SiteItem[];
  timeline: TimelinePoint[];
  errors: ErrorItem[];
  recentErrors: RecentErrorItem[];
  window: {
    hours: number;
    startAt: string;
    endAt: string;
  };
};

function normalizePluginObservability(raw: any): PluginObservabilityData {
  const totals = raw?.totals ?? {};
  const window = raw?.window ?? {};
  const health = raw?.health ?? {};
  return {
    generatedAt: String(raw?.generated_at ?? ''),
    totals: {
      eventsTotal: Number(totals.events_total ?? 0),
      okTotal: Number(totals.ok_total ?? 0),
      errorTotal: Number(totals.error_total ?? 0),
      successRate: Number(totals.success_rate ?? 0),
      avgLatencyMs: Number(totals.avg_latency_ms ?? 0),
      lastSeenAt: String(totals.last_seen_at ?? ''),
      activeSiteCount: Number(totals.active_site_count ?? 0),
      activePluginCount: Number(totals.active_plugin_count ?? 0),
    },
    health: {
      status: String(health.status ?? 'inactive'),
      score: Number(health.score ?? 0),
      summary: String(health.summary ?? ''),
      reasons: Array.isArray(health.reasons) ? health.reasons.map((item: any) => String(item)) : [],
    },
    attention: Array.isArray(raw?.attention)
      ? raw.attention.map((item: any) => ({
          severity: String(item.severity ?? ''),
          code: String(item.code ?? ''),
          attentionKey: String(item.attention_key ?? ''),
          title: String(item.title ?? ''),
          detail: String(item.detail ?? ''),
          suggestedAction: String(item.suggested_action ?? ''),
          workflowStatus: String(item.workflow_status ?? 'active'),
          siteId: String(item.site_id ?? ''),
          pluginSlug: String(item.plugin_slug ?? ''),
          eventKind: String(item.event_kind ?? ''),
          errorCode: String(item.error_code ?? ''),
          state: item.state
            ? {
                mutedUntil: String(item.state.muted_until ?? ''),
                operatorNote: String(item.state.operator_note ?? ''),
                updatedAt: String(item.state.updated_at ?? ''),
              }
            : null,
        }))
      : [],
    attentionWorkflow: {
      active: Number(raw?.attention_workflow?.active ?? 0),
      acknowledged: Number(raw?.attention_workflow?.acknowledged ?? 0),
      muted: Number(raw?.attention_workflow?.muted ?? 0),
      resolved: Number(raw?.attention_workflow?.resolved ?? 0),
      total: Number(raw?.attention_workflow?.total ?? 0),
      needsAttention: Number(raw?.attention_workflow?.needs_attention ?? 0),
    },
    digest: {
      periodLabel: String(raw?.digest?.period_label ?? ''),
      windowHours: Number(raw?.digest?.window_hours ?? 0),
      headline: String(raw?.digest?.headline ?? ''),
      bullets: Array.isArray(raw?.digest?.bullets)
        ? raw.digest.bullets.map((item: any) => String(item))
        : [],
      topPluginSlug: String(raw?.digest?.top_plugin_slug ?? ''),
      topErrorCode: String(raw?.digest?.top_error_code ?? ''),
    },
    plugins: Array.isArray(raw?.plugins)
      ? raw.plugins.map((p: any) => ({
          pluginSlug: String(p.plugin_slug ?? ''),
          eventsTotal: Number(p.events_total ?? 0),
          okTotal: Number(p.ok_total ?? 0),
          errorTotal: Number(p.error_total ?? 0),
          successRate: Number(p.success_rate ?? 0),
          avgLatencyMs: Number(p.avg_latency_ms ?? 0),
          lastSeenAt: String(p.last_seen_at ?? ''),
          eventKinds: Array.isArray(p.event_kinds)
            ? p.event_kinds.map((ek: any) => ({
                eventKind: String(ek.event_kind ?? ''),
                eventsTotal: Number(ek.events_total ?? 0),
                errorTotal: Number(ek.error_total ?? 0),
                successRate: Number(ek.success_rate ?? 0),
                avgLatencyMs: Number(ek.avg_latency_ms ?? 0),
                lastSeenAt: String(ek.last_seen_at ?? ''),
              }))
            : [],
        }))
      : [],
    sites: Array.isArray(raw?.sites)
      ? raw.sites.map((s: any) => ({
          health: {
            status: String(s.health?.status ?? 'inactive'),
            score: Number(s.health?.score ?? 0),
            summary: String(s.health?.summary ?? ''),
            reasons: Array.isArray(s.health?.reasons) ? s.health.reasons.map((item: any) => String(item)) : [],
          },
          siteId: String(s.site_id ?? ''),
          siteName: String(s.site_name ?? ''),
          siteUrl: String(s.site_url ?? ''),
          eventsTotal: Number(s.events_total ?? 0),
          errorTotal: Number(s.error_total ?? 0),
          okTotal: Number(s.ok_total ?? 0),
          successRate: Number(s.success_rate ?? 0),
          avgLatencyMs: Number(s.avg_latency_ms ?? 0),
          pluginCount: Number(s.plugin_count ?? 0),
          lastSeenAt: String(s.last_seen_at ?? ''),
        }))
      : [],
    timeline: Array.isArray(raw?.timeline)
      ? raw.timeline.map((point: any) => ({
          bucketStartAt: String(point.bucket_start_at ?? ''),
          bucketEndAt: String(point.bucket_end_at ?? ''),
          bucketHours: Number(point.bucket_hours ?? 1),
          eventsTotal: Number(point.events_total ?? 0),
          okTotal: Number(point.ok_total ?? 0),
          errorTotal: Number(point.error_total ?? 0),
          successRate: Number(point.success_rate ?? 0),
          avgLatencyMs: Number(point.avg_latency_ms ?? 0),
        }))
      : [],
    errors: Array.isArray(raw?.errors)
      ? raw.errors.map((e: any) => ({
          siteId: e.site_id ?? null,
          pluginSlug: String(e.plugin_slug ?? ''),
          eventKind: String(e.event_kind ?? ''),
          errorCode: String(e.error_code ?? ''),
          count: Number(e.count ?? 0),
          lastSeenAt: String(e.last_seen_at ?? ''),
        }))
      : [],
    recentErrors: Array.isArray(raw?.recent_errors)
      ? raw.recent_errors.map((re: any) => ({
          siteId: String(re.site_id ?? ''),
          pluginSlug: String(re.plugin_slug ?? ''),
          eventKind: String(re.event_kind ?? ''),
          errorCode: String(re.error_code ?? ''),
          status: String(re.status ?? ''),
          abilityId: String(re.ability_id ?? ''),
          proposalId: String(re.proposal_id ?? ''),
          route: String(re.route ?? ''),
          receivedAt: String(re.received_at ?? ''),
        }))
      : [],
    window: {
      hours: Number(window.hours ?? 24),
      startAt: String(window.start_at ?? ''),
      endAt: String(window.end_at ?? ''),
    },
  };
}

type WindowOption = 24 | 72 | 168;
type PluginFilter = string;
type AttentionWorkflowFilter = 'active' | 'acknowledged' | 'muted' | 'resolved' | 'all';
type AttentionSeverityFilter = 'all' | 'warning' | 'error';
type AttentionStateAction = 'acknowledge' | 'mute' | 'resolve' | 'clear';
type TranslationFn = (key: string, params?: Record<string, string>, fallback?: string) => string;

const WINDOW_OPTIONS: { value: WindowOption; label: string }[] = [
  { value: 24, label: '24h' },
  { value: 72, label: '72h' },
  { value: 168, label: '168h' },
];

const PLUGIN_FILTER_OPTIONS: { value: PluginFilter; labelKey: string; fallback: string }[] = [
  { value: 'all', labelKey: 'admin.plugin_obs_filter_all', fallback: 'All plugins' },
  { value: 'npcink-abilities-toolkit', labelKey: 'admin.plugin_obs_filter_abilities', fallback: 'Abilities' },
  { value: 'npcink-governance-core', labelKey: 'admin.plugin_obs_filter_core', fallback: 'Core' },
  { value: 'npcink-ai-client-adapter', labelKey: 'admin.plugin_obs_filter_adapter', fallback: 'Adapter' },
  { value: 'npcink-cloud-addon', labelKey: 'admin.plugin_obs_filter_addon', fallback: 'Cloud Addon' },
];

const ATTENTION_WORKFLOW_OPTIONS: { value: AttentionWorkflowFilter; labelKey: string; fallback: string }[] = [
  { value: 'active', labelKey: 'admin.plugin_obs_workflow_active', fallback: 'Open' },
  { value: 'acknowledged', labelKey: 'admin.plugin_obs_workflow_acknowledged', fallback: 'Acknowledged' },
  { value: 'muted', labelKey: 'admin.plugin_obs_workflow_muted', fallback: 'Muted' },
  { value: 'resolved', labelKey: 'admin.plugin_obs_workflow_resolved', fallback: 'Resolved' },
  { value: 'all', labelKey: 'admin.plugin_obs_workflow_all', fallback: 'All states' },
];

const ATTENTION_SEVERITY_OPTIONS: { value: AttentionSeverityFilter; labelKey: string; fallback: string }[] = [
  { value: 'all', labelKey: 'admin.plugin_obs_severity_all', fallback: 'All severity' },
  { value: 'error', labelKey: 'admin.plugin_obs_severity_error', fallback: 'Error' },
  { value: 'warning', labelKey: 'admin.plugin_obs_severity_warning', fallback: 'Warning' },
];

function formatSuccessRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function successRateStatus(rate: number): string {
  if (rate >= 0.99) return 'success';
  if (rate >= 0.95) return 'warning';
  return 'error';
}

function attentionTone(severity: string): 'warning' | 'danger' | 'info' {
  if (severity === 'error') return 'danger';
  if (severity === 'warning') return 'warning';
  return 'info';
}

function timelineLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:00`;
}

function timestampValue(value: string): number {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

type SiteSortKey = 'errors' | 'success' | 'events' | 'latency' | 'lastSeen';

function attentionCodeSuffix(code: string): string {
  return (
    code
      .trim()
      .toLowerCase()
      .replace(/^plugin_observability[._-]*/, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'default'
  );
}

function missingPluginsFromDetail(detail: string): string {
  return detail.replace(/^Missing plugin telemetry:\s*/i, '').trim();
}

function attentionParams(t: TranslationFn, item: AttentionItem): Record<string, string> {
  const fallback = t('common.not_available');
  return {
    site: item.siteId || fallback,
    plugin: pluginLabel(t, item.pluginSlug) || fallback,
    plugins: missingPluginsFromDetail(item.detail) || item.pluginSlug || fallback,
    eventKind: eventLabel(t, item.eventKind) || fallback,
    errorCode: errorLabel(t, item.errorCode) || fallback,
  };
}

function attentionCopy(
  t: TranslationFn,
  item: AttentionItem,
  field: 'title' | 'detail' | 'action'
): string {
  const params = attentionParams(t, item);
  const suffix = attentionCodeSuffix(item.code);
  const defaultFallback =
    field === 'title'
      ? 'Watch item'
      : field === 'detail'
        ? 'Review this plugin observability signal against the related metadata.'
        : 'Review the linked metadata and local plugin logs.';
  const defaultCopy = t(`admin.plugin_obs_attention_${field}_default`, params, defaultFallback);
  return t(`admin.plugin_obs_attention_${field}_${suffix}`, params, defaultCopy);
}

function attentionActionLabel(t: TranslationFn, action: AttentionStateAction): string {
  return t(
    `admin.plugin_obs_action_${action}`,
    {},
    action === 'acknowledge'
      ? 'Acknowledge'
      : action === 'mute'
        ? 'Mute 24h'
        : action === 'resolve'
          ? 'Resolve'
          : 'Clear state'
  );
}

function errorKey(item: ErrorItem) { return JSON.stringify([item.siteId, item.pluginSlug, item.eventKind, item.errorCode]); }
function pluginLabel(t: TranslationFn, slug: string) {
  const option = PLUGIN_FILTER_OPTIONS.find(item => item.value === slug);
  return option ? t(option.labelKey) : t('admin.plugin_obs_other_plugin');
}
function eventLabel(t: TranslationFn, code: string) {
  const known: Record<string, string> = {"addon.editor_assist.generation.completed": "admin.plugin_obs_event_map_0", "addon.editor_assist.outcome.observed": "admin.plugin_obs_event_map_1", "addon.editor_assist.outcome.expired": "admin.plugin_obs_event_map_2", "addon.media_recognition.completed": "admin.plugin_obs_event_map_3", "addon.media_recognition.failed": "admin.plugin_obs_event_map_4", "validation.technical_monitoring_only": "admin.plugin_obs_event_map_5", "runtime_request": "admin.plugin_obs_event_map_6"};
  return t(known[code] || 'admin.plugin_obs_event_other');
}
function errorLabel(t: TranslationFn, code: string) {
  const known: Record<string, string> = {"runtimecanceled": "admin.plugin_obs_error_map_0", "provider_timeout": "admin.plugin_obs_error_map_1", "timeout": "admin.plugin_obs_error_map_2"};
  return t(known[code.toLowerCase()] || 'admin.plugin_obs_error_other');
}
function healthReason(t: TranslationFn, code: string) {
  const known: Record<string, string> = {"plugin_observability.error_rate_high": "admin.plugin_obs_health_map_0", "plugin_observability.error_rate_elevated": "admin.plugin_obs_health_map_1", "plugin_observability.latency_high": "admin.plugin_obs_health_map_2", "plugin_observability.reporting_stale": "admin.plugin_obs_health_map_3", "plugin_observability.inactive": "admin.plugin_obs_health_map_4"};
  return t(known[code] || 'admin.plugin_obs_health_other');
}

function normalizeWindowOption(value: string | null): WindowOption {
  const parsed = Number(value);
  return parsed === 72 || parsed === 168 ? parsed : 24;
}

function normalizePluginFilter(value: string | null): PluginFilter {
  return value?.trim() || 'all';
}

function AdminPluginObservabilityContent() {
  const { t } = useLocale();
  const toast = useToast();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const windowHours = normalizeWindowOption(searchParams.get('window'));
  const pluginFilter = normalizePluginFilter(searchParams.get('plugin'));
  const siteIdFilter = searchParams.get('site') || '';
  const focusedAttentionKey = searchParams.get('focus') || '';
  const [data, setData] = useState<PluginObservabilityData | null>(null);
  const [error, setError] = useState('');
  const [siteIdInput, setSiteIdInput] = useState(siteIdFilter);
  const [loading, setLoading] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const [issueKey, setIssueKey] = useState<string | null>(null);
  const [inspectedSite, setInspectedSite] = useState<string | null>(null);
  const [siteSort, setSiteSort] = useState<SiteSortKey>('errors');
  const [attentionWorkflowFilter, setAttentionWorkflowFilter] =
    useState<AttentionWorkflowFilter>('active');
  const [attentionSeverityFilter, setAttentionSeverityFilter] =
    useState<AttentionSeverityFilter>('all');
  const [attentionCodeFilter, setAttentionCodeFilter] = useState('all');
  const [attentionActionKey, setAttentionActionKey] = useState('');
  const requestSequenceRef = useRef(0);
  const requestAbortRef = useRef<AbortController | null>(null);

  const updateUrl = useCallback((updates: {
    window?: WindowOption | null;
    plugin?: PluginFilter | null;
    site?: string | null;
    focus?: string | null;
  }) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value && !(key === 'window' && value === 24) && !(key === 'plugin' && value === 'all')) params.set(key, String(value));
      else params.delete(key);
    });
    const query = params.toString();
    window.history.replaceState(null, '', query ? `${pathname}?${query}` : pathname);
  }, [pathname, searchParams]);

  const loadData = useCallback(async (refresh = false) => {
    requestAbortRef.current?.abort();
    const sequence = ++requestSequenceRef.current;
    const controller = new AbortController();
    requestAbortRef.current = controller;
    setLoading(true);
    if (!refresh) { setData(null); setIssueKey(null); setInspectedSite(null); }
    setError('');
    try {
      const params = new URLSearchParams({ window_hours: String(windowHours) });
      if (pluginFilter !== 'all') params.set('plugin_slug', pluginFilter);
      if (siteIdFilter) params.set('site_id', siteIdFilter);
      const response = await pluginObservabilityClient.request<unknown>(
        `/api/admin/plugin-observability?${params.toString()}`,
        { signal: controller.signal }
      );
      if (sequence !== requestSequenceRef.current) return;
      setData(normalizePluginObservability(response.data));
    } catch (err) {
      if (sequence !== requestSequenceRef.current) return;
      setError(resolveUiErrorMessage(err, t('error.failed_load')));
    } finally {
      if (sequence === requestSequenceRef.current) {
        requestAbortRef.current = null;
        setLoading(false);
      }
    }
  }, [windowHours, pluginFilter, siteIdFilter, t]);

  useEffect(() => {
    void loadData();
    return () => {
      requestSequenceRef.current += 1;
      requestAbortRef.current?.abort();
    };
  }, [loadData]);

  useEffect(() => {
    setSiteIdInput(siteIdFilter);
  }, [siteIdFilter]);

  const handleSiteIdSubmit = () => {
    updateUrl({ site: siteIdInput.trim() || null, focus: null });
  };

  const handleSiteIdKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSiteIdSubmit();
  };

  const handleAttentionStateAction = useCallback(
    async (item: AttentionItem, action: AttentionStateAction) => {
      if (!item.attentionKey) return;
      setAttentionActionKey(`${item.attentionKey}-${action}`);
      try {
        await pluginObservabilityClient.request<unknown>('/api/admin/plugin-observability/attention-state', {
          method: 'POST',
          body: {
            attention_key: item.attentionKey,
            attention_code: item.code,
            action,
            site_id: item.siteId,
            plugin_slug: item.pluginSlug,
            event_kind: item.eventKind,
            error_code: item.errorCode,
            mute_hours: 24,
          },
        });
        await loadData();
        toast.success(
          t('admin.plugin_obs_attention_state_updated', {}, 'Watch item state updated.'),
          t('common.success')
        );
      } catch (err) {
        const message = resolveUiErrorMessage(err, t('error.failed_load'));
        setError(message);
        toast.error(message, t('common.error'));
      } finally {
        setAttentionActionKey('');
      }
    },
    [loadData, t, toast]
  );

  const timelineData = useMemo(
    () =>
      (data?.timeline || []).map((point) => ({
        label: timelineLabel(point.bucketStartAt),
        value: point.eventsTotal,
        secondaryValue: point.errorTotal,
      })),
    [data]
  );

  const pluginErrorData = useMemo(
    () =>
      (data?.plugins || []).map((plugin) => ({
        label: pluginLabel(t, plugin.pluginSlug),
        value: plugin.errorTotal,
        color: plugin.errorTotal > 0 ? '#f59e0b' : '#22c55e',
      })),
    [data, t]
  );

  const pluginVolumeData = useMemo(
    () =>
      (data?.plugins || []).map((plugin) => ({
        label: pluginLabel(t, plugin.pluginSlug),
        value: plugin.eventsTotal,
        color: plugin.errorTotal > 0 ? '#f59e0b' : '#2563eb',
      })),
    [data, t]
  );

  const hasPluginErrors = pluginErrorData.some((item) => item.value > 0);

  const attentionCodeOptions = useMemo(() => {
    const codes = new Set((data?.attention || []).map((item) => item.code).filter(Boolean));
    return ['all', ...Array.from(codes).sort()];
  }, [data]);

  const filteredAttention = useMemo(() => {
    return (data?.attention || []).filter((item) => {
      if (
        attentionWorkflowFilter !== 'all' &&
        item.workflowStatus !== attentionWorkflowFilter
      ) {
        return false;
      }
      if (attentionSeverityFilter !== 'all' && item.severity !== attentionSeverityFilter) {
        return false;
      }
      if (attentionCodeFilter !== 'all' && item.code !== attentionCodeFilter) {
        return false;
      }
      return true;
    });
  }, [attentionCodeFilter, attentionSeverityFilter, attentionWorkflowFilter, data]);
  const selectedAttention = filteredAttention.find((item) => item.attentionKey === focusedAttentionKey)
    || null;

  const sortedSites = useMemo(() => {
    const sites = [...(data?.sites || [])];
    return sites.sort((a, b) => {
      if (siteSort === 'success') return a.successRate - b.successRate;
      if (siteSort === 'events') return b.eventsTotal - a.eventsTotal;
      if (siteSort === 'latency') return b.avgLatencyMs - a.avgLatencyMs;
      if (siteSort === 'lastSeen') {
        return timestampValue(b.lastSeenAt) - timestampValue(a.lastSeenAt);
      }
      return b.errorTotal - a.errorTotal || a.successRate - b.successRate;
    });
  }, [data, siteSort]);

  const extraPlugins = Array.from(new Set([pluginFilter, ...(data?.plugins.map(plugin => plugin.pluginSlug) || [])])).filter(slug => !PLUGIN_FILTER_OPTIONS.some(option => option.value === slug));
  const selectedIssue = data?.errors.find((item) => errorKey(item) === issueKey);
  const siteName = (id: string | null) => data?.sites.find((site) => site.siteId === id)?.siteName || id || t('admin.plugin_obs_unknown_site');
  const siteDetails = data?.sites.find((site) => site.siteId === inspectedSite);
  const recent = (data?.recentErrors || []).filter((item) => selectedIssue
    ? item.siteId === selectedIssue.siteId && item.pluginSlug === selectedIssue.pluginSlug && item.eventKind === selectedIssue.eventKind && item.errorCode === selectedIssue.errorCode
    : item.siteId === inspectedSite);
  const copyEvidence = async () => {
    if (!selectedIssue) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify({ window: data?.window, problem: selectedIssue, recentErrors: recent }, null, 2));
      toast.success(t('admin.plugin_obs_copied'));
    } catch { toast.error(t('admin.plugin_obs_copy_failed')); }
  };
  const problemColumns = ['problem', 'site', 'count', 'last', 'action'];
  const cellClass = 'px-4 py-3 text-left text-sm';
  const closeLabel = t('common.close', {}, 'Close');

  return (
    <BackofficePageStack>
      <BackofficePageHeader title={t('admin.plugin_observability_title')} description={t('admin.plugin_obs_intro')}
        secondaryAction={<div className="flex gap-2"><button className="btn btn-secondary btn-sm" onClick={() => setMoreOpen(true)}>{t('admin.plugin_obs_more')}{data ? ` · ${data.attentionWorkflow.needsAttention}` : ''}</button><button className="btn btn-secondary btn-sm" onClick={() => void loadData(true)} disabled={loading}>{t('common.refresh')}</button></div>}
        summaryItems={data ? [
          { label: t('admin.plugin_obs_reporting_sites'), value: formatInteger(data.totals.activeSiteCount) },
          { label: t('admin.plugin_obs_error_records'), value: formatInteger(data.totals.errorTotal) },
          { label: t('admin.plugin_obs_affected_sites'), value: formatInteger(data.sites.filter(site => site.errorTotal > 0).length) },
          { label: t('admin.plugin_obs_record_count'), value: formatInteger(data.totals.eventsTotal) },
        ] : []} />
      <div className="flex flex-wrap items-center gap-3">
        {WINDOW_OPTIONS.map(opt => <BackofficeFilterPill key={opt.value} active={windowHours === opt.value} onClick={() => updateUrl({window: opt.value, focus: null})}>{t(`admin.plugin_obs_window_${opt.value}`)}</BackofficeFilterPill>)}
        <label className="text-sm">{t('admin.plugin_obs_plugin')}<select className="input ml-2 w-auto" aria-label={t('admin.plugin_obs_plugin')} value={pluginFilter} onChange={event => updateUrl({plugin: event.target.value as PluginFilter, focus: null})}>{PLUGIN_FILTER_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>)}{extraPlugins.map(slug => <option key={slug} value={slug}>{pluginLabel(t, slug)} · {slug}</option>)}</select></label>
        <label className="text-sm">{t('admin.plugin_obs_site')}<input list="plugin-sites" className="input ml-2 w-auto" aria-label={t('admin.plugin_obs_site_filter')} value={siteIdInput} onChange={event => setSiteIdInput(event.target.value)} onKeyDown={handleSiteIdKeyDown} placeholder={t('admin.plugin_obs_all_sites')} /><datalist id="plugin-sites">{data?.sites.map(site => <option key={site.siteId} value={site.siteId}>{site.siteName || site.siteId}</option>)}</datalist></label>
        <button className="btn btn-secondary btn-sm" onClick={handleSiteIdSubmit}>{t('common.apply')}</button>
        {siteIdFilter || pluginFilter !== 'all' ? <button className="btn btn-ghost btn-sm" onClick={() => {setSiteIdInput(''); updateUrl({site: null, plugin: null, focus: null});}}>{t('admin.plugin_obs_reset')}</button> : null}
        <span className="text-xs text-slate-500">{data?.generatedAt ? `${t('common.updated_at')}: ${formatDate(data.generatedAt)}` : ''}</span>
      </div>
      {error ? <div role="alert" className="text-sm text-rose-700">{t('error.failed_load')}<details><summary className="cursor-pointer">{t('admin.plugin_obs_raw')}</summary>{error}</details>{data ? <p>{t('admin.plugin_obs_stale_notice')}</p> : null}</div> : null}
      {loading && !data ? <LoadingFallback /> : null}
      {data ? <>
        <p className="text-sm text-slate-600">{data.totals.eventsTotal === 0 ? t('admin.plugin_obs_no_records') : data.totals.errorTotal > 0 ? t('admin.plugin_obs_has_errors') : t('admin.plugin_obs_no_errors')}</p>
        <AdminDataTableFrame title={t('admin.plugin_obs_problems')} resultLabel={t('admin.plugin_obs_group_note')} dataUi="plugin-problems" density="compact">
          <table className="w-full"><thead><tr>{problemColumns.map(key => <th className={cellClass} key={key}>{t(`admin.plugin_obs_col_${key}`)}</th>)}</tr></thead><tbody>
            {data.errors.map(item => <tr key={errorKey(item)} className="border-t border-slate-100 dark:border-slate-800"><td className={cellClass}><p className="font-medium">{errorLabel(t, item.errorCode)}</p><p className="mt-1 text-xs text-slate-500">{eventLabel(t, item.eventKind)} · {pluginLabel(t, item.pluginSlug)}</p></td><td className={cellClass}>{siteName(item.siteId)}</td><td className={cellClass}>{item.count}</td><td className={cellClass}>{item.lastSeenAt ? formatDate(item.lastSeenAt) : '—'}</td><td className={cellClass}><button className="btn btn-ghost btn-sm" aria-haspopup="dialog" onClick={() => setIssueKey(errorKey(item))}>{t('admin.plugin_obs_inspect')}</button></td></tr>)}
          </tbody></table>
          {!data.errors.length ? <p className="p-4 text-sm text-slate-500">{data.totals.errorTotal > 0 ? t('admin.plugin_obs_missing_breakdown') : t('admin.plugin_obs_no_errors')}</p> : null}
        </AdminDataTableFrame>
        <AdminDataTableFrame title={t('admin.plugin_obs_site_overview')} resultLabel={t('admin.plugin_obs_site_scope')} dataUi="plugin-sites" density="compact" headerActions={<select aria-label={t('admin.plugin_obs_sort')} className="input w-auto" value={siteSort} onChange={e => setSiteSort(e.target.value as SiteSortKey)}><option value="errors">{t('admin.plugin_obs_sort_errors')}</option><option value="lastSeen">{t('admin.plugin_obs_sort_recent')}</option><option value="events">{t('admin.plugin_obs_record_count')}</option></select>}>
          <table className="w-full"><thead><tr>{['site','clue','records','errors','last_report','action'].map(key => <th className={cellClass} key={key}>{t(`admin.plugin_obs_col_${key}`)}</th>)}</tr></thead><tbody>{sortedSites.map(site => <tr className="border-t border-slate-100 dark:border-slate-800" key={site.siteId}><td className={cellClass}>{siteName(site.siteId)}<p className="mt-1 break-all text-xs text-slate-500">{site.siteUrl}</p></td><td className={cellClass}>{site.health.reasons.length ? site.health.reasons.map(reason => healthReason(t, reason)).join(' · ') : site.errorTotal > 0 ? t('admin.plugin_obs_has_errors') : t('admin.plugin_obs_no_errors')}</td><td className={cellClass}>{site.eventsTotal}</td><td className={cellClass}>{site.errorTotal}</td><td className={cellClass}>{site.lastSeenAt ? formatDate(site.lastSeenAt) : '—'}</td><td className={cellClass}><button className="btn btn-ghost btn-sm" aria-haspopup="dialog" onClick={() => setInspectedSite(site.siteId)}>{t('admin.plugin_obs_view_records')}</button></td></tr>)}</tbody></table>
          {!sortedSites.length ? <p className="p-4 text-sm text-slate-500">{t('admin.plugin_obs_no_sites')}</p> : null}
        </AdminDataTableFrame>
        <details className="border-t border-slate-200 py-3 dark:border-slate-800"><summary className="cursor-pointer text-sm">{t('admin.plugin_obs_trend')}</summary><p className="my-3 text-xs text-slate-500">{t('admin.plugin_obs_count_note')}</p>{data.timeline.length ? <AnalyticsLineChart data={timelineData} height={240} primarySeriesName={t('admin.plugin_obs_record_count')} secondarySeriesName={t('admin.plugin_obs_error_records')} /> : <p>{t('admin.plugin_obs_no_trend')}</p>}</details>
      </> : null}
      <AdminInspectorDrawer open={Boolean(selectedIssue || siteDetails)} title={selectedIssue ? errorLabel(t, selectedIssue.errorCode) : siteName(inspectedSite)} titleId="plugin-problem-title" closeLabel={closeLabel} onClose={() => {setIssueKey(null);setInspectedSite(null);}}>
        <div className="space-y-5 text-sm">
          {selectedIssue ? <><p>{siteName(selectedIssue.siteId)} · {eventLabel(t, selectedIssue.eventKind)} · {selectedIssue.count} {t('admin.plugin_obs_occurrences')}</p><h3 className="font-semibold">{t('admin.plugin_obs_known')}</h3><p>{t('admin.plugin_obs_unknown_cause')}</p><h3 className="font-semibold">{t('admin.plugin_obs_next')}</h3><ol className="list-decimal space-y-2 pl-5"><li>{t('admin.plugin_obs_step_records')}</li><li>{t('admin.plugin_obs_step_logs')}</li></ol><button className="btn btn-secondary btn-sm" disabled={!selectedIssue.siteId} onClick={() => {setInspectedSite(selectedIssue.siteId);setIssueKey(null);}}>{t('admin.plugin_obs_view_records')}</button><button className="btn btn-ghost btn-sm" onClick={() => void copyEvidence()}>{t('admin.plugin_obs_copy')}</button></> : null}
          {siteDetails ? <p>{t('admin.plugin_obs_site_summary', {records: String(siteDetails.eventsTotal), errors: String(siteDetails.errorTotal)})}</p> : null}
          <h3 className="font-semibold">{t('admin.plugin_obs_recent')}</h3><p className="text-xs text-slate-500">{t('admin.plugin_obs_recent_limit')}</p>
          {recent.map((item,index) => <div className="space-y-2 border-t border-slate-200 py-3 dark:border-slate-800" key={index}><p>{formatDate(item.receivedAt)} · {errorLabel(t,item.errorCode)}</p><p>{eventLabel(t,item.eventKind)} · {pluginLabel(t,item.pluginSlug)}</p><details><summary className="cursor-pointer">{t('admin.plugin_obs_raw')}</summary><dl className="space-y-2 break-all py-3"><dt>{t('admin.plugin_obs_error_id')}</dt><dd><code>{item.errorCode}</code></dd><dt>{t('admin.plugin_obs_event_id')}</dt><dd><code>{item.eventKind}</code></dd><dt>{t('admin.plugin_obs_ability_id')}</dt><dd><code>{item.abilityId || '—'}</code></dd><dt>{t('admin.plugin_obs_proposal_id')}</dt><dd><code>{item.proposalId || '—'}</code></dd><dt>{t('admin.plugin_obs_route')}</dt><dd><code>{item.route || '—'}</code></dd></dl></details></div>)}
          {!recent.length ? <p>{t('admin.plugin_obs_no_recent')}</p> : null}
          {selectedIssue ? <details><summary className="cursor-pointer">{t('admin.plugin_obs_raw')}</summary><dl className="space-y-2 break-all py-3"><dt>{t('admin.plugin_obs_error_id')}</dt><dd><code>{selectedIssue.errorCode}</code></dd><dt>{t('admin.plugin_obs_event_id')}</dt><dd><code>{selectedIssue.eventKind}</code></dd><dt>{t('admin.plugin_obs_plugin_id')}</dt><dd><code>{selectedIssue.pluginSlug}</code></dd><dt>{t('admin.plugin_obs_site_id')}</dt><dd><code>{selectedIssue.siteId || '—'}</code></dd></dl></details> : null}
          {siteDetails ? <><button className="btn btn-secondary btn-sm" onClick={() => {updateUrl({site: siteDetails.siteId, focus: null});setInspectedSite(null);}}>{t('admin.plugin_obs_filter_site')}</button><details><summary className="cursor-pointer">{t('admin.plugin_obs_statistics')}</summary><p className="py-3">{t('admin.plugin_obs_record_stats', {rate: formatSuccessRate(siteDetails.successRate), seconds: (siteDetails.avgLatencyMs / 1000).toFixed(1)})}</p><p>{t('admin.plugin_obs_count_note')}</p><code className="break-all">{siteDetails.siteId}</code></details></> : null}
        </div>
      </AdminInspectorDrawer>
      <AdminInspectorDrawer open={moreOpen || Boolean(focusedAttentionKey)} title={t('admin.plugin_obs_more')} titleId="plugin-more-title" closeLabel={closeLabel} onClose={() => {setMoreOpen(false);updateUrl({focus:null});}}>
        <p className="mb-4 text-sm text-slate-500">{t('admin.plugin_obs_more_note')}</p>
                  {data?.attention.length ? (
            <BackofficeSectionPanel className="overflow-hidden p-0 md:p-0">
              <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800 md:px-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{t('admin.plugin_obs_attention_label', {}, 'Attention')}</p><h2 className="mt-2 text-xl font-semibold text-gray-950 dark:text-white">{t('admin.plugin_obs_attention_title', {}, 'Current watch items')}</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{t('admin.plugin_obs_attention_count_detail', { open: formatInteger(data.attentionWorkflow.needsAttention), total: formatInteger(data.attentionWorkflow.total) }, '{{open}} open / {{total}} total')}</p></div>

                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {ATTENTION_WORKFLOW_OPTIONS.map((option) => <BackofficeFilterPill key={option.value} active={attentionWorkflowFilter === option.value} tone="info" onClick={() => { setAttentionWorkflowFilter(option.value); updateUrl({ focus: null }); }}>{t(option.labelKey, {}, option.fallback)}</BackofficeFilterPill>)}
                  {ATTENTION_SEVERITY_OPTIONS.map((option) => <BackofficeFilterPill key={option.value} active={attentionSeverityFilter === option.value} tone="accent" onClick={() => { setAttentionSeverityFilter(option.value); updateUrl({ focus: null }); }}>{t(option.labelKey, {}, option.fallback)}</BackofficeFilterPill>)}
                  <select value={attentionCodeFilter} aria-label={t('admin.plugin_obs_attention_code_filter', {}, 'Watch item code')} onChange={(event) => { setAttentionCodeFilter(event.target.value); updateUrl({ focus: null }); }} className="h-8 rounded-full border border-slate-200/80 bg-white/80 px-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200">{attentionCodeOptions.map((code) => <option key={code} value={code}>{code === 'all' ? t('admin.plugin_obs_attention_all_codes', {}, 'All codes') : t(`admin.plugin_obs_attention_title_${attentionCodeSuffix(code)}`, {}, t('admin.plugin_obs_health_other'))}</option>)}</select>
                </div>
              </div>
              <div className="space-y-3">
                <div className="max-h-[38rem] divide-y divide-slate-200 overflow-y-auto dark:divide-slate-800">
                  {filteredAttention.map((item) => {
                    const selected = selectedAttention?.attentionKey === item.attentionKey;
                    return <button key={item.attentionKey || `${item.code}-${item.siteId}`} type="button" data-ui="plugin-attention-item" aria-pressed={selected} aria-controls="plugin-attention-inspector" className={`grid w-full cursor-pointer gap-3 px-5 py-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900/45  md:px-6 ${selected ? 'bg-blue-50/65 dark:bg-blue-950/20' : ''}`} onClick={() => updateUrl({ focus: item.attentionKey })}>
                      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-slate-950 dark:text-white">{attentionCopy(t, item, 'title')}</span><BackofficeTag tone={attentionTone(item.severity)}>{t(`admin.plugin_obs_severity_${item.severity}`, {}, item.severity)}</BackofficeTag></div><p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{attentionCopy(t, item, 'detail')}</p><p className="mt-2 truncate text-xs text-slate-500 dark:text-slate-400">{[item.siteId, item.pluginSlug, item.errorCode].filter(Boolean).join(' · ')}</p></div>
                      <div className="text-sm font-medium text-slate-500 md:text-right dark:text-slate-400">{t(`admin.plugin_obs_workflow_${item.workflowStatus}`, {}, item.workflowStatus)}</div>
                    </button>;
                  })}
                  {!filteredAttention.length ? <BackofficeEmptyState className="m-5 md:m-6" title={t('admin.plugin_obs_attention_filtered_empty', {}, 'No watch items match the selected filters.')} description={t('admin.plugin_obs_attention_filtered_empty_desc', {}, 'Clear a workflow, severity, or code filter to return to the active watch queue.')} /> : null}
                </div>
                <div id="plugin-attention-inspector" className="border-t border-slate-200 p-5 dark:border-slate-800 ">
                  {selectedAttention ? <div className="space-y-5"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{t('admin.plugin_obs_selected_watch_item', {}, 'Selected watch item')}</p><div className="mt-2 flex items-start justify-between gap-3"><h3 className="text-lg font-semibold text-slate-950 dark:text-white">{attentionCopy(t, selectedAttention, 'title')}</h3><BackofficeTag tone={attentionTone(selectedAttention.severity)}>{t(`admin.plugin_obs_severity_${selectedAttention.severity}`, {}, selectedAttention.severity)}</BackofficeTag></div><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{attentionCopy(t, selectedAttention, 'detail')}</p></div>
                    <dl className="grid gap-3 text-sm"><div><dt className="text-xs text-slate-500 dark:text-slate-400">{t('admin.plugin_obs_suggested_step', {}, 'Suggested review step')}</dt><dd className="mt-1 text-slate-800 dark:text-slate-100">{attentionCopy(t, selectedAttention, 'action')}</dd></div>{selectedAttention.siteId ? <div><dt className="text-xs text-slate-500 dark:text-slate-400">{t('common.site', {}, 'Site')}</dt><dd className="mt-1"><BackofficeIdentifier value={selectedAttention.siteId} /></dd></div> : null}{selectedAttention.pluginSlug ? <div><dt className="text-xs text-slate-500 dark:text-slate-400">{t('admin.plugin_obs_plugins', {}, 'Plugin')}</dt><dd className="mt-1 text-slate-800 dark:text-slate-100">{selectedAttention.pluginSlug}</dd></div> : null}{selectedAttention.errorCode ? <div><dt className="text-xs text-slate-500 dark:text-slate-400">{t('admin.plugin_obs_error_codes', {}, 'Error code')}</dt><dd className="mt-1 break-all font-mono text-xs text-rose-700 dark:text-rose-300">{selectedAttention.errorCode}</dd></div> : null}</dl>
                    <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">{(['acknowledge', 'mute', 'resolve'] as AttentionStateAction[]).map((action) => <button key={action} type="button" className={action === 'resolve' ? 'btn btn-primary justify-center' : 'btn btn-secondary justify-center'} disabled={Boolean(attentionActionKey) || loading || Boolean(error)} onClick={() => void handleAttentionStateAction(selectedAttention, action)}>{attentionActionLabel(t, action)}</button>)}</div>
                    {selectedAttention.workflowStatus !== 'active' ? <button type="button" className="btn btn-ghost w-full justify-center" disabled={Boolean(attentionActionKey) || loading || Boolean(error)} onClick={() => void handleAttentionStateAction(selectedAttention, 'clear')}>{attentionActionLabel(t, 'clear')}</button> : null}
                    <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500 dark:bg-slate-900/45 dark:text-slate-400">{t('admin.plugin_obs_attention_scope_notice', {}, 'Attention state is Cloud display state only. It does not mutate local plugin settings, approvals, ability definitions, routing, or WordPress content.')}</p>
                  </div> : <p className="text-sm text-slate-500">{t('admin.plugin_obs_select_alert')}</p>}
                </div>
              </div>
            </BackofficeSectionPanel>
          ) : null}


          <div className="grid gap-5 ">
            <BackofficeSectionPanel className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                  {t('admin.plugin_obs_plugin_compare_label', {}, 'Plugin comparison')}
                </p>
                <h2 className="mt-2 text-xl font-semibold text-gray-950 dark:text-white">
                  {hasPluginErrors
                    ? t('admin.plugin_obs_plugin_error_title', {}, 'Error pressure')
                    : t('admin.plugin_obs_plugin_volume_title', {}, 'Event volume')}
                </h2>
              </div>
              <AnalyticsBarChart
                data={hasPluginErrors ? pluginErrorData : pluginVolumeData}
                height={280}
                barColor={hasPluginErrors ? '#f59e0b' : '#2563eb'}
              />
            </BackofficeSectionPanel>
          </div>

            <BackofficeSectionPanel className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                  {t('admin.plugin_obs_plugins', {}, 'Plugins')}
                </p>
                <h2 className="mt-2 text-xl font-semibold text-gray-950 dark:text-white">
                  {t('admin.plugin_obs_plugin_breakdown', {}, 'Plugin breakdown')}
                </h2>
              </div>
              <div className="space-y-3">
                {data?.plugins.map((plugin) => (
                  <BackofficeStackCard key={plugin.pluginSlug}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-950 dark:text-white">{pluginLabel(t, plugin.pluginSlug)}</p>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                          {t(
                            'admin.plugin_obs_record_stats',
                            {
                              records: formatInteger(plugin.eventsTotal),
                              rate: formatSuccessRate(plugin.successRate),
                              seconds: (plugin.avgLatencyMs / 1000).toFixed(1),
                            },
                            '{{events}} events · {{rate}} · avg {{latency}}ms'
                          )}
                        </p>
                        <details className="mt-2"><summary className="cursor-pointer text-sm">{t('admin.plugin_obs_raw')}</summary><code className="break-all text-xs">{plugin.pluginSlug}</code></details>
                        <div className="mt-2 space-y-2">
                          {plugin.eventKinds.map((ek) => (
                            <details key={ek.eventKind}><summary className="cursor-pointer text-sm">{eventLabel(t, ek.eventKind)} · {ek.eventsTotal}</summary><code className="break-all text-xs">{ek.eventKind}</code></details>
                          ))}
                        </div>
                      </div>
                      <BackofficeStatusBadge
                        status={successRateStatus(plugin.successRate)}
                        label={formatSuccessRate(plugin.successRate)}
                      />
                    </div>
                  </BackofficeStackCard>
                ))}
              </div>
            </BackofficeSectionPanel>


      </AdminInspectorDrawer>
    </BackofficePageStack>
  );
}

export default function AdminPluginObservabilityPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AdminPluginObservabilityContent />
    </Suspense>
  );
}
