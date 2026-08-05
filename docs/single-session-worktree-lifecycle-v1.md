# Single-Session Worktree Lifecycle v1

Status: active engineering standard.

Purpose: keep the default one-AI workflow small while protecting dirty work,
M4 operations, and scheduled cleanup from ambiguous worktree state.

## Default Topology

The repository defaults to one active AI development session. Prefer:

1. one clean current development worktree;
2. the existing stable M4 operations worktree;
3. at most one auxiliary AI task worktree when the visible checkout is dirty,
   stale, or contains unrelated work.

Old registered worktrees do not enable parallel-development mode. Multiple AI
builders, integrators, merge queues, conflict-domain owners, and frontend slots
are used only when the operator explicitly enables the
[Parallel AI Collaboration Standard](parallel-ai-collaboration-standard-v1.md).

## Task Worktree Rule

Reuse the current worktree when it is clean, current, and focused on the task.
If isolation is required, create one `codex/*` worktree from current
`origin/master`, immediately lock it as `codex:<task-id>`, and verify the lock
before editing. The lock protects the task from scheduled cleanup as well as
operator error; it does not grant M4 or production authority.

Keep the task worktree locked until the task ends, its PR is confirmed merged
when applicable, and the worktree is clean with no unpreserved deliverable.
Unlocking, removal, and branch deletion are separate actions and require fresh
exact-path evidence.

## Closeout Cases

### Merged and clean

After confirming the exact PR is merged, fetch current `origin/master`, verify
the task worktree is clean, and verify that its task commits are represented by
the merged PR. The session may then unlock and remove only that exact worktree
without force. Branch deletion remains a separate action and is not implied by
worktree removal.

### No deliverable

A task with no deliverable may close only after fresh evidence shows all of the
following:

- the worktree has no tracked, staged, or untracked task content;
- it has no task commit absent from current Git history;
- it has no open PR, active task, or handoff owner;
- it is not a primary, M4, preview, production, acceptance, runtime, or
  operations checkout.

When every condition is proven, unlock and remove only the exact worktree
without force. If any condition is unknown, retain the lock and report the
missing evidence.

### Retained deliverable or handoff

If a task ends with an unmerged commit, dirty file, open PR, or explicit
handoff, keep the worktree locked. Record its absolute path, branch, HEAD,
status, lock reason, owner, deliverable state, and the condition that permits a
later closeout. A handoff transfers responsibility only when the receiving
owner acknowledges it; it does not itself authorize unlocking or removal.

### Stale-lock recovery

Age, a missing process, or an inactive-looking path does not prove a lock is
stale. Recovery requires the same clean-tree, Git-history, PR, task, handoff,
and protected-role evidence as no-deliverable closeout. If all evidence is
complete, remove only the exact stale lock, re-run the read-only audit, and
then make a separate non-force removal decision. If ownership or deliverable
evidence is unavailable, leave the worktree protected.

## Read-Only Audit

Use:

```bash
pnpm run worktree:audit
pnpm run worktree:audit -- --format json
```

The audit classifies the current task, primary/locked/dirty/long-lived
worktrees, and clean unlocked auxiliaries needing manual review. It never
unlocks, removes, prunes, or changes a worktree.

`manual_review` is not deletion authorization. Before exact non-force removal,
separately prove that the worktree is non-primary, unlocked, unoccupied,
clean, inactive, fully represented in current Git history, has no unique
commit or open PR, has no task/handoff owner, and is not a long-lived M4,
preview, production, acceptance, runtime, or operations checkout.

If task or PR evidence is unavailable, keep the worktree protected and report
the missing evidence. Never use age, path name, a clean status, or an apparent
stale registration alone as removal authority.

## Closeout Receipt

A normal single-session closeout reports only:

- task worktree and lock state;
- changed files and highest evidence state reached;
- whether the worktree remains required for an open PR or handoff;
- the exact missing evidence when cleanup is deferred.

No-deliverable and stale-lock receipts also record the evidence used to prove
that no unique work, owner, protected role, or open PR remains. Retained-work
receipts record the acknowledged owner and release condition.

Do not add builder, integrator, conflict-domain, merge-queue, or frontend-slot
fields unless the operator explicitly enabled parallel mode.
