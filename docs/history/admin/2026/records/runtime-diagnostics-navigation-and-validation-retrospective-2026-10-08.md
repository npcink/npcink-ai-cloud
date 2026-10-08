# Runtime Diagnostics, Navigation and Validation Retrospective — 2026-10-08

Status: dated development record; merge and runtime acceptance are recorded
separately. This document is not production authorization or runtime truth.

## Problem and final design

The diagnostics page accumulated overview cards, an oversized trend chart,
issue cards, nested disclosures, repeated explanations and several detail
views. Replacing cards with rows did not establish a clear reading order.
Users still had to open several sections to understand one anomaly.

The operator's job is to select an anomaly, inspect its evidence and choose the
next investigation step. The resulting composition uses a compact two-row
header, an adjacent issue queue and detail workspace, and one level of tabs:
overview, run records and daily trend. The first issue opens by default;
an applicable explicit URL focus takes precedence. The overview presents a
function breakdown beside investigation actions when the viewport permits.
Both panels start at the same vertical position. Numbers use aligned columns
and shared geometry tokens. Short diagnostic tool links remain visible in the
footer when space permits; auxiliary content uses the shared drawer.

Explanations belong next to the metric or action they explain. Help supports
hover, keyboard focus, touch and Escape. Evidence gaps, unknown causes and
unverified recovery remain distinguishable; hiding explanation must not turn
missing evidence into a success or failure claim.

## Findings and prevention

| Finding | Correction | Regression boundary |
| --- | --- | --- |
| Plugin observation had a URL but no ordinary menu entry | Declare route ownership, parent navigation and relevant diagnostic links together | Route navigation contract and browser clicks, including auxiliary/deep routes |
| Cross-page links silently changed time or site scope | Carry supported parameters and show the destination's adjusted time window; declare unsupported filters | Navigation scope mapping, API window-capability guard and keyboard/touch browser checks |
| Advisor displayed the same signals for different scopes | Read scope-specific signals, preserve true zero, distinguish absent values and suppress previous-scope results while loading | Presentation unit tests and four-scope browser switching/refresh checks |
| Advice opened unrelated evidence or a collapsed anchor | Map backend action codes to bounded evidence destinations; open applicable asynchronous fragment disclosures | All 17 static action codes, bilingual labels and actual destination-click assertions |
| Visual pilot registration did not control execution | Generate the unique browser spec plan from the manifest and fail on missing registrations | Missing-mapping/new-registration negative tests and CI changed-file selection |
| Unknown test API requests received successful empty responses | Fail unknown requests with 501; keep only explicit fixture projections/allowlists | Strict fixture contract plus route acceptance matrix |
| Metering coverage depended on the latest capped event list | Associate meters with the bounded run cohort; exclude non-AI zero-credit runs from missing-meter evidence | Normal, outside-window and over-cap metering tests |
| Activity deep links lacked a clear owning Portal section | Treat recent activity as account content and preserve a return path | Portal owner coordinates the separate delivery; Admin PR does not copy its active source |

## Reusable development rules

1. Start with the operator's question and state ownership. Adding another
   disclosure or tab without assigning information ownership recreates the
   clutter elsewhere. Retain one clear primary action and one detail level.
2. A route is complete only when its manifest classification, normal entry,
   parent/return path, parameter capabilities and real browser navigation
   agree. A reachable URL or route inventory alone is insufficient.
3. UI scope is a public interface. Site, time and function filters may be
   forwarded only to destinations that actually support them. An adjusted
   scope must be visible, not discoverable solely by hovering.
4. Unknown data is not zero. Missing evidence, sampled records, full function
   totals, call counts and run counts require distinct labels and units.
5. Test fixtures must reveal missing API ownership. A universal empty success
   response masks broken projections and produces misleading green tests.
6. Validation declarations must execute. Pilot registration selects browser
   specs; structured receipts record required states and rule applicability.
   An early broad failure remains failed even after narrower repairs pass.
7. OCR is a second opinion over an exact revision and file set. Record real
   findings and dispositions; a previous four-file review cannot certify a
   later mixed worktree. Partial token-budget coverage is not a full review.
8. Source, candidate preview, merged master and accepted M4 are separate
   states. Reuse same-revision evidence; invalidate affected evidence after
   source changes or another session replaces the shared candidate.
9. Preserve mixed source before splitting it. Shared translations and CI
   changes require explicit ownership; serialization belongs at the merge
   and shared-runtime boundaries, not in a new mutable control plane.

The active rules live in
[Admin UI Standard](../../../../cloud-admin-ui-standard-v1.md),
[Admin Information Architecture](../../../../cloud-admin-information-architecture-v2.md),
[Runtime Observation UI Development Standard](../../../../cloud-admin-runtime-observation-ui-development-standard-v1.md)
and [Admin Frontend Engineering Standard](../../../../cloud-admin-frontend-engineering-standard-v1.md).

## OCR closeout findings and dispositions

The runtime-only review at `41281ee040d65994728aad7f9357d35ace431d13`
completed its one selected production file with no findings. The initial
Admin review at `97f182751bdec2f34a46445abb7e800ba33a0295` was partial:
20 of 45 selected files completed, 25 failed due to provider rate limits or
the token budget, and 27 comments were returned. This is useful defect evidence,
not a complete clean review. Private raw reports retain exact revision,
coverage, provider and session identifiers without copying tool reasoning into
repository documentation.

Corrections from that review include:

- Preserve toolbar-only controls in both shared header densities.
- Validate run identifiers and timestamps; malformed evidence must finish in
  an error state that can be retried instead of leaving loading unresolved.
- Keep existing disclosure contract selectors valid and expose help expanded
  state without rebinding viewport listeners for every position update.
- Select all registered pilot and supplemental browser specs after shared
  Admin or fixture changes; report subprocess errors explicitly.
- Make required visual states independent of the manifest being checked,
  consolidate fixture ownership, and derive supported fixture periods.
- Register Advisor dynamic translation families, cover dynamic generic action
  fallbacks, localize navigation scope hints and preserve explicit unknowns.
- Derive CI window owners from the capability registry and report successful
  contract completion only after its assertions pass.

Accepted advisory observations: the pinned 14-day navigation default is an
intentional cross-page contract, while unsupported periods remain visibly
adjusted; filter history entries intentionally allow Back to restore scope;
the strict fixture's known identity is deliberate and unknown endpoints still
fail closed; compatibility window exports remain immutable; compact table
class selection is bounded presentational branching, not independent state.
Portal-only guard changes were removed from this Admin candidate and remain
with the Portal owner. Any final OCR retry must reuse unchanged coverage and
review changed or previously failed files with bounded concurrency and budget.

## Local closeout checkpoint

The isolated branch is `codex/admin-diagnostics-closeout`, in
`/Users/muze/.codex/worktrees/diagnostics-closeout/npcink-ai-cloud`, locked as
`codex:runtime-closeout-20261008`. The runtime-only predecessor is retained as
`codex/runtime-meter-coverage-closeout`. Code checkpoint
`b4f481178aa80b0ba0b8f45a33a63a61a5d8a511` includes the review repairs and a
consistent Advisor destination fixture. This record is local committed
preparation, not a published or merged PR.

Current local evidence:

- Admin source/static gate, TypeScript and targeted ESLint passed.
- Twenty focused Vitest cases and 25 CI-efficiency contracts passed.
- Frontend unit contracts initially stopped at unregistered dynamic Advisor
  translation families. The missing families were registered; that seam and
  the remaining contracts passed. The initial failure is retained.
- The final shared visual matrix passed 85 tests across 15 unique specs at
  `24c0e10893a1aeb6bce7e974802bfe429a38a483`, with nine pilot receipts.
  Receipt dirty paths contain only the Next-generated `next-env.d.ts` import,
  restored afterward. No changed golden baseline was committed. Human
  acceptance remains pending for material shared patterns.
- Ten navigation browser cases passed. Advisor had one pass and one failure
  because the test claimed failed runs while its destination fixture was
  healthy. The destination fixture was corrected, actual selected-issue
  content was asserted, and the failed case passed on a focused retry.
  The production frontend did not change after the 85-test matrix.
- Documentation reachability passed: 498 of 498 documents indexed.

The bounded final OCR attempt reviewed the exact `24c0e108` input with
concurrency one. Three unchanged completed files from the initial review
were verified and excluded for reuse. Same-session resume rejected the changed
HEAD, so a new session was necessary. The 16k prompt limit skipped the large
troubleshooting page, and grouped review hit context-compression limits.
At the declared 10:17 local deadline, the session was interrupted gracefully.
Its final result is **failed**, with zero of 41 selected files completed,
421,476 reported tokens and no new findings. This does not certify the final
Admin revision. Session `72cd6ed9-3712-4adc-bddd-432d7c534686` and earlier
partial findings are preserved privately. Any later attempt must narrow the
file group and supply sufficient context instead of replaying the broad run.

Six stale local remote-tracking refs were pruned only after a verified Git
bundle. No live remote head, local branch or worktree was deleted. All task
commits, mixed original source, pilot receipts and screenshots are preserved
outside the worktree. Primary, Portal-owner, M4 operations and unique-unmerged
historical worktrees remain protected.

Remaining delivery gates are the shared merge/M4 owner assignment, scoped M4
API and relevant quality gates, protected PR checks and merge, human visual
acceptance where required, then clean-current-master promotion and smoke.
Portal PR #1079 was still open with a required backend check failing at this
checkpoint; it is owned by the separate Portal session. Do not publish or
replace its shared candidate while ownership is unresolved. Release this
worktree only after its owning PRs are merged, accepted runtime evidence is
current, ignored evidence is preserved and a fresh exact-path audit permits
non-force removal. No production operation is authorized by this checkpoint.

## Evidence limits and pending work

The preceding development candidate passed 18 focused unit tests, the
17-action bilingual contract and strict fixture/visual-plan guards. Its first
broad browser run had 69 passes and 16 failures; affected-file reruns had
43 passes/10 failures and finally 65 passes. Nine visual pilot receipts were
collected. Those are historical candidate facts, not acceptance of this new
isolated revision. Closeout must attach current gates, OCR, PR and promotion
receipts to the delivered revision.

- **Old Portal read failure (F8): unresolved historical root cause.** A later
  authenticated session successfully read nine matching site activities,
  switched the site and returned to account. The old failing response body
  and request ID were not retained. On recurrence, capture route, applied
  filters, request ID, response status and redacted response body, then
  correlate authentication, frontend proxy and API logs. Do not manufacture
  an incident or call the old root cause fixed without that evidence.
- **Tunnel connection refusal:** SSH forwarding can be established while the
  remote target listener is unavailable. Diagnose the selected SSH host,
  forwarding destination, M4 containers and proxy health together. A local
  listening port alone is not proof of the preview service. Use only the
  operator-approved bounded direct recovery path when applicable.
- **Shared M4 cutover:** a 502 occurred during a source-switch window and
  recovered; a later operation from another session changed the runtime.
  Historical logs cannot establish the accepted stable-window 502 count.
  Collect it only after a coordinated clean-master promotion.
- **Repository cleanup:** preserve unique commits and ignored evidence before
  removing any auxiliary checkout. Primary, active-owner and stable M4
  worktrees remain protected. A stale tracking ref is not a live remote
  branch. Report local refs, remote heads and worktree registrations separately.

Cloud remains the hosted runtime enhancement layer. These changes do not
create WordPress write ownership, a local ability/workflow registry, approval
truth or a second deployment controller. No production outcome is requested.
