# Repository Stage-Transition Cleanup Standard v1

Status: active engineering standard.

Purpose: define a safe, evidence-driven closeout for repository phase
transitions so the next development stage starts from a small, understandable
set of branches and worktrees without discarding source, local data, or runtime
evidence.

## Scope

Use this standard when a development phase ends and the operator wants to
consolidate historical local branches, worktrees, caches, and generated state.
It supplements the
[Single-Session Worktree Lifecycle](single-session-worktree-lifecycle-v1.md)
and the
[Repository Hygiene and Documentation Lifecycle Standard](repository-hygiene-and-documentation-lifecycle-standard-v1.md).

A phase transition is an explicit repository lifecycle event. It is not an
incidental extension of feature closeout, PR merge, or routine disk cleanup.
The cleanup owner must declare the repository, current worktree, protected
roles, intended final topology, archive location, and mutation boundaries
before changing state.

## Target Topology

The default post-transition topology is:

1. one primary checkout for the current human-facing task or handoff;
2. one stable M4 operations checkout when the repository uses the M4 lane;
3. at most one locked active `codex/*` task worktree for the next focused
   development stage.

Additional worktrees or local branches require a named owner, current purpose,
and explicit release condition. Historical registrations do not by themselves
justify parallel development mode.

## Safety Invariants

The cleanup owner must preserve all of the following:

- never remove, unlock, switch, reset, stash, clean, rebase, or otherwise
  disturb the current working directory or current worktree;
- never use force removal as a substitute for incomplete evidence;
- never delete a remote branch as an incidental local cleanup action;
- never treat a merged PR, old path, branch age, lock age, or clean-looking
  status as deletion authority by itself;
- use exact absolute paths and freshly read refs immediately before mutation;
- stop when the observed candidate set differs from the reviewed candidate
  set;
- preserve recoverable evidence before removing registrations or local refs;
- keep private archives outside the repository with restrictive permissions;
- keep Git cleanup separate from generated-state and runtime-data cleanup.

Protective aborts, dry-runs, and exact-set mismatches are successful safety
controls, not failed cleanup attempts.

## Inventory Model

Inventory worktrees before branches because checked-out refs constrain branch
handling. For every worktree, record without exposing suspected credentials:

- absolute path and registration state;
- branch or detached HEAD and exact HEAD SHA;
- tracked modifications and deletions;
- untracked and ignored counts, with size by safe data category when relevant;
- merge, rebase, cherry-pick, revert, bisect, or sequencer state;
- lock state and reason;
- upstream, ahead/behind, same-name remote SHA, and PR state when available;
- primary, task, M4, preview, production, acceptance, runtime, or operations
  role;
- owner, deliverable state, and release condition.

Report tracked, untracked, and ignored state independently. `git status` alone
does not prove that a worktree is disposable: a Git-clean tree can still hold
databases, uploads, credentials, dependency trees, build caches, or runtime
evidence.

Maintain separate classifications for:

1. source truth and commits;
2. local uncommitted data;
3. ignored generated or runtime state;
4. worktree registrations;
5. local branch refs;
6. private archive refs and bundles.

Do not infer one category's safety from another category's status.

## Worktree Decision Order

### Protected or active

Keep the worktree when it is current, locked for an active task, owned by an
open PR or handoff, dirty without a verified archive, or assigned a stable M4,
preview, production, acceptance, runtime, or operations role. Report the exact
reason and release condition.

### Clean merged auxiliary

Before non-force removal:

1. confirm the path is not the current worktree and is not occupied;
2. confirm tracked, untracked, and relevant ignored state is empty or explicitly
   proven rebuildable and unnecessary;
3. confirm no Git operation is active;
4. confirm its commits and merged PR evidence are represented in current
   repository truth;
5. confirm no protected runtime role or owner remains;
6. unlock only that exact path when required;
7. remove only that exact worktree without force;
8. re-audit the resulting registration set.

### Dirty auxiliary

Do not selectively copy only tracked files. Archive the entire exact directory,
including tracked changes, untracked files, ignored files, symlinks, and audit
evidence. Verify archive readability and inventory before cleaning the
registration. Sensitive filenames and contents must not be printed in the
receipt.

### Detached HEAD

Create a namespaced archive ref for the exact HEAD and include it in a verified
bundle before worktree removal. Detached commits are not protected by an
ordinary branch name.

### Damaged or missing registration path

When Git metadata remains but the worktree path is damaged or incomplete:

1. create an archive ref for the freshly read HEAD;
2. create and verify a bundle containing the required refs;
3. archive the entire residual directory when it exists;
4. unlock only the exact registration;
5. run `git worktree prune --dry-run --expire now` and capture both stdout and
   stderr;
6. require the dry-run count and exact candidate set to equal the reviewed set;
7. run prune only after that equality check, then re-audit.

Never derive the filesystem path from the internal worktree administration
directory name. Use the path reported by Git and the verified audit.

## Branch Consolidation

Branch cleanup starts only after the worktree topology is stable.

Always exclude:

- the current branch;
- `master` and `production`;
- the active next-stage task branch;
- every branch checked out in any registered worktree;
- any branch with an open PR, active handoff, unique work, or uncertain owner.

A local branch is a safe merged-deletion candidate only when fresh evidence
shows all of the following:

- its expected remote ref exists and has the exact reviewed SHA when such a
  remote is part of the evidence chain;
- the relevant merged PR head matches the reviewed branch head;
- no open PR uses the branch;
- no worktree checks it out;
- a bundle containing the candidate ref set has been created and verified.

Rebase and squash merge workflows can replace feature commit ancestry. Treat
merged PR head evidence, current remote integration SHA, and local ancestry as
separate facts; no single one is a universal substitute for the others.

When evidence is incomplete but preservation is required, atomically migrate
the ref from `refs/heads/<name>` to a dated namespace such as
`refs/archive/local-branches/YYYYMMDD/<name>` using a reviewed ref transaction.
Verify the bundle and the full old/new ref set before and after the transaction.
This reduces active branch clutter without discarding recoverable history.

## Generated and Runtime State

Classify ignored and untracked data independently from Git refs:

- rebuildable dependencies and caches may be moved to a recoverable Trash
  location only after exact-path and classification review;
- databases, uploads, provider fixtures, credentials, runtime volumes, and
  operator evidence require archive or explicit retention;
- `.tmp` and similar names are not disposal authority because they may contain
  databases or runtime evidence;
- combined checksums that embed filenames cannot be compared after path-prefix
  changes without normalizing the manifest.

Record category and capacity in the cleanup receipt without printing contents
or suspected credential filenames.

## Verification and Receipt

After every bounded mutation batch, re-read Git state and compare it with the
declared target. The final receipt must include:

- repository common directory;
- retained worktrees with exact path, role, branch, HEAD, and lock state;
- retained local branches with upstream and ahead/behind;
- archive ref count and namespace;
- verified bundle/archive location and aggregate capacity;
- recoverable generated-state capacity moved to Trash, if any;
- remote branches changed, which should normally be zero;
- active Git operation count;
- remaining manual-review count;
- explicit statement that the current worktree was not removed or unlocked.

Conclude with exactly one operational classification:

- `CLEANUP_READY` only when the current tree is clean, untracked is zero,
  ignored is zero or explicitly proven rebuildable and unnecessary, no Git
  operation is active, local HEAD is fully pushed and remote-consistent, and
  the current session no longer needs the worktree;
- `ARCHIVE_REQUIRED` when local data must be preserved before cleanup;
- `KEEP_ACTIVE` when work, ownership, runtime role, synchronization, or
  evidence remains incomplete.

The classification is a review result. It never authorizes an automated job to
remove or unlock the current worktree.
