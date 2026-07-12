'use client';

import type { ComponentProps } from 'react';
import { BackofficeIdentifier } from '@/components/backoffice/BackofficeIdentifier';

type PortalIdentifierProps = ComponentProps<typeof BackofficeIdentifier>;

export function PortalIdentifier(props: PortalIdentifierProps) {
  return <BackofficeIdentifier {...props} />;
}
