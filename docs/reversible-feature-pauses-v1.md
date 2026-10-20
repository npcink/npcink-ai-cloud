# Reversible Feature Pauses v1

Status: merged to `master`; M4 development preview accepted, 2026-10-19; cross-repo对照 added 2026-10-20. Does not claim the production server has loaded these pauses, and does not authorize plugin distribution or any pause unfreeze. Authoritative closeout: [reversible-pauses-final-closeout-and-cleanup-2026-10-19](history/engineering/2026/reversible-pauses-final-closeout-and-cleanup-2026-10-19.md). SEO specialist detail: [seo-specialist-pause-v1.md](seo-specialist-pause-v1.md).

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

## Cross-repo对照 (parallel lists)

Three repositories enforce availability **independently**. There is no shared
cross-repo constant package. Publish and unpause in order
**Cloud → Addon → Toolbox** so UI never advertises a path that Cloud still
rejects. Do not restore SEO/AEO/GEO or the three runtime keys from
documentation alone.

Sibling inventories (same faces, parallel enforcement):

| Repo | Inventory |
| --- | --- |
| **Cloud (this file)** | `PAUSED_DISCOVERABILITY_TASKS` (10 ids) in `app/domain/wordpress_ai_connector/contracts.py`; `PAUSED_RUNTIME_FEATURES` (`cloud_inspection`, `audio_generation`, `advanced_media`) in `app/domain/runtime/availability.py`; Cloud-only `OPERATIONS_ADVISOR_PAUSED`. |
| **Addon** | [`docs/reversible-feature-pauses-v1.md`](https://github.com/npcink/npcink-cloud-addon/blob/master/docs/reversible-feature-pauses-v1.md) — Tables A–C, error codes, release order, smoke matrix row map. Cross-repo对照 expanded in [Addon PR #309](https://github.com/npcink/npcink-cloud-addon/pull/309) (still the landing PR until merge; post-merge path is the same blob URL on `master`). **Naming:** Addon has no `$paused_specialist_tasks`; the ten SEO/AEO/GEO ids live inside `Npcink_Cloud_Discoverability_Pause::is_task_paused()`. Runtime map: `$paused_runtime_features`. |
| **Toolbox** | [`docs/reversible-feature-pauses-v1.md`](https://github.com/npcink/npcink-workflow-toolbox/blob/master/docs/reversible-feature-pauses-v1.md) — mirrors the same faces (`DISCOVERABILITY_PAUSED` whole-surface boolean; `$paused_cloud_features` for the three runtime keys). |

Verified smoke baselines (Asia/Shanghai 2026-10-20, read-only, **no unpause**):

| Repo | HEAD used for matrix v1 |
| --- | --- |
| Cloud (`npcink-ai-cloud`) | `fe12ce2c` |
| Addon (`npcink-cloud-addon`) | `ae15b90` (matrix run); package/docs baseline later `6100e23` / **0.4.4** (pause policy unchanged) |
| Toolbox (`npcink-workflow-toolbox`) | `2dfc3fe` |

### Table A — SEO/AEO/GEO specialist

| Capability | Cloud | Addon | Toolbox | State |
| --- | --- | --- | --- | --- |
| Specialist task set | `PAUSED_DISCOVERABILITY_TASKS`: **10** ids (`meta_description`, `seo_title`, `seo_headline`, `seo_description`, `seo_metadata`, `aeo_summary`, `answer_summary`, `geo_summary`, `structured_data_hints`, `content_discoverability`). Reject: `wordpress_operation.feature_paused` **400** | `is_task_paused()` same 10 ids; filter `editorial_notes` seo/aeo/geo; hide Meta Description host feature; reject `cloud_feature_paused` **409** | **No per-task array.** `Settings::DISCOVERABILITY_PAUSED = true`; hide Site Profile SEO/AEO/GEO tabs; do not register `build-content-discoverability-brief`; specialist plan/brief → `npcink_toolbox_feature_paused` **409** | All three paused; Cloud↔Addon task ids match; Toolbox is a whole-surface boolean |
| `editorial_notes` specialist | Pure specialist → pause; mixed → filter then continue | Legacy runtime may reject whole payload; connector path filters specialist types | No specialist brief exposed; generic writing still available | Specialist side paused |

### Table B — runtime feature keys (same names)

| Key | Cloud `PAUSED_RUNTIME_FEATURES` | Addon `$paused_runtime_features` | Toolbox `$paused_cloud_features` | State |
| --- | --- | --- | --- | --- |
| `cloud_inspection` | Nightly / site-ops markers; `runtime.feature_paused` **409** | Same key + markers; Hosted Runtime entitlement forced paused/hidden | `true`; hide Cloud analysis entry; Provider **409**; local Site Check kept | All three paused |
| `audio_generation` | `generate-audio`; intents `article_narration` / `article_audio_summary` | Same key; pre-sign reject | `true`; both intents paused; editor entries removed; existing players kept | All three paused |
| `advanced_media` | `plan-media-derivative-batch` / `audit-media-governance` etc. | Same key; transport / plan reject | `true`; withdraw batch optimize; omit `build-media-derivative-handoff`; backup restore kept | All three paused |

### Table C — asymmetric / Cloud-only notes

| Item | Notes |
| --- | --- |
| Operations Advisor | Cloud-only (`OPERATIONS_ADVISOR_PAUSED`); Addon/Toolbox have no matching key |
| `wordpress_ai_generation_tests` | Addon `$paused_admin_surfaces` cleared (P0 restored 2026-10-20); unrelated to SEO pause |
| Toolbox specialist granularity | Whole-surface `DISCOVERABILITY_PAUSED` closes the gap vs Cloud’s 10 task ids |
| Error codes (do not cross-search) | Cloud task: `wordpress_operation.feature_paused` **400**; Cloud runtime: `runtime.feature_paused` **409**; Addon: `cloud_feature_paused` **409**; Toolbox: `npcink_toolbox_feature_paused` **409** |

### Risks when aligning

1. Do not invent `$paused_specialist_tasks` for Addon.
2. Do not force Toolbox to grow a 10-id task array — map to “entry hidden + whole-surface reject.”
3. Keep the three error-code families distinct in logs and tests.
4. Addon `ACTIVE=false` unpauses SEO **and** all three runtime keys at once; restore one face by editing the list/map only.
5. Tables above are source-policy truth; live sites must match the deployed SHA. This document does **not** authorize unfreeze.

### Pause smoke matrix v1 (row map)

Convention: every row must satisfy **entry not visible / not registered** and
**execute path returns the expected code**, with **zero outbound Cloud HTTP**
on Addon/Toolbox reject paths. “Visible but rejected” = fail.

| Rows | Owner | Cloud / sibling coverage |
| --- | --- | --- |
| D1–D4 | Toolbox | SEO UI/projection/register/API |
| D5–D6 | Addon | Meta Description + copy; 10 tasks / editorial → `cloud_feature_paused` 409 |
| **D7–D8** | **Cloud** | Same 10 tasks + editorial → **400** `wordpress_operation.feature_paused` |
| C1–C3 | Toolbox | `cloud_inspection` UI/projection/API |
| C4–C5 | Addon | Overview Hosted Runtime paused/hidden; nightly/site-ops markers 409 |
| **C6** | **Cloud** | analyze-nightly → **409** `runtime.feature_paused` |
| A1–A3 | Toolbox | audio UI/API |
| A4 | Addon | `execute_toolbox_audio_generation_runtime` → 409 `audio_generation` |
| **A5** | **Cloud** | generate-audio → **409** `runtime.feature_paused` |
| M1–M3 | Toolbox | advanced_media UI/register/API |
| M4 | Addon | Transport / Plan_Projection / markers → 409 `advanced_media` |
| **M5** | **Cloud** | plan-media-derivative-batch etc. → **409** `runtime.feature_paused` |

Cloud matrix v1 result on `fe12ce2c`: **D7 D8 C6 A5 M5 all PASS** (read-only,
no unfreeze). Addon and Toolbox reported matching PASS for their rows the same
day.

Still available while paused: generic title/excerpt/translate/classify/slug
(non-SEO specialist), ALT, ordinary images, Site Knowledge, search, verified
connection, historical run/result reads, existing artifact download/ACK,
optional monitoring; Toolbox local Site Check; existing audio playback;
media backup restore; Cloud Advisor history read-only.

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


## Merge continuation — 2026-10-19

The operator subsequently authorized resolving the remaining blockers,
integrating current master, publishing and merging, with no production deploy.
A clean, locked task worktree replays the four batches on origin/master
`6f3a1dae` (including #1148–#1150). The original checkout's three unrelated
staged documents remain untouched. Addon and Toolbox were already current.
The weekly CNA evidence renewal is isolated in prerequisite Cloud PR #1153;
live ranges still match and its 48 focused supply-chain tests pass.

The operator explicitly selected office LAN direct transfer for this bounded
recovery, covering candidate validation and clean-master accepted promotion.
Pin `NPCINK_CLOUD_M4_SSH_HOST=muze@192.168.10.200` and
`NPCINK_CLOUD_M4_SOURCE_TRANSFER_MODE=direct` for this task only. The old relay
endpoint timed out and a second documented relay endpoint rejected the
available identity; no relay service, public firewall, SSH configuration or
production runtime was changed. Initial M4 status was accepted master PR #1150.

Current-base focused source regression: 555 passed. Changed-Python Ruff/mypy
passed after a fixture-spacing-only repair; its seven Advisor implementation
tests passed separately. Real mounted Local WordPress Addon calls for audio,
inspection, media planning and governance all returned feature-paused with zero
outbound HTTP attempts and zero content writes. Addon Playground activation,
PHPStan, WordPress.org guard and strict Plugin Check passed. POT freshness was
repaired by the normal i18n refresh; compiled translation mappings are identical.
Publication, CI, merged-source and M4 acceptance receipts follow separately.


Merge-continuation verification also covered the retained internal audio
workbench. Its article-audio-summary path previously prepared a text script
before the runtime audio pause. The route now rejects before constructing the
workbench, and direct workbench callers reject before payload/context/script
work. A new default-policy API suite covers both audio intents, authentication,
direct calls and recent-history reads. Retained workbench tests explicitly
unpause only their own fixture. The related audio/provider/media-observability
suite passes 61 tests after the fix; the new tests failed before the fix.
There is no browser audio-preview entrypoint to remove (existing frontend
contracts already forbid it).

Full Admin visual matrix on the isolated current-base worktree: 95 passed.
The initial startup-only failure from dependency symlinks was corrected with a
frozen-lockfile offline install (451 packages, zero downloads); no dependency
source changed. M4 LAN candidate sync succeeded without an image build, its
focused API/domain suite passed 116 tests, and the actual M4-served paused page
passed its browser check. Source was subsequently updated for the audio
workbench guard, requiring a new candidate sync before final acceptance.

Addon PR #296 merged as `e69879fc`; every PHP compatibility, WordPress AI,
release-static and advisory PHPStan check passed. Its pre-publish local OCR is
incomplete (13 selected, zero successfully reviewed; 5,890 tokens before budget
stopped dispatch). Addon and Toolbox OCR workflows are disabled_manually and
are not re-enabled by this task. Toolbox PR #281 follows the documented
publisher exception path with the unavailable-review reason recorded in its
body. Cloud CNA PR #1153's bounded OCR also failed; mandatory deterministic
checks remain the merge authority. No missing review is described as clean.


The final merged Addon ref is verified against origin/master as `e69879fc`
(PR #296); Toolbox is `2dfc3fef` (PR #281). Both local mounted plugin checkouts
were fast-forwarded to clean master. Cloud PR #1155 initially failed the docs
reachability gate because the new pause record was linked from root README
but absent from the owning docs index. The index entry is now added in the
isolated task checkout; the original shared checkout's staged docs remain
untouched. This is a documentation-only correction to the tested runtime.


The exact-head CI impacted API lane then completed 585 passing tests and one
failure in an old full-equality entitlement expectation. The expectation now
includes `available=false` and `availability_state=paused`; the existing seeded
usage-detail test also asserts paused availability while retaining its original
used/remaining counters. This correction changes only tests and this receipt,
not runtime behavior or saved quota evidence. It is a task-related stale
contract expectation, not a flaky/pre-existing failure claim.


The frontend critical-path lane exposed three additional superseded assertions:
the acceptance matrix expected a withdrawn quick-switcher entry, and two
Advisor PC tests expected the former diagnosis/scope controls. Those contracts
now explicitly check the paused bookmark, absent discovery/actions, zero
Advisor requests, preserved PC layout, legacy-scope reloads, and return to
normal diagnostics (including its own focus parameter). Read-only metadata
smoke expectations were reconciled separately; runtime metadata remains intact.
No tests are skipped and the retained page/service implementation is unchanged;
old positive browser contracts remain recoverable from Git history. The exact
CI core-browser list then passed all 48 tests locally in 43.9s against the
unchanged built frontend. Existing 95-test visual evidence remains valid.
The backend impacted lane on the prior exact head also passed all 586 tests.


Updating the metadata browser smoke first selected an incompatible specialized
CI command: it assumed both a browser cache and a running Cloud at localhost
on the source runner. The metadata rule now runs the existing authenticated,
read-only API projection contract in source/CI, with the browser check retained
as an explicit M4 follow-up. A router regression prevents recoupling the source
gate to live browsers; all specialized commands must reference existing package
scripts or bounded repository pytest nodes. No M4 credentials or deployment
operation was added to CI, and package/dependency/image inputs are unchanged.
The router plus API contract suite passed 36 tests, the specialized-only command
passed, anti-drift passed, and the metadata API contract passed on M4.

The full external metadata-browser attempt remained unverified: its existing
dev-entry redirect selected the configured Cloudflare Access origin and did not
complete login. No Access/auth/production configuration was changed. This is
recorded separately from the passing M4 paused-page browser check and M4 API
contracts; it is not described as a successful live metadata-browser acceptance.
