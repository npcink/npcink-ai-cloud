import { NextResponse } from 'next/server';
import { buildBackendUrl } from '@/app/api/admin/_shared';
import { readInstallationState } from '@/lib/installation-state';

function buildHealthResponse({
  checkedAt,
  revision,
  scope,
  status,
  statusCode,
}: {
  checkedAt: string;
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
  }, {
    status: statusCode,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Npcink-Frontend-Revision': revision,
    },
  });
}

/**
 * 健康检查 API
 * 用于通用服务可用性检查和负载均衡器健康检查
 */
export async function GET() {
  const checkedAt = new Date().toISOString();
  const revision = String(process.env.NPCINK_CLOUD_FRONTEND_REVISION || 'unknown').trim();
  const installation = await readInstallationState();
  if (installation.ok && installation.installationState !== 'complete') {
    return buildHealthResponse({
      checkedAt,
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
    return buildHealthResponse({
      checkedAt,
      revision,
      scope: 'website_and_portal_api_entry',
      status: 'healthy',
      statusCode: 200,
    });
  } catch {
    return buildHealthResponse({
      checkedAt,
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
