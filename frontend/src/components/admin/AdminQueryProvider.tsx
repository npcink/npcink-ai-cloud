'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/lib/errors';

const MAX_TRANSIENT_RETRIES = 2;

export function shouldRetryAdminQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_TRANSIENT_RETRIES) {
    return false;
  }
  if (!(error instanceof ApiError)) {
    return false;
  }
  return (
    error.statusCode === 0 ||
    error.statusCode === 408 ||
    error.statusCode === 429 ||
    error.statusCode >= 500
  );
}

export function AdminQueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            gcTime: 5 * 60 * 1000,
            staleTime: 30 * 1000,
            refetchOnWindowFocus: false,
            retry: shouldRetryAdminQuery,
          },
          mutations: {
            retry: false,
          },
        },
      })
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
