import { Suspense } from 'react';
import { LoadingFallback } from '@/components/ui/LoadingFallback';
import { AdminAuditWorkspace } from '@/features/admin/audit/AdminAuditWorkspace';

export default function AdminAuditPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AdminAuditWorkspace />
    </Suspense>
  );
}
