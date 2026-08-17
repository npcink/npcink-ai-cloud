import {
  portalClient,
  type PortalCustomerJourneyEvent,
} from '@/lib/portal-client';

const SESSION_ID_KEY = 'npcink.portal.journey.session.v1';
const SENT_PREFIX = 'npcink.portal.journey.sent.v1';

function opaqueId(prefix: string): string {
  const randomBytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(randomBytes);
  const randomValue = Array.from(
    randomBytes,
    (value) => value.toString(16).padStart(2, '0')
  ).join('');
  return `${prefix}_${randomValue}`;
}

function sessionId(): string {
  const existing = window.sessionStorage.getItem(SESSION_ID_KEY);
  if (existing && existing.length >= 16) return existing;
  const created = opaqueId('portal_session');
  window.sessionStorage.setItem(SESSION_ID_KEY, created);
  return created;
}

function browserFamily(): NonNullable<PortalCustomerJourneyEvent['browser_family']> {
  const userAgent = window.navigator.userAgent.toLowerCase();
  if (userAgent.includes('firefox')) return 'firefox';
  if (userAgent.includes('safari') && !userAgent.includes('chrome')) return 'safari';
  if (userAgent.includes('chrome') || userAgent.includes('chromium') || userAgent.includes('edg/')) {
    return 'chromium';
  }
  return 'other';
}

function viewportClass(): NonNullable<PortalCustomerJourneyEvent['viewport_class']> {
  return window.innerWidth < 768 ? 'mobile' : 'desktop';
}

export async function recordPortalJourneyBestEffort(
  siteId: string,
  journey: PortalCustomerJourneyEvent['journey'],
  step: PortalCustomerJourneyEvent['step'],
  options: { oncePerSession?: boolean; deadlineMs?: number } = {}
): Promise<void> {
  if (!siteId || typeof window === 'undefined') return;
  const sentKey = `${SENT_PREFIX}:${siteId}:${journey}:${step}`;
  if (options.oncePerSession && window.sessionStorage.getItem(sentKey) === '1') return;

  const event: PortalCustomerJourneyEvent = {
    event_id: opaqueId('portal_event'),
    anonymous_session_id: sessionId(),
    surface: 'portal',
    journey,
    step,
    browser_family: browserFamily(),
    viewport_class: viewportClass(),
    occurred_at: new Date().toISOString(),
  };
  try {
    const request = portalClient.recordCustomerJourney(siteId, [event]);
    if (options.deadlineMs) {
      await Promise.race([
        request,
        new Promise<void>((resolve) => window.setTimeout(resolve, options.deadlineMs)),
      ]);
    } else {
      await request;
    }
    if (options.oncePerSession) window.sessionStorage.setItem(sentKey, '1');
  } catch {
    // Journey evidence is diagnostic only and must never block Portal work.
  }
}
