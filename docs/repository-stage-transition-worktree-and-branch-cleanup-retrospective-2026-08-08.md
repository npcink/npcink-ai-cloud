# Repository Stage-Transition Worktree and Branch Cleanup Retrospective — 2026-08-08

Status: dated closeout and retrospective evidence.

Purpose: preserve the evidence, corrections, and reusable lessons from the
2026-08-08 repository consolidation. This record is not automatic authority to
delete a future branch, worktree, cache, or archive.

## Outcome

The repository moved from a long-running accumulation of historical worktrees
and local branches to a bounded next-stage topology without deleting remote
branches, disturbing the current session, or performing an M4 build,
deployment, or runtime operation.

| Measure | Initial evidence | Final evidence |
| --- | ---: | ---: |
| Registered worktrees | 121 | 3 |
| Local branches | 333 | 4 |
| Manual-review worktrees | not a safe deletion set | 0 |
| Historical archive refs | 0 in the new namespace | 100 |
| Current historical checkout untracked files | 3 | 0 in retained development checkouts |
| Current historical checkout ignored files | 65,495 | 0 in retained development checkouts |
| Current historical checkout ignored capacity | about 1.81 GiB | classified and preserved or moved recoverably |

The private archive at
`/Users/muze/gitee/.codex-archives/npcink-ai-cloud/2026-08-08-stage-transition-99d1d42`
was recorded at approximately 854,328 KiB during closeout; a later read-only
verification measured 853,704 KiB. Rebuildable cache state totaling
approximately 2,070,180 KiB was moved to Trash for recoverability rather than
irreversibly deleted.

## Final Retained Topology

1. `/Users/muze/gitee/npcink-ai-cloud`
   - branch: `docs/release-retrospective`
   - HEAD: `99d1d42cf96cfff4e9283cce238f571661ebfaf0`
   - state: Git clean; ignored count zero
2. `/Users/muze/gitee/.worktrees/npcink-ai-cloud-next-stage-foundation-20260808`
   - branch: `codex/next-stage-foundation-20260808`
   - baseline HEAD: `78b0b5ef2b47fc9d9fa88dcd4ec34abddc1d9ddd`
   - state at cleanup closeout: Git clean; ignored count zero; locked as
     `codex:next-stage-foundation-20260808`
3. `/Users/muze/gitee/npcink-ai-cloud-m4-ops`
   - branch: `master`
   - HEAD: `78b0b5ef2b47fc9d9fa88dcd4ec34abddc1d9ddd`
   - state: equal to `origin/master`; Git clean; intentionally retained
     ignored dependency and runtime state

The retained local branches were:

- `master`, tracking `origin/master` at ahead/behind 0/0;
- `production`, tracking `origin/production` at ahead/behind 0/0;
- `docs/release-retrospective`, matching its remote at ahead/behind 0/0;
- `codex/next-stage-foundation-20260808`, initially tracking `origin/master` at
  ahead/behind 0/0.

No merge, rebase, cherry-pick, revert, or sequencer operation remained active.

## Preservation Actions

The cleanup treated recoverability as a prerequisite, not an afterthought.
Verified bundles in the private archive included:

- `merged-local-branches-245.bundle`;
- `newly-released-merged-branches-9.bundle`;
- `final-safe-merged-branches-9.bundle`;
- `historical-local-branches-66.bundle`;
- `detached-production-worktrees-7.bundle`;
- `damaged-locked-worktrees-19.bundle`;
- `dirty-locked-worktrees-8.bundle`;
- `unmerged-clean-worktrees-3.bundle`.

Sixty-six evidence-incomplete local branches were not discarded. Their refs
were atomically migrated from `refs/heads/*` to
`refs/archive/local-branches/20260808/*` after bundle creation and verification.
The transaction used `git update-ref --stdin`, so an unexpected ref value
would abort the batch instead of partially rewriting the branch set.

Dirty and damaged worktrees were preserved by category before registration
cleanup. Detached HEADs received archive refs and bundle coverage. Remote
branches were untouched throughout the operation.

## What Worked

### Worktrees before branches

Reducing worktree registrations first exposed which refs were still checked
out and prevented branch consolidation from racing against active checkouts.
This ordering also made the intended final topology easy to verify.

### Exact-set gates

Every destructive boundary used exact absolute paths, fresh HEAD values, and
candidate-set equality checks. `git worktree prune --dry-run --expire now` was
treated as a reviewed manifest, not a suggestion. Unexpected counts stopped
the operation before mutation.

### Recoverability layers

Archive refs, verified Git bundles, whole-directory archives, restrictive
private storage, and recoverable Trash moves protected different failure
modes. No single mechanism was asked to preserve source history, uncommitted
files, ignored runtime state, and filesystem metadata at once.

### Protective aborts

Several commands stopped because parsing, occupancy, checksum, or candidate
evidence did not match expectations. Those stops prevented unsafe partial
cleanup and directly improved the final procedure.

## Corrections and Lessons

1. In zsh, assigning to lowercase `path` can overwrite the special `$path`
   array and effectively clobber `$PATH`. Cleanup scripts should use names such
   as `wt_path`.
2. `git worktree prune --dry-run` writes candidate details to stderr in the Git
   version used here. Audits must capture `2>&1` when comparing the manifest.
3. Worktree administration directory names are not reliable filesystem-path
   mappings. Use exact paths from `git worktree list --porcelain` and the audit.
4. Running `lsof +D` while the checking process itself has the target as its
   current directory creates false occupancy evidence. Run occupancy checks
   from a different retained worktree.
5. Loose regexes can parse `tracked=` from inside `untracked=`. Prefer
   structured JSON or exact token parsing.
6. Repeated escaping made `\d`-style parsers fragile. Structured command output
   is safer than increasingly complex regular expressions.
7. Checksum manifests that include filenames produce false mismatches after a
   path-prefix change. Compare normalized relative paths and content digests.
8. With the installed Git version, ref globs for `git bundle create` require
   the `--glob=...` form.
9. Audit snapshots age quickly during a long cleanup. Re-read active HEADs and
   remote refs immediately before each mutation batch.
10. A Git-clean worktree can contain large ignored, sensitive, or operationally
    unique state. Tracked cleanliness, ignored capacity, and runtime role are
    independent evidence.
11. Directory names such as `.tmp` are hints, not data classifications. Some
    temporary-looking paths contained databases or runtime evidence and had to
    be preserved.
12. Rebase and squash merges can replace feature commit ancestry. PR head SHA,
    remote integration SHA, and ancestry each answer different questions.

## Development Practice Derived from the Cleanup

The next phase should prevent accumulation rather than depend on another large
recovery exercise:

- start from the bounded single-session topology;
- create at most one auxiliary task worktree, lock it immediately, and record
  its release condition;
- close a merged or abandoned task while its owner and PR evidence are still
  available;
- keep the stable M4 operations checkout out of ordinary source cleanup;
- run `pnpm run worktree:audit` regularly as inventory, never as deletion
  authorization;
- keep generated-state retention decisions separate from Git branch and
  worktree decisions;
- archive uncertain evidence under a dated namespace instead of leaving
  hundreds of active local branches;
- record a compact phase-transition receipt whenever repository topology is
  deliberately reset for a new development stage.

## Boundary and Acceptance

This cleanup changed local repository topology and private local archives only.
It did not change Cloud product behavior, product boundaries, public contracts,
production source, M4 accepted state, or remote branch inventory. It performed
no M4 sync, preview, promotion, build, deployment, or runtime test.

The active policy derived from this evidence is the
[Repository Stage-Transition Cleanup Standard](repository-stage-transition-cleanup-standard-v1.md).
Future cleanup must re-inventory current state and may not reuse the counts or
candidate lists in this retrospective as deletion authority.
