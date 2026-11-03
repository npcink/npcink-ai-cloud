import { NextRequest, NextResponse } from 'next/server';
import { appendForwardHeaders, buildBackendUrl, buildErrorResponse } from '@/app/api/admin/_shared';

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(buildBackendUrl('/admin/logout', request.nextUrl.search), {
      headers: {
        Accept: 'text/html,application/json',
        Cookie: request.headers.get('cookie') || '',
      },
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]),
    });

    const nextResponse = new NextResponse(null, { status: response.status });
    appendForwardHeaders(response, nextResponse);
    return nextResponse;
  } catch {
    return buildErrorResponse(502, 'proxy.admin_logout_unreachable', 'failed to confirm admin logout');
  }
}
