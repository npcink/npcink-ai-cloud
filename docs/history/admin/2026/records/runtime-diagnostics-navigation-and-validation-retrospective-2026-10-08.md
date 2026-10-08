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

## Preparation while Portal closeout owns the shared lane

On 2026-10-08, a bounded local preparation checkpoint compared Admin commit
`4e7a84743229e999fc85201a796ec5faf4e99eb0` with Portal backend commit
`619082a67ace9cfea2492e024ee296499b98d6e0` and Portal UI commit
`dc4f9e91fad6ea0d41a4f1b2ba8504c93afca3d2`. Their common base was
`c61982b2cf90735d5b3340bfd511c870029dd6d9`.

Both `git merge-tree --write-tree --name-only --messages` comparisons exited
zero. The only overlapping path was `frontend/src/lib/i18n.ts`; neither had
textual conflicts. This created synthetic Git trees without merging a branch,
changing an index, publishing a PR or switching M4.

The UI integration tree was
`b2b84ce09b67b4ab99ef8e6c81d80b2be945a912`. A disposable archive of that tree
passed frontend `type-check` and nine focused contracts: Admin navigation,
Admin window capabilities, referenced Admin/Portal translations, dynamic
translation families, modal keyboard accessibility, Portal customer
correctness, Portal usage simplification, Portal professional information
simplification and Advisor actions. Existing dependency links and previously
generated Next route types were reused. This was not a new build, browser
acceptance or runtime test.

AST comparison verified that every translation changed by either owner was
retained: 85 Admin and 28 Portal English changes, and 87 Admin and 28 Portal
Chinese changes. There were no new asymmetric keys. A broader equal-key-set
probe failed on 335 pre-existing Chinese-only keys; explicit English fallback
is supported, so that probe does not establish 335 new user-facing defects.

The historical F6 fix is **not fully delivered**. The original mixed worktree
still contains the `PortalNavbar.tsx` change assigning `/portal/audit` to the
account menu and declaring `aria-current` on desktop and mobile links. Neither
Portal commit above contains that change. Its exact patch was preserved as a
Portal-owner handoff item, without editing the owner's active worktree or
adding Portal source to the Admin candidate. Patch indentation should be
normalized when the owner incorporates it; account highlighting and keyboard
current-page semantics then need focused browser verification.

Overlap metadata, merge-tree output, translation checks, the type-check log
and the F6 patch are retained privately outside the worktree under
`/Users/muze/.codex/task-backups/runtime-closeout-20261008/waiting-portal-20261008`.
The disposable integration snapshot can be reconstructed from the recorded
tree. No paid OCR or shared-runtime operation was used for this preparation.

After the Portal owner finishes, fetch the final merged master and repeat the
affected comparison against that revision. Confirm F6's disposition before
calling the historical list complete. Then resume the scoped runtime and
Admin publication gates, required checks, coordinated clean-master M4
promotion and smoke. These local static results cannot substitute for those
gates or authorize taking over the active owner's shared lane.

### Operator-selected resumption and checklist

The operator will notify this session when Portal closeout is complete.
Shared publication and M4 operations wait for that notification. Preparation
does not create a background monitor or send messages to the Portal session.

Resume in this order:

1. Verify the Portal owner's final merged PRs, the relevant executed CI lanes
   and its clean-master M4 acceptance receipt. Fetch `origin/master`; replace
   the dated comparison inputs above with the final revisions.
2. Inspect the final `PortalNavbar.tsx` for F6. If the fix is still absent,
   resolve implementation ownership, incorporate the preserved patch with
   normalized indentation and verify desktop/mobile account highlighting and
   `aria-current` on `/portal/audit` before marking F6 complete.
3. Integrate the scoped runtime and Admin commits in the isolated locked
   checkout. Preserve the mixed primary worktree. Recheck overlap and retain
   both owners' translation changes; do not blindly replay already-merged
   fixes from the runtime-only predecessor.
4. Recompute the `merge`-lane changed-file plan. Reuse only evidence valid for
   the resulting source fingerprints; run affected static, browser and M4
   candidate gates. Record OCR's incomplete coverage and use bounded file
   groups if completing the advisory review.
5. Publish focused PRs through `pr:publish` with the repository template,
   resolve required checks/review threads and confirm merge. Promote clean
   current master with the owning merged PR, then verify accepted revision
   and the actual diagnostics/navigation consumer paths.
6. Update this record with exact delivery states. Preserve ignored evidence
   and unique commits before the final worktree/ref audit. Remove only eligible
   task resources after their closure conditions hold; keep protected or
   independently active worktrees. Report F8's historical root-cause limit
   separately from delivery completion.

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


## 2026-10-08 operator-authorized closeout checkpoint

The operator delegated the remaining source, native-feedback, budget, release
preparation and cleanup tasks to this session, retaining SMTP/account trials,
real writing, payment and stationmaster trials. This is a single active delivery
lane. The earlier parallel-session hold above is historical, not current.

### Delivered dependencies

- Portal F6: Cloud PR #1083 merged as
  `95f126fab721b3ad3a02a080c29fddc564d18936`. Desktop/tablet/mobile
  account highlighting and `aria-current` passed. Clean-master M4 promotion
  confirmed acceptance; actual authenticated account/activity navigation passed.
- Runtime metering: Cloud PR #1084 merged as
  `b8887d657c85889879043d57870d9a7303a78452`. Six focused tests passed
  locally and on M4, including meters outside the old 10,000-row slice;
  clean-master promotion confirmed acceptance.
- Advisory CI: Cloud PR #1078 merged as
  `9944f621cf60fa1b9b098fa3764c8fab218a219c`. The workflow has three
  bounded attempts, enrollment checks and configuration-specific failure
  guidance. It remains advisory; permissions/action versions were retained.
- Addon native producer: PR #243 merged as
  `ce5208cc2aac43b873cb7329b0a4d928e4c879eb`. Exact local adoption queues
  metadata for the original run, with opt-in, expiry, stable retry identity and
  Cloud dedupe. The controlled real-WordPress smoke made zero Provider calls,
  Cloud submissions, post writes or persistent option writes. The option buffer
  is best effort across processes and is not adoption/approval truth. Natural
  adoption remains the operator's real writing trial.

### Current Admin candidate evidence

The isolated candidate integrates the delivered master dependencies and only
adds Admin diagnostics/navigation/shared primitives, test governance and these
records. Runtime metering and Portal changes are not duplicated in its PR diff.

- Human visual acceptance: the operator explicitly replied
  “接受，继续合并验收” to the displayed shared-layout candidate. No golden
  baseline was regenerated. This is visual acceptance, not production dispatch.
- Static evidence: Admin UI, Agent feedback quality and editor-assist quality
  gates passed. The new Python checker/tests passed full Ruff and 36 contract
  tests. Frontend contracts and 20 focused Vitest tests passed. An earlier
  combined changed-file command stopped on missing Python selection; its
  successful sub-gates were retained and the affected gates rerun with explicit
  interpreter paths. Do not relabel that whole earlier command as green.
- M4: direct candidate deployment built only the frontend image because root
  package scripts changed the image fingerprint; runtime image/migrations were
  not rebuilt. Actual authenticated diagnostics rendered current evidence,
  opened failure records and navigated to the operational advisor. Screenshots
  and deployment identity are retained outside Git.
- One complete current browser matrix: **84 passed, 1 failed (6.5 minutes)**.
  The credit-pack save notice failure reproduced in its focused diagnosis.
  Trace showed redundant same-URL navigation when opening the already selected
  pack. A no-op URL guard preserves the mounted page and its save notice.
  After focused ESLint and another M4 source checkpoint, both credit-pack
  tests passed in **9.1 seconds**. The other 84 passes and nine pilot receipts
  remain valid; no repeated full matrix was needed for that isolated guard.
- Local OCR on the new window checker failed to complete: 80,060 tokens,
  5m16s, budget exceeded, zero delivered findings. Earlier partial review
  remains partial. Manual review, deterministic gates and GitHub required
  checks remain the acceptance authority; do not claim complete AI coverage.

The Admin PR and clean-master M4 promotion still have to close this candidate.
Their exact merged/accepted revisions must be reported in the task receipt.
F8 remains an unresolved historical root-cause question without the old failed
response/request ID; current successful reads do not retroactively prove a fix.

### Preserved source and remaining operator inputs

The primary worktree's 93 dirty/untracked paths and local refs were preserved in
a verified Git bundle, source archive and hash manifest before reconciliation.
Do not clear the protected primary worktree with generic cleanup. Compare
source against delivered master and report genuine residual paths separately;
only proven closed auxiliary resources are eligible for removal.

Provider budget configuration requires the operator's selected paid connections,
per-account daily/monthly USD caps and target environment. Until supplied, paid
trial calls remain zero. Production preparation must freeze the final master
revision, prove executed CI/bundle/DB/rollback gates and obtain the exact-SHA
host-dispatch authorization prescribed by the release policy. The original
“no production outcome requested” statement above describes its earlier stage.


### PR #1086 CI and advisory follow-up

The first PR frontend run executed 48 operator/acceptance scenarios: 47 passed
and one expected the old identifier-derived new-customer heading. The stricter
fixture now returns the actual submitted operator display name. The failure
reproduced on M4, whose DOM showed `New Customer Display`; updating the exact
heading assertion preserved the behavior check. The focused scenario passed
in 15.9 seconds. This was a stale test expectation, not a product change or a
reason to restore lenient empty fixture success. Backend required lanes passed.

CI advisory findings were reviewed separately from local incomplete OCR. The
unsupported-window comment now states the minimum-window fallback explicitly;
existing consumer hints and tests already disclose that fallback. A cross-file
visual-plan assertion protects the missing-base manifest fallback selecting
the full matrix. The remaining suggestions are documented as bounded design
choices, non-defects or optional future refactoring; no unrelated API batching,
logging or visual restructuring was added. In particular, Python AST defaults
are an empty list rather than `None`, and a synchronous guarded render cannot
interleave another render between its condition and value expression.

### Cross-platform CI checkpoint

The next frontend run reached the newly registered Linux visual matrix:
75 scenarios passed, nine failed and one passed on retry. Eight failures
were missing Linux goldens (11 images); the repository previously contained
Darwin goldens for those states. Those missing images are not evidence of a
layout regression and must not be bypassed or silently accepted.

The ninth failure assumed keyboard focus always places a help trigger close
enough to the bottom to force an above-trigger bubble. Linux font geometry
left sufficient room below instead. The test now explicitly scrolls the
trigger to the bottom and waits for the anchored geometry. The session test
now uses a supported 720-hour diagnostic window; an unsupported 72-hour
diagnostic window was canonically replaced by the advertised minimum. The
plugin refresh test waits for acknowledgement and its accompanying refresh
to complete before injecting the next refresh failure. These are test
preconditions, not relaxed product assertions. All three focused scenarios
passed against M4 frontend assets in 17.3 seconds.

Linux golden candidates were generated in one bounded disposable Docker
container on M4 using Playwright 1.59.1, the locked repository version. Its
official arm64 image digest was
`sha256:040190be07ce081a025d95f2aeab57b588bed4f19165c1c93cb765372d368463`.
The bounded run reported eight missing-baseline scenarios and two passes
(24.7 seconds); its only errors were the 11 intentionally unaccepted images.
Playwright's `missing` mode writes candidates while retaining the failing
status, so this generation run is not reported as a green browser gate.
All 11 candidate dimensions match the existing Darwin images. Font and
timezone presentation differences were inspected in three comparison sheets.
Human acceptance remains required before committing new golden baselines.
No Cloud Docker build or runtime was moved to the authoring Mac.

### Independent closeout evidence

- Sixteen historical Cloud local branches were migrated to dated archive refs
  with verified mode-600 bundles. Four contain unmerged historical work and
  are preserved, not claimed delivered. The merged CI auxiliary worktree was
  removed without force after preserving relevant ignored evidence and
  confirming its complete tree matched current master. The Addon native
  feedback topic was also archived after PR #243 merged; its primary checkout
  is clean master. Remote deletion was not inferred from local cleanup.
- The primary Cloud checkout remains protected with all 93 paths preserved.
  Against candidate `e681b933` before these test corrections, 53 match exactly,
  11 match preserved historical
  heads and 29 have manual residual dispositions. Most residuals are newer
  validation, accessibility, localization, fixtures or formatting. The unique
  original design brief and proposal for two additional Portal CI selections
  remain recoverable. Rehash against final accepted master before closeout;
  generic cleanup must not discard this primary checkout.
- Two production maintenance runs were deliberately read-only:
  [database readiness #37743477533](https://github.com/npcink/npcink-ai-cloud/actions/runs/37743477533)
  and [ownership inventory #37743481231](https://github.com/npcink/npcink-ai-cloud/actions/runs/37743481231).
  Both passed. The inventory reported zero violations and warnings, excluding
  credentials, content and email addresses. Database readiness applies to the
  currently running release; it does not prove the future candidate's
  migrations, bundle, rollback or deployment. Paid connection selection,
  per-account daily/monthly USD caps, target environment and matched restore
  point evidence remain operator inputs. No production application deploy,
  migration or paid Provider call was executed.

Subsequent read-only inventory observed primary checkout commit `dc58be21`
and a rebase/abort reflog, created outside this task's actions. That primary
checkout is now clean; hashes confirm all 93 earlier preserved files match
the new commit's working files. Its exact commit was separately bundled and
verified. The initial dirty-checkout evidence above is historical, not its
current status. Keep this branch protected pending ownership/coordination
confirmation; this task did not commit, rebase or overwrite the primary.

The central Toolbox matrix was run once for clean Addon master `ce5208cc`
after PR #243 merged: its configured source gate passed in 4.6 seconds,
zero failures, zero dirty paths. Cloud's current-revision central source gate
remains pending the Admin PR's protected merge; do not report the two-repository
milestone complete from the Addon result alone.

### Operator closeout query (2026-10-08)

Fresh GitHub inspection still reports PR #1086 open and blocked: 22 checks
passed, one frontend check failed and seven lanes were skipped. Local test
corrections and documentation are committed but not pushed, and the 11 Linux
golden candidates remain untracked pending explicit human visual acceptance.
The original shared-layout acceptance does not itself approve newly generated
platform goldens. Preserve the locked auxiliary until protected merge and
clean-master M4 acceptance complete.

Addon PR #243 is merged, its primary master is clean and its central quality
gate passed. A fresh remote inventory found the merged topic still present.
After verifying its exact PR head, archive ref, bundle and absence from all
Addon worktrees, the remote ref was removed with an expected-SHA lease;
fresh remote inventory now contains only master. Cloud retains its active
Admin topic, protected primary branch and old unmerged production candidate.
Do not report all local/remote branches or worktrees clean merely because
historical closed topics were archived.

The updated Portal closeout addendum distinguishes implemented native feedback
from a future real writing-loop delivery, lists merged follow-ups and records
the remaining budget, release, operator-owned tests and F8 evidence limit.
Existing UI standards, this retrospective and the Addon producer contract
provide the local development record; these final Cloud documentation updates
are still part of the unmerged Admin closeout.

### Accepted Linux baseline checkpoint (2026-10-08)

The operator agreed to the recommended sequence of Linux baseline acceptance,
final CI, PR #1086 merge, clean-master M4 acceptance and exact-topic cleanup
("同意，按您的建议落实"). This supersedes the pending visual acceptance in
the preceding dated checkpoint. The 11 previously displayed Linux candidates
were rehashed against their preserved manifest and accepted without
regeneration, changes to existing Darwin goldens or relaxed pixel assertions.
They cover customer credits/mobile navigation/quota/top-up, external services,
providers, runtime profiles and service settings. The candidates were generated
on M4 with the pinned official Linux arm64 Playwright image; GitHub's Linux
runner remains the final cross-platform comparison gate.

Only existing test corrections, the accepted goldens and dated handoff records
are included in this checkpoint. The shared page models, action hierarchy,
API/URL state ownership and product boundaries are unchanged. Publication,
protected merge and post-merge M4 acceptance must still be verified separately.
No production deployment or paid Provider call is authorized by this checkpoint.

### Final advisory review and focused correction (2026-10-08)

The second advisory review added 25 threads after the earlier dispositions.
Each was inspected against current source and preserved test evidence. Two
bounded Advisor defects were corrected: routing candidate availability and
commercial decision activity now keep a neutral tone, while attention/failure
metrics retain warning semantics; scope/site filters replace the shareable URL
with `scroll: false` instead of adding history entries. Evidence destination
links and browser return paths remain covered. Four focused unit cases,
targeted lint, the complete Admin contract/type gate and both Advisor browser
scenarios passed (M4 assets, 31.2 seconds). The browser regression verifies
neutral routing counts, retained site scope and stable history length.

The other 23 findings were optional refactors, diagnostic wording improvements
or false positives; individual dispositions are recorded in PR #1086. Examples
include the intentional serialized scope key for stale-response isolation,
the aggregation `then` rejection handled by `catch`, exact query fixtures and
the fail-closed unmocked-request policy. These findings do not authorize
unrelated provider/API/state-library work. A fresh required CI run remains
necessary after the two actual source fixes.

At revision `57aa26b8`, CI passed all 48 critical operator scenarios and 84 of
85 visual scenarios. Only the service-settings screenshot failed, with 566
different pixels. This is retained as a failed gate until the exact rendered
state difference is reproduced; the other ten new Linux goldens compared
successfully. Neither pixel tolerance nor the required merge gate was relaxed.

### Exact screenshot cause and source reconciliation (2026-10-08)

The remaining 566-pixel CI difference was reproduced on M4 using the same
Linux browser image and a loopback frontend URL. Every differing pixel was in
the Portal URL row's origin-dependent detail: the Docker hostname candidate
showed "Use current URL", while CI's loopback address correctly showed the
callback-address source explanation. The rest of the image was identical.
The corrected candidate passed a normal comparison and the complete settings
interaction scenario in 5.1 seconds, without `--update-snapshots`. Its exact
SHA-256 is `70c31c4008cec13939d5bf658bdd29973f0e780112c33c51cfd65c073235702f`.
Explicit human acceptance for this corrected image is requested and pending;
the earlier approval of 11 candidates does not silently approve a replacement.

Reusable rule: golden generation and comparison must agree on origin class,
locale, viewport and browser version, as well as fixture data. A production
frontend accessed through an internal Docker hostname can render a legitimate
action absent from the loopback CI context. Reproduce and inspect the exact
pixel region before changing a baseline; do not hide the action, weaken pixel
tolerance or claim an architectural browser difference without evidence.

A fresh comparison against local candidate `1e9eb614` confirmed that all 93
original primary-checkout file hashes remain unchanged: 50 match this newer
candidate exactly, 11 match preserved historical variants and 32 retain manual
residual dispositions. Eight candidate files changed since the earlier
comparison, all accounted for by recorded contract, validation, test or Advisor
corrections. This remains candidate reconciliation, not merged-master proof.
The primary checkout and exact `dc58be21` bundle remain protected.

The newly registered `codex/m4-resource-baseline` auxiliary belongs to the
active "服务器资源占用监测" task. Its declared lane prepares a standalone
sampling tool and performs bounded read-only M4 sampling, without deployment,
limits changes or paid model traffic. It is retained separately. Before the
next M4 promotion, inspect the live sampling state so container recreation
does not invalidate an observation still in progress. This evidence does not
declare a parallel merge queue or authorize messaging another task.

### Corrected Linux golden accepted by operator (2026-10-08)

After the corrected service-settings screenshot and its exact origin-dependent
difference were shown, the operator explicitly replied "可以，继续合并".
This accepts the replacement image with SHA-256
`70c31c4008cec13939d5bf658bdd29973f0e780112c33c51cfd65c073235702f`
and supersedes only the pending acceptance in the preceding checkpoint.
The other ten reviewed Linux goldens and all Darwin goldens are unchanged.

The accepted image represents the loopback origin used by GitHub CI. Its
normal M4 Linux comparison and full settings interaction passed in 5.1 seconds.
The exact 566-pixel reproduction, original candidate and comparison evidence
remain preserved. No product control was hidden and no screenshot tolerance,
test assertion or required merge protection was weakened.

This checkpoint also publishes the two already-tested Advisor corrections.
Their four unit cases, Admin contracts/type-check, targeted lint and two
M4-asset browser scenarios remain valid for the unchanged source. Required
GitHub checks on the final pushed revision must still pass before protected
merge, clean-current-master M4 promotion, relevant smoke and exact-topic
cleanup. Human image acceptance does not itself prove these later states or
authorize production deployment.
