# Repository Hygiene Final Closeout and Development Lessons — 2026-08-18

Status: dated merged-source closeout and development retrospective.

Purpose: consolidate the repository branch/worktree cleanup completed on
2026-08-18, preserve the reasoning behind the final topology, and turn the
reusable engineering lessons into a short operating checklist. This document
is historical evidence; it does not authorize a future deletion, merge,
release, M4 operation, or production action. Re-inventory the live repository
before acting.

The active rules remain the
[Repository Stage-Transition Cleanup Standard](repository-stage-transition-cleanup-standard-v1.md),
[Single-Session Worktree Lifecycle](single-session-worktree-lifecycle-v1.md),
and [Repository Hygiene and Documentation Lifecycle Standard](repository-hygiene-and-documentation-lifecycle-standard-v1.md).

## 1. Final outcome

The cleanup reduced local repository topology without blindly merging
historical work or disturbing the production branch.

| Measure | Before | After | Interpretation |
| --- | ---: | ---: | --- |
| Registered worktrees | 66 | 2 | One development checkout plus the stable M4 operations checkout |
| Local branches | 213 | 3 | `master`, `production`, and one closeout topic branch |
| Remote branches | 513 | 9 | `master`, `production`, and seven open Dependabot branches |
| Manual-review candidates | not bounded | 0 | No unresolved cleanup candidate remained |
| Dirty retained worktrees | present in historical inventory | 0 | Dirty trees were archived before registration cleanup |
| Active merge/rebase/cherry-pick state | unknown during inventory | 0 | Final audit found no active Git operation |

The final retained checkouts are:

1. `/Users/muze/gitee/npcink-ai-cloud` —
   `codex/repository-hygiene-closeout-20260818`, clean and equal to the
   current `origin/master` revision `f6d0a0f2da33e9fdeeb86537e3533b64e7edf03f`.
2. `/Users/muze/gitee/.worktrees/npcink-ai-cloud-m4-ops` — `master`, clean,
   same revision, and retained because the repository policy gives the M4
   operations role a stable checkout.

The “three branches” target applies to human-controlled local branches. The
seven Dependabot branches are intentionally retained because they correspond
to open dependency-update PRs and must be reviewed on their own security and
compatibility merits.

## 2. What was merged, and what was not

The cleanup used protected merge evidence for the four completed documentation
and architecture batches:

- PR #795 — Site Knowledge search architecture;
- PR #796 — early product validation stop rules;
- PR #797 — repository stage-transition cleanup standard;
- PR #798 — production release feedback closeout.

Historical branches were not merged merely to make the graph look tidy. In
particular:

- production/release-fix history was deleted or archived after review; it was
  not replayed into `master` solely for ancestry alignment;
- the proposed PR #704 candidate was discarded because its closing evidence
  confirmed that PR #703 already contained the correct behavior;
- maintenance-readiness work was not re-merged because current `master`
  already contained the stronger implementation;
- three unrelated dirty worktrees were archived as complete directories
  rather than guessed into `master` without an owner and validation chain.

This is the central distinction: a branch can be historically important
without being a current integration candidate.

## 3. Preservation and rollback layers

Recoverability was established before local refs or worktree registrations were
removed:

- Git history bundle:
  `/Users/muze/gitee/.archives/npcink-ai-cloud-refs-before-cleanup-20260818.bundle`;
- dirty-worktree archive root:
  `/Users/muze/gitee/.archives/npcink-ai-cloud-dirty-worktrees-20260818`;
- verified tar archives for the Portal workspace, Site Knowledge
  auto-acceptance worktree, and the old M4/CI worktree;
- restrictive archive permissions (`700` directories, `600` files).

Raw archived directories were retained as an additional confidence window.
They total approximately 1 GiB and are a future retention decision, not an
automatic deletion target. The verified tar archives and Git bundle should be
kept even if raw copies are later removed.

The layers protect different failure modes:

1. Git refs and bundles protect commit history.
2. Whole-directory archives protect uncommitted, ignored, symlinked, and
   runtime-specific files.
3. Restrictive permissions reduce exposure of local operational evidence.
4. A dated receipt makes the decision and rollback location discoverable.

No single layer is sufficient for all four categories.

## 4. Reusable execution method

Future stage transitions should proceed in this order:

```text
fresh inventory
  -> identify owners and protected roles
  -> preserve dirty/detached evidence
  -> stabilize worktree registrations
  -> prove branch/PR disposition
  -> remove only exact reviewed local refs
  -> final audit against the target topology
  -> record the closeout receipt
```

### 4.1 Inventory before mutation

Record exact absolute paths, HEAD SHAs, branch/upstream state, tracked versus
untracked versus ignored data, locks, active Git operations, PR state, and
runtime role. `git status` proves only tracked state; it does not prove that a
clean worktree is disposable.

### 4.2 Worktrees before branches

Worktree registrations constrain branch deletion and reveal ownership. Remove
or archive exact worktrees first, then consolidate local refs. Never infer a
filesystem path from an internal worktree administration directory name.

### 4.3 Archive uncertainty instead of guessing

If a worktree is dirty, detached, damaged, or evidence-incomplete, archive the
entire exact directory and create a verified bundle before changing Git
registrations. Do not copy only tracked files: ignored databases, uploads,
fixtures, and operator evidence may be the valuable part.

### 4.4 Use exact-set gates

Before every mutating batch, compare the freshly observed candidate set with
the reviewed set. Abort on path, count, SHA, checksum, occupancy, or lock-state
mismatch. A protective abort is a successful safety result, not a failed
cleanup.

### 4.5 Keep evidence states separate

These states answer different questions and must not be collapsed:

| State | What it proves |
| --- | --- |
| Local verified | The current checkout passes its narrow gate |
| PR/CI verified | The proposed change passed protected repository checks |
| Merged into `master` | The integration branch contains the change |
| M4 candidate | A preview runtime exercised a candidate revision |
| M4 accepted | Clean current `master` promotion was accepted by M4 |
| Production validated | The production release path was exercised |
| Human accepted | A human/operator or user supplied the required acceptance |

The cleanup was a local and merged-source topology operation. It performed no
M4 build, deployment, production operation, or human-value trial.

## 5. Development lessons and corrections

### Lesson 1: ancestry is not merge proof

Squash and rebase merges can replace commit SHAs. Use merged PR evidence,
current integration SHA, and ancestry as separate facts. Never merge old
production history back into `master` just to make the graph symmetrical.

### Lesson 2: clean is not disposable

A Git-clean worktree can hold credentials, databases, uploads, build output,
or runtime evidence in ignored files. Track source cleanliness, ignored
capacity, process occupancy, ownership, and runtime role independently.

### Lesson 3: current-base freshness matters

A locally ready branch is only a builder receipt. Before publication, refresh
`origin/master`, re-check the expected file set, and rerun the changed seam.
The integration base may have advanced while a task waited.

### Lesson 4: classify names by evidence, not appearance

`.tmp`, `cache`, `old`, `release-fix`, and “merged-looking” names are review
signals only. Read consumers, PR state, ownership, and rollback evidence before
deciding whether an item is active, historical, rebuildable, or disposable.

### Lesson 5: separate Git cleanup from local-state cleanup

Branch/worktree consolidation and deletion of generated state have different
owners, risks, and rollback paths. Finish the Git topology first; retain a
confidence window before deciding whether raw archives or rebuildable caches
can be removed.

### Lesson 6: shell and parser details are part of the safety model

Use structured output and safe variable names in cleanup scripts. In
particular, avoid assigning to zsh’s special lowercase `path`, capture
`git worktree prune --dry-run` stderr, normalize checksum paths before
comparison, and avoid loose regexes that confuse `tracked` with `untracked`.

## 6. Ongoing branch and worktree policy

The recommended steady state is intentionally small:

- `master`: development integration and source truth;
- `production`: production source and release boundary;
- one `codex/*` branch: the active focused task or documentation closeout;
- one stable M4 operations worktree, checked out at `master`;
- at most one additional locked auxiliary task worktree when the primary
  checkout is dirty or owned by another task.

Additional branches or worktrees require a named owner, current purpose, and
explicit release condition. Dependabot branches are an exception to the human
branch count because open dependency PRs are external review work, not idle
local development lanes.

## 7. Closeout checklist

Before declaring a future cleanup complete, verify:

- [ ] `git status --short --branch` is clean in every retained checkout;
- [ ] the current `origin/master` revision was refreshed immediately before
      the final mutation;
- [ ] every removed worktree had exact path, owner, lock, occupancy, and data
      evidence;
- [ ] dirty/detached/evidence-incomplete work was archived and the archive was
      readable and verified;
- [ ] every deleted local branch had exact merged-PR or archival evidence;
- [ ] remote branches were left unchanged unless separately authorized;
- [ ] no merge, rebase, cherry-pick, revert, or sequencer operation remains;
- [ ] the final worktree/branch counts match the declared target;
- [ ] the receipt names residual archives, risks, rollback, and next owner.

## 8. Final receipt for this closeout

```text
REPOSITORY_HYGIENE_RECEIPT
- baseline/master: f6d0a0f2da33e9fdeeb86537e3533b64e7edf03f
- worktree/owner: primary development checkout plus stable M4 operations checkout
- candidates reviewed by lifecycle class: clean merged, dirty, detached, archival, and protected-role worktrees
- active authority retained: master, production, current standards, ADRs, and dated evidence
- historical evidence retained or moved: verified Git bundle plus full dirty-worktree archives
- commands/scripts removed and replacements: none in this closeout
- task contracts default/active/archived: unchanged
- local generated state removed or deferred: raw archive retention window remains; no new destructive cleanup
- focused local gates: documentation/index and repository-state audit
- PR/CI/merge evidence: PRs #795–#798 merged; final source equals origin/master
- M4/production/human evidence: not applicable; no M4 or production operation occurred
- residual risks and next review queue: decide raw archive retention after the confidence window; review seven Dependabot PRs independently
- rollback: restore from the verified Git bundle or dated whole-directory archives
- lane/worktree release: no active Git operation; two retained clean worktrees
```
