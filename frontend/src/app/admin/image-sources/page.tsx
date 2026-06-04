'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import {
  BackofficeMetricStrip,
  BackofficePageStack,
  BackofficePrimaryPanel,
  BackofficeSectionPanel,
  BackofficeStackCard,
} from '@/components/backoffice/BackofficeScaffold';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';
import { LoadingFallback } from '@/components/ui/LoadingFallback';
import { resolveUiErrorMessage } from '@/lib/errors';

type ProviderId = 'unsplash' | 'pixabay' | 'pexels';

type ProviderState = {
  provider_id: ProviderId;
  display_name: string;
  enabled: boolean;
  configured: boolean;
  status: string;
  base_url: string;
};

type ImageSourceConfig = {
  provider_mode: string;
  env_path: string;
  requires_worker_restart_after_save: boolean;
  providers: Record<ProviderId, ProviderState>;
  runtime: {
    timeout_seconds: number;
    cost_per_query: number;
  };
};

type ProviderForm = {
  base_url: string;
  secret: string;
  clear_secret: boolean;
};

const PROVIDERS: ProviderId[] = ['unsplash', 'pixabay', 'pexels'];

const MODE_LABELS: Record<string, string> = {
  disabled: 'Disabled',
  auto: 'Auto fallback',
  unsplash: 'Unsplash',
  pixabay: 'Pixabay',
  pexels: 'Pexels',
};

function normalizeConfig(raw: any): ImageSourceConfig {
  const providers = raw?.providers ?? {};
  const normalizeProvider = (providerId: ProviderId, fallbackName: string): ProviderState => {
    const provider = providers?.[providerId] ?? {};
    return {
      provider_id: providerId,
      display_name: String(provider.display_name ?? fallbackName),
      enabled: Boolean(provider.enabled),
      configured: Boolean(provider.configured),
      status: String(provider.status ?? 'missing_secret'),
      base_url: String(provider.base_url ?? ''),
    };
  };
  return {
    provider_mode: String(raw?.provider_mode ?? 'disabled'),
    env_path: String(raw?.env_path ?? ''),
    requires_worker_restart_after_save: Boolean(raw?.requires_worker_restart_after_save),
    providers: {
      unsplash: normalizeProvider('unsplash', 'Unsplash'),
      pixabay: normalizeProvider('pixabay', 'Pixabay'),
      pexels: normalizeProvider('pexels', 'Pexels'),
    },
    runtime: {
      timeout_seconds: Number(raw?.runtime?.timeout_seconds ?? 15),
      cost_per_query: Number(raw?.runtime?.cost_per_query ?? 0),
    },
  };
}

function emptyForms(config: ImageSourceConfig): Record<ProviderId, ProviderForm> {
  return PROVIDERS.reduce((forms, providerId) => {
    forms[providerId] = {
      base_url: config.providers[providerId].base_url,
      secret: '',
      clear_secret: false,
    };
    return forms;
  }, {} as Record<ProviderId, ProviderForm>);
}

function providerHelp(providerId: ProviderId): string {
  switch (providerId) {
    case 'unsplash':
      return 'Stock image reference source for editorial and product imagery.';
    case 'pixabay':
      return 'Stock image reference source with broad public image coverage.';
    case 'pexels':
      return 'Stock image reference source for photography and visual references.';
  }
}

function ImageSourcesAdminContent() {
  const [config, setConfig] = useState<ImageSourceConfig | null>(null);
  const [providerMode, setProviderMode] = useState('disabled');
  const [forms, setForms] = useState<Record<ProviderId, ProviderForm> | null>(null);
  const [timeoutSeconds, setTimeoutSeconds] = useState(15);
  const [costPerQuery, setCostPerQuery] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    async function loadConfig() {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/admin/image-source-providers', { credentials: 'include' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(resolveUiErrorMessage(payload, 'Failed to load image source provider settings.'));
        }
        const normalized = normalizeConfig(payload.data ?? {});
        if (!mounted) return;
        setConfig(normalized);
        setProviderMode(normalized.provider_mode);
        setForms(emptyForms(normalized));
        setTimeoutSeconds(normalized.runtime.timeout_seconds);
        setCostPerQuery(normalized.runtime.cost_per_query);
      } catch (loadError) {
        if (!mounted) return;
        setError(loadError instanceof Error ? loadError.message : 'Failed to load image source provider settings.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadConfig();
    return () => {
      mounted = false;
    };
  }, []);

  const metrics = useMemo(() => {
    if (!config) return [];
    const configuredCount = PROVIDERS.filter((providerId) => config.providers[providerId].configured).length;
    return [
      {
        label: 'Mode',
        value: MODE_LABELS[providerMode] ?? providerMode,
        detail: 'Default Cloud image source routing mode.',
      },
      {
        label: 'Configured',
        value: `${configuredCount}/3`,
        detail: 'Provider secrets present in Cloud runtime configuration.',
      },
      {
        label: 'Storage',
        value: config.env_path || 'runtime env',
        detail: 'Secrets remain Cloud-side and are not returned to the browser.',
        size: 'compact' as const,
      },
      {
        label: 'Worker',
        value: config.requires_worker_restart_after_save ? 'Restart' : 'Live',
        detail: config.requires_worker_restart_after_save ? 'Restart worker after provider changes.' : 'Changes apply immediately.',
      },
    ];
  }, [config, providerMode]);

  function updateProvider(providerId: ProviderId, patch: Partial<ProviderForm>) {
    setForms((current) => {
      if (!current) return current;
      return {
        ...current,
        [providerId]: {
          ...current[providerId],
          ...patch,
        },
      };
    });
  }

  async function save() {
    if (!forms) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch('/api/admin/image-source-providers', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_mode: providerMode,
          providers: forms,
          runtime: {
            timeout_seconds: timeoutSeconds,
            cost_per_query: costPerQuery,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(resolveUiErrorMessage(payload, 'Failed to save image source provider settings.'));
      }
      const normalized = normalizeConfig(payload.data ?? {});
      setConfig(normalized);
      setProviderMode(normalized.provider_mode);
      setForms(emptyForms(normalized));
      setTimeoutSeconds(normalized.runtime.timeout_seconds);
      setCostPerQuery(normalized.runtime.cost_per_query);
      setMessage('Image source provider settings saved. Restart worker processes for queued runs to pick up the same values.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save image source provider settings.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <LoadingFallback />;
  }

  if (!config || !forms) {
    return (
      <BackofficePageStack>
        <BackofficePrimaryPanel
          eyebrow="Cloud Runtime"
          title="Image Sources"
          description="Cloud-managed image source provider settings."
        >
          <BackofficeStackCard className="border-rose-200 bg-rose-50 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/25 dark:text-rose-200">
            {error || 'Image source provider settings are unavailable.'}
          </BackofficeStackCard>
        </BackofficePrimaryPanel>
      </BackofficePageStack>
    );
  }

  return (
    <BackofficePageStack>
      <BackofficePrimaryPanel
        eyebrow="Cloud Runtime"
        title="Image Sources"
        description="Configure Cloud-owned stock image provider credentials. WordPress sites never provide or receive these provider keys."
        aside={<BackofficeStatusBadge label={MODE_LABELS[providerMode] ?? providerMode} status={providerMode === 'disabled' ? 'disabled' : 'active'} />}
        summary={<BackofficeMetricStrip items={metrics} columnsClassName="xl:grid-cols-4" />}
      >
        {message ? (
          <BackofficeStackCard className="border-emerald-200 bg-emerald-50 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/25 dark:text-emerald-200">
            {message}
          </BackofficeStackCard>
        ) : null}
        {error ? (
          <BackofficeStackCard className="border-rose-200 bg-rose-50 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/25 dark:text-rose-200">
            {error}
          </BackofficeStackCard>
        ) : null}
      </BackofficePrimaryPanel>

      <BackofficeSectionPanel>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Default provider mode</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Auto tries configured stock image providers in Cloud order and returns image candidates only.
            </p>
          </div>
          <select
            className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            value={providerMode}
            onChange={(event) => setProviderMode(event.target.value)}
          >
            {Object.entries(MODE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </BackofficeSectionPanel>

      <div className="grid gap-4 xl:grid-cols-3">
        {PROVIDERS.map((providerId) => {
          const provider = config.providers[providerId];
          const form = forms[providerId];
          return (
            <BackofficeSectionPanel key={providerId}>
              <div className="flex flex-col gap-3 sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-slate-950 dark:text-white">{provider.display_name}</h2>
                    <BackofficeStatusBadge
                      label={provider.configured ? 'Configured' : 'Missing key'}
                      status={provider.configured ? 'success' : 'warning'}
                    />
                    {provider.enabled ? <BackofficeStatusBadge label="Active" status="active" /> : null}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{providerHelp(providerId)}</p>
                </div>
              </div>

              <div className="mt-5 grid gap-4">
                <label className="grid gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                  Base URL
                  <input
                    className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    value={form.base_url}
                    onChange={(event) => updateProvider(providerId, { base_url: event.target.value })}
                  />
                </label>

                <label className="grid gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                  {providerId === 'unsplash' ? 'Access key' : 'API key'}
                  <input
                    className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    value={form.secret}
                    onChange={(event) => updateProvider(providerId, { secret: event.target.value, clear_secret: false })}
                    placeholder={provider.configured ? 'Configured. Leave blank to keep existing secret.' : 'Paste provider secret'}
                    type="password"
                    autoComplete="new-password"
                  />
                </label>

                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={Boolean(form.clear_secret)}
                    onChange={(event) => updateProvider(providerId, { clear_secret: event.target.checked, secret: '' })}
                  />
                  Clear stored secret
                </label>
              </div>
            </BackofficeSectionPanel>
          );
        })}
      </div>

      <BackofficeSectionPanel>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
            Timeout seconds
            <input
              className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              value={timeoutSeconds}
              onChange={(event) => setTimeoutSeconds(Number(event.target.value || 0))}
              type="number"
              min="1"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
            Cost per query
            <input
              className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              value={costPerQuery}
              onChange={(event) => setCostPerQuery(Number(event.target.value || 0))}
              type="number"
              min="0"
              step="0.000001"
            />
          </label>
        </div>
      </BackofficeSectionPanel>

      <BackofficeSectionPanel>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
            Saving updates Cloud runtime configuration only. Returned images are candidates; final WordPress writes still go through Core proposal approval.
          </p>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save provider settings'}
          </button>
        </div>
      </BackofficeSectionPanel>
    </BackofficePageStack>
  );
}

export default function ImageSourcesAdminPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ImageSourcesAdminContent />
    </Suspense>
  );
}
