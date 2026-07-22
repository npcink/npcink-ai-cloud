import { NextRequest } from 'next/server';
import { proxySetupPath } from '@/app/api/setup/_shared';

type SetupRouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, context: SetupRouteContext) {
  const { path } = await context.params;
  return proxySetupPath(request, path || []);
}

export async function POST(request: NextRequest, context: SetupRouteContext) {
  const { path } = await context.params;
  return proxySetupPath(request, path || []);
}
