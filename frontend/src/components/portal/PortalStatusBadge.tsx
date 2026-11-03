'use client';

import { normalizeStatusToken } from '@/lib/status-display';
import { cn } from '@/lib/utils';

type PortalStatusBadgeProps = {
  label: string;
  status: string;
  className?: string;
  /** Force render even when status is "normal" (rare; prefer quiet inline mark instead). */
  force?: boolean;
};

/** Statuses that should not paint a badge — only deviations are shown. */
const PORTAL_NORMAL_STATUSES = new Set([
  'active',
  'success',
  'succeeded',
  'within_budget',
  'published',
  'ok',
  'normal',
  'connected',
  'healthy',
  'ready',
]);

export function isPortalNormalStatus(status: string): boolean {
  return PORTAL_NORMAL_STATUSES.has(normalizeStatusToken(status));
}

function portalStatusClassName(status: string): string {
  switch (normalizeStatusToken(status)) {
    case 'active':
    case 'success':
    case 'succeeded':
    case 'within_budget':
    case 'published':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200';
    case 'warning':
    case 'over_budget':
    case 'provisioning':
    case 'pending':
    case 'trialing':
    case 'past_due':
    case 'inactive':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200';
    case 'error':
    case 'denied':
    case 'revoked':
    case 'expired':
    case 'canceled':
    case 'failed':
    case 'suspended':
      return 'bg-rose-100 text-rose-800 dark:bg-rose-950/30 dark:text-rose-200';
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300';
  }
}

/**
 * Deviation-only status capsule. Normal / connected-ok statuses render nothing
 * unless `force` is set — use {@link PortalStatusInline} for a quiet connected mark.
 */
export function PortalStatusBadge({ label, status, className, force = false }: PortalStatusBadgeProps) {
  if (!force && isPortalNormalStatus(status)) {
    return null;
  }
  return (
    <span
      data-ui="portal-status-badge"
      className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-medium', portalStatusClassName(status), className)}
    >
      {label}
    </span>
  );
}

type PortalStatusInlineProps = {
  label: string;
  className?: string;
};

/** Quiet inline mark (dot + text) for connected/ready when a mark is still needed. */
export function PortalStatusInline({ label, className }: PortalStatusInlineProps) {
  return (
    <span
      data-ui="portal-status-inline"
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300',
        className
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400 dark:bg-slate-500" aria-hidden="true" />
      {label}
    </span>
  );
}
