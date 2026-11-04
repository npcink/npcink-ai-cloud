import { NextRequest } from 'next/server';
import { dataExportMethodNotAllowed, dataExportOptions, proxyDataExport } from '../_shared';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) { return proxyDataExport(request, 'code'); }

export const GET = dataExportMethodNotAllowed;
export const HEAD = dataExportMethodNotAllowed;
export const PUT = dataExportMethodNotAllowed;
export const PATCH = dataExportMethodNotAllowed;
export const DELETE = dataExportMethodNotAllowed;
export const OPTIONS = dataExportOptions;
