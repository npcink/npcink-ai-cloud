'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminConfigurationRow, AdminConfigurationTable } from '@/components/admin/AdminConfigurationTable';
import { AdminHelpTip } from '@/components/admin/AdminHelpTip';
import { AdminDataTableFrame } from '@/components/admin/AdminDataTableFrame';
import { AdminMutationReceipt, type AdminMutationReceiptPayload } from '@/components/admin/AdminMutationReceipt';
import { AdminWorkbenchDialog } from '@/components/admin/AdminWorkbenchDialog';
import {
  BackofficeConfigurationHeader,
  BackofficeDisclosure,
  BackofficeEmptyState,
  BackofficePageStack,
} from '@/components/backoffice/BackofficeScaffold';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';
import { LoadingFallback } from '@/components/ui/LoadingFallback';
import { ConfirmModal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAdminNavigationGuard } from '@/hooks/useAdminNavigationGuard';
import { useLocale } from '@/contexts/LocaleContext';
import { createApiClient } from '@/lib/api-client';
import { ApiError, resolveUiErrorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/utils';

const runtimeProfilesClient = createApiClient({ idempotencyPrefix: 'runtime_profiles' });
const MAX_VISIBLE_CANDIDATES = 80;
const SUPPORTED_EXECUTION_KINDS = new Set(['text', 'vision', 'image_generation', 'audio_generation']);
const SUPERSEDED_CONNECTOR_CONTRACT_FIELD = ['connector', 'contract', 'version'].join('_');
const MEDIA_RECOGNITION_PROFILE_UNAVAILABLE_ERROR = 'service_settings.media_recognition_profile_unavailable';

type CapabilityEvidence = {
  state: string;
  source: string;
  revision: string;
  checked_at: string;
  error_code: string;
};

type RuntimeInstance = {
  instance_id: string;
  provider_id: string;
  provider_display_name: string;
  adapter_type: string;
  model_id: string;
  endpoint_variant: string;
  region: string;
  health_status: string;
  weight: number;
  capability_tags: string[];
  model_status: string;
  model_feature: string;
  upstream_model_id: string;
  catalog_source: string;
  upstream_status: string;
  vision_evidence: CapabilityEvidence | null;
  capability_evidence: Record<string, CapabilityEvidence>;
};

type RuntimeProfile = {
  profile_id: string;
  group_id: string;
  routing_intent: string;
  label: string;
  description: string;
  execution_kind: string;
  tasks: string[];
  candidate_instance_ids: string[];
  timeout_ms: number;
  max_timeout_ms: number;
  allow_fallback: boolean;
  max_retries: number;
  note: string;
  revision: string;
  updated_at: string;
  status: string;
  availability_state: 'active' | 'paused';
  platform_kind: 'wordpress';
  connector_id: 'wordpress_ai_connector';
};

type RuntimeProfilesData = {
  contract_version: 'cloud-hosted-runtime-profiles.v1';
  surface: 'admin_hosted_runtime_profiles';
  projection_kind: 'hosted_runtime_profile_configuration';
  owner: 'cloud_runtime';
  platform_kind: 'wordpress';
  connector_id: 'wordpress_ai_connector';
  operation_contract_version: 'wordpress_operation.v1';
  available_instances: {
    text: RuntimeInstance[];
    vision: RuntimeInstance[];
    image_generation: RuntimeInstance[];
    audio_generation: RuntimeInstance[];
  };
  profiles: RuntimeProfile[];
  read_only_profiles: Array<{
    profile_id: 'text.ai';
    selection_mode: 'automatic';
    candidates: Array<{
      instance_id: string;
      provider_id: string;
      provider_display_name: string;
      model_id: string;
      upstream_model_id: string;
    }>;
  }>;
  receipt?: AdminMutationReceiptPayload | null;
};

type CapabilityProbeGroup = {
  attempts: number;
  verified: number;
  failed: number;
  success_rate: number;
};

type CapabilityProbeSummary = {
  window_minutes: number;
  generated_at: string;
  totals: CapabilityProbeGroup;
  by_capability: Array<CapabilityProbeGroup & { capability: string }>;
  by_instance: Array<CapabilityProbeGroup & { instance_id: string }>;
  recent_failures: Array<{
    instance_id: string;
    capability: string;
    state: string;
    error_code: string;
    checked_at: string;
  }>;
};

type CapabilityProbeEvidence = CapabilityEvidence & {
  capability: string;
};

type MediaRecognitionPolicyForm = {
  enabled: boolean;
  timezone: string;
  window_start: string;
  window_end: string;
  daily_limit: string;
};

type MediaRecognitionPolicySetting = {
  enabled: boolean;
  status: string;
  config: Record<string, unknown>;
};

type ServiceSettingsProjection = {
  settings: {
    media_recognition_policy: MediaRecognitionPolicySetting;
    platform_preferences: MediaRecognitionPolicySetting;
  };
};

const DEFAULT_MEDIA_RECOGNITION_POLICY: MediaRecognitionPolicyForm = {
  enabled: false,
  timezone: 'Asia/Shanghai',
  window_start: '01:00',
  window_end: '06:00',
  daily_limit: '100',
};

function normalizeRuntimeInstance(value: unknown): RuntimeInstance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Hosted runtime instance must be an object.');
  }
  const item = value as Record<string, unknown>;
  const instanceId = String(item.instance_id || '').trim();
  const providerId = String(item.provider_id || '').trim();
  const modelId = String(item.model_id || '').trim();
  if (!instanceId || !providerId || !modelId) {
    throw new TypeError('Hosted runtime instance requires instance_id, provider_id, and model_id.');
  }
  return {
    instance_id: instanceId,
    provider_id: providerId,
    provider_display_name: String(item.provider_display_name || ''),
    adapter_type: String(item.adapter_type || ''),
    model_id: modelId,
    endpoint_variant: String(item.endpoint_variant || ''),
    region: String(item.region || ''),
    health_status: String(item.health_status || ''),
    weight: Number(item.weight || 0),
    capability_tags: Array.isArray(item.capability_tags) ? item.capability_tags.map(String) : [],
    model_status: String(item.model_status || ''),
    model_feature: String(item.model_feature || ''),
    upstream_model_id: String(item.upstream_model_id || item.model_id || ''),
    catalog_source: String(item.catalog_source || ''),
    upstream_status: String(item.upstream_status || 'current'),
    vision_evidence: item.vision_evidence && typeof item.vision_evidence === 'object'
      ? {
        state: String((item.vision_evidence as Record<string, unknown>).state || ''),
        source: String((item.vision_evidence as Record<string, unknown>).source || ''),
        revision: String((item.vision_evidence as Record<string, unknown>).revision || ''),
        checked_at: String((item.vision_evidence as Record<string, unknown>).checked_at || ''),
        error_code: String((item.vision_evidence as Record<string, unknown>).error_code || ''),
      }
      : null,
    capability_evidence: item.capability_evidence && typeof item.capability_evidence === 'object'
      ? Object.fromEntries(Object.entries(item.capability_evidence as Record<string, unknown>).flatMap(([capability, raw]) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
        const evidence = raw as Record<string, unknown>;
        return [[capability, {
          state: String(evidence.state || ''),
          source: String(evidence.source || ''),
          revision: String(evidence.revision || ''),
          checked_at: String(evidence.checked_at || ''),
          error_code: String(evidence.error_code || ''),
        }]];
      }))
      : {},
  };
}

function normalizeRuntimeProfile(value: unknown): RuntimeProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Hosted runtime profile must be an object.');
  }
  const item = value as Record<string, unknown>;
  if (item.platform_kind !== 'wordpress' || item.connector_id !== 'wordpress_ai_connector') {
    throw new TypeError('Hosted runtime profile identity does not match the WordPress connector contract.');
  }
  const profileId = String(item.profile_id || '').trim();
  if (!profileId) {
    throw new TypeError('Hosted runtime profile requires a non-empty profile_id.');
  }
  if (!Array.isArray(item.tasks) || !Array.isArray(item.candidate_instance_ids)) {
    throw new TypeError(`Hosted runtime profile ${profileId} requires tasks and candidate_instance_ids arrays.`);
  }
  if (item.tasks.some((task) => typeof task !== 'string' || !task.trim())) {
    throw new TypeError(`Hosted runtime profile ${profileId} requires non-empty string task identifiers.`);
  }
  if (item.candidate_instance_ids.some((instanceId) => typeof instanceId !== 'string' || !instanceId.trim())) {
    throw new TypeError(`Hosted runtime profile ${profileId} requires non-empty string candidate instance identifiers.`);
  }
  if (item.candidate_instance_ids.length > 2) {
    throw new TypeError(`Hosted runtime profile ${profileId} supports at most two candidate instance identifiers.`);
  }
  const executionKind = String(item.execution_kind || '').trim();
  if (!SUPPORTED_EXECUTION_KINDS.has(executionKind)) {
    throw new TypeError(`Hosted runtime profile ${profileId} has an unsupported execution_kind.`);
  }
  return {
    profile_id: profileId,
    group_id: String(item.group_id || item.groupId || ''),
    routing_intent: String(item.routing_intent || ''),
    label: String(item.label || ''),
    description: String(item.description || ''),
    execution_kind: executionKind,
    tasks: item.tasks.map((task) => task.trim()),
    candidate_instance_ids: item.candidate_instance_ids.map((instanceId) => instanceId.trim()),
    timeout_ms: Number(item.timeout_ms || 0),
    max_timeout_ms: Number(item.max_timeout_ms || 0),
    allow_fallback: Boolean(item.allow_fallback),
    max_retries: Number(item.max_retries || 0),
    note: String(item.note || ''),
    revision: String(item.revision || ''),
    updated_at: String(item.updated_at || ''),
    status: String(item.status || ''),
    availability_state: item.availability_state === 'paused' ? 'paused' : 'active',
    platform_kind: 'wordpress',
    connector_id: 'wordpress_ai_connector',
  };
}

function normalizeRuntimeProfilesData(value: unknown): RuntimeProfilesData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Hosted runtime profile response is not an object.');
  }
  const data = value as Record<string, unknown>;
  if (SUPERSEDED_CONNECTOR_CONTRACT_FIELD in data) {
    throw new TypeError('Hosted runtime profile contract contains superseded connector contract identity.');
  }
  const expectedIdentity: Record<string, string> = {
    contract_version: 'cloud-hosted-runtime-profiles.v1',
    surface: 'admin_hosted_runtime_profiles',
    projection_kind: 'hosted_runtime_profile_configuration',
    owner: 'cloud_runtime',
    platform_kind: 'wordpress',
    connector_id: 'wordpress_ai_connector',
    operation_contract_version: 'wordpress_operation.v1',
  };
  for (const [field, expected] of Object.entries(expectedIdentity)) {
    if (data[field] !== expected) {
      throw new TypeError(`Hosted runtime profile contract identity mismatch: ${field}.`);
    }
  }
  if (!data.available_instances || typeof data.available_instances !== 'object' || Array.isArray(data.available_instances)) {
    throw new TypeError('Hosted runtime profile contract requires available_instances object.');
  }
  const available = data.available_instances as Record<string, unknown>;
  const requiredInstanceKinds = ['text', 'vision', 'image_generation', 'audio_generation'] as const;
  for (const kind of requiredInstanceKinds) {
    if (!Array.isArray(available[kind])) {
      throw new TypeError(`Hosted runtime profile contract requires available_instances.${kind} array.`);
    }
  }
  if (!Array.isArray(data.profiles)) {
    throw new TypeError('Hosted runtime profile contract requires profiles array.');
  }
  const profiles = data.profiles.map(normalizeRuntimeProfile);
  const profileIds = new Set<string>();
  for (const profile of profiles) {
    if (profileIds.has(profile.profile_id)) {
      throw new TypeError(`Hosted runtime profile_id is duplicated: ${profile.profile_id}.`);
    }
    profileIds.add(profile.profile_id);
  }
  const list = (key: typeof requiredInstanceKinds[number]) => (
    available[key] as unknown[]
  ).map(normalizeRuntimeInstance);
  return {
    contract_version: 'cloud-hosted-runtime-profiles.v1',
    surface: 'admin_hosted_runtime_profiles',
    projection_kind: 'hosted_runtime_profile_configuration',
    owner: 'cloud_runtime',
    platform_kind: 'wordpress',
    connector_id: 'wordpress_ai_connector',
    operation_contract_version: 'wordpress_operation.v1',
    available_instances: {
      text: list('text'),
      vision: list('vision'),
      image_generation: list('image_generation'),
      audio_generation: list('audio_generation'),
    },
    profiles,
    read_only_profiles: normalizeReadOnlyProfiles(data.read_only_profiles),
    receipt: data.receipt && typeof data.receipt === 'object'
      ? data.receipt as AdminMutationReceiptPayload
      : null,
  };
}

function normalizeReadOnlyProfiles(value: unknown): RuntimeProfilesData['read_only_profiles'] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new TypeError('Read-only runtime profiles must be an array.');
  return value.map((raw) => {
    if (!raw || raw.profile_id !== 'text.ai' || raw.selection_mode !== 'automatic' || !Array.isArray(raw.candidates)) {
      throw new TypeError('Read-only runtime profile must describe the automatic text.ai route.');
    }
    return {
      profile_id: 'text.ai',
      selection_mode: 'automatic',
      candidates: raw.candidates.map((candidate: Record<string, unknown> | null) => {
        if (!candidate || !candidate.instance_id || !candidate.provider_id || !candidate.model_id) {
          throw new TypeError('Read-only candidate requires recorded routing identity.');
        }
        return {
          instance_id: String(candidate.instance_id),
          provider_id: String(candidate.provider_id),
          provider_display_name: String(candidate.provider_display_name || ''),
          model_id: String(candidate.model_id),
          upstream_model_id: String(candidate.upstream_model_id || candidate.model_id),
        };
      }),
    };
  });
}

function normalizeCapabilityProbeSummary(value: unknown): CapabilityProbeSummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Capability probe summary response is not an object.');
  }
  const data = value as Record<string, unknown>;
  if (!Number.isFinite(data.window_minutes) || Number(data.window_minutes) <= 0
    || !data.totals || typeof data.totals !== 'object'
    || !Array.isArray(data.by_capability) || !Array.isArray(data.by_instance) || !Array.isArray(data.recent_failures)) {
    throw new TypeError('Capability probe summary response is invalid.');
  }
  const normalizeGroup = (raw: unknown): CapabilityProbeGroup => {
    const item = raw && typeof raw === 'object' && !Array.isArray(raw)
      ? raw as Record<string, unknown>
      : Object.create(null) as Record<string, unknown>;
    if (['attempts', 'verified', 'failed'].some((key) => !Number.isInteger(item[key]) || Number(item[key]) < 0)
      || !Number.isFinite(item.success_rate) || Number(item.success_rate) < 0 || Number(item.success_rate) > 1) {
      throw new TypeError('Capability probe counts are invalid.');
    }
    return {
      attempts: Number(item.attempts || 0),
      verified: Number(item.verified || 0),
      failed: Number(item.failed || 0),
      success_rate: Number(item.success_rate || 0),
    };
  };
  const normalizeList = (raw: unknown, key: 'capability' | 'instance_id') => (
    Array.isArray(raw) ? raw.flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
      const item = entry as Record<string, unknown>;
      const name = String(item[key] || '').trim();
      return name ? [{ [key]: name, ...normalizeGroup(item) }] : [];
    }) : []
  );
  const failures = Array.isArray(data.recent_failures) ? data.recent_failures.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    return [{
      instance_id: String(item.instance_id || ''),
      capability: String(item.capability || ''),
      state: String(item.state || ''),
      error_code: String(item.error_code || ''),
      checked_at: String(item.checked_at || ''),
    }];
  }) : [];
  return {
    window_minutes: Number(data.window_minutes || 0),
    generated_at: String(data.generated_at || ''),
    totals: normalizeGroup(data.totals),
    by_capability: normalizeList(data.by_capability, 'capability') as CapabilityProbeSummary['by_capability'],
    by_instance: normalizeList(data.by_instance, 'instance_id') as CapabilityProbeSummary['by_instance'],
    recent_failures: failures,
  };
}

function profileSnapshot(profiles: RuntimeProfile[]): string {
  return JSON.stringify(profiles.map((profile) => ({
    profile_id: profile.profile_id,
    candidate_instance_ids: profile.candidate_instance_ids,
    timeout_ms: profile.timeout_ms,
    allow_fallback: profile.allow_fallback,
    max_retries: profile.max_retries,
    note: profile.note,
  })));
}

function normalizeMediaRecognitionPolicy(
  value: unknown,
  platformPreferences: unknown
): MediaRecognitionPolicyForm {
  const setting = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : Object.create(null) as Record<string, unknown>;
  const config = setting.config && typeof setting.config === 'object' && !Array.isArray(setting.config)
    ? setting.config as Record<string, unknown>
    : Object.create(null) as Record<string, unknown>;
  const preferences = platformPreferences && typeof platformPreferences === 'object' && !Array.isArray(platformPreferences)
    ? platformPreferences as Record<string, unknown>
    : Object.create(null) as Record<string, unknown>;
  const preferenceConfig = preferences.config && typeof preferences.config === 'object' && !Array.isArray(preferences.config)
    ? preferences.config as Record<string, unknown>
    : Object.create(null) as Record<string, unknown>;
  if (typeof setting.enabled !== 'boolean'
    || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(config.window_start || ''))
    || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(config.window_end || ''))
    || !Number.isInteger(config.daily_limit) || Number(config.daily_limit) < 1 || Number(config.daily_limit) > 10000
    || typeof preferenceConfig.timezone !== 'string' || !preferenceConfig.timezone.trim()) {
    throw new TypeError('Media recognition policy response is invalid.');
  }
  return {
    enabled: Boolean(setting.enabled),
    timezone: String(preferenceConfig.timezone || DEFAULT_MEDIA_RECOGNITION_POLICY.timezone),
    window_start: String(config.window_start || DEFAULT_MEDIA_RECOGNITION_POLICY.window_start),
    window_end: String(config.window_end || DEFAULT_MEDIA_RECOGNITION_POLICY.window_end),
    daily_limit: String(config.daily_limit || DEFAULT_MEDIA_RECOGNITION_POLICY.daily_limit),
  };
}

function mediaRecognitionPolicySnapshot(policy: MediaRecognitionPolicyForm): string {
  return JSON.stringify(policy);
}

function mediaRecognitionSwitchClassName(checked: boolean): string {
  return `relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60 dark:focus:ring-blue-950 ${checked
    ? 'border-blue-600 bg-blue-600'
    : 'border-slate-300 bg-slate-200 dark:border-slate-700 dark:bg-slate-800'}`;
}

function profileTone(profile: RuntimeProfile, instances: Map<string, RuntimeInstance>): 'success' | 'warning' | 'error' {
  const primary = instances.get(profile.candidate_instance_ids[0] || '');
  if (!primary) return profile.candidate_instance_ids.length ? 'error' : 'warning';
  if (profile.candidate_instance_ids.some((instanceId) => {
    const instance = instances.get(instanceId);
    return instance && !instanceMatchesExecutionKind(instance, profile.execution_kind);
  })) return 'error';
  const tones = profile.candidate_instance_ids.map((id) => {
    const instance = instances.get(id);
    return instance ? instanceTone(instance, profile.execution_kind) : 'error';
  });
  if (tones.includes('error')) return 'error';
  if (tones.includes('warning')) return 'warning';
  return 'success';
}

function instanceTone(instance: RuntimeInstance, executionKind = ''): 'success' | 'warning' | 'error' {
  const modelStatus = instance.model_status.trim().toLowerCase();
  const healthStatus = instance.health_status.trim().toLowerCase();
  if (modelStatus !== 'available' || healthStatus === 'unhealthy') return 'error';
  if (requiresCapabilityVerification(executionKind)) {
    const evidence = capabilityEvidence(instance, executionKind);
    if (evidence?.state === 'verified') return 'success';
    return evidence?.error_code ? 'error' : 'warning';
  }
  if (healthStatus !== 'healthy') return 'warning';
  return 'success';
}

function profileLabelKey(profile: RuntimeProfile): string {
  const keys: Record<string, string> = {
    'wp-ai.short-text': 'profile_short_text',
    'wp-ai.editorial': 'profile_editorial',
    'wp-ai.classification': 'profile_classification',
    'vision.ai': 'profile_vision_understanding',
    'wp-ai.image-generation': 'profile_image_generation',
    'wp-ai.audio-generation': 'profile_audio_generation',
  };
  return keys[profile.profile_id] || '';
}

function instanceMatchesExecutionKind(instance: RuntimeInstance, executionKind: string): boolean {
  const feature = instance.model_feature === 'text_generation' ? 'text' : instance.model_feature;
  return feature === executionKind || (['text', 'vision'].includes(executionKind) && ['text', 'vision'].includes(feature));
}

function requiresCapabilityVerification(executionKind: string): boolean {
  return ['vision', 'image_generation', 'audio_generation'].includes(executionKind);
}

function capabilityEvidence(instance: RuntimeInstance, capability: string) {
  return instance.capability_evidence[capability]
    || (capability === 'vision' ? instance.vision_evidence : null);
}

function normalizeCapabilityProbeEvidence(value: unknown): CapabilityProbeEvidence {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Capability probe evidence response is not an object.');
  }
  const item = value as Record<string, unknown>;
  const capability = String(item.capability || '').trim();
  const state = String(item.state || '').trim();
  if (!capability || !state) {
    throw new TypeError('Capability probe evidence requires capability and state.');
  }
  return {
    capability,
    state,
    source: String(item.source || ''),
    revision: String(item.revision || ''),
    checked_at: String(item.checked_at || ''),
    error_code: String(item.error_code || ''),
  };
}

function capabilityProbeEvidenceFromError(cause: unknown): CapabilityProbeEvidence | null {
  if (!(cause instanceof ApiError)) return null;
  try {
    return normalizeCapabilityProbeEvidence(cause.details);
  } catch {
    return null;
  }
}

export default function RuntimeProfilesPage() {
  const { t } = useLocale();
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const copy = useCallback(
    (key: string, fallback: string, params?: Record<string, string>) => t(`admin.runtime_profiles.${key}`, params, fallback),
    [t]
  );
  const copyRef = useRef(copy);
  useEffect(() => { copyRef.current = copy; }, [copy]);
  const profileName = useCallback((profile: RuntimeProfile) => {
    const key = profileLabelKey(profile);
    return key ? copy(key, profile.label || profile.profile_id) : (profile.label || profile.routing_intent || profile.profile_id);
  }, [copy]);
  const [data, setData] = useState<RuntimeProfilesData | null>(null);
  const drafts = data?.profiles || [];
  const [editingProfile, setEditingProfile] = useState<RuntimeProfile | null>(null);
  const [activeProfileId, setActiveProfileId] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const operationRef = useRef(false);
  const profilesReadActive = useRef(false);
  const [probingInstanceId, setProbingInstanceId] = useState('');
  const [probeError, setProbeError] = useState('');
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<AdminMutationReceiptPayload | null>(null);
  const [probeSummary, setProbeSummary] = useState<CapabilityProbeSummary | null>(null);
  const [probeSummaryError, setProbeSummaryError] = useState('');
  const [pendingNavigationHref, setPendingNavigationHref] = useState('');
  const [mediaRecognitionForm, setMediaRecognitionForm] = useState<MediaRecognitionPolicyForm>(DEFAULT_MEDIA_RECOGNITION_POLICY);
  const [mediaRecognitionBaseline, setMediaRecognitionBaseline] = useState(mediaRecognitionPolicySnapshot(DEFAULT_MEDIA_RECOGNITION_POLICY));
  const [mediaRecognitionLoading, setMediaRecognitionLoading] = useState(true);
  const [mediaRecognitionLoaded, setMediaRecognitionLoaded] = useState(false);
  const policyReadActive = useRef(false);
  const [mediaRecognitionSaving, setMediaRecognitionSaving] = useState(false);
  const [mediaRecognitionError, setMediaRecognitionError] = useState('');
  const [mediaRecognitionErrorCode, setMediaRecognitionErrorCode] = useState('');
  const [mediaRecognitionExpanded, setMediaRecognitionExpanded] = useState(false);

  const applyData = useCallback((next: RuntimeProfilesData) => {
    setData(next);
    const requestedProfileId = typeof window === 'undefined'
      ? ''
      : new URLSearchParams(window.location.search).get('profile') || '';
    setActiveProfileId((current) => {
      if (next.profiles.some((profile) => profile.profile_id === requestedProfileId)) return requestedProfileId;
      if (next.profiles.some((profile) => profile.profile_id === current)) return current;
      return next.profiles[0]?.profile_id || '';
    });
    setReceipt(next.receipt || null);
  }, []);

  const loadProfiles = useCallback(async () => {
    if (profilesReadActive.current) return;
    profilesReadActive.current = true;
    const copy = copyRef.current;
    setLoading(true);
    setError('');
    setData(null);
    setActiveProfileId('');
    setEditingProfile(null);
    try {
      const response = await runtimeProfilesClient.request<RuntimeProfilesData>('/api/admin/runtime-profiles');
      applyData(normalizeRuntimeProfilesData(response.data));
    } catch (cause) {
      setError(resolveUiErrorMessage(cause, copy('error_load', 'Failed to load hosted runtime profiles.')));
    } finally {
      profilesReadActive.current = false;
      setLoading(false);
    }
  }, [applyData, setEditingProfile]);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  const applyMediaRecognitionPolicy = useCallback((value: unknown, platformPreferences: unknown) => {
    const next = normalizeMediaRecognitionPolicy(value, platformPreferences);
    setMediaRecognitionForm(next);
    setMediaRecognitionBaseline(mediaRecognitionPolicySnapshot(next));
  }, [setMediaRecognitionForm]);

  const loadMediaRecognitionPolicy = useCallback(async () => {
    if (policyReadActive.current || operationRef.current) return;
    policyReadActive.current = true;
    const copy = copyRef.current;
    setMediaRecognitionLoading(true);
    setMediaRecognitionError('');
    try {
      const response = await runtimeProfilesClient.request<ServiceSettingsProjection>('/api/admin/service-settings');
      applyMediaRecognitionPolicy(
        response.data.settings.media_recognition_policy,
        response.data.settings.platform_preferences
      );
      setMediaRecognitionLoaded(true);
    } catch (cause) {
      setMediaRecognitionLoaded(false);
      setMediaRecognitionError(resolveUiErrorMessage(cause, copy('media_recognition_load_error', 'Failed to load the media recognition policy.')));
    } finally {
      policyReadActive.current = false;
      setMediaRecognitionLoading(false);
    }
  }, [applyMediaRecognitionPolicy]);

  useEffect(() => {
    void loadMediaRecognitionPolicy();
  }, [loadMediaRecognitionPolicy]);

  const loadProbeSummary = useCallback(async () => {
    const copy = copyRef.current;
    setProbeSummaryError('');
    try {
      const response = await runtimeProfilesClient.request<CapabilityProbeSummary>(
        '/api/admin/runtime-profiles/capability-probes/summary?window_minutes=10080&limit=5'
      );
      setProbeSummary(normalizeCapabilityProbeSummary(response.data));
    } catch (cause) {
      setProbeSummaryError(resolveUiErrorMessage(cause, copy('probe_summary_load_error', 'Capability verification history is unavailable.')));
    }
  }, []);

  useEffect(() => {
    void loadProbeSummary();
  }, [loadProbeSummary]);

  const allInstances = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    return Object.values(data.available_instances).flat().filter((instance) => {
      if (seen.has(instance.instance_id)) return false;
      seen.add(instance.instance_id);
      return true;
    });
  }, [data]);
  const instancesById = useMemo(
    () => new Map(allInstances.map((instance) => [instance.instance_id, instance])),
    [allInstances]
  );
  const savedEditingProfile = data?.profiles.find((profile) => profile.profile_id === editingProfile?.profile_id);
  const profileDirty = Boolean(editingProfile && profileSnapshot([editingProfile]) !== profileSnapshot(savedEditingProfile ? [savedEditingProfile] : []));
  const mediaRecognitionDirty = mediaRecognitionPolicySnapshot(mediaRecognitionForm) !== mediaRecognitionBaseline;
  const dirty = profileDirty || mediaRecognitionDirty;
  const activeProfiles = drafts.filter((profile) => profile.availability_state !== 'paused');
  const configuredCount = activeProfiles.filter((profile) => profile.candidate_instance_ids.length > 0 && profileTone(profile, instancesById) !== 'error').length;
  const unconfiguredCount = activeProfiles.filter((profile) => !profile.candidate_instance_ids.length).length;
  const pausedCount = drafts.length - activeProfiles.length;
  const attentionCount = activeProfiles.filter((profile) => profile.candidate_instance_ids.length > 0 && profileTone(profile, instancesById) === 'error').length;
  const mediaRecognitionProfile = data?.profiles.find((profile) => profile.profile_id === 'vision.ai') || null;
  const mediaRecognitionPrimary = mediaRecognitionProfile
    ? instancesById.get(mediaRecognitionProfile.candidate_instance_ids[0] || '')
    : undefined;
  const mediaRecognitionModelReady = Boolean(
    mediaRecognitionProfile
      && mediaRecognitionPrimary
      && instanceTone(mediaRecognitionPrimary, mediaRecognitionProfile.execution_kind) === 'success'
  );
  const mediaRecognitionFallback = mediaRecognitionProfile
    ? instancesById.get(mediaRecognitionProfile.candidate_instance_ids[1] || '')
    : undefined;
  const mediaRecognitionDailyLimit = Number(mediaRecognitionForm.daily_limit);
  const mediaRecognitionValidationError = mediaRecognitionForm.enabled && !mediaRecognitionModelReady
    ? copy('media_recognition_profile_required', 'Configure and verify the Vision understanding profile before enabling background recognition.')
    : mediaRecognitionForm.window_start === mediaRecognitionForm.window_end
      ? copy('media_recognition_window_invalid', 'Choose different start and end times.')
      : !Number.isInteger(mediaRecognitionDailyLimit) || mediaRecognitionDailyLimit < 1 || mediaRecognitionDailyLimit > 10000
        ? copy('media_recognition_daily_limit_invalid', 'Enter a daily limit from 1 to 10000.')
        : '';
  const savedMediaRecognitionPolicy = useMemo(() => {
    try {
      return JSON.parse(mediaRecognitionBaseline) as MediaRecognitionPolicyForm;
    } catch {
      return DEFAULT_MEDIA_RECOGNITION_POLICY;
    }
  }, [mediaRecognitionBaseline]);
  const mediaRecognitionBlocked = savedMediaRecognitionPolicy.enabled && !mediaRecognitionModelReady;
  const mediaRecognitionNeedsVerification = mediaRecognitionBlocked
    || mediaRecognitionErrorCode === MEDIA_RECOGNITION_PROFILE_UNAVAILABLE_ERROR;
  const mediaRecognitionStatusLabel = !mediaRecognitionLoaded
    ? copy('status_unknown', 'Unknown')
    : mediaRecognitionNeedsVerification
    ? copy('media_recognition_needs_verification', 'Needs verification')
    : mediaRecognitionDirty
      ? copy('media_recognition_unsaved', 'Unsaved')
      : savedMediaRecognitionPolicy.enabled
        ? copy('media_recognition_enabled', 'Enabled')
        : copy('media_recognition_disabled', 'Disabled');
  const mediaRecognitionStatusTone = !mediaRecognitionLoaded
    ? 'warning'
    : mediaRecognitionNeedsVerification
    ? 'warning'
    : mediaRecognitionDirty
      ? 'warning'
      : savedMediaRecognitionPolicy.enabled
        ? 'success'
        : 'disabled';

  useEffect(() => {
    if (mediaRecognitionError || mediaRecognitionDirty || mediaRecognitionBlocked) {
      setMediaRecognitionExpanded(true);
    }
  }, [mediaRecognitionBlocked, mediaRecognitionDirty, mediaRecognitionError]);

  const { confirmNavigation, cancelNavigation } = useAdminNavigationGuard(
    dirty, setPendingNavigationHref, (href) => router.push(href),
  );

  useEffect(() => {
    const requested = searchParams.get('profile');
    if (requested && data?.profiles.some((profile) => profile.profile_id === requested)) setActiveProfileId(requested);
  }, [searchParams, data]);

  function openProfile(profile: RuntimeProfile) {
    if (operationRef.current) return;
    selectProfile(profile.profile_id);
    setProviderFilter(new URLSearchParams(window.location.search).get('provider') || '');
    setModelSearch('');
    setProbeError('');
    setEditingProfile({ ...profile, candidate_instance_ids: [...profile.candidate_instance_ids] });
  }

  const candidatePool = useMemo(() => {
    if (!editingProfile || !data) return [];
    const available = editingProfile.execution_kind === 'vision'
      ? [...data.available_instances.vision, ...data.available_instances.text]
      : editingProfile.execution_kind === 'image_generation'
        ? data.available_instances.image_generation
        : editingProfile.execution_kind === 'audio_generation'
          ? data.available_instances.audio_generation
          : [...data.available_instances.text, ...data.available_instances.vision];
    const selectedIds = editingProfile.candidate_instance_ids;
    const selected = selectedIds
      .map((instanceId) => instancesById.get(instanceId))
      .filter((instance): instance is RuntimeInstance => Boolean(instance));
    const merged = [...selected, ...available.filter((item) => !selectedIds.includes(item.instance_id))];
    return merged;
  }, [data, editingProfile, instancesById]);
  const candidates = useMemo(() => {
    const query = modelSearch.trim().toLowerCase();
    return candidatePool.filter((instance) => {
      if (providerFilter && instance.provider_id !== providerFilter) return false;
      if (!query) return true;
      return [
        instance.provider_display_name,
        instance.provider_id,
        instance.model_id,
        instance.instance_id,
        instance.region,
        ...instance.capability_tags,
      ].join(' ').toLowerCase().includes(query);
    });
  }, [candidatePool, modelSearch, providerFilter]);
  // Retained provider selections stay recoverable without crowding the current catalog.
  // Selecting one promotes it into the main list; eligibility and probe rules are unchanged.
  const candidateGroups = useMemo(() => {
    const current: RuntimeInstance[] = [];
    const other: RuntimeInstance[] = [];
    candidates.forEach((instance) => {
      const selected = editingProfile?.candidate_instance_ids.includes(instance.instance_id);
      const needsAttention = instance.upstream_status === 'missing_from_latest_catalog'
        || instanceTone(instance, editingProfile?.execution_kind || 'text') === 'error';
      (selected || !needsAttention ? current : other).push(instance);
    });
    return [
      { key: 'current', candidates: current.slice(0, MAX_VISIBLE_CANDIDATES), total: current.length },
      { key: 'other', candidates: other.slice(0, MAX_VISIBLE_CANDIDATES), total: other.length },
    ];
  }, [candidates, editingProfile]);
  const providers = useMemo(() => {
    const values = new Map<string, string>();
    candidatePool.forEach((instance) => values.set(
      instance.provider_id,
      instance.provider_display_name || instance.provider_id
    ));
    return [...values.entries()].sort((left, right) => left[1].localeCompare(right[1]));
  }, [candidatePool]);

  function updateProfile(profileId: string, patch: Partial<RuntimeProfile>) {
    setEditingProfile((current) => current?.profile_id === profileId ? { ...current, ...patch } : current);
  }

  function selectProfile(profileId: string) {
    setActiveProfileId(profileId);
    const params = new URLSearchParams(window.location.search);
    params.set('profile', profileId);
    router.replace(`/admin/runtime-profiles?${params.toString()}`, { scroll: false });
  }

  function setCandidate(profileId: string, position: 0 | 1, instanceId: string) {
    const profile = editingProfile?.profile_id === profileId ? editingProfile : null;
    if (!profile) return;
    const next = [...profile.candidate_instance_ids];
    next[position] = instanceId;
    updateProfile(profileId, {
      candidate_instance_ids: next.filter(Boolean).filter((value, index, values) => values.indexOf(value) === index),
      ...(position === 1 ? { allow_fallback: true } : {}),
    });
  }

  function clearCandidate(profileId: string, position: 0 | 1) {
    const profile = editingProfile?.profile_id === profileId ? editingProfile : null;
    if (!profile) return;
    updateProfile(profileId, {
      candidate_instance_ids: position === 0
        ? []
        : profile.candidate_instance_ids.slice(0, 1),
    });
  }

  function applyCapabilityEvidence(instanceId: string, evidence: CapabilityProbeEvidence) {
    setData((current) => {
      if (!current || !evidence.capability) return current;
      const update = (instances: RuntimeInstance[]) => instances.map((instance) => instance.instance_id === instanceId
        ? {
          ...instance,
          vision_evidence: evidence.capability === 'vision' ? evidence : instance.vision_evidence,
          capability_evidence: {
            ...instance.capability_evidence,
            [evidence.capability]: evidence,
          },
        }
        : instance);
      return {
        ...current,
        available_instances: {
          text: update(current.available_instances.text),
          vision: update(current.available_instances.vision),
          image_generation: update(current.available_instances.image_generation),
          audio_generation: update(current.available_instances.audio_generation),
        },
      };
    });
  }

  function probeFailureMessage(cause: unknown, instance: RuntimeInstance): string {
    const details = cause instanceof ApiError && cause.details && typeof cause.details === 'object' && !Array.isArray(cause.details)
      ? cause.details as Record<string, unknown>
      : Object.create(null) as Record<string, unknown>;
    const errorCode = String(details.error_code || (cause instanceof ApiError ? cause.errorCode : '')).trim();
    if (errorCode.startsWith('provider.budget_')) {
      return copy('probe_failed_budget', '{{model}}: verification was blocked by the Provider budget ({{code}}). Check the budget configuration and remaining limit; this does not establish model capability.', {
        model: instance.model_id,
        code: errorCode,
      });
    }
    if (errorCode === 'provider.access_denied') {
      return copy('probe_failed_access_denied', '{{model}} 验证失败：供应商拒绝访问（{{code}}）。请检查 API 密钥、模型权限、额度或网关策略。', {
        model: instance.model_id,
        code: errorCode,
      });
    }
    if (errorCode) {
      return copy('probe_failed_detail', '{{model}} 验证失败（{{code}}）。请检查 Provider 配置后重试。', {
        model: instance.model_id,
        code: errorCode,
      });
    }
    return resolveUiErrorMessage(cause, copy('probe_failed', '能力验证未通过，请检查 Provider 或稍后重试。'));
  }

  async function requestCapabilityProbe(instance: RuntimeInstance, capability: string, timeoutMs: number) {
    return runtimeProfilesClient.request<CapabilityProbeEvidence>('/api/admin/runtime-profiles/capability-probe', {
      method: 'POST',
      body: {
        capability,
        instance_id: instance.instance_id,
        timeout_ms: timeoutMs,
      },
      timeoutMs: timeoutMs + 5000,
    });
  }

  async function saveProfiles() {
    if (!editingProfile || operationRef.current) return;
    if (!profileDirty) { setEditingProfile(null); return; }
    const profile = editingProfile;
    if (profile.candidate_instance_ids.some((id) => {
      const instance = instancesById.get(id);
      return !instance || !instanceMatchesExecutionKind(instance, profile.execution_kind);
    })) {
      setProbeError(copy('incompatible_candidate', '{{profile}} requires compatible {{kind}} models.', { profile: profileName(profile), kind: profile.execution_kind }));
      return;
    }
    if (requiresCapabilityVerification(profile.execution_kind) && profile.candidate_instance_ids.some((id) => {
      const instance = instancesById.get(id);
      return !instance || capabilityEvidence(instance, profile.execution_kind)?.state !== 'verified';
    })) {
      setProbeError(copy('explicit_verification_required', 'Use Verify capability for the selected models before saving. Saving does not start a capability probe.'));
      return;
    }
    operationRef.current = true;
    setSaving(true);
    setProbeError('');
    try {
      const response = await runtimeProfilesClient.request<RuntimeProfilesData>('/api/admin/runtime-profiles', {
        method: 'PATCH',
        body: {
          contract_version: 'cloud-hosted-runtime-profiles.v1', platform_kind: 'wordpress',
          connector_id: 'wordpress_ai_connector', operation_contract_version: 'wordpress_operation.v1',
          profiles: [{
            profile_id: profile.profile_id, candidate_instance_ids: profile.candidate_instance_ids,
            timeout_ms: profile.timeout_ms, allow_fallback: profile.allow_fallback,
            max_retries: profile.max_retries, note: profile.note,
          }],
        },
      });
      applyData(normalizeRuntimeProfilesData(response.data));
      setEditingProfile(null);
      if (!response.data.receipt) toast.success(copy('message_saved', 'Usage configuration saved.'), t('common.success'));
    } catch (cause) {
      setProbeError(resolveUiErrorMessage(cause, copy('error_save', 'Failed to save usage configuration.')));
    } finally { operationRef.current = false; setSaving(false); }
  }

  async function saveMediaRecognitionPolicy() {
    if (!mediaRecognitionLoaded || mediaRecognitionLoading || !mediaRecognitionDirty || operationRef.current || mediaRecognitionValidationError) return;
    operationRef.current = true;
    setMediaRecognitionSaving(true);
    setMediaRecognitionError('');
    try {
      const response = await runtimeProfilesClient.request<MediaRecognitionPolicySetting>(
        '/api/admin/service-settings/media-recognition-policy',
        {
          method: 'PATCH',
          body: {
            enabled: mediaRecognitionForm.enabled,
            window_start: mediaRecognitionForm.window_start,
            window_end: mediaRecognitionForm.window_end,
            daily_limit: mediaRecognitionDailyLimit,
          },
        }
      );
      applyMediaRecognitionPolicy(response.data, {
        config: { timezone: mediaRecognitionForm.timezone },
      });
      setMediaRecognitionErrorCode('');
      setMediaRecognitionExpanded(false);
      toast.success(copy('media_recognition_saved', 'Media recognition policy saved.'), t('common.success'));
    } catch (cause) {
      const errorCode = cause instanceof ApiError ? cause.errorCode : '';
      setMediaRecognitionErrorCode(errorCode);
      setMediaRecognitionError(
        errorCode === MEDIA_RECOGNITION_PROFILE_UNAVAILABLE_ERROR
          ? copy('media_recognition_profile_unavailable_error', 'Background recognition cannot be enabled because the Vision understanding profile has no verified model. Configure and verify a vision-capable model first.')
          : resolveUiErrorMessage(cause, copy('media_recognition_save_error', 'Failed to save the media recognition policy.'))
      );
    } finally {
      operationRef.current = false;
      setMediaRecognitionSaving(false);
    }
  }

  async function verifyInstance(instance: RuntimeInstance, capability: string, timeoutMs: number) {
    if (operationRef.current) return;
    operationRef.current = true;
    setProbingInstanceId(instance.instance_id);
    setProbeError('');
    try {
      const response = await requestCapabilityProbe(instance, capability, timeoutMs);
      applyCapabilityEvidence(instance.instance_id, normalizeCapabilityProbeEvidence(response.data));
      await loadProbeSummary();
      toast.success(copy('probe_success', '能力验证成功，可以保存配置。'), t('common.success'));
    } catch (cause) {
      const failedEvidence = capabilityProbeEvidenceFromError(cause);
      if (failedEvidence?.capability) {
        applyCapabilityEvidence(instance.instance_id, failedEvidence);
      }
      setProbeError(probeFailureMessage(cause, instance));
      await loadProbeSummary();
    } finally {
      operationRef.current = false;
      setProbingInstanceId('');
    }
  }

  function instanceLabel(instance: RuntimeInstance | undefined): string {
    if (!instance) return copy('model_unassigned', 'Not assigned');
    return `${instance.provider_display_name || instance.provider_id} · ${instance.upstream_model_id}`;
  }

  if (loading) {
    return <LoadingFallback />;
  }

  return (
    <BackofficePageStack className="space-y-3" data-page-model="configuration">
      <BackofficeConfigurationHeader
        title={copy('title', 'Runtime Profiles')}
        description={copy('description', 'Configure the Cloud-hosted candidate chain for WordPress connector tasks. This is runtime routing metadata, not local ability or workflow truth.') + ' ' + copy('boundary_notice', 'The local plugin still owns abilities, workflows, prompts, profile adoption, approvals, audit, and final WordPress writes.')}
        secondaryAction={(
          <Link href="/admin/ai-resources" className="btn btn-secondary">
            {copy('action_open_suppliers', 'Model suppliers')}
          </Link>
        )}
        summaryItems={[
          { label: copy('summary_configured', 'Configured'), value: data ? String(configuredCount) : '—' },
          { label: copy('summary_unconfigured', 'Unconfigured'), value: data ? String(unconfiguredCount) : '—' },
          { label: copy('summary_paused', 'Paused'), value: data ? String(pausedCount) : '—' },
          { label: copy('summary_configuration_error', 'Configuration error'), value: data ? String(attentionCount) : '—' },
        ]}
      />

      {error ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/25 dark:text-rose-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadProfiles()}>
              {t('common.retry')}
            </button>
          </div>
        </div>
      ) : null}
      {data ? <AdminMutationReceipt receipt={receipt} title={copy('receipt_title', 'Latest profile change')} /> : null}

      {data ? drafts.length === 0 ? (
        <BackofficeEmptyState
          title={copy('empty_title', 'No hosted runtime profiles')}
          description={copy('empty_description', 'The WordPress connector has not projected any Cloud-hosted task profiles.')}
        />
      ) : (
        <AdminDataTableFrame
          title={copy('directory_title', 'Hosted profile directory')}
          resultLabel={copy('usage_count', '{{count}} usages', { count: String(drafts.length) })}
          dataUi="runtime-profile-table"
          density="compact"
        >
          <table className="w-full table-fixed text-left text-sm">
            <colgroup><col className="w-[28%]" /><col className="w-[38%]" /><col className="w-[20%]" /><col className="w-[14%]" /></colgroup>
            <thead className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800">
              <tr><th className="px-3 py-2">{copy('column_profile', 'Usage')}</th><th className="px-3 py-2">{copy('primary_model', 'Primary model')}</th><th className="px-3 py-2">{t('common.status')}</th><th className="px-3 py-2 text-right">{copy('column_action', 'Action')}</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {drafts.map((profile) => {
                const tone = profileTone(profile, instancesById);
                const paused = profile.availability_state === 'paused';
                const primary = instancesById.get(profile.candidate_instance_ids[0] || '');
                return <tr key={profile.profile_id} data-profile-id={profile.profile_id} data-selected={profile.profile_id === activeProfileId ? 'true' : 'false'}>
                  <th className="px-3 py-3 text-left align-top" scope="row"><span className="block font-semibold">{profileName(profile)}</span><span className="mt-1 block text-xs font-normal text-slate-500">{copy(`${profileLabelKey(profile)}_tasks`, profile.description)}</span></th>
                  <td className="break-words px-3 py-3 align-top"><span>{instanceLabel(primary)}</span>{profile.candidate_instance_ids[1] ? <span className="mt-1 block text-xs text-slate-500">{copy('fallback_model', 'Fallback')}: {instanceLabel(instancesById.get(profile.candidate_instance_ids[1]))}</span> : null}{primary?.upstream_status === 'missing_from_latest_catalog' ? <span className="block text-xs text-amber-700">{copy('catalog_unconfirmed', 'Catalog unconfirmed')}</span> : null}</td>
                  <td className="px-3 py-3 align-top"><BackofficeStatusBadge status={paused ? 'disabled' : tone} label={paused ? copy('status_paused', 'Paused') : !profile.candidate_instance_ids.length ? copy('summary_unconfigured', 'Unconfigured') : tone === 'error' ? copy('summary_configuration_error', 'Configuration error') : copy('status_configured', 'Usage configured')} /></td>
                  <td className="px-3 py-3 text-right align-top"><button type="button" className="btn btn-secondary btn-sm" disabled={saving || mediaRecognitionSaving || Boolean(probingInstanceId)} onClick={() => openProfile(profile)}>{copy('action_configure', 'Configure')}</button></td>
                </tr>;
              })}
            </tbody>
          </table>
        </AdminDataTableFrame>
      ) : null}

      {data ? (
        <BackofficeDisclosure summary={copy('probe_summary_title', 'Capability verification history')}>
          {probeSummaryError ? (
            <div><p className="text-sm text-rose-700 dark:text-rose-300">{probeSummaryError}</p><button type="button" className="btn btn-secondary btn-sm mt-2" onClick={() => void loadProbeSummary()}>{t('common.retry')}</button></div>
          ) : probeSummary ? (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-slate-600 dark:text-slate-300">
                <span>{copy('probe_summary_window', 'Last {{days}} days', { days: String(Math.max(1, Math.round(probeSummary.window_minutes / 1440))) })}</span>
                <span>{copy('probe_summary_attempts', '{{count}} attempts', { count: String(probeSummary.totals.attempts) })}</span>
                <span>{probeSummary.totals.attempts ? copy('probe_summary_success_rate', '{{rate}}% verified', { rate: String(Math.round(probeSummary.totals.success_rate * 100)) }) : copy('probe_summary_rate_unknown', 'Verification rate: —')}</span>
              </div>
              {probeSummary.totals.attempts === 0 ? (
                <p className="text-slate-500 dark:text-slate-400">{copy('probe_summary_empty', 'No capability probes have been recorded yet. Verify a selected candidate to start collecting evidence.')}</p>
              ) : (
                <>
                  <table className="w-full max-w-3xl text-left text-xs">
                    <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                      <tr>
                        <th className="py-1.5 pr-3" scope="col">{copy('probe_summary_capability', 'Capability')}</th>
                        <th className="py-1.5 pr-3" scope="col">{copy('probe_summary_attempts_column', 'Attempts')}</th>
                        <th className="py-1.5 pr-3" scope="col">{copy('probe_summary_verified', 'Verified')}</th>
                        <th className="py-1.5" scope="col">{copy('probe_summary_failed', 'Failed')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                      {probeSummary.by_capability.map((item) => (
                        <tr key={item.capability}>
                          <th className="py-1.5 pr-3 font-medium text-slate-800 dark:text-slate-200" scope="row">{item.capability}</th>
                          <td className="py-1.5 pr-3 tabular-nums">{item.attempts}</td>
                          <td className="py-1.5 pr-3 tabular-nums">{item.verified}</td>
                          <td className="py-1.5 tabular-nums">{item.failed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {probeSummary.recent_failures.length ? (
                    <p className="text-xs text-rose-700 dark:text-rose-300">
                      {copy('probe_summary_recent_failure', 'Latest failure: {{capability}} / {{code}}', {
                        capability: probeSummary.recent_failures[0].capability,
                        code: probeSummary.recent_failures[0].error_code || probeSummary.recent_failures[0].state,
                      })}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">{copy('probe_summary_loading', 'Loading capability verification history...')}</p>
          )}
        </BackofficeDisclosure>
      ) : null}

      {data?.read_only_profiles.map((profile) => <details key={profile.profile_id} data-ui="automatic-runtime-profile" className="border-y border-slate-200 px-3 py-4 dark:border-slate-800">
        <summary className="cursor-pointer text-sm font-semibold">{copy('automatic_title', 'Toolbox content assistance · Automatic model selection')}</summary>
        <p className="mt-1 text-xs text-slate-500">{copy('automatic_notice', 'text.ai is read-only. These are configured candidates in order, not evidence of a model used in a past call.')}</p>
        <ol className="mt-2 list-inside list-decimal text-sm">{profile.candidates.map((candidate) => <li key={candidate.instance_id}>{candidate.provider_display_name || candidate.provider_id} · {candidate.upstream_model_id}</li>)}</ol>
        {!profile.candidates.length ? <p className="mt-2 text-sm">{copy('automatic_empty', 'No configured candidates')}</p> : null}
        <Link href="/admin/troubleshooting" className="mt-2 inline-block text-sm font-semibold text-blue-700 dark:text-blue-300">{copy('action_view_actual_runs', 'View actual calls')}</Link>
      </details>)}

      {data ? (
        <BackofficeDisclosure
          data-ui="media-recognition-policy"
          open={mediaRecognitionExpanded}
          onToggle={(event) => setMediaRecognitionExpanded(event.currentTarget.open)}
          summary={<div className="ml-2 inline-flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-x-3 gap-y-1 align-middle">
            <span className="text-base font-semibold text-slate-950 dark:text-white">
              {copy('media_recognition_title', 'Site media recognition')}
            </span>
            <BackofficeStatusBadge label={mediaRecognitionStatusLabel} status={mediaRecognitionStatusTone} />
            <span className="min-w-0 text-xs font-normal text-slate-500 dark:text-slate-400">
              {mediaRecognitionPrimary ? instanceLabel(mediaRecognitionPrimary) : copy('model_unassigned', 'Not assigned')}
              {mediaRecognitionLoaded ? <> / {mediaRecognitionForm.window_start}-{mediaRecognitionForm.window_end} / {copy('media_recognition_daily_limit_summary', '{{count}} images/day', { count: mediaRecognitionForm.daily_limit })}</> : ' / —'}
            </span>
          </div>}
          contentClassName="pt-4"
        >
          <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between">
            <p className="min-w-0 text-sm text-slate-600 dark:text-slate-300">
              {copy('media_recognition_description', 'Background recognition inherits the Vision understanding candidate chain. Configure only its schedule and daily limit here.')}
            </p>
            <button
              type="button"
              className="btn btn-primary btn-sm shrink-0"
              disabled={!mediaRecognitionLoaded || mediaRecognitionLoading || mediaRecognitionSaving || saving || Boolean(probingInstanceId) || !mediaRecognitionDirty || Boolean(mediaRecognitionValidationError)}
              onClick={() => void saveMediaRecognitionPolicy()}
            >
              {mediaRecognitionSaving
                ? copy('media_recognition_saving', 'Saving...')
                : copy('media_recognition_save', 'Save recognition policy')}
            </button>
          </div>

          {mediaRecognitionError ? (
            <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-rose-700 dark:text-rose-300">
              <span>{mediaRecognitionError}</span>
              <div className="flex flex-wrap items-center gap-2">
                {mediaRecognitionErrorCode === MEDIA_RECOGNITION_PROFILE_UNAVAILABLE_ERROR ? (
                  <Link className="font-semibold text-blue-700 hover:underline dark:text-blue-300" href="/admin/runtime-profiles?profile=vision.ai" onClick={(event) => { event.preventDefault(); if (mediaRecognitionProfile) openProfile(mediaRecognitionProfile); }}>
                    {copy('media_recognition_configure_profile', 'Configure and verify model')}
                  </Link>
                ) : null}
                <button type="button" className="btn btn-secondary btn-sm" disabled={mediaRecognitionLoading || mediaRecognitionSaving || saving || Boolean(probingInstanceId)} onClick={() => void (mediaRecognitionLoaded ? saveMediaRecognitionPolicy() : loadMediaRecognitionPolicy())}>
                  {t('common.retry')}
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-3">
          {mediaRecognitionLoaded ? (
          <fieldset className="min-w-0" disabled={!mediaRecognitionLoaded || mediaRecognitionLoading || mediaRecognitionSaving || saving || Boolean(probingInstanceId)}>
            <AdminConfigurationTable
              ariaLabel={copy('media_recognition_table_label', 'Site media recognition policy')}
              itemHeading={copy('configuration_item_heading', 'Setting')}
              valueHeading={copy('configuration_value_heading', 'Current value')}
              detailHeading={copy('configuration_detail_heading', 'Action / note')}
              density="compact"
            >
              <AdminConfigurationRow
                rowId="media-recognition-model"
                label={copy('media_recognition_model', 'Recognition model')}
                value={mediaRecognitionLoading
                  ? t('common.loading')
                  : mediaRecognitionPrimary
                    ? <div className="space-y-1">
                        <div className="font-medium">{instanceLabel(mediaRecognitionPrimary)}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {mediaRecognitionFallback
                            ? copy('media_recognition_fallback_named', 'Fallback: {{model}}', { model: instanceLabel(mediaRecognitionFallback) })
                            : copy('media_recognition_no_fallback', 'No fallback model')}
                        </div>
                      </div>
                    : copy('model_unassigned', 'Not assigned')}
                detail={<div className="flex flex-wrap items-center gap-2">
                  <span>{copy('media_recognition_model_inherited', 'Inherited from Vision understanding; this policy does not store another model selection.')}</span>
                  <Link className="font-semibold text-blue-700 hover:underline dark:text-blue-300" href="/admin/runtime-profiles?profile=vision.ai" onClick={(event) => { event.preventDefault(); if (mediaRecognitionProfile) openProfile(mediaRecognitionProfile); }}>
                    {copy('media_recognition_configure_profile', 'Configure and verify model')}
                  </Link>
                </div>}
              />
              <AdminConfigurationRow
                rowId="media-recognition-enabled"
                label={copy('media_recognition_background', 'Background recognition')}
                value={mediaRecognitionForm.enabled
                  ? copy('media_recognition_enabled', 'Enabled')
                  : copy('media_recognition_disabled', 'Disabled')}
                detail={<div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    role="switch"
                    aria-label={copy('media_recognition_toggle', 'Enable background media recognition')}
                    aria-checked={mediaRecognitionForm.enabled}
                    className={mediaRecognitionSwitchClassName(mediaRecognitionForm.enabled)}
                    disabled={mediaRecognitionLoading || (!mediaRecognitionForm.enabled && !mediaRecognitionModelReady)}
                    onClick={() => setMediaRecognitionForm((current) => ({ ...current, enabled: !current.enabled }))}
                  >
                    <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition ${mediaRecognitionForm.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                  {!mediaRecognitionModelReady ? (
                    <span className="text-amber-700 dark:text-amber-300">
                      {copy('media_recognition_profile_required', 'Configure and verify the Vision understanding profile before enabling background recognition.')}
                    </span>
                  ) : null}
                </div>}
              />
              <AdminConfigurationRow
                rowId="media-recognition-window"
                label={copy('media_recognition_window', 'Background execution window')}
                value={<div className="grid max-w-sm grid-cols-2 gap-2">
                  <input
                    aria-label={copy('media_recognition_window_start', 'Window start')}
                    className="input w-full"
                    type="time"
                    value={mediaRecognitionForm.window_start}
                    onChange={(event) => setMediaRecognitionForm((current) => ({ ...current, window_start: event.target.value }))}
                  />
                  <input
                    aria-label={copy('media_recognition_window_end', 'Window end')}
                    className="input w-full"
                    type="time"
                    value={mediaRecognitionForm.window_end}
                    onChange={(event) => setMediaRecognitionForm((current) => ({ ...current, window_end: event.target.value }))}
                  />
                </div>}
                detail={copy('media_recognition_window_note', 'Interactive recognition is not delayed by this window.')}
              />
              <AdminConfigurationRow
                rowId="media-recognition-daily-limit"
                label={copy('media_recognition_daily_limit', 'Daily image limit')}
                value={<input
                  aria-label={copy('media_recognition_daily_limit', 'Daily image limit')}
                  className="input w-40"
                  type="number"
                  min={1}
                  max={10000}
                  step={1}
                  value={mediaRecognitionForm.daily_limit}
                  onChange={(event) => setMediaRecognitionForm((current) => ({ ...current, daily_limit: event.target.value }))}
                />}
                detail={copy('media_recognition_daily_limit_note', 'New background work is deferred after this daily limit; queued images are not dropped.')}
              />
              <AdminConfigurationRow
                rowId="media-recognition-timezone"
                label={copy('media_recognition_timezone', 'Platform timezone')}
                value={<span className="font-mono text-xs">{mediaRecognitionForm.timezone}</span>}
                detail={<div className="flex flex-wrap items-center gap-2">
                  <span>{copy('media_recognition_timezone_note', 'The execution window is interpreted in this platform timezone.')}</span>
                  <Link className="font-semibold text-blue-700 hover:underline dark:text-blue-300" href="/admin/service-settings?tab=system">
                    {copy('media_recognition_change_timezone', 'Change system timezone')}
                  </Link>
                </div>}
              />
            </AdminConfigurationTable>
          </fieldset>
          ) : null}
          </div>
          {mediaRecognitionValidationError && mediaRecognitionDirty ? (
            <p className="mt-3 text-sm text-rose-700 dark:text-rose-300" role="alert">
              {mediaRecognitionValidationError}
            </p>
          ) : null}
        </BackofficeDisclosure>
      ) : null}

      {data ? <BackofficeDisclosure summary={copy('contract_details', 'Hosted runtime contract details')}>
        <dl className="grid gap-4 text-sm md:grid-cols-2 xl:grid-cols-4">
          <div><dt className="text-xs text-slate-500 dark:text-slate-400">{copy('contract_version', 'Contract version')}</dt><dd className="mt-1 break-all font-mono text-xs text-slate-950 dark:text-white">{data?.contract_version || '—'}</dd></div>
          <div><dt className="text-xs text-slate-500 dark:text-slate-400">{copy('connector', 'Connector')}</dt><dd className="mt-1 break-all font-mono text-xs text-slate-950 dark:text-white">{data?.connector_id || '—'}</dd></div>
          <div><dt className="text-xs text-slate-500 dark:text-slate-400">{copy('operation_contract', 'Operation contract')}</dt><dd className="mt-1 break-all font-mono text-xs text-slate-950 dark:text-white">{data?.operation_contract_version || '—'}</dd></div>
          <div><dt className="text-xs text-slate-500 dark:text-slate-400">{copy('surface', 'Surface')}</dt><dd className="mt-1 break-all font-mono text-xs text-slate-950 dark:text-white">{data?.surface || '—'}</dd></div>
        </dl>
      </BackofficeDisclosure> : null}

      <AdminWorkbenchDialog
        open={Boolean(editingProfile)}
        title={copy('dialog_title', 'Configure candidate chain')}
        titleId="runtime-profile-dialog-title"
        headerAccessory={editingProfile ? (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {profileName(editingProfile)}
          </span>
        ) : null}
        saving={saving || Boolean(probingInstanceId)}
        closeLabel={t('common.close')}
        cancelLabel={t('common.cancel')}
        saveLabel={copy('action_save_usage', 'Save usage')}
        savingLabel={probingInstanceId ? copy('verifying', '验证中...') : copy('action_saving', 'Saving...')}
        footerNotice={copy('dialog_save_notice', 'Save applies this usage immediately. Cancel discards changes.')}
        density="compact"
        contentMode="contained"
        onClose={() => { setEditingProfile(null); setProbeError(''); }}
        onSubmit={() => void saveProfiles()}
      >
        {editingProfile ? (
          <fieldset disabled={saving || Boolean(probingInstanceId)} className="flex min-h-0 min-w-0 flex-1 flex-col gap-2.5">
            <details className="shrink-0 text-xs text-slate-500"><summary className="cursor-pointer">{copy('task_list', 'Applicable tasks')} · {editingProfile.tasks.length}</summary><p className="mt-1 break-words">{editingProfile.tasks.join(' · ')}</p><p className="mt-1">{copy('column_updated', 'Updated')}: {formatDate(editingProfile.updated_at) || '—'}</p></details>
            <div className="shrink-0 max-h-[45vh] overflow-y-auto">
              <AdminConfigurationTable
              ariaLabel={copy('profile_configuration_table_label', '{{name}} runtime profile configuration', {
                name: profileName(editingProfile),
              })}
              itemHeading={copy('configuration_item_heading', 'Setting')}
              valueHeading={copy('configuration_value_heading', 'Current value')}
              detailHeading={copy('configuration_detail_heading', 'Action / note')}
              density="compact"
            >
              <AdminConfigurationRow
                rowId="runtime-primary-model"
                label={copy('primary_model', 'Primary model')}
                value={instanceLabel(instancesById.get(editingProfile.candidate_instance_ids[0] || ''))}
                detail={editingProfile.candidate_instance_ids[0] ? (
                  <button
                    type="button"
                    className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
                    onClick={() => clearCandidate(editingProfile.profile_id, 0)}
                  >
                    {copy('action_clear_primary', 'Clear candidate chain')}
                  </button>
                ) : copy('primary_required_note', 'Select one primary model below.')}
              />
              <AdminConfigurationRow
                rowId="runtime-fallback-model"
                label={copy('fallback_model', 'Fallback model')}
                value={editingProfile.candidate_instance_ids[1] ? instanceLabel(instancesById.get(editingProfile.candidate_instance_ids[1])) : copy('fallback_unconfigured', 'No fallback configured')}
                detail={editingProfile.candidate_instance_ids[1] ? (
                  <button
                    type="button"
                    className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
                    onClick={() => clearCandidate(editingProfile.profile_id, 1)}
                  >
                    {copy('action_clear_fallback', 'Clear fallback')}
                  </button>
                ) : copy('fallback_optional_note', 'Optional; requires a primary model.')}
              />
              </AdminConfigurationTable>
              <BackofficeDisclosure summary={copy('advanced_settings', 'Advanced settings')}>
              <AdminConfigurationTable ariaLabel={copy('advanced_settings', 'Advanced settings')} itemHeading={copy('configuration_item_heading', 'Setting')} valueHeading={copy('configuration_value_heading', 'Current value')} detailHeading={copy('configuration_detail_heading', 'Action / note')} density="compact">
              <AdminConfigurationRow
                rowId="runtime-timeout"
                label={copy('timeout', 'Timeout')}
                value={(
                  <input
                    id="runtime-profile-timeout"
                    type="number"
                    min={1}
                    max={(editingProfile.max_timeout_ms || 120000) / 1000}
                    step={1}
                    value={editingProfile.timeout_ms / 1000}
                    onChange={(event) => updateProfile(editingProfile.profile_id, { timeout_ms: Number(event.target.value) * 1000 })}
                    className="input w-36"
                    aria-label={copy('timeout', 'Timeout')}
                  />
                )}
                detail={copy('timeout_seconds_note', 'Seconds; maximum {{max}}.', {
                  max: String((editingProfile.max_timeout_ms || 120000) / 1000),
                })}
              />
              <AdminConfigurationRow
                rowId="runtime-fallback-policy"
                label={copy('allow_fallback', 'Allow fallback')}
                value={(
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editingProfile.allow_fallback}
                      onChange={(event) => updateProfile(editingProfile.profile_id, { allow_fallback: event.target.checked })}
                    />
                    {!editingProfile.candidate_instance_ids[1] ? copy('fallback_unconfigured', 'No fallback configured') : editingProfile.allow_fallback ? copy('enabled', 'Enabled') : copy('disabled', 'Disabled')}
                  </label>
                )}
                detail={copy('fallback_policy_note', 'Uses the selected fallback only when the primary route fails.')}
              />
              <AdminConfigurationRow
                rowId="runtime-retries"
                label={copy('retries', 'Retries')}
                value={(
                  <input
                    id="runtime-profile-retries"
                    type="number"
                    min={0}
                    max={1}
                    value={editingProfile.max_retries}
                    onChange={(event) => updateProfile(editingProfile.profile_id, { max_retries: Number(event.target.value) })}
                    className="input w-24"
                    aria-label={copy('retries', 'Retries')}
                  />
                )}
                detail={copy('retry_note', 'Bounded to 0 or 1 retry.')}
              />
              </AdminConfigurationTable>
              </BackofficeDisclosure>
            </div>

            <section className="flex min-h-0 flex-1 flex-col gap-2.5 pt-1">
              <div data-ui="runtime-profile-model-toolbar" className="flex items-center gap-3">
                <div className="flex min-w-0 flex-1 items-baseline gap-2">
                  <h3 className="shrink-0 text-sm font-semibold text-slate-950 dark:text-white">
                    {copy('candidate_table_title', 'Candidate models')}
                  </h3>
                  <AdminHelpTip label={copy('candidate_help', 'How to choose models')}>{copy('candidate_table_description', 'Choose one primary model and, when needed, one fallback model.')}</AdminHelpTip>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <select
                    className="input w-40"
                    value={providerFilter}
                    onChange={(event) => setProviderFilter(event.target.value)}
                    aria-label={copy('provider_filter', 'Supplier')}
                  >
                    <option value="">{copy('provider_all', 'All suppliers')}</option>
                    {providers.map(([providerId, label]) => <option key={providerId} value={providerId}>{label}</option>)}
                  </select>
                  <input
                    className="input w-64"
                    type="search"
                    value={modelSearch}
                    onChange={(event) => setModelSearch(event.target.value)}
                    placeholder={copy('model_search_placeholder', 'Search supplier or model ID')}
                    aria-label={copy('model_search', 'Search models')}
                  />
                </div>
              </div>
              {requiresCapabilityVerification(editingProfile.execution_kind) ? (
                <p data-ui="capability-verification-notice" className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                  {copy('verification_cost_notice', 'Verification sends a real test request to this supplier and may incur a charge. Verify selected models before saving; saving does not start a test.')}
                </p>
              ) : null}
              {probeError ? (
                <div
                  role="alert"
                  data-ui="runtime-profile-probe-error"
                  className="shrink-0 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/25 dark:text-rose-200"
                >
                  {probeError}
                </div>
              ) : null}
              {candidates.length ? (
                <div data-ui="runtime-profile-candidate-table" className="min-h-0 flex-1 overflow-auto overscroll-contain [scrollbar-gutter:stable]">
                  {candidateGroups.map((group) => {
                    const table = (
                  <table className="w-full min-w-[760px] table-auto text-left text-sm">
                    <colgroup>
                      <col className="w-[18%]" />
                      <col className="w-[36%]" />
                      <col className="w-[14%]" />
                      <col className="w-[10%]" />
                      <col className="w-[10%]" />
                      <col className="w-[12%]" />
                    </colgroup>
                    <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                      <tr>
                        <th className="px-3 py-1.5" scope="col">{copy('column_supplier', 'Supplier')}</th>
                        <th className="px-3 py-1.5" scope="col">{copy('column_model', 'Model')}</th>
                        <th className="px-3 py-1.5" scope="col">{t('common.status')}</th>
                        <th className="whitespace-nowrap px-3 py-1.5 text-center" scope="col">{copy('selected_primary', 'Primary')}</th>
                        <th className="whitespace-nowrap px-3 py-1.5 text-center" scope="col">{copy('selected_fallback', 'Fallback')}</th>
                        <th className="min-w-24 whitespace-nowrap px-3 py-1.5 text-center" scope="col">{t('common.actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                      {group.candidates.map((instance) => {
                        const primary = editingProfile.candidate_instance_ids[0] === instance.instance_id;
                        const fallback = editingProfile.candidate_instance_ids[1] === instance.instance_id;
                        const evidence = capabilityEvidence(instance, editingProfile.execution_kind);
                        const verificationFailed = requiresCapabilityVerification(editingProfile.execution_kind)
                          && evidence?.state !== 'verified'
                          && Boolean(evidence?.error_code);
                        const tone = verificationFailed ? 'error' : instanceTone(instance, editingProfile.execution_kind);
                        return (
                          <tr key={instance.instance_id} data-instance-id={instance.instance_id} className="bg-white dark:bg-slate-950">
                            <td className="px-3 py-2 align-middle">
                              <span className="whitespace-nowrap font-medium text-slate-900 dark:text-white">
                                {instance.provider_display_name || instance.provider_id}
                              </span>
                              {instance.region ? (
                                <span className="ml-2 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                                  {instance.region}
                                </span>
                              ) : null}
                            </td>
                            <th className="px-3 py-2 align-middle" scope="row" title={`${instance.model_id} · ${instance.instance_id}`}>
                              <span className="block break-words font-semibold text-slate-950 dark:text-white">{instance.upstream_model_id}</span>
                              {instance.upstream_status === 'missing_from_latest_catalog' ? (
                                <span className="mt-0.5 block text-xs font-normal text-amber-700 dark:text-amber-300">
                                  {copy('candidate_upstream_missing', 'Enabled; catalog unconfirmed. The latest account catalog did not return this model.')}
                                </span>
                              ) : null}
                            </th>
                            <td className="px-3 py-2 align-middle">
                              <BackofficeStatusBadge
                                label={verificationFailed
                                  ? copy('candidate_status_failed', 'Verification failed')
                                  : tone === 'success'
                                    ? requiresCapabilityVerification(editingProfile.execution_kind) ? copy('candidate_status_verified', 'Capability verified') : instance.upstream_status === 'missing_from_latest_catalog' ? copy('catalog_unconfirmed', 'Catalog unconfirmed') : copy('candidate_status_configured', 'Configured')
                                    : tone === 'error'
                                      ? copy('candidate_status_unavailable', 'Unavailable')
                                      : requiresCapabilityVerification(editingProfile.execution_kind)
                                        ? copy('candidate_status_pending', 'Needs verification')
                                        : instance.upstream_status === 'missing_from_latest_catalog'
                                          ? copy('catalog_unconfirmed', 'Catalog unconfirmed')
                                          : copy('candidate_status_unconfirmed', 'Status unconfirmed')}
                                status={tone === 'success'
                                  && !requiresCapabilityVerification(editingProfile.execution_kind)
                                  && instance.upstream_status === 'missing_from_latest_catalog'
                                  ? 'warning'
                                  : tone}
                              />
                            </td>
                            <td className="min-w-24 whitespace-nowrap px-3 py-2 text-center align-middle">
                              <input
                                type="radio"
                                name={`runtime-primary-${editingProfile.profile_id}`}
                                checked={primary}
                                disabled={tone === 'error'}
                                onChange={() => setCandidate(editingProfile.profile_id, 0, instance.instance_id)}
                                aria-label={copy('select_primary_named', 'Use {{name}} as primary', { name: instance.upstream_model_id })}
                              />
                            </td>
                            <td className="px-3 py-2 text-center align-middle">
                              <input
                                type="radio"
                                name={`runtime-fallback-${editingProfile.profile_id}`}
                                checked={fallback}
                                disabled={tone === 'error' || primary || !editingProfile.candidate_instance_ids[0]}
                                onChange={() => setCandidate(editingProfile.profile_id, 1, instance.instance_id)}
                                aria-label={copy('select_fallback_named', 'Use {{name}} as fallback', { name: instance.upstream_model_id })}
                              />
                            </td>
                            <td className="px-3 py-2 text-center align-middle">
                              {requiresCapabilityVerification(editingProfile.execution_kind)
                                && capabilityEvidence(instance, editingProfile.execution_kind)?.state !== 'verified' ? (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm min-w-16 whitespace-nowrap"
                                  disabled={Boolean(probingInstanceId)}
                                  onClick={() => void verifyInstance(instance, editingProfile.execution_kind, editingProfile.timeout_ms)}
                                >
                                  {probingInstanceId === instance.instance_id ? copy('verifying', '验证中...') : copy(`verify_${editingProfile.execution_kind}`, 'Verify capability')}
                                </button>
                              ) : capabilityEvidence(instance, editingProfile.execution_kind)?.state === 'verified' ? (
                                <span className="whitespace-nowrap text-xs text-emerald-600">{copy('verified', '已验证')}</span>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                    );
                    const limitNotice = group.total > MAX_VISIBLE_CANDIDATES ? <p className="py-2 text-xs text-slate-500">{copy('candidate_limit', 'Showing {{count}} of {{total}} models. Narrow the search to see others.', { count: String(MAX_VISIBLE_CANDIDATES), total: String(group.total) })}</p> : null;
                    return group.key === 'other' ? group.total > 0 ? (
                      <details key={`${editingProfile.profile_id}-other`} data-ui="runtime-profile-other-candidates" className="mt-3 border-t border-slate-200 pt-2 dark:border-slate-800">
                        <summary className="cursor-pointer py-1 text-sm font-medium">{copy('other_candidates', 'Unconfirmed or unavailable models · {{count}}', { count: String(group.total) })}</summary>
                        <p className="py-2 text-xs text-slate-500">{copy('other_candidates_help', 'Unselected models needing attention. Check the account catalog in Model suppliers.')} <Link className="font-semibold underline" href="/admin/ai-resources">{copy('manage_suppliers', 'Manage suppliers')}</Link></p>
                        {table}{limitNotice}
                      </details>
                    ) : null : (
                      <div key="current" data-ui="runtime-profile-current-candidates">
                        {group.total ? table : <p className="py-3 text-sm text-slate-500">{copy('current_candidates_empty', 'No current catalog models match. Check the retained models below or fetch the supplier catalog.')}</p>}
                        {limitNotice}
                      </div>
                    );
                  })}

                </div>
              ) : (
                <BackofficeEmptyState title={copy('models_empty_title', 'No matching models')} description={copy('models_empty_description', 'Enable a compatible model in Model suppliers or clear the current filters.')} />
              )}
            </section>
          </fieldset>
        ) : null}
      </AdminWorkbenchDialog>

      <ConfirmModal
        isOpen={Boolean(pendingNavigationHref)}
        title={copy('unsaved_leave_title', 'Leave with unsaved changes?')}
        message={copy('unsaved_leave_desc', 'Leaving this page will discard the hosted runtime profile draft. Saved profiles are not affected.')}
        confirmLabel={copy('discard_and_leave', 'Discard and leave')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        onClose={cancelNavigation}
        onConfirm={() => {
          const href = pendingNavigationHref;
          setMediaRecognitionForm(JSON.parse(mediaRecognitionBaseline) as MediaRecognitionPolicyForm);
          setEditingProfile(null);
          setProviderFilter('');
          setModelSearch('');
          setPendingNavigationHref('');
          confirmNavigation(href);
        }}
      />
    </BackofficePageStack>
  );
}
