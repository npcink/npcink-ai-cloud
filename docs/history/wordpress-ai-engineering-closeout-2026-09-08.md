# WordPress AI Phase-1 Engineering Closeout

Status: historical engineering closeout; not current deployment or acceptance
authority.

Date: 2026-09-08. Lane: merge, L2 runtime integration. No production release.
This is a dated evidence record, not current deployment authority.

## Outcome and scope

The previously uncommitted preservation-first formatting workflow is integrated
into the relevant repositories. WordPress requests formatting and displays the
validated complete result in its native editor; the author owns normal save.
Cloud never writes WordPress. Addon only transports. Eval-lab stays outside the
product runtime. No new billing system, model routing, Nano or semantic feature.

The overall original objective also includes economical task-appropriate model
choice and useful site context for official WordPress AI features. Those
questions are not declared solved merely because formatting is integrated.

## Source integration

| Repository | Merged PR | Integrated revision | Scope |
| --- | --- | --- | --- |
| Cloud | [924](https://github.com/npcink/npcink-ai-cloud/pull/924) | e80090233c6df47fee905b3cbac22a49bf3e67c3 | Protected-source engine and dependencies |
| Cloud | [925](https://github.com/npcink/npcink-ai-cloud/pull/925) | 86c00610b4a3de9e30b74127658f530090fd25cf | Signed no-store runtime and API tests |
| Addon | [141](https://github.com/npcink/npcink-cloud-addon/pull/141) | a9a0baf635fd03a5bec411721e5cf6d6da670035 | Transport, browser-harness isolation and compatibility |
| Toolbox | [141](https://github.com/npcink/npcink-workflow-toolbox/pull/141) | 68db923ee8d531b668852efa0e4117465334a85a | Editor validation, application and undo |
| Eval Lab | [63](https://github.com/npcink/npcink-eval-lab/pull/63) | 77207e778c3389be600ac5a4a3075355b11a084b | Offline checks and historical pilot evidence |

Cloud, Addon and Toolbox required PR checks passed before protected merges.
Eval-lab has no configured PR checks; its local offline gates are the evidence,
not an invented green CI result. Documentation publication follows this runtime
checkpoint and must not rewrite the runtime revision recorded here.

## Verification and corrections

- Cloud core: 62 domain tests and changed Python quality checks passed.
- Cloud runtime: 10 API tests, targeted Ruff/mypy and release-policy checks passed.
- Adjacent media runtime: four tests passed.
- M4 first regression run: 70 passed, two failed. Python 3.12 and 3.14 interpret
  malformed HTML declarations differently. Explicit declaration protection
  now preserves original bytes and returns REVIEW; the two failed cases passed
  on M4 after repair. The initially failing command is not described as green.
- Addon: composer test:all, metadata, WordPress.org guard, POT freshness and
  Playground activation/reconciliation smoke passed. Generated translations
  were refreshed using the existing tooling.
- Toolbox: composer test:all, metadata, WordPress.org, platform/fixed-button
  contracts and actual WordPress PHP validation passed. Contract tables were
  corrected to advertise v2 while retaining accepted v1 result compatibility.
- Eval-lab: composer test, 927-check/42-task self-check, formatting adversarial
  checks, paragraph self-test and library-only judge import passed. Inline code
  whitespace mutation is now independently rejected by the offline evaluator.

Post-promotion Site A used a disposable copy of article 2701: list/BR repairs,
protected block identities, exact candidate application, repeat stability,
undo/redo, late-response rejection and zero tool-triggered post writes passed.
Draft 281070 and temporary session were deleted; original 2701 stayed unchanged.
Its independent offline outcome checks passed 7/7.

Site B rich-text/table/code checks and offline 8/8 passed. Its first post-merge
browser run failed only at mobile sidebar geometry after earlier assertions
passed; draft 24 and session were still cleaned. Installed WordPress source
confirms entering a narrow viewport asynchronously closes the active sidebar.
The test must await that transition before reopening and inspecting the control;
do not use a larger arbitrary sleep or weaken the content assertions. Final
corrected browser run passed completely, including inspected mobile geometry;
draft 25 and temporary session were cleaned. The test-only correction is tracked
in [Toolbox PR 142](https://github.com/npcink/npcink-workflow-toolbox/pull/142).

The central matrix ran once: all five WordPress gates passed. Cloud initially
reported needs_validation while exact-master CI was pending. Preserve those
five results and rerun only the Cloud evidence check after CI completes; do not
manufacture a full green matrix by ignoring the pending entry.

## Runtime acceptance checkpoint

Clean stable operations worktree promoted PR 925 through the private source
relay. Runtime fingerprints matched; no image build or migration was required.
Status verified:

```text
acceptance_state=accepted
promotion_pr=925
source_branch=master
source_dirty=false
source_revision=86c00610b4a3de9e30b74127658f530090fd25cf
source_bundle_sha256=1fe528cc3425ca61e312172e8bbe80d1fff79c5f065cdd77b61cb8fbb01a2945
```

API/frontend/proxy and database health passed; migration remained
20260828_0082. This is M4 preview acceptance, not production deployment.
Any later master revision requires its own current status check.

## Reusable development rules

1. Convert the user's visible goal into editor acceptance criteria before coding.
   HTTP success or inserted spaces alone do not prove paragraph/list restoration.
2. Preserve text and assets independently at producer and consumer boundaries.
   Scores never override a failed integrity check or grant write authority.
3. Include real Gutenberg serialization, protected no-op, rich inline content,
   undo, late responses and the actual runtime Python version in verification.
4. Use disposable copies, lock test autosave and block writes; cleanup must run
   on failure and preserve original articles, credentials and operator sessions.
5. Keep historical plans visibly historical. Old two-step adoption, empty-node
   deletion, mandatory human scoring and model experiments are not current scope.
6. Separate source tests, PR CI, merged source, candidate M4 and accepted M4.
   Reuse successful sub-gates, but never label a partially failed run green.
7. Adopt open-source techniques selectively: text-node spacing from pangu-style
   rules, content/display separation from Heti, conservative sentence boundaries
   from prior projects. Do not import their unrelated deletion or CSS behavior.
8. For a single operator, stop when the useful workflow is reliable. More models,
   vectors, dashboards and samples need demonstrated benefit, not an existing plan.

## Remaining decisions and cleanup boundary

- Model pilot: 23 attempts, 16 successes, eight complete pairs, unresolved/error
  evidence retained. No winner has been established and no context-on/off benefit
  is proved. Reuse ignored artifacts offline before proposing more calls.
- User participation remains actual use and feedback. No mandatory scoring batch.
- New paid model/judge calls require a new bounded decision; third-party billing
  is not permission for retries or unlimited experiments. This closeout used zero.
- Nano and further semantic splitting remain paused; no automatic restart.
- Production requires separate explicit approval; it was not touched.
- Only exact task branches and the clean merged auxiliary worktree are cleanup
  targets. Keep stable M4 operations and unrelated root changes. Squash merge
  requires PR/head evidence plus content checks, not just git branch --merged.
- Root structural-remediation documentation and docs/history/architecture were
  unrelated dirty work and remain preserved. Do not report the entire machine
  or all remote branches as clean.

The historical summary and unified plan are archived with this record. The
task's final receipt records documentation integration, focused CI recheck and
verified cleanup after this checkpoint.

M4_OBSERVATION_RECEIPT date=2026-09-08; route=private-Tailscale-source-relay-with-Pgy-SSH; sync=not measured; focused=two-regressions-pytest-1.53s; promotion=not measured; operations=candidate-sync:2,promotion-sync:1,deploy:0; stable_502=not measured; m4_only=Python-parser-divergence-fixed; coordination=not occurred
