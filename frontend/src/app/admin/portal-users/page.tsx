'use client';

import { Suspense } from 'react';
import { LoadingFallback } from '@/components/ui/LoadingFallback';
import { PortalUsersWorkspace } from '@/features/admin/portal-users/PortalUsersWorkspace';

export default function AdminPortalUsersPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <PortalUsersWorkspace />
    </Suspense>
  );
}
