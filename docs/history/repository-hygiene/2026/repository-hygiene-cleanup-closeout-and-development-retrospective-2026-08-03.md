# Repository Hygiene Cleanup Closeout and Development Retrospective - 2026-08-03

Status: merged-source closeout and historical development retrospective.

Purpose: record the evidence, mistakes, corrections, and reusable method from
the documentation, deprecated Mini Preview, and anti-drift task-contract cleanup
completed on 2026-08-03. This is not current M4, production, or human-acceptance
evidence.

The durable procedure extracted from this work is the
[Repository Hygiene and Documentation Lifecycle Standard](../../../repository-hygiene-and-documentation-lifecycle-standard-v1.md).

## 1. Original Goal and Constraints

The task was to identify expired documentation, unused code or folders, and
safe cleanup opportunities based on the actual repository rather than names
alone.

The initial conditions constrained execution:

- the visible checkout was dirty and owned by unrelated Admin work;
- a large CommercialRepository split owned a hot code and merge lane;
- M4 was a separate shared-runtime lane and was not needed for repository
  policy/documentation work;
- historical ADRs, migrations, negative guards, and dated evidence could look
  obsolete while still carrying unique authority or traceability;
- ignored local state was large but potentially in use by active worktrees.

The response was therefore read-only first, followed by isolated locked
worktrees and sequential admission after the split finished.

## 2. Baseline Classification

The documentation baseline contained 309 tracked Markdown files. Of these, 250
had an early status marker and 59 required further classification. These counts
were used as an inventory snapshot, not a deletion quota.

The audit separated candidates into:

- active boundaries, standards, runbooks, and current plans;
- dated closeout, validation, trial, audit, and retrospective evidence;
- retired negative guards and legacy snapshots;
- deprecated engineering commands with governed replacements;
- a completed root task contract that still controlled anti-drift discovery;
- ignored, regenerable local state requiring a separate destructive decision.

## 3. Delivered Batches

| Batch | Merged evidence | Result |
| --- | --- | --- |
| Documentation information architecture | [PR #502](https://github.com/npcink/npcink-ai-cloud/pull/502), merge `185881e3` | Reduced the root README from 1,838 to 288 lines and added `docs/README.md`; the README diff removed 1,760 lines and added 210 before the later contract repair. |
| README contract repair | [PR #504](https://github.com/npcink/npcink-ai-cloud/pull/504), merge `ef76a557` | Restored 48 compact lines containing required release, M4, target-refactor, negative-boundary, environment, timeout, and provider-operation anchors. |
| Deprecated Mini Preview retirement | [PR #505](https://github.com/npcink/npcink-ai-cloud/pull/505), merge `3c68cc09` | Removed nine deprecated package commands and four dedicated scripts while retaining `mini:deploy` and governed `m4:preview:*` paths; the batch deleted 817 lines and left 138 active inventoried commands. |
| Anti-drift contract lifecycle | [PR #506](https://github.com/npcink/npcink-ai-cloud/pull/506), merge `4a340f22` | Added a durable default contract, archived the unchanged dated release-readiness contract, made selection deterministic and observable, and made multiple root contracts fail closed. |

The first Mini Preview publication attempt, [PR #503](https://github.com/npcink/npcink-ai-cloud/pull/503), was closed rather than hidden or force-described as successful. PR #505 is the merged replacement.

## 4. What Was Deliberately Retained

- ADRs and historical migrations remain append-only decision/schema evidence.
- `docs/cloud-task-pack-boundary-v1.md` remains a retired negative guard against
  reintroducing public Task Pack surfaces.
- dated closeout and validation records remain evidence, not current authority.
- `docs/legacy-contracts/**` remains reference-only historical material.
- `mini:deploy`, M4 preview commands, and dated projection-drill evidence remain
  because they have distinct governed purposes.
- the archived 2026-07-06 task contract remains byte-for-byte historical
  evidence under `docs/history/`.

No cache, dependency directory, virtual environment, build output, M4 runtime,
or production environment was removed or mutated in these Git batches.

## 5. Problems, Root Causes, and Corrections

### 5.1 README was treated as prose before being treated as an interface

The initial documentation batch made the README substantially clearer, but the
local validation did not run the full README consumer-contract set before
publication. The first Mini Preview CI run then exposed 11 failures caused by
required markers that PR #502 had removed.

Root cause: the cleanup inspected documentation content and release policy too
late, instead of first enumerating every script and test that consumed README
phrases as a machine interface.

Correction: PR #504 restored the smallest required contract surface rather than
restoring the old 1,838-line README. Future README changes must inspect policy
implementations and run focused contract tests before a dependent PR is
published.

### 5.2 A locally ready branch was not yet an integrated candidate

The Mini Preview cleanup was prepared while another large split was active. By
the time it could publish, `master` had changed through the documentation batch.
The original PR #503 was closed and replaced with PR #505 after rebasing and
branch recreation.

Root cause: local-ready evidence was correctly preserved, but its handoff did
not itself guarantee compatibility with the later integrated README and current
base.

Correction: treat local-ready as a builder receipt only. Refresh
`origin/master`, rebase or recreate the candidate, and rerun the changed seam
before entering the serialized PR/merge lane.

### 5.3 A completed task contract was silently acting as global configuration

The dated root release-readiness JSON was historically valid but still matched
the checker's automatic discovery rule. It therefore supplied unrelated future
tasks with stale truth-owner text, operator notes, and required gates.

Root cause: one file combined two lifecycles: temporary task evidence and
durable repository default configuration.

Correction: PR #506 introduced a generic default under `config/`, preserved the
dated file under `docs/history/`, made explicit selection highest priority, and
made multiple active root contracts fail closed.

### 5.4 Declared gates were not checked against executable commands

The first PR #506 revision copied historical `pnpm run check:risk` text into the
new default even though `package.json` exposed no such command. Automated review
identified that the checker could claim success while naming an impossible
closeout gate.

Root cause: the implementation validated the presence of a gate string, not
whether the selected durable default referred to a real command.

Correction: commit `b2bd892c` made the default use the available
`pnpm run check:fast` gate, kept historical names compatible for old explicit
contracts, and added executable-seam regression coverage. The review thread was
answered and resolved before merge.

## 6. What Worked Well

- The initial audit classified by references, Git history, lifecycle,
  replacement, and ownership instead of deleting by filename or age.
- Dirty shared work was protected with isolated locked worktrees and exact-file
  staging; no reset, stash, broad add, or overwrite was used.
- Conflict domain, merge lane, and M4 ownership stayed separate. Cleanup waited
  for the CommercialRepository split without occupying shared runtime.
- Command retirement removed aliases, scripts, inventory metadata, and tests in
  one coherent batch while preserving governed replacements.
- CI and automated review were treated as evidence and feedback. Valid criticism
  produced a code/test correction instead of a waiver.
- Local, merged-source, M4, production, and human evidence were reported as
  distinct states.

## 7. Work Review Report

### Original objective

Safely reduce obsolete repository burden, preserve active and historical
authority, publish the resulting changes, and extract a repeatable engineering
method.

### Completion

- [x] Established a documentation lifecycle index and concise repository entry.
- [x] Removed proved-deprecated Mini Preview commands and scripts.
- [x] Separated durable anti-drift defaults from historical task evidence.
- [x] Preserved dirty parallel work, negative guards, ADRs, migrations, and M4.
- [x] Merged all four corrective batches into `master` with protected CI.
- [ ] Removed ignored local build/cache state. This was deliberately deferred
  because active worktree/process ownership was not clear enough for destructive
  cleanup.

### Problems found

| Severity | Concrete problem | Root cause | Improvement |
| --- | --- | --- | --- |
| Must correct | PR #502 removed README markers consumed by 11 contract tests. | Machine consumers were not inventoried before simplifying the human-facing entry point. | Treat README/index files as interfaces; run consumer searches and focused contracts first. |
| Must correct | The first default contract in PR #506 named unavailable `check:risk`. | A historical declaration was copied without resolving it against current executable commands. | Validate every durable `required_gate` against package inventory or a documented executable procedure. |
| Should correct | PR #503 had to be closed and replaced after the integration base changed. | Local-ready and current-base PR-ready states were not sufficiently separated in the publication sequence. | Refresh/rebase/revalidate every queued batch immediately before PR publication. |
| Suggested improvement | Approximately 2 GB of regenerable local state remains. | Destructive local cleanup was correctly withheld while ownership was uncertain. | Run a separate owner-aware local-state cleanup only after active tasks release their directories. |

### What went well

- Every discovered mistake was made visible, corrected, tested, and preserved in
  the PR history.
- The final repository is smaller without losing historical or negative-boundary
  evidence.
- No cleanup claim was promoted into M4, production, or human acceptance.

### Focus next time

- Inventory machine consumers before editing documentation entry points.
- Resolve declared gates to real commands before treating configuration as
  durable authority.
- Revalidate local-ready work against current `origin/master` immediately before
  publication.
- Keep Git hygiene and destructive local cache cleanup as separate decisions.

## 8. Final Evidence State

The highest evidence state for this cleanup is merged into `master` at
`4a340f228bcd0268ed7db74dd6915e39ee3b1f9e` through PR #506, with the earlier
batches merged through PRs #502, #504, and #505. PR #506 finished with 12
successful checks and five classification-based skips after the review fix.

M4 candidate, M4 acceptance, production validation, and human acceptance were
not applicable or not measured for these repository-only changes.

## 9. Follow-up Queue

1. Apply the lifecycle standard to the bounded review queue already recorded in
   `docs/README.md`; do not bulk-move the remaining 59 unclassified-status files.
2. Add a durable tracked Markdown-link command only if repeated documentation
   batches prove the ad hoc path scan is insufficient.
3. Review ignored local state after active task owners release it; use exact
   paths and pre/post evidence, with no Git changes.
4. Periodically verify that no completed root task contract or retired command
   has regained implicit authority.
