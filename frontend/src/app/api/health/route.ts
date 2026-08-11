import { NextResponse } from 'next/server';
import { buildBackendUrl } from '@/app/api/admin/_shared';
import { readInstallationState } from '@/lib/installation-state';

function buildHealthResponse({
  backendRelease,
  backendRevision,
  backendSourceDirty,
  checkedAt,
  release,
  revision,
  scope,
  status,
  statusCode,
}: {
  backendRelease: string;
  backendRevision: string;
  backendSourceDirty: boolean;
  checkedAt: string;
  release: string;
  revision: string;
  scope: 'frontend_container' | 'website_and_portal_api_entry';
  status: 'healthy' | 'degraded';
  statusCode: 200 | 503;
}) {
  return NextResponse.json({
    status,
    scope,
    checked_at: checkedAt,
    revision,
    deployment: {
      release,
      frontend_revision: revision,
      backend_release: backendRelease,
      backend_revision: backendRevision,
      backend_source_dirty: backendSourceDirty,
    },
  }, {
    status: statusCode,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Npcink-Frontend-Revision': revision,
      'X-Npcink-Backend-Release': backendRelease,
      'X-Npcink-Backend-Revision': backendRevision,
      'X-Npcink-Backend-Dirty': String(backendSourceDirty),
      'X-Npcink-Release': release,
    },
  });
}

function readBackendDeployment(payload: unknown): { release: string; sourceRevision: string; sourceDirty: boolean } {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { release: 'unknown', sourceRevision: 'unknown', sourceDirty: false };
  }
  const data = (payload as Record<string, unknown>).data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { release: 'unknown', sourceRevision: 'unknown', sourceDirty: false };
  }
  const deployment = (data as Record<string, unknown>).deployment;
  if (!deployment || typeof deployment !== 'object' || Array.isArray(deployment)) {
    return { release: 'unknown', sourceRevision: 'unknown', sourceDirty: false };
  }
  const record = deployment as Record<string, unknown>;
  return {
    release: typeof record.release === 'string' && record.release.trim() ? record.release.trim() : 'unknown',
    sourceRevision: typeof record.source_revision === 'string' && record.source_revision.trim()
      ? record.source_revision.trim()
      : 'unknown',
    sourceDirty: record.source_dirty === true,
  };
}

/**
 * 健康检查 API
 * 用于通用服务可用性检查和负载均衡器健康检查
 */
export async function GET() {
  const checkedAt = new Date().toISOString();
  const revision = String(process.env.NPCINK_CLOUD_FRONTEND_REVISION || 'unknown').trim();
  const release = String(process.env.NPCINK_CLOUD_DEPLOYMENT_RELEASE || 'unknown').trim() || 'unknown';
  let backendRelease = 'unknown';
  let backendRevision = 'unknown';
  let backendSourceDirty = false;
  const installation = await readInstallationState();
  if (installation.ok && installation.installationState !== 'complete') {
    return buildHealthResponse({
      backendRelease,
      backendRevision,
      backendSourceDirty,
      checkedAt,
      release,
      revision,
      scope: 'frontend_container',
      status: 'healthy',
      statusCode: 200,
    });
  }
  try {
    const backendResponse = await fetch(buildBackendUrl('/health/live'), {
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    });
    if (!backendResponse.ok) {
      throw new Error('Portal API liveness check failed');
    }
    const backendDeployment = readBackendDeployment(await backendResponse.json());
    backendRelease = backendDeployment.release;
    backendRevision = backendDeployment.sourceRevision;
    backendSourceDirty = backendDeployment.sourceDirty;
    return buildHealthResponse({
      backendRelease,
      backendRevision,
      backendSourceDirty,
      checkedAt,
      release,
      revision,
      scope: 'website_and_portal_api_entry',
      status: 'healthy',
      statusCode: 200,
    });
  } catch {
    return buildHealthResponse({
      backendRelease,
      backendRevision,
      backendSourceDirty,
      checkedAt,
      release,
      revision,
      scope: 'website_and_portal_api_entry',
      status: 'degraded',
      statusCode: 503,
    });
  }
}

/**
 * 轻量健康检查
 */
export async function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
