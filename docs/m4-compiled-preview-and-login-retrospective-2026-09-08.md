# M4 Compiled Preview and Login Retrospective

Status: historical incident evidence; current procedure is the linked M4
preview runbook.

Date: 2026-09-08. Scope: M4 browser preview and Admin login response navigation.
This is historical evidence; the active procedure is the
[M4 preview runbook](m4-preview-development-v1.md).

## Incident and Evidence

The operator reported slow loading at `http://127.0.0.1:18010/admin/login`.
The listener was an SSH local forward to `muze@172.16.3.35`, forwarding to
M4 loopback port 8010. The Pgy client later displayed transmission type
`forwarding`; no network settings were changed and no plan limit was proven.

| Observation | Result | Limit |
| --- | --- | --- |
| Login HTML via tunnel | about 0.31 seconds | one sample |
| Dev main JavaScript | 12,191,734 decoded bytes; 2,742,959 compressed bytes | gzip already enabled |
| Dev browser load | about 41.08 seconds | overlapping diagnostic downloads added contention |
| Same main asset on M4 loopback | about 0.077 seconds | uncompressed local read |
| Isolated dev login chunk | 702,106 compressed bytes in 9.12 seconds | one tunnel sample |
| Compiled browser load | about 1.32 seconds | fresh hashed assets; not a controlled bandwidth comparison |
| Compiled login route chunk | 4,898 compressed bytes | shared chunks remain separate |

The evidence supports reducing development asset overhead and identifies
the tunnel as a transfer bottleneck. It does not establish a fixed speedup
ratio, a Pgy bandwidth entitlement, or the cause of failed direct connectivity.

## Implementation Decision

The primary preview now defaults to a Next.js production build and standalone
server, reusing the existing M4 dependency image and volumes. Static and public
assets are copied into the standalone layout. Explicit `development` mode
retains hot reload; local optional Compose and frontend slots keep dev mode.
`NEXT_PUBLIC_ENV=development` still identifies the disposable environment.
Build optimization does not promote the application to production.

The tradeoff is compilation during frontend recreation or restart, causing
a temporary frontend outage. Unchanged source/configuration skips recreation.
Build failure exits before serving, and development mode is the recovery lane.
This bounded change does not introduce another preview service or deployment
controller. A future requirement for uninterrupted preview should be assessed
separately with measured build duration and lifecycle evidence.

## Missed Login Check and Correction

The first verification checked page rendering, health, and unauthenticated
session rejection, but did not submit the login form. The operator then
reported a permanently busy button. This was a verification gap.

Two backend login attempts returned 401. A controlled invalid-key request
returned 303 with an absolute Location on the configured public domain even
though the form originated on loopback. Browser submission reproduced the
busy state. The response advertised `form-action 'self'`; browser console
capture did not produce an explicit CSP violation, so that enforcement detail
is an explanation consistent with the evidence, not a captured console fact.

The login BFF now returns sanitized relative Admin redirects for success,
failure, and upstream redirects. Backend trusted-host evidence, key validation,
cookie attributes, JSON responses, and CSP remain unchanged. An invalid-key
browser submission then stayed on port 18010, displayed the localized error,
and restored the enabled login button.

## Verification and Its Limits

- 69 M4 contract tests passed across the initial run and one focused rerun.
  The first failure was a local dependency symlink appearing as source; local
  Git excludes fixed it without changing packaging security.
- 11 login BFF tests passed, including loopback/public origins, safe redirect
  paths, cookie preservation, upstream redirects, and failure responses.
- Type checking, focused lint, Shell syntax, release policy, Admin UI checks,
  and the login error source contract passed.
- Candidate runtime health and loopback-only ports were verified; invalid-key
  submission was verified in a real browser. Successful credential submission
  was covered by mocked BFF tests, not a real authenticated browser session.
  Do not equate these evidence levels or claim authenticated acceptance.
- Candidate dispatches comprised one deploy and one source sync. Both reused
  images and skipped unchanged migration/worker work. The source sync took
  approximately 81 seconds. There were no paid Provider calls.

## Durable Working Rules

1. Begin with the observed listener, route, source revision, and runtime state.
2. Separate response generation, bytes transferred, hydration, and user action.
3. Measure without self-induced transfer contention; qualify imperfect samples.
4. Keep browser-origin navigation distinct from trusted backend host evidence.
5. Verify the full affected user action, including failure recovery, before
   declaring a performance change usable.
6. Use source changes and governed candidate dispatch for runtime corrections.
7. Preserve focused evidence, publish through required checks, and perform
   clean-master promotion before reporting M4 acceptance.

Rollback: use the runbook's development override for build startup failure;
use a reviewed revert for login behavior. Do not weaken authorization or CSP.
Production publication, network plan changes, and WordPress ownership are
outside this work.
