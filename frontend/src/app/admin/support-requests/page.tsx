import { Suspense } from 'react';
import { LoadingFallback } from '@/components/ui/LoadingFallback';
import { SupportRequestsWorkspace } from '@/features/admin/support-requests/SupportRequestsWorkspace';

export default function AdminSupportRequestsPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <SupportRequestsWorkspace />
    </Suspense>
  );
}
