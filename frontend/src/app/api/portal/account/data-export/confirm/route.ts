import { NextRequest } from 'next/server';
import { proxyDataExport } from '../_shared';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) { return proxyDataExport(request, 'confirm'); }
