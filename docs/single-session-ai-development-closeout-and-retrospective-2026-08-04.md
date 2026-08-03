# Single-Session AI Development Closeout and Retrospective

Status: time-bounded closeout evidence and implementation guidance.

Date: 2026-08-04.

This record closes the repository-governance change that made one active AI
development session the default for Npcink AI Cloud. It explains the evidence,
trade-offs, review corrections, and working method that should guide the next
development tasks.

This file is not a new source of runtime, product, M4, or release authority.
Current normative rules remain in:

- [Development and Validation Operating Model](development-validation-operating-model-v1.md);
- [Single-Session Worktree Lifecycle](single-session-worktree-lifecycle-v1.md);
- [AI Development Validation Tiers](ai-development-validation-tiers-v1.md);
- [M4 Preview AI Development Standard](m4-preview-ai-development-standard-v1.md);
- [Parallel AI Collaboration Standard](parallel-ai-collaboration-standard-v1.md),
  only after the operator explicitly enables multi-session work.

## 1. Outcome

Pull request [#510](https://github.com/npcink/npcink-ai-cloud/pull/510),
`chore: streamline single-session AI development`, merged into `master` as
`01a6e26b897b73106b8efa53a5fb64ed8032be50`.

The repository now has one simpler default path:

```text
one admitted task
  -> one active AI session
  -> one clean locked task worktree when isolation is needed
  -> changed-file plan
  -> narrow local verification
  -> focused commit and protected PR
  -> merge
  -> clean worktree closeout
```

Parallel AI work was not deleted. It was changed from an assumed baseline into
an explicit exception that requires an operator declaration, disjoint ownership,
and the existing coordination standard. This matches the actual capacity of a
single active session while retaining a governed escape hatch for genuinely
independent work.

## 2. Problem That Was Solved

The earlier guidance preserved many rules needed for concurrent builders,
integrators, shared M4 ownership, and handoffs. Those rules were individually
reasonable, but applying them to every task imposed a coordination graph that
did not exist when only one AI session could run at a time.

The resulting costs were:

- session startup required reasoning about inactive parallel lanes;
- task completion was obscured by worktree and ownership bookkeeping;
- broad validation was easier to select than the exact gate for the changed
  seam;
- old worktrees accumulated because inventory and deletion were not clearly
  separated;
- the difference between local completion, PR completion, M4 acceptance, and
  production release could be lost in a generic claim of "done".

The main design conclusion is that process complexity should be proportional
to real concurrency and real risk. Rules for a capacity that is not currently
available must not dominate the common path.

## 3. Implemented Changes

PR #510 made four related changes.

### 3.1 Single-session became the default

Repository entry points now direct normal work through one focused session and
one admitted module. Parallel rules apply only when the operator explicitly
declares a multi-session queue.

This is a default, not a claim that parallel development is always wrong.
Parallelism is appropriate when work is demonstrably independent and the
additional ownership and integration cost is lower than the time saved.

### 3.2 Changed-file verification became the inner-loop router

`pnpm run check:changed -- --plan` classifies the current change without
executing gates. `pnpm run check:changed` runs focused local checks and reports
runtime or browser follow-ups separately.

The router intentionally does not mutate M4, production, Cloudflare, provider
budgets, or other external systems. It reduces command-selection effort; it
does not replace engineering judgment, GitHub required checks, M4 acceptance,
or human browser verification.

### 3.3 Worktree inventory became read-only by default

`pnpm run worktree:audit` reports current, protected, and manual-review
worktrees without unlocking, pruning, or removing anything. The initial audit
snapshot contained 193 registered worktrees: one current, 66 protected, and
126 requiring manual review. Those numbers are historical evidence, not a
cleanup target or current inventory.

The durable rule is:

> Inventory is safe automation. Deletion is a separate, evidence-bearing
> operation.

### 3.4 Worktree closeout received an explicit lifecycle

The lifecycle standard now distinguishes:

- no-deliverable closeout;
- merged and clean closeout;
- retained work requiring a handoff;
- stale-lock recovery with ownership evidence.

A worktree lock protects authoring state from cleanup. It does not confer M4
ownership, prove task activity, or authorize removal of another worktree.

## 4. Review Corrections and Their General Lessons

Automated review of the first implementation found five correctness gaps. All
were fixed in follow-up commit `afc7350129f38982ab47bbc04147fbd65ab5d892`
before merge.

| Review correction | General lesson |
| --- | --- |
| Include deleted files in changed-path collection | A change classifier must model removal as a first-class change; deleted contracts and tests can be the highest-risk diff. |
| Recognize every M4 build/runtime fingerprint input | A convenience router must derive from the authoritative fingerprint contract instead of maintaining an optimistic subset. |
| Route migrations through source sync while adding migration evidence | Risk level and transfer mechanism are separate dimensions; high-risk does not automatically mean image rebuild. |
| Check whitespace across merge-base, staged, and working-tree ranges | A gate must cover committed topic work and uncommitted edits, not only the easiest Git diff. |
| Execute changed Vitest tests rather than only type-checking them | Discovering a test file is not evidence that its assertions ran. |

These corrections expose a broader standard for developer tooling:

1. define the complete input set before optimizing selection;
2. keep classification, execution, and external mutation as separate steps;
3. test negative transitions such as deletion and invalidation;
4. treat the plan output as inspectable evidence;
5. require the selected gate to execute the behavior implied by its label.

Developer tooling is production-like policy code even when it runs only on a
workstation. A fast but incomplete router can create more false confidence
than running no router at all.

## 5. Standard Working Method

### 5.1 Admit one task

State the focused module, desired outcome, non-goals, public contracts, expected
files, forbidden areas, verification gates, external systems that must remain
unchanged, and rollback. Do not admit a second unrelated module merely because
the first task has a waiting step.

### 5.2 Preserve and isolate

Start with `git status --short --branch`. Use the current checkout only when it
is clean, current, and belongs to the task. Otherwise create one clean locked
`codex/*` worktree from current `origin/master`. Never reset, stash, broadly
stage, or overwrite user work to manufacture a clean tree.

### 5.3 Select evidence from the changed seam

Inspect the plan first when the correct command is not obvious:

```bash
pnpm run check:changed -- --plan
pnpm run check:changed
```

Add a broader gate only when it answers a distinct risk question. A docs-only
change normally stops at document links, formatting, policy contracts, and
protected CI. Cloud runtime work follows the M4 standard after its narrow local
gate. Production remains a separate operator-approved flow.

### 5.4 Publish one coherent revision

Before staging, inspect status and diff statistics. Stage exact task files,
verify the staged file list, commit one coherent change, and publish with:

```bash
pnpm run pr:publish -- --title "<title>" --body-file <path>
```

Required review and CI are part of the implementation loop. Actionable review
comments must be fixed or explicitly dispositioned; resolving a thread is not
a substitute for fixing its underlying issue.

### 5.5 Report the highest evidenced state

Keep these states distinct:

```text
local verified
  != PR verified
  != merged into master
  != M4 candidate validated
  != M4 accepted
  != production validated
  != human accepted
```

For documentation and local tooling, M4 is normally not applicable. Absence of
an M4 action is correct when runtime behavior did not change.

### 5.6 Close only owned state

After merge, confirm the exact PR and merge commit, fetch current
`origin/master`, confirm the task worktree is clean, then unlock and remove
only that exact worktree without force. Do not delete branches or touch other
worktrees as an incidental cleanup step.

## 6. When Parallel Work Is Worth Its Cost

Do not enable multiple sessions merely because several ideas exist. Enable
parallel work only when all of the following can be named before work starts:

- two or more bounded tasks are independently valuable;
- conflict domains and expected files are disjoint;
- one integration owner controls the protected merge lane;
- one owner controls shared M4 mutation when runtime evidence is required;
- handoff receipts and stop conditions are explicit;
- the saved elapsed time is expected to exceed coordination and merge cost.

If these conditions cannot be stated, keep one session and sequence the work.
The single-session default lowers complexity by removing inactive roles,
queues, locks, and handoffs from the common path; it does not lower code review,
test, security, or release requirements.

## 7. Efficiency Measurement Plan

Do not continue refactoring the development process based only on the apparent
cleanliness of this document. Exercise the new default on three to five real,
representative tasks and record:

- time from task admission to first source edit;
- time from edit to the first useful failing or passing gate;
- number of commands selected manually versus by `check:changed`;
- duplicated full-suite executions for the same revision;
- review findings caused by a missed local classification;
- number of new, closed, retained, and unexplained worktrees;
- wait time caused by GitHub, M4, browser access, or real shared ownership;
- highest evidence state reached at closeout.

Interpret the observations before changing the model:

- repeated missed seams mean the router or its contract tests need correction;
- frequent manual extra gates may indicate a missing classification;
- growing unexplained worktrees indicate lifecycle non-compliance, not a need
  for automatic deletion;
- sustained queueing on independent tasks may justify explicit parallel mode;
- queueing on the same conflict domain or shared runtime does not become safe
  merely by adding more sessions.

Do not manufacture test runs, M4 activity, or worktree cleanup solely to make
the metrics look complete.

## 8. Closeout Receipt

- Source baseline: `origin/master` at `7bf68292` when the implementation branch
  was created.
- Initial implementation commit: `bb9f838c866edc067e3f07ac35e462951c6e2723`.
- Review-hardening commit: `afc7350129f38982ab47bbc04147fbd65ab5d892`.
- Pull request: [#510](https://github.com/npcink/npcink-ai-cloud/pull/510).
- Merge state: merged into `master`.
- Merge commit: `01a6e26b897b73106b8efa53a5fb64ed8032be50`.
- Verification: focused tooling contracts, release-policy contracts, required
  GitHub checks, and review-thread closure passed before merge.
- M4: not applicable; the change affected repository policy and local tooling,
  not Cloud source or runtime behavior.
- Production: unchanged and unvalidated by this work.
- Original dirty checkout: preserved; unrelated Admin UI work was not staged,
  reset, stashed, or modified by the implementation.

## 9. Rollback and Next Step

The repository-level change can be rolled back with a reviewed revert of PR
#510. A partial rollback should preserve the safety properties added during
review: deletion-aware diffs, complete M4 fingerprint classification, migration
evidence, all relevant Git ranges, and actual execution of changed tests.

The next step is observation, not another governance refactor. Use the standard
on three to five real tasks, collect the measurements in Section 7, and revise
only the rule or command that a repeated, evidenced failure shows to be wrong.
