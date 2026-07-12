'use client';

import React from 'react';
import {
  BackofficeEmptyState,
  BackofficeMetricStrip,
  BackofficePageStack,
  BackofficePrimaryPanel,
  BackofficeSectionPanel,
  BackofficeStackCard,
} from '@/components/backoffice/BackofficeScaffold';

type PortalPageStackProps = React.ComponentProps<typeof BackofficePageStack>;
type PortalSectionProps = React.ComponentProps<typeof BackofficeSectionPanel>;
type PortalCardProps = React.ComponentProps<typeof BackofficeStackCard>;
type PortalMetricStripProps = React.ComponentProps<typeof BackofficeMetricStrip>;
type PortalPrimaryPanelProps = React.ComponentProps<typeof BackofficePrimaryPanel>;
type PortalEmptyStateProps = React.ComponentProps<typeof BackofficeEmptyState>;

/**
 * Customer-facing layout primitives.
 *
 * Portal pages depend on these semantic components instead of importing the
 * operator Backoffice surface directly. The implementation can evolve without
 * coupling customer information architecture to Admin presentation choices.
 */
export function PortalPageStack(props: PortalPageStackProps) {
  return <BackofficePageStack {...props} />;
}

export function PortalSection({ variant: _variant, ...props }: PortalSectionProps) {
  return <BackofficeSectionPanel {...props} variant="portal" />;
}

export function PortalCard({ variant: _variant, ...props }: PortalCardProps) {
  return <BackofficeStackCard {...props} variant="portal" />;
}

export function PortalMetricStrip({ variant: _variant, ...props }: PortalMetricStripProps) {
  return <BackofficeMetricStrip {...props} variant="portal" />;
}

export function PortalPrimaryPanel(props: PortalPrimaryPanelProps) {
  return <BackofficePrimaryPanel {...props} />;
}

export function PortalScaffoldEmptyState(props: PortalEmptyStateProps) {
  return <BackofficeEmptyState {...props} />;
}
