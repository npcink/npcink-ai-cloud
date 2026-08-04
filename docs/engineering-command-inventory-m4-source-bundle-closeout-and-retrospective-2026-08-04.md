# Engineering Command Inventory M4 Source Bundle Closeout and Retrospective

Status: time-bounded implementation, candidate-validation, and handoff
evidence; PR #513 is open and this record is not M4 acceptance evidence.

Date: 2026-08-04.

This record explains why the engineering command inventory checker failed in
the controlled M4 source bundle, how the checker was made portable without
weakening its Git authority or the bundle security boundary, and which lessons
should guide future repository tools that execute outside a Git worktree.

Current normative authority remains in:

- [Engineering Command Inventory Standard](engineering-command-inventory-standard-v1.md);
- [M4 Preview AI Development Standard](m4-preview-ai-development-standard-v1.md);
- [Development and Validation Operating Model](development-validation-operating-model-v1.md);
- [Single-Session Worktree Lifecycle](single-session-worktree-lifecycle-v1.md).

## 1. Outcome and Evidence State

The implementation on branch
`codex/m4-engineering-inventory-bundle-20260804` changed the checker and its
contract tests in commits `63ae0e82` and `249147ac`. Pull request
[#513](https://github.com/npcink/npcink-ai-cloud/pull/513) is published with
protected squash auto-merge enabled.

The highest evidenced states at the time of this record are:

| Lane | Evidence |
| --- | --- |
| Local source | Verified on the current task revision. |
| Controlled no-`.git` copy | Checker output exactly matched the Git-authority output. |
| M4 candidate | Revision `249147ac` passed the focused contract, 11 tests. |
| GitHub PR | Open and blocked by the Python dependency audit; the targeted backend check passed. |
| M4 accepted | Not reached for PR #513 because it has not merged. |
| Shared M4 | Restored to accepted PR #512 at `625ac95f`; shared runtime locks were released. |
| Production | Not changed and not validated by this task. |
| Human acceptance | Not claimed. |

The Cloud merge lane and locked task worktree remain owned by PR #513 until
the required check is repaired in a separate authorized task and the PR is
merged. Shared M4 is released and does not contain the candidate revision.

## 2. Problem and Root Cause

The inventory checker discovers repository callers of package commands. It
previously always invoked `git ls-files`, which is correct in an authoring
worktree because tracked files are the intended authority and untracked files
must not influence governance results.

The M4 source relay intentionally creates a controlled source bundle without
`.git`. The bundle exclusion is a security and ownership property: M4 receives
the source needed to build and test, not repository metadata or a second Git
control plane. The checker therefore failed before it could inspect any
command caller.

The defect was an environment-assumption mismatch:

```text
authoring contract: tracked-file inventory from Git
M4 contract: controlled source tree without Git metadata
old checker: Git metadata is always present
result: authoring passes, M4 focused contract fails
```

Copying `.git` into the bundle would have hidden the checker defect by
weakening the M4 boundary. Silently returning an empty file list would have
turned a failed inventory into false success. Neither is acceptable.

## 3. Implemented Authority Model

The checker now has two explicit modes.

### 3.1 Local Git authority

When the canonical repository root itself contains `.git`, `git ls-files`
remains authoritative. The checker keeps its previous semantics:

- only tracked files participate;
- untracked command references do not change observed usage;
- deleted tracked files disappear from the inventory after Git reports them;
- a Git failure is an error, not a reason to fall back silently.

The mode test is intentionally local to the canonical root. An unrelated Git
checkout above a no-`.git` bundle must not capture the bundle and change its
file authority.

### 3.2 Controlled filesystem authority

When the canonical root has no local `.git`, the checker performs a sorted,
repository-root-bounded filesystem walk. It excludes dependency, generated,
cache, coverage, report, build, and temporary directories, including
`.venv`, `node_modules`, `.next`, Python caches, and known tool-output trees.
Known binary file types are also excluded from command-reference scanning.

The fallback fails closed when it cannot prove that a path belongs to the
expected repository surface. It rejects:

- an incorrect or incomplete repository root;
- directory symlinks during traversal;
- file symlinks that resolve outside the root;
- special files such as FIFOs;
- unreadable or otherwise unclassifiable paths.

It never searches a parent directory and never follows a path outside the
canonical repository root.

## 4. Test-First Regression Matrix

The first focused run was intentionally made against the old implementation.
It produced four failures and four passes, demonstrating the missing no-Git
contract before the implementation changed.

The final contract contains 11 passing cases:

| Case | Required behavior |
| --- | --- |
| No `.git` bundle | Use deterministic filesystem authority and complete the inventory. |
| Local `.git` worktree | Retain `git ls-files` as the authority. |
| Untracked reference | Ignore it in Git mode. |
| Bundle below unrelated outer Git checkout | Use bundle fallback, not ancestor Git. |
| Deleted command reference | Stop reporting the deleted caller. |
| Generated directories and binary pollution | Exclude them deterministically. |
| Incorrect repository root | Fail closed. |
| External file symlink | Fail closed. |
| Directory symlink | Fail closed. |
| FIFO or other special path | Fail closed. |
| Stable inventory report | Preserve the governed command totals and usage result. |

The outer-Git case was added after automated review identified that probing
Git ancestors could misclassify a valid source bundle nested under another
checkout. The correction illustrates an important rule: environment detection
must test the boundary the tool owns, not the broadest context discoverable by
the host process.

## 5. Verification Evidence

The final implementation revision produced:

- focused contract: 11 passed;
- Ruff on the checker and contract test: passed;
- direct inventory checker: passed with 109 root commands, 31 frontend
  commands, and 140 total commands;
- controlled no-`.git` full-tree replay: output exactly matched Git mode and
  completed in 0.46 seconds;
- `pnpm run check:release-policy`: passed;
- `pnpm run check:anti-drift`: passed;
- M4 focused contract on Linux with Python 3.14.6: 11 passed;
- GitHub `backend-targeted`: passed.

The GitHub `Python dependency audit` failed on an upstream security finding for
`cryptography 49.0.0` (`CVE-2026-69247`, fixed version reported as 50.0.0).
The aggregate backend check consequently failed. This is not evidence against
the command-inventory implementation, but it is still a required-check
blocker and therefore prevents merge and M4 acceptance. Dockerfiles, image
locks, and CVE allowlists were deliberately not changed in this task.

The required read-only Python observer reported:

```text
status=waiting_for_candidate
python_version=3.14.6
fixed_image_claimed=false
exception_expires_on=2026-08-05
required_next_action=Keep current exception scope unchanged and continue daily observation
```

That observer result and the new dependency-audit CVE are separate evidence:
the observer describes the current Python image candidate process, while the
required check describes a dependency vulnerability discovered by CI.

## 6. Five-Axis Review

### Correctness

The two modes have explicit, mutually exclusive authority. Git semantics are
preserved on authoring machines, while the source bundle receives equivalent
command-reference coverage. Deletion, untracked files, and nested-checkout
behavior are executable contracts rather than assumptions.

### Security

The change preserves exclusion of `.git` from M4. The fallback is rooted,
does not follow directory symlinks, rejects external file symlinks and special
files, and cannot convert an unsafe path into a skipped scan.

### Compatibility

The existing CLI, JSON/Markdown report shape, inventory data, and Git-mode
behavior remain unchanged. The fallback uses standard-library Python and runs
in the M4 Linux container.

### Performance

The fallback sorts and scans only the bounded source surface while pruning
high-volume dependency and generated trees before descent. The measured full
controlled copy completed in 0.46 seconds; this is a dated observation, not a
future performance guarantee.

### Maintainability

Authority selection, exclusion policy, path validation, and scan behavior are
separate functions with focused regressions. The active standard documents
both modes, so later command cleanup does not need to rediscover the M4
environment assumption.

## 7. Reusable Engineering Method

Repository tools often depend on metadata that disappears in source archives,
containers, deployment contexts, or generated SDK bundles. Use this sequence
before making such a tool portable:

1. Name the original authority and preserve it where it exists.
2. Name the metadata-free environment and why the metadata is absent.
3. Decide whether the portable artifact can carry a signed or generated
   manifest; otherwise define a bounded filesystem authority.
4. Anchor environment detection to the owned root, not an arbitrary ancestor.
5. Enumerate dependencies, generated trees, caches, reports, temporary paths,
   binaries, symlinks, and special files before walking the filesystem.
6. Fail closed on ambiguity, root mismatch, escape, or unreadable input.
7. Write negative regressions first: untracked files, deletion, nested
   repositories, generated pollution, wrong roots, symlinks, and special files.
8. Compare metadata-free output with the original authoritative output on the
   same revision.
9. Exercise the real target environment; a local copied directory is useful
   but does not replace the M4 container contract.
10. Keep candidate validation, protected merge, clean-master promotion, and
    accepted runtime status as separate release states.

The central design principle is:

> Portability must add an explicit authority, not remove authority.

A fallback is safe only when its input boundary and rejection behavior are at
least as reviewable as its success path.

## 8. Handoff and Final Closeout Conditions

PR #513 can reach accepted closeout only after all of the following occur:

1. remediate the Python dependency audit in a separate, explicitly scoped
   task without weakening the security gate;
2. let all required checks pass and protected auto-merge complete;
3. fetch current `origin/master` in a clean operations worktree;
4. run `pnpm run m4:preview:promote -- --pr 513` using source sync unless the
   promotion fingerprint explicitly requires a rebuild;
5. verify `acceptance_state=accepted`, `promotion_pr=513`,
   `source_branch=master`, `source_dirty=false`, and the current
   `origin/master` revision;
6. run the narrow post-promotion status and smoke checks;
7. confirm the task worktree is clean, then unlock and remove only that exact
   worktree according to the lifecycle standard.

Until then, the correct status is: implementation and M4 candidate verified,
PR published, protected merge blocked, PR #513 not accepted. No production
action is implied.

## 9. Observation Receipt

The candidate was dispatched twice, once for the initial implementation and
once after the review correction. Shared M4 was restored to its accepted
baseline after each bounded candidate exercise; those two restores account for
the remaining sync operations.

`M4_OBSERVATION_RECEIPT date=2026-08-04; route=not measured; sync=30s initial,33s review revision; focused=5s initial,6s review revision; promotion=PR513 not occurred, baseline restores 34s and 33s; operations=sync:4,deploy:0; stable_502=not measured; m4_only=not occurred; coordination=not measured`.
