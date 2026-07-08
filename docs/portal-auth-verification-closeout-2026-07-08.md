# Portal Auth Verification Closeout - 2026-07-08

Status: accepted.

Scope: Npcink AI Cloud Portal email-code registration and login.

This note records the registration/login verification issues fixed on
2026-07-08 and the guardrails added to avoid repeating the same class of
problem.

## Boundary

This work stays inside the bounded Cloud Portal user workspace.

Cloud owns:

- Portal email-code request and verification runtime.
- Cookie-backed Portal session creation.
- Portal account/session UI refresh behavior.
- Email-code request rate limiting and delivery error presentation.

Cloud does not own:

- WordPress writes.
- Local ability, workflow, prompt, preset, MCP, or OpenClaw truth.
- A second WordPress control plane.
- Email-domain admission rules such as a hard-coded QQ or 163 allowlist.

## User-Visible Problems

The reported sequence exposed four connected issues:

1. After completing registration with a valid verification code, the user
   expected to enter the Portal dashboard directly, but the frontend still sent
   the user through the login flow.
2. During normal login, entering the correct verification code did not visibly
   advance the page.
3. The login and registration verification steps had no explicit resend-code
   action, even though the backend already supported requesting a fresh code.
4. After receiving a registration code and a login code, further login attempts
   could stop receiving email codes because registration and login code requests
   shared the same short-window rate limit.

## Root Causes

The backend already created cookie-backed sessions after successful registration
and login-code verification. The frontend used soft navigation after those
cookie changes, so the shared Portal session state and Next route boundary were
not reliably refreshed before entering `/portal`.

The resend-code capability existed in the backend endpoints:

- `POST /portal/v1/auth/code/request`
- `POST /portal/v1/register/code/request`

The missing piece was the visible frontend action on the verification step.

The rate limiter used one email scope for both registration and login code
requests. That is correct for abuse protection, but the previous email limit of
three requests per 15 minutes was too tight for first-login behavior:

- one registration code request;
- one login code request;
- one resend or retry;
- one more login attempt.

That sequence naturally reaches the old limit edge.

## Decisions

1. Use full-page navigation after successful cookie-backed login/registration.
   This ensures the browser and server-side route checks observe the new Portal
   session cookie.
2. Keep registration completion as a direct path into the Portal dashboard.
   Users should not need to immediately log in again after verifying the same
   email account.
3. Add explicit resend-code actions to both login and registration verification
   steps.
4. Keep registration and login code requests in the same email rate-limit scope
   so abuse protection remains unified.
5. Increase the same-email short-window limit from three to five requests per
   15 minutes to give the first-login path enough room.
6. Do not add a hard-coded email-provider allowlist. QQ, 163, corporate email,
   Gmail, Outlook, and private-domain addresses should all remain eligible if
   they pass normal email validation. Abuse should be handled with rate limits,
   delivery diagnostics, and future operator-configurable deny rules if needed.

## Implemented Changes

Registration:

- `frontend/src/app/portal/register/page.tsx` refreshes the shared session and
  uses `window.location.replace('/portal')` after successful registration
  verification.
- The verification step exposes a resend-code button that reuses the existing
  registration-code request endpoint.

Login:

- `frontend/src/app/portal/login/page.tsx` uses
  `window.location.replace('/portal')` after successful login-code verification.
- The verification step exposes a resend-code button that reuses the existing
  login-code request hook.
- Verification inputs and secondary actions are disabled while a request or
  verification is in flight.

Portal session selection:

- `frontend/src/hooks/usePortalSiteSelection.ts` calls `router.refresh()` after
  updating cookie-backed selected-site state.

Rate limiting:

- `app/api/auth.py` now allows five email-code requests per email per
  15-minute window.
- The client/IP window remains ten requests per 15 minutes.

Tests:

- `frontend/tests/e2e/portal-login.spec.ts` now exercises the real user path:
  request code, resend code, verify code, and enter the Portal dashboard.
- `frontend/tests/unit/portal-login-remember-me-contract.mjs` guards the
  login remember-me and full-page navigation contract.
- `frontend/tests/unit/portal-registration-ui-contract.mjs` guards direct
  registration-to-dashboard behavior and the registration resend action.
- `frontend/tests/unit/portal-cookie-route-refresh-contract.mjs` guards the
  cookie-backed site-selection route refresh.
- `tests/api/test_portal_routes.py` guards the increased rate limit and the
  mixed registration-plus-login request path.

## Verification Run

Focused gates:

```bash
pnpm --dir frontend exec node tests/unit/portal-login-remember-me-contract.mjs
pnpm --dir frontend exec node tests/unit/portal-registration-ui-contract.mjs
pnpm --dir frontend exec node tests/unit/portal-cookie-route-refresh-contract.mjs
pnpm --dir frontend exec tsc --noEmit
pnpm --dir frontend exec playwright test -c playwright.config.ts tests/e2e/portal-login.spec.ts
.venv/bin/python -m pytest tests/api/test_portal_routes.py::test_portal_registration_code_request_is_rate_limited tests/api/test_portal_routes.py::test_portal_registration_and_login_code_requests_share_email_rate_limit_with_first_login_buffer -q
```

Default fast gate:

```bash
pnpm run check:fast
```

Observed results:

- Frontend unit contracts passed.
- Frontend TypeScript passed.
- Portal login E2E passed.
- Targeted API tests passed.
- `check:fast` passed:
  - contract: 60 passed, 1 skipped;
  - domain: 152 passed, 3 skipped.

Known warning:

- FastAPI/Starlette test client emits the existing `httpx` deprecation warning.
  This warning was not introduced by the Portal auth fix.

## Prevention Checklist

Future Portal auth/session changes must verify:

- Registration verification enters `/portal` directly when the backend creates
  a valid cookie session.
- Login-code verification enters `/portal` with a cookie-backed session visible
  to route guards.
- Code request, resend, verify, and dashboard entry are covered by at least one
  behavior-level browser test.
- Cookie-backed state changes that affect route guards call a refresh or use a
  full-page navigation.
- Email-code request limits are tested against realistic first-login flows, not
  isolated endpoint calls only.
- Error presentation must surface `portal.login_code_rate_limited` instead of
  appearing as a silent no-op.
- Email-provider restrictions must not be hard-coded without an explicit
  product and operator policy decision.

## Operational Notes

If a user reports that code email stopped arriving:

1. Check whether the request response is `429 portal.login_code_rate_limited`.
2. If it is 429, wait for the 15-minute window or inspect the replay receipts
   for the email/client scope.
3. If the response is `502 portal.email_delivery_failed`, inspect SMTP
   configuration and provider delivery errors.
4. If the response is 200 but no email arrives, inspect spam filtering, delayed
   delivery, recipient address typos, and whether the email account exists in
   Portal. Login-code request intentionally avoids account enumeration.
5. Remember that a newer code request expires older active codes for the same
   login purpose, so delayed older emails may contain codes that are no longer
   valid.
