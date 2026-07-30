# Parallel AI Collaboration Standard v1

Status: active repository policy.

Purpose: allow several AI sessions to investigate and implement independent
Cloud work without mixing source ownership, repeatedly invalidating protected
merge checks, or overwriting the shared M4 candidate. This standard applies
whenever two or more human or AI sessions are active against this repository.
The task-worktree lifecycle rule in Section 4.1 also applies when a single AI
session creates an auxiliary linked worktree.

This document governs coordination only. It does not change Cloud product
ownership, GitHub branch protection, M4 acceptance authority, production
approval, or the requirement to preserve user work.

## 1. The Three Uniques

Parallel work is governed by three mandatory uniqueness rules.

| Unique owner | Rule | What may still happen in parallel |
| --- | --- | --- |
| Conflict-domain implementation owner | One session owns edits to one high-conflict scope at a time. | Read-only investigation, review, and edits to clearly disjoint scopes. |
| Protected merge-lane owner | One human-authored change PR from the active sessions enters final required checks and auto-merge at a time. | Local work, draft preparation, and read-only review for later changes. |
| Shared-runtime operation owner | One session owns M4 or another shared stateful validation environment at a time. | Local/static checks and non-interfering read-only diagnostics. |

These rules intentionally do not serialize the whole repository. They
serialize only the places where parallel execution destroys evidence or makes
ownership ambiguous.

## 2. Conflict Domains

A conflict domain is broader than a single file. It includes files and state
that must change coherently. Treat the following as high-conflict domains:

- the same route, page, service, repository, workflow, or shared primitive;
- the same API, DTO, database, migration-head, or cross-repository contract;
- `AGENTS.md`, release policy, CI classification, PR publishing, Docker,
  Compose, proxy, deployment, and M4 governance;
- generated artifacts whose source inputs overlap;
- a shared browser fixture, database record, provider budget, or runtime
  candidate when the validation mutates state.

Two sessions editing different files are still in conflict when one change
alters a contract consumed by the other. Two sessions may edit the same broad
module only when their file sets and contracts are demonstrably independent
and both owners record that boundary before editing.

Database migrations are always a high-conflict domain. Only one active
migration owner may allocate the next revision or validate it on shared M4.

## 3. Required Session Declaration

After the normal `AGENTS.md` startup checks and before editing, each active
session must report this compact declaration in its task commentary or
handoff:

```text
Parallel coordination
- conflict-domain owner: <scope or read-only>
- branch/worktree: <branch and absolute worktree>
- expected files/contracts: <bounded list>
- merge lane: not requested | requested | held
- shared runtime: none | requested | held for <candidate/revision>
- dependencies or known peer owners: <tasks/PRs/scopes>
```

This declaration is coordination evidence, not conflict-domain authority by
itself. The Git worktree lifecycle lock required by Section 4.1 protects a
task worktree from accidental pruning, moving, or removal, but it also does not
grant edit, merge-lane, or shared-runtime ownership. Do not add a mutable
ownership registry, background daemon, Git hook, or second deployment
controller to the repository. Ad hoc local lock files are not authority.

Use this authority order when declarations disagree:

1. an explicit current operator assignment;
2. an acknowledged ownership handoff;
3. an established owner with coherent source, PR, or shared-runtime evidence;
4. a new unopposed session declaration.

A new declaration cannot seize an established scope or runtime. If two
sessions appear to claim the same ownership without a clear authority, both
remain or return to read-only work until the operator or an acknowledged
handoff selects the owner.

When the available task list does not reveal the other owners, inspect the
repository and continue only in a clearly disjoint scope. If ownership remains
ambiguous, stay read-only and ask the operator or current owner to resolve it.

## 4. Startup and Refresh Checks

At session start:

1. run `git status --short --branch`;
2. read `README.md`, `AGENTS.md`, this standard, and the relevant boundary;
3. inspect `git worktree list --porcelain`;
4. fetch `origin` when current integration state matters;
5. inspect open human-authored PRs and available active-task ownership;
6. use a clean isolated `codex/*` worktree when the visible checkout is dirty,
   stale, or owned by another task;
7. immediately lock any worktree created by the session as specified in
   Section 4.1;
8. publish the required coordination declaration and change envelope.

Refresh the ownership and baseline check:

- before editing a newly discovered shared contract;
- before allocating a migration revision;
- before publishing or updating a PR;
- before any M4 mutation or stateful shared-environment test;
- after another active PR merges;
- before reporting completion or handing work to another session.

Do not reset, stash, switch, overwrite, or broadly stage another session's
work to create a clean baseline.

### 4.1 Task Worktree Lifecycle Lock

Whenever an AI session creates an auxiliary linked worktree, it MUST lock that
worktree immediately after `git worktree add` succeeds:

```bash
git worktree lock \
  --reason "codex:<task-id>" \
  <absolute-worktree-path>
git worktree list --porcelain
```

`<task-id>` MUST be the stable task identifier supplied by Codex or the
orchestrator. When no system identifier is exposed, use one unique task
identifier declared in the session's coordination record and keep it unchanged
through handoff and closeout. The reason MUST use the exact
`codex:<task-id>` form and MUST NOT contain secrets, credentials, customer
content, or prompts.

The session MUST verify that the target entry contains
`locked codex:<task-id>` before editing. This common-Git-directory metadata is
the durable lifecycle marker; a worktree's path, branch name, directory
modification time, or apparent age is not ownership or cleanup evidence.

The lock prevents accidental cleanup of an in-flight task. It does not replace
the Three Uniques, prove that a session is still running, reserve the merge
lane, or authorize a shared-runtime mutation. Existing long-lived main and
operations worktrees are outside this create-and-lock action unless a task
created them as auxiliary worktrees.

For normal closeout, keep the worktree locked until all of the following are
true:

1. the task has ended and its handoff evidence is recorded;
2. the task PR is confirmed merged, using PR state rather than ancestry alone
   because protected squash or rebase merge may replace topic commits;
3. the worktree is clean and contains no unpreserved task output.

Only then may the owner or an acknowledged cleanup session run:

```bash
git worktree unlock <absolute-worktree-path>
```

Unlocking and removing are separate operations. After unlock, inspect
`git worktree list --porcelain` again; remove only the exact clean auxiliary
worktree and delete its topic branch only under the repository's post-merge
cleanup policy.

If a task produced no commit or PR, merge confirmation is not applicable. The
worktree may be unlocked only after verifying that it is clean, has no unique
commit or untracked deliverable, and the no-deliverable closeout is recorded.
An unmerged, closed, abandoned, interrupted, or handed-off task remains locked;
a handoff keeps the same task ID. Do not unlock because the path looks old or
its modification time is stale.

For suspected stale-lock recovery, first inspect the exact worktree status,
branch, unique commits, PR state, recorded task ID, and available session or
handoff evidence. Preserve or transfer any recoverable work. Only the recorded
owner, an acknowledged successor, or an operator may authorize unlock after
that inventory; do not use a forced remove or unlock as a discovery mechanism.

## 5. Unique Conflict-Domain Owner

The implementation owner is accountable for the coherent diff and its
verification. Other sessions may:

- investigate and send evidence to the owner;
- review the owner's diff;
- work in a separate conflict domain and isolated worktree;
- prepare a proposal without editing owned source.

Other sessions must not independently fix, refactor, format, or stage files in
the owned conflict domain. A reviewer finding a required change sends it to
the owner unless ownership is explicitly transferred.

Ownership transfer requires a handoff that identifies:

- current branch, worktree, and revision;
- dirty or untracked files that must be preserved;
- completed and failing gates;
- open PR and CI state;
- M4 candidate or lock state, if any;
- the exact next safe action.

The receiving session must acknowledge the handoff before editing. The prior
owner then stops mutating that domain.

## 6. Unique Protected Merge Lane

The merge lane starts when a human-authored change from the active sessions is
ready to publish or update for final required checks. It ends when that PR is
merged, closed, or deliberately withdrawn from the lane.

Before reporting `merge lane: held`, inspect open human-authored PRs and active
task declarations. An existing merge-ready PR with required checks or
auto-merge requested is the current holder unless the operator explicitly
changes the order.

While the lane is held:

- other sessions may continue disjoint local work;
- other sessions do not publish another merge-ready human PR or request its
  auto-merge;
- dependent sessions wait for the owning PR to merge, then rebase or recreate
  their clean baseline from current `origin/master`;
- the lane owner monitors required checks and resolves failures on the same
  branch without bypassing protection.

Draft proposals and bot-authored dependency PRs do not automatically own the
human merge lane. An operator may explicitly place one in the lane when its
merge timing affects active work.

If `master` advances while checks run, do not treat the old green revision as
current. Fetch, inspect the delta, update the branch using the repository's
normal policy, rerun the affected narrow gates, and allow required checks to
run again. Repeated baseline drift is a scheduling problem; solve it by
sequencing merge-ready PRs, not by weakening the up-to-date rule.

## 7. Unique Shared-Runtime Operation Owner

The shared-runtime owner declares the exact worktree, candidate revision,
intended operation, and expected release point before mutation. During that
ownership window, other sessions must not run:

- `m4:preview:sync`, `m4:preview:deploy`, or `m4:preview:promote`;
- recovery, restart, stop, migration, or state-mutating M4 commands;
- stateful browser, provider, database, or WordPress validation against the
  same candidate unless coordinated by the owner;
- any command that deletes, seizes, or bypasses the source-relay or operation
  lock.

Acquiring shared-runtime ownership is a sequencing step, not a second user
approval gate. The existing M4 standard still authorizes the appropriate
candidate checkpoint after an approved Cloud source change; the session runs
it when the current runtime owner has released the shared environment.

Read-only status and redacted log inspection are allowed only when they cannot
consume the owner's lock, alter shared state, or create a contradictory
acceptance claim.

An M4 candidate belongs to its declared source revision until the owner
releases it. A different session must not overwrite a healthy dirty candidate
merely because its own source is ready. Migration mismatch is release-ordering
evidence: wait for the owning migration and PR; never fake, downgrade, or
delete a revision to make another candidate pass.

The shared-runtime owner releases ownership only after reporting the candidate
state, revision, dirty state, locks, completed evidence, and any recovery
needed by the next owner.

## 8. Stop and Recovery Rules

| Observed condition | Required response |
| --- | --- |
| Another session owns the same conflict domain | Stop source edits, preserve the worktree, and send findings or request an explicit handoff. |
| An unowned dirty checkout contains user or peer work | Create a separate clean worktree; do not clean the shared checkout. |
| A peer PR changes a consumed contract | Fetch and inspect the exact delta before continuing; rebase only in the focused worktree. |
| A merge-ready PR already owns the lane | Keep later work local and do not request auto-merge until the lane is released. |
| M4 has another candidate, migration, or lock | Wait for the owner; use read-only diagnosis only when non-interfering. |
| Ownership cannot be established | Remain read-only and ask for coordination rather than guessing. |

If parallel edits were made before a conflict was discovered, neither session
may discard the other's work. Preserve both branches/worktrees, compare the
contracts, choose one owner, and integrate through an explicit reviewed diff.

## 9. Completion and Handoff Evidence

Every parallel task closeout reports:

- owned conflict domain and files actually changed;
- branch, PR, source revision, and merge revision separately;
- task worktree lock reason and whether it remains locked or met the documented
  unlock conditions;
- local, CI, M4 candidate, accepted M4, and production states separately;
- whether the merge lane and shared runtime were released;
- remaining peer dependencies and the next owner, if any;
- known stale worktrees or untracked files that were intentionally preserved.

Do not use "done" to collapse source, CI, M4, production, and human acceptance
into one state.

## 10. Practical Scheduling Pattern

For several active AI sessions, use this default schedule:

1. allow parallel read-only audits and disjoint implementation;
2. assign one owner for each hot conflict domain;
3. choose the highest-value coherent change as the sole merge-lane owner;
4. keep the shared M4 runtime with one owner until its candidate evidence is
   released;
5. after the merge, refresh every dependent worktree from current
   `origin/master`;
6. admit the next ready PR to the merge lane;
7. promote only clean merged source through the governed M4 path.

The objective is not maximum simultaneous mutation. It is maximum useful
parallel investigation with one unambiguous source, merge, and runtime truth.

## 11. Development-Stage Closeout and Release Handoff

Finishing one PR does not close a development stage. A stage closes only when:

1. every batch already admitted to the stage is merged, withdrawn with a
   recorded reason, or explicitly handed to a later stage;
2. every merged batch that requires runtime acceptance has completed
   clean-current-`master` promotion and the relevant smoke;
3. no candidate belonging to the stage is still running or waiting on shared
   M4;
4. both the human Cloud merge lane and shared-runtime ownership are explicitly
   released;
5. remaining worktrees, local-only candidates, blockers, rollback boundaries,
   and next owners are recorded;
6. the operator explicitly changes the queue from feature development to
   release-candidate preparation.

The merge lane and shared runtime are separate resources. "Double release"
means that both have independently met their release conditions. A merged PR
whose clean-master promotion is pending has not completed the stage handoff.
An M4-released candidate whose PR is still in final required checks also has
not completed it.

When an operator places controlled production validation after the current
development stage:

- record one durable release-queue handoff with start and stop conditions;
- keep it behind all already admitted development batches;
- do not admit an ordinary feature batch after the stage-close condition is
  reached until the exact release-candidate decision is complete;
- freeze and record the exact `master` revision, scope, migrations, rollback,
  bundle, image, and protected configuration dependencies;
- follow the current production release policy and checklist rather than
  copying their mutable gate details into the coordination queue;
- treat a release issue, production PR, green CI, M4 acceptance, manual
  workflow dispatch, Environment approval, production validation, and GA as
  distinct evidence and authorization states.

Creating a release issue or queue record does not authorize a production PR,
host mutation, Environment approval, user enablement, or GA. If a release gate
is missing, the owner records the blocker and stops at that boundary; it must
not substitute M4, synthetic fixture, liveness, or queue state for production
evidence.
