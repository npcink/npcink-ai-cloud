# Customer operations, runtime evidence and authentication closeout

Date: 2026-10-27. Scope: the operator-approved customer/commercial corrections,
eight runtime observation/diagnostic recommendations, and the subsequent
stalled-login investigation. The operator explicitly authorized PR publication,
merge into `master` and M4 acceptance; production is excluded.

## Delivered scope

Customer operations now use consistent operator names/search, current-site
statistics, service-specific warning wording, quota-specific actions and manual
identity repair/recheck guidance. Free service periods are not payment demands.
No customer identity or entitlement was automatically changed.

| Priority | Recommendation | Delivered behavior |
| --- | --- | --- |
| P1 | Find affected missing-call runs | Default evidence excludes recorded-call comparison runs; comparison is separate. |
| P1 | Make the next step direct | Primary action opens affected runs; subsequent investigation correlates by Cloud `run_id`. |
| P1 | Distinguish evidence states | Pending, failed/canceled without calls, recorded, missing and not-required states remain distinct; absence does not establish cause. |
| P2 | Bound the health conclusion | Task failure status does not imply provider/metering completeness or editorial adoption. |
| P2 | Name the grouping accurately | Runtime profile rows are labelled runtime types, separate from editorial tasks. |
| P2 | Separate plugin and Cloud counts | Plugin history explicitly counts retained events and omits Cloud KPI cards. |
| P2 | Explain aggregate duration | Successful and failed durations are separate; long failed text runs explain the aggregate skew. |
| P2 | Support recovery review | Fixed `since` scope and retained issue focus; no traffic, pending or partial evidence cannot establish recovery. |

Admin login has bounded submission and upstream requests, actionable timeout
feedback and a document-navigation exit after successful authentication.
Confirmed similar gaps in session/logout, Admin/Advisor proxies, Setup,
development auth entrypoints, public compliance reads and Portal auth handoffs
were corrected without retrying writes or consumed verification codes.

## Verification and review

- Customer module: five focused API/domain cases locally, three new cases on
  M4; seven focused unit cases and two mocked PC browser cases; changed-route
  live checks at 1440×1050. See the retained customer-operations task receipt.
- Runtime module: 20 focused API/domain tests locally and on M4; seven focused
  telemetry unit tests; 21 mocked browser tests; live evidence, comparison,
  detail/focus, no-traffic review and duration checks.
- Authentication: 46 focused unit tests and 13 mocked browser tests, including
  held requests, retries and stalled navigation exits; live M4 valid-session
  redirect reached the populated overview.
- Final closeout: all 671 frontend unit tests passed. The active-site quota
  label now uses `active_sites_quota_label`, preserving the retired-key test.
  Earlier reports of one failure describe the pre-closeout checkpoint.
- Changed Python quality, frontend types, scoped ESLint, Admin structural gate
  and relevant i18n/window/login contracts passed at the implementation
  checkpoints. Final label-only change has separate type/lint checks.
- Review covered correctness, readability, ownership boundaries, authorization,
  bounded reads and absence of new dependencies or per-row network requests.

## Evidence states and handoff

The final pre-closeout M4 candidate was clean `d1ee12630ff9`, API and frontend
healthy, with no captured warnings/errors on the diagnostic and overview pages.
The closeout label change retains identical visible text. PR CI, merged source
identity and accepted M4 promotion are separate subsequent states; record their
actual outcomes in the attached PR and external task receipt, not by inferring
them from this candidate.

Evidence is retained outside the disposable checkout at the task's
`customer-operations/` and `runtime-observation-clarity/` artifact directories.
The task branch is `codex/customer-operations-clarity-20261027`; keep its worktree
locked until merge, clean-master M4 acceptance and preservation are confirmed.
Only this task's worktree may then be archived/removed under the lifecycle
standard. Other retained worktrees and branches are outside this closeout.

## Remaining limits and rollback

- Historical missing-call associations were not backfilled or declared fixed.
  Investigate individual runs using the corrected evidence flow when needed.
- The initial incident's transport delay lacks a complete browser trace; the
  persistent busy-state defect was reproduced and fixed, not its unproven
  network trigger.
- No real customer identity repair, paid observation traffic, real payment,
  production deploy or production/human value acceptance occurred.
- Rollback is a reviewed revert of the focused merged change, followed by M4
  promotion. No schema migration or data rewrite requires reversal.

Active behavior contracts:
[customer operations](../cloud-admin-customer-operations-workspace-standard-v1.md),
[runtime evidence](../runtime-observation-diagnostics-v1.md), and
[request recovery](../frontend-request-recovery-v1.md).
