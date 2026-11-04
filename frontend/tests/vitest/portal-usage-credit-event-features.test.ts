import { describe, expect, it } from 'vitest';
import { PORTAL_USAGE_CREDIT_EVENT_FILTER_FEATURES } from '@/lib/portal-usage-credit-event-features';

describe('Portal usage credit-event service filters', () => {
  it('lists active services and omits paused audio_generation', () => {
    expect([...PORTAL_USAGE_CREDIT_EVENT_FILTER_FEATURES]).toEqual([
      'content_generation',
      'topic_research',
      'web_search',
      'site_knowledge',
      'image_assistance',
    ]);
    expect(PORTAL_USAGE_CREDIT_EVENT_FILTER_FEATURES).not.toContain('audio_generation');
  });
});
