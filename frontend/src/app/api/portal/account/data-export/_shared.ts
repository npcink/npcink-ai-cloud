import { NextRequest, NextResponse } from 'next/server';
import { proxyPortalBackendPath } from '@/app/api/portal/_shared';

export async function proxyDataExport(request: NextRequest, operation: 'code' | 'confirm') {
  let response: NextResponse;
  try {
    response = await proxyPortalBackendPath(request, `/portal/v1/account/data-export/${operation}`, {
      method: 'POST', unreachableCode: 'portal.data_export_unavailable',
      unreachableMessage: 'Personal data copy unavailable',
    });
  } catch {
    response = NextResponse.json({ error: { code: 'portal.data_export_unavailable', message: 'Personal data copy unavailable' } }, { status: 502 });
  }
  if (!(response.headers.get('content-type') || '').includes('application/json')) {
    response = NextResponse.json({ error: { code: 'portal.data_export_unavailable', message: 'Personal data copy unavailable' } }, { status: 502 });
  }
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Pragma', 'no-cache');
  const vary = response.headers.get('Vary');
  response.headers.set('Vary', [...new Set([...(vary ? vary.split(',').map(v => v.trim()) : []), 'Cookie', 'Authorization'])].join(', '));
  return response;
}
