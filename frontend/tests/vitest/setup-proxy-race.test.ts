import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/env', () => ({
  getApiBaseUrl: () => 'http://api:8000',
}));

import { proxy } from '@/proxy';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stateEnvelope(installationState: 'pending' | 'complete') {
  return new Response(JSON.stringify({
    status: 'ok',
    error_code: '',
    message: 'installation state loaded',
    data: {
      installation_state: installationState,
      setup_revision: 'setup-v1',
      retry_allowed: installationState !== 'complete',
    },
    meta: { trace_id: '', revision: 'first-install-v1' },
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('setup proxy terminal-state cache', () => {
  it('does not let a late pending response override an observed complete state', async () => {
    let resolvePending!: (response: Response) => void;
    const pendingResponse = new Promise<Response>((resolve) => {
      resolvePending = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => pendingResponse)
      .mockResolvedValueOnce(stateEnvelope('complete'));
    vi.stubGlobal('fetch', fetchMock);

    const delayedPendingRequest = proxy(new NextRequest('https://cloud.example.com/admin'));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const completeResponse = await proxy(
      new NextRequest('https://cloud.example.com/admin/login')
    );
    expect(completeResponse.status).toBe(200);

    resolvePending(stateEnvelope('pending'));
    const lateResponse = await delayedPendingRequest;
    expect(lateResponse.headers.get('location')).toBe(
      'https://cloud.example.com/admin/login?redirect=%2Fadmin'
    );
  });
});
