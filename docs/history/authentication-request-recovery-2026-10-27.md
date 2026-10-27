# Authentication/request recovery — development receipt

Date: 2026-10-27. Operator authorized investigation of a stuck Admin login
button and correction of similar issues elsewhere in the project.
Contract: [frontend-request-recovery-v1.md](../frontend-request-recovery-v1.md).

## Findings and changes

The old login form set its busy flag before native form navigation and had no
deadline or recovery path. Holding the request reproduced a disabled login
button beyond 18 seconds. The backend login forwarder also had no deadline.
This explains the persistent UI state; the initial transport delay in the
reported event cannot be assigned to a specific network/host cause because
the complete incident trace was not retained. The observed successful login,
session and overview responses rule out treating that event as an invalid key.

Admin login now uses the existing bounded JSON client, releases busy state on
failure, preserves the safe target and cookie contract, and displays localized
timeout guidance. Successful auth has a usable document link if navigation
stalls. No credential is stored or logged by this change.

The audit also corrected missing deadlines in Admin session reads, auth checks,
logout, generic/Advisor forwarding, development auth entrypoints, Setup writes
and public compliance reads. Setup's deadline now covers body consumption.
Portal login, registration and second factor expose a next-page link after a
confirmed auth step; they do not resubmit consumed codes. Existing Portal
transport, ordinary form clients and public pricing/status/support deadlines
were inspected and retained.

## Verification states

- Before fix: the held-login browser case failed after 18 seconds, waiting for
  the submit action to become usable again.
- Local after fix: 46 targeted Vitest tests passed across login, session,
  forwarding, capability gates, Setup timeout and idempotency contracts.
- Local browser mocks: 13 tests passed across Admin and Portal auth. These
  include stalled login timeout/retry, invalid key recovery, retained targets,
  valid/stale session gates, email-code login, slow discovery, and a deliberately
  stalled client transition followed by the document-link recovery on all four
  auth entry surfaces.
- Local source gates: TypeScript, targeted ESLint, Admin UI gate and login error
  contract passed. The unrelated full-unit-suite baseline failure documented in
  the runtime-observation receipt was subsequently resolved during combined-task
  closeout; the final frontend unit suite passed all 671 tests.
- No real Provider calls, production operations, notification expansion or
  authentication bypass were used for verification.

M4 source identity and final live checks are recorded in the task closeout.
CI, merge, accepted M4, production and human acceptance are not asserted by
these local tests.
