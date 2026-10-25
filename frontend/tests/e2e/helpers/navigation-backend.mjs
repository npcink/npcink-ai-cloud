// Disposable loopback backend for the two authentication handoffs. No provider,
// SMTP, database or production endpoint is contacted by this fixture.
import { createServer } from 'node:http';

const port = Number(process.env.NPCINK_NAVIGATION_BACKEND_PORT || 4317);
const site = { site_id: 'navigation_site', name: 'Navigation Site', site_url: 'https://site.example.test', status: 'active', platform_kind: 'wordpress' };
const session = (selected = true) => ({
  email: 'navigation@example.test', sites: [site], auth_mode: 'session',
  selected_context: selected ? { site, allowed_actions: [], current_subscription: null } : null,
  session: { state: 'active', transport: 'cookie', issued_at: '2026-01-01T00:00:00Z',
    expires_at: '2099-01-01T00:00:00Z', revocable: true },
});
let installation = 'pending';
let authenticated = true;
let unbindFails = false;
let nextStateFails = false;
let heldSession = null;
let holdNextSession = false;
let calls = [];
let installs = 0;

function reply(res, data, status = 200, error = '', headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify({ status: status < 400 ? 'ok' : 'error', error_code: error,
    message: error || 'ok', data, meta: { trace_id: 'navigation-test', revision: 'navigation-test-v1' } }));
}

const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://127.0.0.1').pathname;
  if (path === '/__test' && req.method === 'POST') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const action = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    if (action.resetPortal) { authenticated = true; unbindFails = false; calls = []; }
    if ('failUnbind' in action) unbindFails = Boolean(action.failUnbind);
    if (action.failNextState) nextStateFails = true;
    if (action.holdNextSession) holdNextSession = true;
    if (action.releaseSession) {
      if (!heldSession) return reply(res, {}, 409, 'test.no_held_session');
      const held = heldSession; heldSession = null;
      if (action.releaseSession === 'unauthorized') reply(held, {}, 401, 'auth.portal_session_revoked');
      else reply(held, session(false));
    }
    return reply(res, { installation, authenticated, held: Boolean(heldSession), calls, installs });
  }
  if (path === '/__health') return reply(res, {});
  calls.push(`${req.method} ${path}`);
  if (path === '/setup/v1/state') {
    if (nextStateFails) { nextStateFails = false; return reply(res, {}, 503, 'setup.state_unavailable'); }
    return reply(res, { installation_state: installation, setup_revision: 'setup-v1', retry_allowed: installation !== 'complete' });
  }
  if (path === '/setup/v1/session') return reply(res, { installation_state: installation,
    setup_revision: 'setup-v1', retry_allowed: true, expires_in_seconds: 900 }, 200, '',
  { 'Set-Cookie': 'npcink_setup_session=navigation-test; Path=/; HttpOnly; SameSite=Lax' });
  if (path === '/setup/v1/database/test') return reply(res, { postgres_major_version: 18, ssl_mode: 'verify-full', database_empty: true, latency_ms: 1 });
  if (path === '/setup/v1/install') {
    if (installation === 'complete') return reply(res, {}, 404, 'setup.already_complete');
    installation = 'complete'; installs += 1;
    return reply(res, { admin_key: 'nca_admin_navigation_test_only', next_url: '/admin/login' });
  }
  if (path === '/admin/session') return reply(res, {}, 401, 'auth.admin_session_required');
  if (path === '/portal/v1/auth/login-options') return reply(res, { qq_available: true });
  if (path === '/portal/v1/auth/code/request') return reply(res, { email: 'navigation@example.test', code: '123456', resend_cooldown_seconds: 1 });
  if (path === '/portal/v1/auth/code/verify') {
    authenticated = true;
    return reply(res, session(), 200, '', { 'Set-Cookie': 'npcink_portal_session_token=navigation-new; Path=/; HttpOnly; SameSite=Lax' });
  }
  if (path === '/portal/v1/session' && holdNextSession) {
    holdNextSession = false; heldSession = res; return;
  }
  if (path.startsWith('/portal/v1/') && !authenticated) return reply(res, {}, 401, 'auth.portal_session_revoked');
  if (path === '/portal/v1/session' || path === '/portal/v1/session/site') return reply(res, session());
  if (path === '/portal/v1/auth/qq/unbind') {
    if (unbindFails) return reply(res, {}, 503, 'service.unbind_unavailable');
    authenticated = false;
    return reply(res, { provider: 'qq', revoked: 1 });
  }
  if (path === '/portal/v1/auth/identity-providers') return reply(res, { providers: [
    { provider: 'qq', display_name: 'QQ', configured: true, bound: true,
      binding: { display_name: 'Test QQ', bound_at: '2026-01-01T00:00:00Z' } },
  ] });
  if (path === '/portal/v1/notifications') return reply(res, { items: [], total_count: 0, unread_count: 0 });
  if (path === '/portal/v1/account/payment-orders') return reply(res, { items: [], summary: { all_count: 0, pending_count: 0, paid_count: 0, closed_count: 0 } });
  // Optional account projections fail visibly; the test makes no commerce claims.
  return reply(res, {}, 404, 'test.route_not_selected');
});
server.listen(port, '127.0.0.1');
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  if (heldSession) heldSession.destroy();
  server.close(() => process.exit(0));
});
