# Frontend request and authentication recovery v1

Status: active correctness contract. No new auth authority or automatic retry.

## Recovery rules

- Use the existing bounded API client for submitting browser forms. Set busy
  before the request and release it in success/error/finally paths. Do not tie
  an indefinitely disabled button solely to completion of document navigation.
- Backend forwarding must have a deadline that remains active until the body
  is consumed. Compose it with the caller's abort signal. Admin auth/session
  waits are 10 seconds; general Admin/Advisor and development handoffs are
  12 seconds. The exact Admin capability-probe POST instead uses its valid backend
  probe budget (1–120 seconds; default 30) plus 3 seconds for completion, below
  the browser's budget plus 5 seconds. Its edge proxy allows 130 seconds; other
  Admin paths retain the ordinary edge wait. Malformed budgets are forwarded
  unchanged under the ordinary BFF deadline for backend validation. Probe transport
  failures mean unconfirmed evidence, not a Provider configuration failure; read
  the latest evidence before another potentially billable probe. No automatic retry.
  Setup state retains 5 seconds; its other forwarding uses 12.
  Portal's existing 12-second forwarding/client deadlines are retained.
- Timeout means that the result is unconfirmed. Preserve authentication gates,
  safe same-origin redirect rules, cookies and idempotency keys. Never infer
  successful logout or a completed write from a transport failure. Do not
  automatically resubmit mutations or one-use verification codes.
- After confirmed authentication/verification, show a usable document link
  while opening the next page. An interrupted client transition must not trap
  the user in a skeleton or leave a consumed code as the only action.
- Display localized, bounded error codes and support references. Never show
  credentials or arbitrary backend error bodies in recovery UI or receipts.

## Client selection and navigation

- Selection/filter state used only by the current client workspace must not
  enqueue a server navigation. Keep the selected query parameter using Next's
  integrated native `history.replaceState(null, '', href)`, preserving unrelated
  search parameters and the hash. Skip an identical URL. Keep real cross-page
  navigation in the router and preserve the existing dirty-draft guard.
- Guard this behavior at request level as well as by the final URL: repeatedly
  open/cancel a draft, assert that selection enqueues no RSC navigation, then
  leave for the supplier page. A single successful URL assertion can miss a
  late same-page replacement racing a later navigation. See the
  [2026-11-19 follow-up](history/engineering/2026/runtime-profile-followups-2026-11-19.md).

## Capability-probe diagnosis and delivery checks

- Correlate the request time/model, proxy duration and persisted capability
  evidence before assigning a Provider failure. A proxy can stop waiting while
  backend work continues. A persisted upstream failure remains a separate finding.
- If a save succeeded but its readback failed during a preview restart, retain
  the old snapshot and confirm with a bounded read. Do not repeat the write or
  chargeable probe automatically to refresh UI state.
- After shared M4 candidates change, verify the exact revision, deployed source
  and loaded Nginx configuration before reusing a timeout-fix receipt. Healthy
  endpoints alone cannot prove that the repaired path is deployed.
- Keep local verification, historical candidate deployment, merge and current
  acceptance separate. The [2026-11-18 audit](history/engineering/2026/capability-probe-timeout-closeout-audit-2026-11-18.md)
  records the motivating incident and outstanding delivery work.

## 2026-10-27 finding and scope

The reported Admin symptom was a login button remaining in submission. Source
inspection found native form navigation with `setIsSubmitting(true)` and no
deadline/reset. The BFF's backend login fetch was unbounded. Holding the login
request reproduced the unusable state beyond 18 seconds. The original event's
complete browser/network trace was not retained; its initial transport delay
cannot be attributed to a particular host or network fault from the available
200-response logs.

The fix uses a 12-second browser request, a 10-second backend login deadline,
localized failure/retry, and an explicit successful handoff. Native form
fallback, origin checks and cookie forwarding remain supported.

The follow-up audit covered application fetch sites, form busy states and auth
handoffs. Corrections also bound Admin session discovery/authorization/logout,
generic Admin and Advisor forwarding, development auth entrypoints, all Setup
forwarding, and public compliance reads. Portal login, registration and second
factor now retain a usable next-page link. Existing Portal requests, setup
wizard submissions, account/site/support forms, public pricing/status/support
reads already had bounded clients or recovery paths. Background telemetry and
the currently unused exported fetch-retry helper do not drive a pending user
flow; no telemetry or retry platform was introduced.

This evidence covers local mocked failures and an M4 development candidate.
It does not establish production behavior or human acceptance.
