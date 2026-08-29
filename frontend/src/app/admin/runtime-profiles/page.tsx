'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminConfigurationRow, AdminConfigurationTable } from '@/components/admin/AdminConfigurationTable';
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
import { useLocale } from '@/contexts/LocaleContext';
import { createApiClient } from '@/lib/api-client';
import { ApiError, resolveUiErrorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/utils';

const runtimeProfilesClient = createApiClient({ idempotencyPrefix: 'runtime_profiles' });
const MAX_VISIBLE_CANDIDATES = 80;
const SUPPORTED_EXECUTION_KINDS = new Set(['text', 'vision', 'image_generation', 'audio_generation']);
const SUPERSEDED_CONNECTOR_CONTRACT_FIELD = ['connector', 'contract', 'version'].join('_');

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
    receipt: data.receipt && typeof data.receipt === 'object'
      ? data.receipt as AdminMutationReceiptPayload
      : null,
  };
}

function normalizeCapabilityProbeSummary(value: unknown): CapabilityProbeSummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Capability probe summary response is not an object.');
  }
  const data = value as Record<string, unknown>;
  const normalizeGroup = (raw: unknown): CapabilityProbeGroup => {
    const item = raw && typeof raw === 'object' && !Array.isArray(raw)
      ? raw as Record<string, unknown>
      : Object.create(null) as Record<string, unknown>;
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

function profileTone(profile: RuntimeProfile, instances: Map<string, RuntimeInstance>): 'success' | 'warning' | 'error' {
  const primary = instances.get(profile.candidate_instance_ids[0] || '');
  if (!primary) return 'warning';
  if (profile.candidate_instance_ids.some((instanceId) => {
    const instance = instances.get(instanceId);
    return instance && !instanceMatchesExecutionKind(instance, profile.execution_kind);
  })) return 'error';
  const modelStatus = primary.model_status.trim().toLowerCase();
  const healthStatus = primary.health_status.trim().toLowerCase();
  if (modelStatus !== 'available' || healthStatus === 'unhealthy') return 'error';
  if (healthStatus !== 'healthy') return 'warning';
  return 'success';
}

function instanceTone(instance: RuntimeInstance, executionKind = ''): 'success' | 'warning' | 'error' {
  const modelStatus = instance.model_status.trim().toLowerCase();
  const healthStatus = instance.health_status.trim().toLowerCase();
  if (modelStatus !== 'available' || healthStatus === 'unhealthy') return 'error';
  if (requiresCapabilityVerification(executionKind)) {
    return capabilityEvidence(instance, executionKind)?.state === 'verified'
      ? 'success'
      : 'warning';
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
  return feature === executionKind || (executionKind === 'vision' && feature === 'text');
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
  const copy = useCallback(
    (key: string, fallback: string, params?: Record<string, string>) => t(`admin.runtime_profiles.${key}`, params, fallback),
    [t]
  );
  const profileName = useCallback((profile: RuntimeProfile) => {
    const key = profileLabelKey(profile);
    return key ? copy(key, profile.label || profile.profile_id) : (profile.label || profile.routing_intent || profile.profile_id);
  }, [copy]);
  const [data, setData] = useState<RuntimeProfilesData | null>(null);
  const [drafts, setDrafts] = useState<RuntimeProfile[]>([]);
  const [baseline, setBaseline] = useState('[]');
  const [activeProfileId, setActiveProfileId] = useState('');
  const [editingProfileId, setEditingProfileId] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifyingBeforeSave, setVerifyingBeforeSave] = useState(false);
  const [probingInstanceId, setProbingInstanceId] = useState('');
  const [probeError, setProbeError] = useState('');
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<AdminMutationReceiptPayload | null>(null);
  const [probeSummary, setProbeSummary] = useState<CapabilityProbeSummary | null>(null);
  const [probeSummaryError, setProbeSummaryError] = useState('');
  const [pendingNavigationHref, setPendingNavigationHref] = useState('');

  const applyData = useCallback((next: RuntimeProfilesData) => {
    setData(next);
    setDrafts(next.profiles);
    setBaseline(profileSnapshot(next.profiles));
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
    setLoading(true);
    setError('');
    setData(null);
    setDrafts([]);
    setBaseline('[]');
    setActiveProfileId('');
    setEditingProfileId('');
    setProbeSummary(null);
    setProbeSummaryError('');
    try {
      const response = await runtimeProfilesClient.request<RuntimeProfilesData>('/api/admin/runtime-profiles');
      applyData(normalizeRuntimeProfilesData(response.data));
    } catch (cause) {
      setError(resolveUiErrorMessage(cause, copy('error_load', 'Failed to load hosted runtime profiles.')));
    } finally {
      setLoading(false);
    }
  }, [applyData, copy]);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  const loadProbeSummary = useCallback(async () => {
    setProbeSummaryError('');
    try {
      const response = await runtimeProfilesClient.request<CapabilityProbeSummary>(
        '/api/admin/runtime-profiles/capability-probes/summary?window_minutes=10080&limit=5'
      );
      setProbeSummary(normalizeCapabilityProbeSummary(response.data));
    } catch (cause) {
      setProbeSummaryError(resolveUiErrorMessage(cause, copy('probe_summary_load_error', 'Capability verification history is unavailable.')));
    }
  }, [copy]);

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
  const pendingSelectedProbes = useMemo(() => {
    const seen = new Set<string>();
    return drafts.flatMap((profile) => {
      if (!requiresCapabilityVerification(profile.execution_kind)) return [];
      return profile.candidate_instance_ids.flatMap((instanceId) => {
        const instance = instancesById.get(instanceId);
        if (!instance || capabilityEvidence(instance, profile.execution_kind)?.state === 'verified') return [];
        const key = `${instanceId}:${profile.execution_kind}`;
        if (seen.has(key)) return [];
        seen.add(key);
        return [{ profile, instance }];
      });
    });
  }, [drafts, instancesById]);
  const editingProfile = drafts.find((profile) => profile.profile_id === editingProfileId) || null;
  const dirty = profileSnapshot(drafts) !== baseline;
  const configuredCount = drafts.filter((profile) => profile.candidate_instance_ids.length > 0).length;
  const attentionCount = drafts.filter((profile) => profileTone(profile, instancesById) !== 'success').length;

  useEffect(() => {
    if (!dirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const handleAnchorClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(target instanceof HTMLAnchorElement) || target.target === '_blank') return;
      const destination = new URL(target.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingNavigationHref(`${destination.pathname}${destination.search}${destination.hash}`);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('click', handleAnchorClick, true);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('click', handleAnchorClick, true);
    };
  }, [dirty]);

  const candidatePool = useMemo(() => {
    if (!editingProfile || !data) return [];
    const available = editingProfile.execution_kind === 'vision'
      ? [...data.available_instances.vision, ...data.available_instances.text]
      : editingProfile.execution_kind === 'image_generation'
        ? data.available_instances.image_generation
        : editingProfile.execution_kind === 'audio_generation'
          ? data.available_instances.audio_generation
          : data.available_instances.text;
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
    }).slice(0, MAX_VISIBLE_CANDIDATES);
  }, [candidatePool, modelSearch, providerFilter]);
  const providers = useMemo(() => {
    const values = new Map<string, string>();
    candidatePool.forEach((instance) => values.set(
      instance.provider_id,
      instance.provider_display_name || instance.provider_id
    ));
    return [...values.entries()].sort((left, right) => left[1].localeCompare(right[1]));
  }, [candidatePool]);

  function updateProfile(profileId: string, patch: Partial<RuntimeProfile>) {
    setDrafts((current) => current.map((profile) => profile.profile_id === profileId
      ? { ...profile, ...patch }
      : profile));
  }

  function selectProfile(profileId: string) {
    setActiveProfileId(profileId);
    const params = new URLSearchParams(window.location.search);
    params.set('profile', profileId);
    router.replace(`/admin/runtime-profiles?${params.toString()}`, { scroll: false });
  }

  function setCandidate(profileId: string, position: 0 | 1, instanceId: string) {
    const profile = drafts.find((item) => item.profile_id === profileId);
    if (!profile) return;
    const next = [...profile.candidate_instance_ids];
    next[position] = instanceId;
    updateProfile(profileId, {
      candidate_instance_ids: next.filter(Boolean).filter((value, index, values) => values.indexOf(value) === index),
    });
  }

  function clearCandidate(profileId: string, position: 0 | 1) {
    const profile = drafts.find((item) => item.profile_id === profileId);
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
    if (!dirty || saving) return;
    const incompatible = drafts.find((profile) => profile.candidate_instance_ids.some((instanceId) => {
      const instance = instancesById.get(instanceId);
      return instance && (
        !instanceMatchesExecutionKind(instance, profile.execution_kind)
      );
    }));
    if (incompatible) {
      setError(copy('incompatible_candidate', '{{profile}} 只能使用 {{kind}} 类型的模型，请更换候选模型后再保存。', {
        profile: profileName(incompatible),
        kind: incompatible.execution_kind === 'vision' ? copy('execution_kind_vision', '视觉') : incompatible.execution_kind === 'image_generation' ? copy('execution_kind_image_generation', '图片生成') : incompatible.execution_kind,
      }));
      return;
    }
    setSaving(true);
    setError('');
    setProbeError('');
    try {
      if (pendingSelectedProbes.length) {
        setVerifyingBeforeSave(true);
        for (const { profile, instance } of pendingSelectedProbes) {
          setProbingInstanceId(instance.instance_id);
          try {
            const probeResponse = await requestCapabilityProbe(instance, profile.execution_kind, profile.timeout_ms);
            applyCapabilityEvidence(instance.instance_id, normalizeCapabilityProbeEvidence(probeResponse.data));
          } catch (cause) {
            const failedEvidence = capabilityProbeEvidenceFromError(cause);
            if (failedEvidence?.capability) {
              applyCapabilityEvidence(instance.instance_id, failedEvidence);
            }
            selectProfile(profile.profile_id);
            setEditingProfileId(profile.profile_id);
            setProbeError(probeFailureMessage(cause, instance));
            await loadProbeSummary();
            return;
          } finally {
            setProbingInstanceId('');
          }
        }
      }
      setVerifyingBeforeSave(false);
      const response = await runtimeProfilesClient.request<RuntimeProfilesData>('/api/admin/runtime-profiles', {
        method: 'PUT',
        body: {
          contract_version: 'cloud-hosted-runtime-profiles.v1',
          platform_kind: 'wordpress',
          connector_id: 'wordpress_ai_connector',
          operation_contract_version: 'wordpress_operation.v1',
          profiles: drafts.map((profile) => ({
            profile_id: profile.profile_id,
            candidate_instance_ids: profile.candidate_instance_ids,
            timeout_ms: profile.timeout_ms,
            allow_fallback: profile.allow_fallback,
            max_retries: profile.max_retries,
            note: profile.note,
          })),
        },
      });
      const next = normalizeRuntimeProfilesData(response.data);
      applyData(next);
      toast.success(copy('message_saved', 'Hosted runtime profiles saved.'), t('common.success'));
    } catch (cause) {
      setError(resolveUiErrorMessage(cause, copy('error_save', 'Failed to save hosted runtime profiles.')));
    } finally {
      setVerifyingBeforeSave(false);
      setProbingInstanceId('');
      setSaving(false);
    }
  }

  async function verifyInstance(instance: RuntimeInstance, capability: string, timeoutMs: number) {
    if (probingInstanceId) return;
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
    } finally {
      setProbingInstanceId('');
    }
  }

  function instanceLabel(instance: RuntimeInstance | undefined): string {
    if (!instance) return copy('model_unassigned', 'Not assigned');
    return `${instance.provider_display_name || instance.provider_id} / ${instance.model_id}`;
  }

  if (loading) {
    return <LoadingFallback />;
  }

  return (
    <BackofficePageStack className="space-y-3" data-page-model="configuration">
      <BackofficeConfigurationHeader
        eyebrow={copy('eyebrow', 'Runtime plane')}
        title={copy('title', 'Runtime Profiles')}
        description={copy('description', 'Configure the Cloud-hosted candidate chain for WordPress connector tasks. This is runtime routing metadata, not local ability or workflow truth.')}
        secondaryAction={(
          <Link href="/admin/ai-resources" className="btn btn-secondary">
            {copy('action_open_suppliers', 'Model suppliers')}
          </Link>
        )}
        primaryAction={(
          <button
            type="button"
            className="btn btn-primary"
            disabled={!dirty || saving}
            onClick={() => void saveProfiles()}
          >
            {saving
              ? verifyingBeforeSave
                ? copy('action_verifying_and_saving', 'Verifying and saving...')
                : copy('action_saving', 'Saving...')
              : pendingSelectedProbes.length
                ? copy('action_verify_and_save', 'Verify and save')
                : copy('action_save', 'Save profiles')}
          </button>
        )}
        summaryItems={[
          { label: copy('summary_platform', 'Platform'), value: 'WordPress' },
          { label: copy('summary_profiles', 'Profiles'), value: String(drafts.length) },
          { label: copy('summary_configured', 'Configured'), value: `${configuredCount}/${drafts.length}` },
          { label: copy('summary_attention', 'Needs attention'), value: String(attentionCount) },
          {
            label: t('common.status'),
            value: dirty ? copy('unsaved_status', 'Unsaved') : copy('saved_status', 'Configuration saved'),
            toneClassName: dirty ? 'text-amber-700 dark:text-amber-300' : undefined,
          },
        ]}
        summaryAside={copy('boundary_notice', 'The local plugin still owns abilities, workflows, prompts, profile adoption, approvals, audit, and final WordPress writes.')}
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

      {data ? (
        <BackofficeDisclosure summary={copy('probe_summary_title', 'Capability verification history')}>
          {probeSummaryError ? (
            <p className="text-sm text-rose-700 dark:text-rose-300">{probeSummaryError}</p>
          ) : probeSummary ? (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-slate-600 dark:text-slate-300">
                <span>{copy('probe_summary_window', 'Last {{days}} days', { days: String(Math.max(1, Math.round(probeSummary.window_minutes / 1440))) })}</span>
                <span>{copy('probe_summary_attempts', '{{count}} attempts', { count: String(probeSummary.totals.attempts) })}</span>
                <span>{copy('probe_summary_success_rate', '{{rate}}% verified', { rate: String(Math.round(probeSummary.totals.success_rate * 100)) })}</span>
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

      {data ? drafts.length === 0 ? (
        <BackofficeEmptyState
          title={copy('empty_title', 'No hosted runtime profiles')}
          description={copy('empty_description', 'The WordPress connector has not projected any Cloud-hosted task profiles.')}
        />
      ) : (
        <AdminDataTableFrame
          title={copy('directory_title', 'Hosted profile directory')}
          resultLabel={copy('directory_description', 'Primary model, fallback, policy, status, and the next action are shown in one table.')}
          dataUi="runtime-profile-table"
          density="compact"
        >
          <table className="w-full min-w-[1040px] table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[20%]" />
              <col className="w-[17%]" />
              <col className="w-[17%]" />
              <col className="w-[18%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[8%]" />
            </colgroup>
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-400">
              <tr>
                <th className="px-3 py-1.5" scope="col">{copy('column_profile', 'Profile')}</th>
                <th className="px-3 py-1.5" scope="col">{copy('primary_model', 'Primary model')}</th>
                <th className="px-3 py-1.5" scope="col">{copy('fallback_model', 'Fallback model')}</th>
                <th className="px-3 py-1.5" scope="col">{copy('column_policy', 'Runtime policy')}</th>
                <th className="px-3 py-1.5" scope="col">{t('common.status')}</th>
                <th className="px-3 py-1.5" scope="col">{copy('column_updated', 'Updated')}</th>
                <th className="px-3 py-1.5 text-right" scope="col">{copy('column_action', 'Action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {drafts.map((profile) => {
                const tone = profileTone(profile, instancesById);
                const active = profile.profile_id === activeProfileId;
                return (
                  <tr
                    key={profile.profile_id}
                    data-profile-id={profile.profile_id}
                    data-selected={active ? 'true' : 'false'}
                    className={active ? 'bg-blue-50/60 dark:bg-blue-950/15' : 'bg-white dark:bg-slate-950'}
                  >
                    <th className="px-3 py-2 align-middle" scope="row">
                      <span className="truncate font-semibold text-slate-950 dark:text-white">
                        {profileName(profile)}
                      </span>
                      <span className="ml-2 truncate text-xs font-normal text-slate-500 dark:text-slate-400">
                        {profile.tasks.length} {copy('task_count_suffix', 'tasks')}
                      </span>
                    </th>
                    <td className="px-3 py-2 align-middle text-slate-700 dark:text-slate-200">
                      <span className="block truncate">{instanceLabel(instancesById.get(profile.candidate_instance_ids[0] || ''))}</span>
                    </td>
                    <td className="px-3 py-2 align-middle text-slate-700 dark:text-slate-200">
                      <span className="block truncate">{instanceLabel(instancesById.get(profile.candidate_instance_ids[1] || ''))}</span>
                    </td>
                    <td className="px-3 py-2 align-middle text-xs text-slate-600 dark:text-slate-300">
                      {Math.round(profile.timeout_ms / 1000)}s · {profile.allow_fallback ? copy('fallback_enabled_short', 'Fallback on') : copy('fallback_disabled_short', 'Fallback off')}
                      <span className="text-slate-500 dark:text-slate-400"> · {copy('retry_count', '{{count}} retries', { count: String(profile.max_retries) })}</span>
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <BackofficeStatusBadge
                        label={tone === 'success' ? copy('status_ready', 'Ready') : tone === 'error' ? copy('status_error', 'Blocked') : copy('status_attention', 'Needs config')}
                        status={tone}
                      />
                    </td>
                    <td className="px-3 py-2 align-middle text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      {formatDate(profile.updated_at) || '—'}
                    </td>
                    <td className="px-3 py-2 text-right align-middle">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          selectProfile(profile.profile_id);
                          setProviderFilter('');
                          setModelSearch('');
                          setProbeError('');
                          setEditingProfileId(profile.profile_id);
                        }}
                      >
                        {copy('action_configure', 'Configure')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </AdminDataTableFrame>
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
        saving={saving}
        closeLabel={t('common.close')}
        cancelLabel={t('common.cancel')}
        saveLabel={copy('action_done', 'Done')}
        savingLabel={copy('action_saving', 'Saving...')}
        footerNotice={copy('dialog_save_notice', 'Changes remain in the page draft until you use Save profiles.')}
        footerActions={(
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditingProfileId('')}>
            {copy('action_done', 'Done')}
          </button>
        )}
        density="compact"
        contentMode="contained"
        onClose={() => setEditingProfileId('')}
        onSubmit={() => setEditingProfileId('')}
      >
        {editingProfile ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2.5">
            <div className="shrink-0">
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
                value={instanceLabel(instancesById.get(editingProfile.candidate_instance_ids[1] || ''))}
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
              <AdminConfigurationRow
                rowId="runtime-timeout"
                label={copy('timeout', 'Timeout')}
                value={(
                  <input
                    id="runtime-profile-timeout"
                    type="number"
                    min={1000}
                    max={editingProfile.max_timeout_ms || 120000}
                    step={1000}
                    value={editingProfile.timeout_ms}
                    onChange={(event) => updateProfile(editingProfile.profile_id, { timeout_ms: Number(event.target.value) })}
                    className="input w-36"
                    aria-label={copy('timeout', 'Timeout')}
                  />
                )}
                detail={copy('timeout_note', 'Milliseconds; maximum {{max}}.', {
                  max: String(editingProfile.max_timeout_ms || 120000),
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
                    {editingProfile.allow_fallback ? copy('enabled', 'Enabled') : copy('disabled', 'Disabled')}
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
            </div>

            <section className="flex min-h-0 flex-1 flex-col gap-2.5 pt-1">
              <div data-ui="runtime-profile-model-toolbar" className="flex items-center gap-3">
                <div className="flex min-w-0 flex-1 items-baseline gap-2">
                  <h3 className="shrink-0 text-sm font-semibold text-slate-950 dark:text-white">
                    {copy('candidate_table_title', 'Candidate models')}
                  </h3>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {copy('candidate_table_description', 'Choose one primary model and, when needed, one fallback model.')}
                  </p>
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
                  <table className="w-full min-w-[960px] table-auto text-left text-sm">
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
                      {candidates.map((instance) => {
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
                            <th className="px-3 py-2 align-middle" scope="row" title={instance.instance_id}>
                              <span className="block whitespace-nowrap font-semibold text-slate-950 dark:text-white">{instance.model_id}</span>
                              {instance.upstream_status === 'missing_from_latest_catalog' ? (
                                <span className="mt-0.5 block text-xs font-normal text-amber-700 dark:text-amber-300">
                                  {copy('candidate_upstream_missing', 'Enabled, but not returned by the latest upstream catalog. Verify before use.')}
                                </span>
                              ) : null}
                            </th>
                            <td className="px-3 py-2 align-middle">
                              <BackofficeStatusBadge
                                label={verificationFailed
                                  ? copy('candidate_status_failed', 'Verification failed')
                                  : tone === 'success'
                                    ? copy('candidate_status_ready', 'Ready')
                                    : tone === 'error'
                                      ? copy('candidate_status_unavailable', 'Unavailable')
                                      : copy('candidate_status_pending', 'Needs verification')}
                                status={tone}
                              />
                            </td>
                            <td className="min-w-24 whitespace-nowrap px-3 py-2 text-center align-middle">
                              <input
                                type="radio"
                                name={`runtime-primary-${editingProfile.profile_id}`}
                                checked={primary}
                                disabled={tone === 'error'}
                                onChange={() => setCandidate(editingProfile.profile_id, 0, instance.instance_id)}
                                aria-label={copy('select_primary_named', 'Use {{name}} as primary', { name: instance.model_id })}
                              />
                            </td>
                            <td className="px-3 py-2 text-center align-middle">
                              <input
                                type="radio"
                                name={`runtime-fallback-${editingProfile.profile_id}`}
                                checked={fallback}
                                disabled={tone === 'error' || primary || !editingProfile.candidate_instance_ids[0]}
                                onChange={() => setCandidate(editingProfile.profile_id, 1, instance.instance_id)}
                                aria-label={copy('select_fallback_named', 'Use {{name}} as fallback', { name: instance.model_id })}
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
                                  {probingInstanceId === instance.instance_id ? copy('verifying', '验证中...') : copy('verify', '验证')}
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
                </div>
              ) : (
                <BackofficeEmptyState title={copy('models_empty_title', 'No matching models')} description={copy('models_empty_description', 'Enable a compatible model in Model suppliers or clear the current filters.')} />
              )}
            </section>
          </div>
        ) : null}
      </AdminWorkbenchDialog>

      <ConfirmModal
        isOpen={Boolean(pendingNavigationHref)}
        title={copy('unsaved_leave_title', 'Leave with unsaved changes?')}
        message={copy('unsaved_leave_desc', 'Leaving this page will discard the hosted runtime profile draft. Saved profiles are not affected.')}
        confirmLabel={copy('discard_and_leave', 'Discard and leave')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        onClose={() => setPendingNavigationHref('')}
        onConfirm={() => {
          const href = pendingNavigationHref;
          if (data) {
            setDrafts(data.profiles);
            setBaseline(profileSnapshot(data.profiles));
          }
          setEditingProfileId('');
          setProviderFilter('');
          setModelSearch('');
          setPendingNavigationHref('');
          if (href) router.push(href);
        }}
      />
    </BackofficePageStack>
  );
}
