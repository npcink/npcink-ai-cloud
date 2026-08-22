# Repository Hygiene and Documentation Lifecycle Standard v1

Status: active engineering standard.

Purpose: govern the review, retirement, archival, and local cleanup of
documentation, engineering commands, task contracts, generated state, and
apparently unused repository files. The objective is to reduce active
maintenance burden without deleting authority, historical evidence, rollback
material, or another task's work.

This standard complements the
[Development and Validation Operating Model](development-validation-operating-model-v1.md),
[Parallel AI Collaboration Standard](parallel-ai-collaboration-standard-v1.md),
[Engineering Command Inventory Standard](engineering-command-inventory-standard-v1.md),
and [Structural Remediation Delivery Standard](structural-remediation-delivery-standard-v1.md).
It does not change the Cloud product boundary, release authority, M4 ownership,
or production policy.

## 1. Core Rule

Repository cleanup starts as an evidence task, not a deletion task:

```text
current baseline and ownership
  -> lifecycle classification
  -> active references and replacement proof
  -> bounded reversible change
  -> focused and integration validation
  -> merged-source evidence
  -> separate local-state cleanup when authorized
```

A stale date, large file, unreferenced basename, `retired` status, or ignored
directory is only a review signal. None is deletion authority by itself.

## 2. Required Classification

Classify every candidate before moving or deleting it.

| Class | Examples | Default action | Deletion threshold |
| --- | --- | --- | --- |
| Active authority | boundary, standard, current runbook, release policy | retain and keep indexed | named successor plus updated consumers and policy checks |
| Active implementation | runtime code, scripts, package commands, CI entrypoints | retain until replacement is executable | replacement and all callers proven; focused behavior tests pass |
| Retired negative guard | prohibited API, removed Task Pack, forbidden direction | retain as a compact guard | another active contract provides equal or stronger regression protection |
| Time-bounded evidence | closeout, acceptance, validation, audit, retrospective | preserve and mark historical | exact duplicate with no unique revision, result, decision, or rollback value |
| ADR or migration history | accepted/superseded ADR, Alembic revision | preserve in place | never through routine hygiene; use successor ADR or new migration |
| Temporary task envelope | root `task-contract-*.json`, handoff receipt | archive or remove after task closeout | task is closed and durable default/history remains discoverable |
| Regenerable local state | `node_modules`, `.venv`, `.next`, `dist`, caches, `.tmp` | keep out of Git; clean separately | owner/process checks plus explicit local cleanup authorization |
| Unclassified | unknown script, folder, snapshot, or data file | retain and investigate | classification, ownership, replacement, and recovery evidence completed |

Historical evidence may contain obsolete names or commands. That does not make
the historical file active, and it does not justify rewriting the record to
look current.

## 3. Baseline and Ownership Preflight

Before editing:

1. refresh current `origin/master` and record its revision;
2. inspect the visible checkout, worktrees, active tasks, open PRs, merge lane,
   and shared-runtime owner;
3. use a clean locked `codex/*` worktree when the visible checkout is dirty,
   stale, or owned by another task;
4. identify the conflict domain for documentation, command surfaces, task
   contracts, and local generated state separately;
5. state non-goals, required gates, rollback, and areas that must not change.

Conflict-domain ownership, merge-lane ownership, and M4/shared-runtime ownership
are independent. A documentation batch can be locally prepared beside a code
split only when its files are disjoint. It must not publish, merge, or mutate M4
until the owning lane is available.

## 4. Documentation Lifecycle

### 4.1 Entry points are interfaces

The root README and `docs/README.md` are maintained interfaces, not prose dumps.

- The root README explains product boundary, current focus, setup, layout,
  development entry, and the smallest set of release/validation anchors.
- `docs/README.md` owns lifecycle explanation and navigation to active
  authority.
- Dated evidence remains searchable but is not exhaustively copied into the
  root README.

Before shortening either entry point, inspect repository policy and contract
tests for required phrases and links. Search the implementations of release,
anti-drift, documentation, and PR-body checks rather than assuming a visually
complete README is contract-complete.

### 4.2 Moving or superseding documents

- Update inbound links in the same change.
- Preserve the document's original evidence claims and date.
- Add a clear status and successor/current-authority pointer when needed.
- Do not delete old ADRs; add or update the successor relationship.
- Do not rewrite historical commands as if they had run against the current
  revision.
- Keep retired negative guards indexed when they prevent an old surface from
  returning.

Run a tracked Markdown-link scan or equivalent path check after every move.

## 5. Engineering Command Retirement

A command or script may be retired only after all of the following are known:

1. owner and intended environment;
2. whether it reads, mutates, deploys, or requires operator approval;
3. package, CI, documentation, shell-script, test, and external operator
   callers;
4. current supported replacement;
5. rollback or recovery path;
6. focused contract coverage for both the removed name and retained path.

Remove a deprecated command coherently: package alias, dedicated script,
inventory metadata, tests, and active documentation change together. Do not
leave a dead wrapper for compatibility unless an identified external caller
still requires it and the retirement date is explicit.

Production commands, historical evidence, and governed replacements are not
removed merely because a newer development shortcut exists.

## 6. Task Contract Lifecycle

Anti-drift contract selection follows the operating model:

1. explicit `--contract <path>`;
2. exactly one active root `task-contract-*.json`;
3. the durable repository default under `config/`;
4. multiple root task contracts fail closed as ambiguous.

A root task contract is temporary. At task closeout:

- preserve it under `docs/history/` when it carries unique evidence;
- otherwise remove it after confirming the durable default remains valid;
- update the related closeout/history document;
- verify every declared `required_gate` resolves to a real package command or
  documented executable procedure;
- make the checker report which contract governed the result.

Never allow a dated task-specific description to silently govern unrelated
future work.

## 7. Local Generated State

Local cache cleanup is not a Git cleanup batch.

Before removing ignored state, verify:

- the exact path is ignored and regenerable;
- no active process or worktree owns it;
- it contains no database, user upload, credential, evidence, or manually
  curated artifact;
- regeneration cost and required network access are acceptable;
- the user authorized the destructive local action.

Prefer tool-owned cleanup commands and exact targets. Do not combine cache
removal with source commits, recursively target a workspace root, or use local
space recovery as justification to delete Git history.

## 8. Batch Order

Use this default order when several hygiene classes are present:

1. read-only inventory and lifecycle index;
2. documentation information architecture;
3. repair or preserve policy/contract anchors exposed by the new entry points;
4. executable command/script retirement with replacement proof;
5. task-contract default/archive separation;
6. local generated-state cleanup after active owners release it.

Publish coherent batches sequentially. Rebase or recreate the next candidate
from current `origin/master` before publication; do not assume an earlier
local-ready commit still represents the integrated entry-point contracts.

## 9. Validation

Select the narrowest useful gates, then let protected CI decide merge
eligibility.

| Change | Minimum local proof |
| --- | --- |
| Documentation navigation or move | link/path scan, focused policy check, `git diff --check` |
| Root README | release-policy contract and any README-focused tests before publication |
| Command/script retirement | caller search, command inventory tests, focused behavior/contract tests |
| Anti-drift contract selection | anti-drift self-tests, JSON parse, missing/zero/one/multiple/explicit selection cases |
| Ignored local state | pre/post exact-path inventory and process/owner verification; no Git diff |

Documentation and repository tooling do not use M4 by default. M4 is required
only when the change modifies Cloud build/runtime inputs or needs real runtime
consumer evidence.

Evidence states remain separate: local verified, PR verified, merged into
`master`, M4 candidate, M4 accepted, production validated, and human accepted.

## 10. Stop Conditions

Stop and report instead of deleting when:

- ownership or active-task state is unknown;
- the visible checkout contains unrelated dirty work and no isolated worktree
  is available;
- a replacement command exists only in prose, not executable source;
- a document supplies a required policy marker, negative guard, rollback step,
  or unique historical receipt;
- more than one root task contract is active without explicit selection;
- local state may be in use or may contain non-regenerable data;
- the change would need M4, production, credential, or merge-lane authority not
  owned by the task.

## 11. Closeout Receipt

```text
REPOSITORY_HYGIENE_RECEIPT
- baseline/master:
- worktree/owner:
- candidates reviewed by lifecycle class:
- active authority retained:
- historical evidence retained or moved:
- commands/scripts removed and replacements:
- task contracts default/active/archived:
- local generated state removed or deferred:
- focused local gates:
- PR/CI/merge evidence:
- M4/production/human evidence:
- residual risks and next review queue:
- rollback:
- lane/worktree release:
```

The first complete application is recorded in
[Repository Hygiene Cleanup Closeout and Development Retrospective](history/repository-hygiene/2026/repository-hygiene-cleanup-closeout-and-development-retrospective-2026-08-03.md).
