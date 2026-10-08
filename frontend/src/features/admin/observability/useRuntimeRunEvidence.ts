'use client';

import { useEffect, useState } from 'react';
import { createApiClient } from '@/lib/api-client';
import type { RuntimeRunEvidence } from './runtimeTelemetry';

const client = createApiClient({ idempotencyPrefix: 'runtime_run_evidence' });
const sampleLimit = 25;

type EvidenceSnapshot = {
  key: string;
  items: RuntimeRunEvidence[];
  truncated: boolean;
  failedScopes: number;
};

export function useRuntimeRunEvidence({ issueCode, capabilities, site, capability, windowHours, refreshSignal }: {
  issueCode: string;
  capabilities: string[];
  site: string;
  capability: string;
  windowHours: number;
  refreshSignal: number;
}) {
  const [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<EvidenceSnapshot | null>(null);
  // A key also prevents a prior scope's rows from appearing during the render
  // before effect cleanup, or after a delayed response from a cancelled request.
  const key = JSON.stringify({ issueCode, scopes: capability ? [capability] : [...new Set(capabilities)].sort(), site, windowHours, refreshSignal, attempt });

  useEffect(() => {
    const query = JSON.parse(key) as { issueCode: string; scopes: string[]; site: string; windowHours: number };
    if (!query.issueCode) return;
    const controller = new AbortController();
    const scopes = query.scopes.length ? query.scopes : [''];
    void Promise.allSettled(scopes.map(async (scope) => {
      const params = new URLSearchParams({ issue_code: query.issueCode, recent_minutes: String(query.windowHours * 60), limit: String(sampleLimit) });
      if (query.site) params.set('site_id', query.site);
      if (scope) params.set('capability', scope);
      const response = await client.request<{ items: RuntimeRunEvidence[]; sampled?: boolean; truncated?: boolean }>(
        `/api/admin/runtime-telemetry/runs?${params}`, { signal: controller.signal },
      );
      if (!Array.isArray(response.data.items)) throw new Error('Invalid runtime evidence response');
      return response.data;
    })).then((results) => {
      if (controller.signal.aborted) return;
      const fulfilled = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
      const rows = [...new Map(fulfilled.flatMap((result) => result.items).map((run) => [run.run_id, run])).values()]
        .sort((a, b) => (b.started_at || '').localeCompare(a.started_at || '') || b.run_id.localeCompare(a.run_id));
      setSnapshot({ key, items: rows.slice(0, sampleLimit), failedScopes: results.length - fulfilled.length,
        truncated: rows.length > sampleLimit || fulfilled.some((result) => result.sampled || result.truncated) });
    });
    return () => controller.abort();
  }, [key]);

  const current = snapshot?.key === key ? snapshot : null;
  return {
    items: current?.items ?? [],
    loading: Boolean(issueCode) && !current,
    failedScopes: current?.failedScopes ?? 0,
    truncated: current?.truncated ?? false,
    retry: () => setAttempt((value) => value + 1),
  };
}
