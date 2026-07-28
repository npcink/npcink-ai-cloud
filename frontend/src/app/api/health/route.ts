import { NextResponse } from 'next/server';
import { buildBackendUrl } from '@/app/api/admin/_shared';

/**
 * 健康检查 API
 * 用于通用服务可用性检查和负载均衡器健康检查
 */
export async function GET() {
  const checkedAt = new Date().toISOString();
  try {
    const backendResponse = await fetch(buildBackendUrl('/health/live'), {
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    });
    if (!backendResponse.ok) {
      throw new Error('Portal API liveness check failed');
    }
    return NextResponse.json({
      status: 'healthy',
      scope: 'website_and_portal_api_entry',
      checked_at: checkedAt,
    }, {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch {
    return NextResponse.json({
      status: 'degraded',
      scope: 'website_and_portal_api_entry',
      checked_at: checkedAt,
    }, {
      status: 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
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
