export const SUPPORT_TOPICS = ['billing', 'payment', 'site', 'usage', 'account', 'general'] as const;

/** Browser-only draft input; never a submission or an authorization claim. */
export function readSupportPrefill(params: Pick<URLSearchParams, 'get'>) {
  const open = params.get('new') === '1';
  const topic = (params.get('topic') || 'general').toLowerCase();
  return {
    open,
    topic: SUPPORT_TOPICS.includes(topic as (typeof SUPPORT_TOPICS)[number]) ? topic : 'general',
    siteId: params.get('site') || '',
    title: open ? (params.get('title') || '').slice(0, 191) : '',
    description: open ? (params.get('description') || '').slice(0, 4000) : '',
  };
}

export interface SupportDraftScope {
  email: string;
  contextSiteId: string;
  linkKey: string;
}

/** Same-scope refreshes preserve edits; context/account changes retire the draft. */
export function supportDraftTransition(previous: SupportDraftScope | null, next: SupportDraftScope) {
  if (previous?.email === next.email && previous.contextSiteId === next.contextSiteId
    && previous.linkKey === next.linkKey) return 'preserve';
  if (previous && (previous.email !== next.email || previous.contextSiteId !== next.contextSiteId)) return 'clear';
  return 'prefill';
}
