'use client';

import type { ComponentProps } from 'react';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';

type PortalStatusBadgeProps = ComponentProps<typeof BackofficeStatusBadge>;

export function PortalStatusBadge(props: PortalStatusBadgeProps) {
  return <BackofficeStatusBadge {...props} />;
}
