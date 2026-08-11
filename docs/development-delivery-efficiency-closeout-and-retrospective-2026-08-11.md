# Development and Delivery Efficiency Closeout and Retrospective — 2026-08-11

Status: time-bounded evidence for the repository state at 2026-08-11. This
document records completed work and remaining measurements; it is not current
release authorization.

## 1. Original Objective

The work began with user-visible defects and unexpectedly long delivery cycles:

- a seven-day login choice appeared to expire after about four hours;
- the WordPress addon Cloud authorization exchange did not return a valid
  connection key;
- bound-site visibility and active-site quota behavior needed a clearer model;
- bug-fix and production closeout appeared to take from more than one hour to
  several hours;
- image build, vulnerability scan, bundle transfer, image load, migration,
  cutover, health wait, and broad tests were being questioned as unconditional
  work.

The resulting engineering objective was to preserve the product and release
boundaries while shortening repeated feedback and delivery work. The intended
end state was not “skip safety”; it was “execute only the evidence and mutation
required for this revision.”

## 2. Completed Scope

The completed PR sequence was:

| PR | Result |
| --- | --- |
| `#620`–`#622` | added image scan evidence, content identity, and application-image reuse |
| `#626`–`#628` | added release planning, skipped unrelated bundles, and preserved the backend for frontend-only releases |
| `#629`–`#630` | separated M4 source sync from deploy and avoided unrelated Ollama restarts |
| `#631`–`#633` | added structured release timing, a fail-closed compatibility comparator, and parallel-phase timing |
| `#634` | allowed ordinary backend PRs to skip an unrelated complete frontend gate |
| `#635` | added focused contract selection for ordinary backend Python changes |

PR `#635` merged as `0a45a3865ecb92562b01a7844f69de99b4880aa8`.
Its selector follows static import closure, parent-package initialization,
exact source-path references, and five repository-wide scan contracts. Deleted,
renamed, unknown, unparseable, CI, selector, deploy, script, and contract
changes fail closed to the full contract suite.

A historical site-removal replay selected 13 of 77 contract files and ran 57
tests in 7.08 seconds. The selector-focused verification ran 27 tests. These
figures prove selection behavior, not total hosted-CI improvement.

## 3. Measured Evidence

### Production baseline

The compatible pre-optimization production baseline is successful `Deploy
Production` run `31364293862` at revision
`e1a5ed6148a9fdc788ec54518f4fcced8ea7b2e6`, using the `full/runtime` lane:

| Measure | Seconds |
| --- | ---: |
| Recorded non-duplicated total | 226 |
| Remote mutation sequence | 172 |
| Bundle | 11 |
| Transfer | 48 |
| Image load | 78 |
| Migration | 14 |
| Cutover | 50 |
| Health | 25 |

The phase values are diagnostic and may overlap outside the governed
non-duplicated total. The earlier description of “one hour and fifteen minutes”
mixed workflow, wait, and release activity; it was not the measured production
mutation baseline.

No successful post-optimization production run with the same compatible lane
and action has occurred. Therefore this retrospective does not claim measured
production acceleration.

### Backend CI history

| Sample | Structure and purpose | Result |
| --- | --- | --- |
| PR `#596`, run `31309002713` | historical two-shard ordinary login bug | total 5m26s; slowest contract shard 4m47s; impacted 3m15s |
| PR `#613`, run `31370223095` | historical two-shard site-removal bug | total 11m21s; impacted 10m33s |
| PR `#635`, run `31452867978` | current three-shard selector control | total 4m33s; selector change correctly forced full-contract fallback |
| merged `master` for `#635` | current aggregate authority | full required gate 19m20s |

The two-shard and three-shard executed job sets are incompatible. The governed
comparator correctly rejects an exact comparison with `executed GitHub Actions
job sets do not match`. PR `#635` is a current-structure full-contract control,
not a natural focused-selection after-sample.

The next naturally occurring ordinary backend PR is the valid candidate for
measuring PR critical-path improvement. PR `#613` also shows that accelerating
contract selection alone may not improve total time when impacted tests become
the critical path.

## 4. Problems Found, Root Causes, and Corrections

| Severity | Problem | Root cause | Correction |
| --- | --- | --- | --- |
| High | End-to-end waiting and production mutation were described as one release duration | evidence states and clocks were not separated | require phase receipts and separate feedback, closeout, queue, approval, and mutation time |
| High | Repeating every release phase was treated as the safe default | release behavior was a fixed ritual rather than a change-derived plan | use a fail-closed release plan for artifact, migration, cutover, and smoke decisions |
| High | PR `#635` initially added the CI selector to the production release-policy `require_file` list | a CI implementation detail was coupled to production policy authority | removed that coupling; keep CI selector contracts in the CI seam |
| Medium | Focused local tests did not expose an isolation-fixture problem caught by GitHub | local selection evidence was narrower than the aggregate required-check environment | retain the narrow loop but require GitHub checks before merge; add representative fallback contracts |
| Medium | Historical two-shard and current three-shard receipts could be mistaken for comparable speed samples | elapsed time was considered before workflow identity | keep the comparator fail closed and label incompatible runs as context only |
| Medium | A macOS Bash 3.2 shell lacks `mapfile`; one local command consequently invoked pytest without intended focused arguments | a shell feature assumption escaped the script's supported environment | the run was stopped and excluded from evidence; scripts must use the repository-supported shell subset or explicit runtime |
| Medium | Multiple consecutive optimization PRs incurred their own CI, review, and merge cost | improvements were decomposed safely but had an up-front delivery cost | stop broad work after the current mechanisms; continue only from measured natural bottlenecks |
| Low | “Smoke locally, so why smoke after release?” treated smoke as duplicated coverage | environment-specific assertions were not distinguished | define local, M4, and production smoke by the unique mutation and consumer each proves |

## 5. What Worked Well

- Required GitHub check names and protected-branch authority were preserved.
- Ambiguous selector inputs and timing comparisons fail closed instead of
  silently producing optimistic results.
- Image reuse is bound to digest and evidence identity rather than a mutable
  tag or filename.
- The release plan skips work by proved state and change scope, not by manual
  assumption.
- M4 sync and deploy now answer different questions; ordinary source changes
  need not rebuild images or restart unrelated services.
- CI-only work was not presented as M4 or production validation.
- Timing receipts make transfer, load, migration, cutover, and health costs
  visible enough to optimize the actual bottleneck.
- The process paused before manufacturing a production release or dummy backend
  PR merely to obtain a favorable measurement.

## 6. Self-Criticism

The largest reasoning error was accepting the user's wall-clock impression as
one technical duration before decomposing it. That made the early discussion
less precise and risked optimizing the wrong segment. The correct first step is
always to identify the evidence state, start/end timestamps, queueing, operator
wait, and mutation phases.

The first PR `#635` CI failure also showed insufficient boundary discipline:
the production policy was modified to watch a CI selector because both were
“important files.” Importance is not ownership. The production policy should
guard production authority; the CI contracts should guard selection safety.
The correction was small, but the lesson is durable.

Finally, local focused success was given too much confidence before the hosted
aggregate gate ran. Focused tests should remain the fast inner loop, but their
claim must stay narrow. They do not replace the required-check environment,
especially for fixture isolation and repository-wide contract discovery.

## 7. Current Benefit and Whether to Continue

The structural benefit is already real:

- unchanged artifacts can reuse build and vulnerability evidence;
- targets can skip artifact transfer and loading when the digest exists;
- migrations, cutovers, and service health waits are selected by the release
  plan;
- frontend-only and ordinary source paths avoid unrelated backend or M4 work;
- ordinary backend contract selection is ready to reduce PR feedback when a
  natural eligible change occurs;
- phase timing and compatibility rules prevent misleading optimization claims.

The exact production and ordinary-backend wall-clock benefit is not yet
measured with compatible after-samples. Further broad optimization is therefore
not justified now. The correct next action is observation, not another chain of
infrastructure PRs.

Continue only under these triggers:

1. compare the next natural ordinary backend PR with current-structure
   compatible evidence;
2. compare the next separately authorized `full/runtime` production release
   with run `31364293862`;
3. retain the mechanisms if the gain is material and selection remains
   accurate;
4. if the critical path moves to one impacted test or fixture, optimize that
   hotspot only;
5. simplify or revert a mechanism if fallback frequency, mis-selection, or
   maintenance cost outweighs the measured gain.

Decision guides are recorded in the
[Development and Delivery Efficiency Standard](development-delivery-efficiency-standard-v1.md):
more than two minutes or 25 percent for an ordinary backend PR is material;
more than 60–90 seconds for a compatible production full/runtime release is
material; less than 30 seconds of production gain normally does not justify
additional release complexity.

## 8. Evidence Locations and Limitations

Local replay receipts used during this investigation are outside the
repository and remain machine-local evidence:

- `/Users/muze/.codex/evidence/npcink-ai-cloud/release-timing/backend-pr-596-31309002713.json`
- `/Users/muze/.codex/evidence/npcink-ai-cloud/release-timing/backend-pr-613-31370223095.json`
- `/Users/muze/.codex/evidence/npcink-ai-cloud/release-timing/current-structure-pr-635-31452867978.json`

They should not be treated as portable repository authority. GitHub run and PR
identities above are the durable lookup keys. Exact human working time was not
inferred from logs.

## 9. Final Closeout State

The implementation sequence through PR `#635` is merged into `master`. This
documentation task closes the learning and governance gap; it does not run M4,
deploy production, or alter Cloud/WordPress ownership.

Remaining observation work is intentionally open:

- one natural ordinary backend PR on the current workflow structure;
- one separately authorized compatible production `full/runtime` release.

Until those samples exist, report projected mechanisms and measured baselines,
not realized speedup.
