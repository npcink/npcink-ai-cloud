# Reversible Feature Pauses v1

Status: development candidate, 2026-10-19. Not production deployment evidence.

## Policy

Pause availability and remove product entrypoints while retaining implementation,
saved configuration, usage/billing evidence and historical results. Do not add
database deletion migrations, a feature-control console, or a second registry.
Restore each feature only through a reviewed source change and current consumer
verification; reconnecting, refreshing caches and old saved settings cannot
restore availability. Retention and artifact cleanup continue normally.

## Ordered batches

1. Operations Advisor: pause new diagnosis, summaries, previews and disclosure
   review. Authenticated summary history and value evidence remain read-only.
   Remove navigation, diagnostic directory and command-search entries. Old page
   URLs show a pause notice without fetching advisor data. The retained page,
   service implementation and translations remain available for future review.
2. Cloud nightly inspection and site-operations analysis: pause new execution
   and retries; preserve WordPress-local deterministic checks and old results.
3. Article audio: pause generation and regeneration; retain existing playback.
4. Advanced batch media: pause derivative planning, governance audit and
   optimization-plan entrypoints; retain ordinary image/ALT and safe delivery.
5. Reconcile current help, capability advertising and product promises. Keep
   Site Knowledge sync/search, existing external search, commercial integrity,
   essential observability and translation compatibility operational. Freeze
   their advanced expansion. SEO/AEO/GEO specialist tasks remain paused under
   their existing contract.

Each batch has a focused local commit and regression evidence. A candidate M4
sync does not establish merge, accepted-master or production state. This task
uses the development lane; publication and production are separate decisions.

## First-batch evidence

- Advisor API pause and historical-read tests: 9 passed.
- Retained implementation API tests: 7 passed before the test-data-only repair.
- Frontend type-check, targeted ESLint and `check:admin-ui`: passed.
- PC browser: paused bookmark, no advisor requests, no execution buttons and
  viewport fit passed at 1440x1050. Narrow navigation checks follow the batch.

Rollback: revert the corresponding batch commit and verify current consumers.
Do not treat old configuration or historic acceptance as restoration approval.

## Inspection batch evidence

Cloud ingress and queued-run execution check exact ability, execution kind,
profile and contract markers before runtime work. A queued inspection fails
with `runtime.feature_paused`; historical completed results remain readable.
Nightly retries re-enter the same execute guard. Entitlements project paused
availability without changing stored budgets or historical counts.

Addon guards every runtime POST and inspection retry before signing/HTTP.
Toolbox masks effective Pro inspection enablement without changing stored
options, blocks provider and REST submission/retry, and removes Cloud detail
and recovery actions while keeping local checks. Retained implementation
suites explicitly unpause their in-process test fixtures; default-pause tests
exercise the real release policy separately.

- Cloud focused ingress/queue/history plus retained feature APIs: 52 passed.
- Addon default-pause behavior and full PHP contract/behavior suite: passed.
- Toolbox static contracts: 4224 passed; provider behavior suite passed.
- M4: first source transfer failed reaching the private relay SSH endpoint.
  No source was applied. No direct fallback or production operation occurred.

## Audio batch evidence

Audio generation is paused by ability, execution kind, profile and contract
at the ingress/queue seam. Addon refuses named and generic transport through
the common pre-signing guard. Toolbox rejects narration and audio-summary
editor intents before preparing their text context, including the preliminary
summary model call, and rejects direct provider calls before filters. Audio
flows and regeneration are unavailable; existing playback and preferences stay.

- Cloud focused pauses, ordinary runtime and artifact characterization: 152 passed.
- Addon default-pause and retained WordPress connector runtime tests passed.
- Toolbox static contracts, provider behavior and evaluated editor JS passed;
  audio entries are absent while ordinary formatting remains available.

## Advanced-media and final source evidence

Advanced media planning, governance audits and new derivative/optimization jobs
are paused. The dedicated media-jobs ingress is also guarded; ordinary uploads,
image generation, ALT, artifact delivery and historical results remain usable.
Addon dispatch stops before uploads, and its optimization-plan projection is
unavailable. Toolbox withdraws the workbench, optimize bulk action and planning
ability, and blocks new manifests, batches, confirmation and per-item processing.
Backup restoration, retention cleanup and adopted media are unchanged.

Final focused Cloud suite: **555 passed**, including pause defaults, ordinary
runtime, WordPress connector, Site Knowledge-related connector regressions,
media delivery and dormant implementations. Python correctness/import checks
and targeted mypy passed. The two pytest warnings are Starlette/httpx test-client
deprecation and an existing intentional interrupting-close fixture finalizer.

Admin source gate passed. Full Admin visual run: **94 passed, 1 failed** because
the old assertion expected the withdrawn Advisor link. That assertion was
updated; focused diagnostic/navigation/paused-page PC and narrow browser
coverage then passed **30 tests**. The other 94 tests were not rerun merely to
repeat already-proved evidence. Local WordPress Site Check browser passed with
Cloud entries absent and no Cloud analysis/Core execution.

The single broad in-process contract/domain attempt was stopped after failures;
a focused reproduction reports an expired authoritative image-supply validation
window in unchanged supply-chain inputs. It is not a passing `check:fast` run.
No Docker runtime was started locally and no security exception was renewed.
M4 transfer remains unverified after private-relay SSH timeout; production and
GitHub publication are outside the authorized development lane.

The source pauses are complete; verification and distribution states above must
not be conflated. Shared billing/security, Site Knowledge sync/search, existing
external search, essential feedback, existing media/audio and first-party
localization stay operational. Broader RAG/provider/commercial/dashboard/shim
expansion is frozen pending operator evidence. Restoration is a reviewed source
change against current consumers, never an automatic saved-option reactivation.


## Development closeout receipt — 2026-10-19

All three repositories use local branch
`codex/reversible-feature-pauses-20261019`. No branch was published, PR opened,
merge performed, plugin distributed or production deployment attempted.

| Batch | Cloud | Addon | Toolbox |
| --- | --- | --- | --- |
| Advisor | `6286c134` | not applicable | not applicable |
| Inspection/site analysis | `75c13129` | `deaff5d` | `788e590` |
| Article audio | `212bb914` | `d7091da` | `b050233` |
| Advanced media/product copy | `e4f109e6` | `dbe2d08` | `61ec0bf` |

The central `composer quality:matrix:run` was executed once against these final
code revisions, restricted to these three repositories. Toolbox and Addon
`composer test:all` both passed (35.7s and 4.4s). Cloud is `needs_validation`:
its exact-SHA GitHub gate refused the three unrelated staged documentation
changes retained in this shared worktree. Those files were not included in any
pause commit. No remote evidence was inferred and the overall matrix is not
green. At closeout, Cloud origin/master also contains two newer commits
(`#1148`, `#1149`) outside this candidate; integration with them remains a
separate required step before merge validation. Toolbox emitted PHP dynamic-property deprecation notices from retained
Provider_Client construction; they are recorded, not concealed by a passing exit.
Toolbox coding standards and PHPStan passed separately.

Candidate plugin ZIPs were generated and validated locally. Toolbox package
integrity and its changed Settings, Admin_Page, Media_Optimization_Batches and
editor JS payloads match the checked source. Addon release manifest verification
passed. Their SHA256 values are:

- Addon: `fa8cd68f8256733233c6e075df0ea1ab61cf5fd2ecb8c48258ac6891711db223`.
- Toolbox: `03bb6bf839824439073d3fa0ca210b0cfc48451c96c23d309cd93157f32a7ba9`.

The final M4 candidate sync used the required private relay and explicit
non-master/dirty-candidate opt-ins. It failed before transfer while acquiring the
relay lock (`SSH operation timed out`, exit 255). Two consecutive relay failures
ended automatic retries. Three sync commands were attempted in total, including
one branch-preflight refusal; zero source transfers were applied and zero deploys
were attempted. Accepted-master promotion was not attempted. Runtime behavior
and M4 acceptance remain unverified. The separate image-supply validation-window
blocker above also remains unresolved; no security exception or scope expansion
was introduced to make the receipt appear green.

M4_OBSERVATION_RECEIPT date=2026-10-19; route=Pgy-control-and-Tailscale-private-relay; sync=failed-before-transfer; focused=not measured; promotion=not occurred; operations=sync3/deploy0/applied0; stable_502=not measured; m4_only=not observed; coordination=unrelated staged docs preserved
