'use client';

import type { ComponentProps } from 'react';
import { BackofficeTag } from '@/components/backoffice/BackofficeTag';

type PortalTagProps = ComponentProps<typeof BackofficeTag>;

export function PortalTag({ dataUi = 'portal-tag', ...props }: PortalTagProps) {
  return <BackofficeTag {...props} dataUi={dataUi} />;
}
