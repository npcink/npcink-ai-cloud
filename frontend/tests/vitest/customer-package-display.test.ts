import { describe, expect, it } from 'vitest';

import { selectCustomerPackagePressureResource } from '@/lib/customer-package-display';

describe('customer package pressure selection', () => {
  it('prioritizes a real overage over an earlier resource that is only full', () => {
    const selected = selectCustomerPackagePressureResource([
      {
        key: 'bound_sites',
        used: 3,
        limit: 3,
        remaining: 0,
        status: 'limited',
      },
      {
        key: 'active_sites',
        used: 2,
        limit: 1,
        remaining: 0,
        status: 'limited',
      },
    ]);

    expect(selected?.key).toBe('active_sites');
  });

  it('keeps an authoritative limited resource when no resource is over its limit', () => {
    const selected = selectCustomerPackagePressureResource([
      {
        key: 'bound_sites',
        used: 3,
        limit: 3,
        remaining: 0,
        status: 'limited',
      },
      {
        key: 'vector_documents',
        used: 80,
        limit: 100,
        remaining: 20,
        status: 'ok',
      },
    ]);

    expect(selected?.key).toBe('bound_sites');
  });
});
