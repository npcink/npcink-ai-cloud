/** Selectable Portal usage credit-event service filters (paused audio omitted). */
export const PORTAL_USAGE_CREDIT_EVENT_FILTER_FEATURES = [
  'content_generation',
  'topic_research',
  'web_search',
  'site_knowledge',
  'image_assistance',
] as const;

export type PortalUsageCreditEventFilterFeature =
  (typeof PORTAL_USAGE_CREDIT_EVENT_FILTER_FEATURES)[number];
