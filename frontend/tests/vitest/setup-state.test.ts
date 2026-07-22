import { describe, expect, it } from 'vitest';
import { parseSetupStateEnvelope } from '@/lib/setup';

function validStateEnvelope() {
  return {
    status: 'ok',
    error_code: '',
    message: 'installation state loaded',
    data: {
      installation_state: 'complete',
      setup_revision: 'setup-v1',
      retry_allowed: false,
    },
    meta: {
      trace_id: '',
      revision: 'first-install-v1',
    },
  };
}

describe('setup state envelope', () => {
  it('accepts a complete state only inside a valid success envelope', () => {
    expect(parseSetupStateEnvelope(validStateEnvelope())).toEqual({
      installation_state: 'complete',
      setup_revision: 'setup-v1',
      retry_allowed: false,
    });
  });

  it.each([
    { ...validStateEnvelope(), status: 'error', error_code: 'setup.state_unavailable' },
    { data: validStateEnvelope().data },
    { ...validStateEnvelope(), meta: { trace_id: '', revision: '' } },
    {
      ...validStateEnvelope(),
      data: { ...validStateEnvelope().data, setup_revision: '' },
    },
  ])('rejects malformed or error envelopes before complete can be cached', (payload) => {
    expect(parseSetupStateEnvelope(payload)).toBeNull();
  });
});
