import { NextRequest } from 'next/server';
import { buildBackendUrl, buildErrorResponse, buildForwardedRequestHeaders, forwardBackendJson } from '@/app/api/admin/_shared';

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(buildBackendUrl('/admin/session'), {
      headers: buildForwardedRequestHeaders(request, {
        Accept: 'application/json',
        Cookie: request.headers.get('cookie') || '',
      }),
      cache: 'no-store',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]),
    });

    return await forwardBackendJson(response);
  } catch {
    return buildErrorResponse(502, 'proxy.admin_session_unreachable', 'failed to verify admin session');
  }
}
