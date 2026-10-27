'use client';

import { AdminObservationWindow } from '@/components/admin/AdminObservationWindow';

/** Navigation lives in the Admin header; the route retains its observation-period control. */
export function AdminObservabilityTabs({ showWindow = true }: { showWindow?: boolean }) {
  return showWindow ? (
    <div data-ui="admin-observability-toolbar" className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
      <AdminObservationWindow />
    </div>
  ) : null;
}
