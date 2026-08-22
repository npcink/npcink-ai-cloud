# Repository Documentation Consolidation Closeout and Lessons - 2026-08-22

Status: historical closeout and engineering synthesis; not future cleanup,
branch deletion, release, M4, or production authority.

## Purpose

This record closes the 2026-08-22 repository and documentation consolidation.
It explains what changed, why the work stopped, which methods were reliable,
which assumptions were corrected, and when another cleanup batch would be
worth reopening.

Current source, pull-request state, worktrees, active standards, and the
[Repository Hygiene and Documentation Lifecycle Standard](../../../repository-hygiene-and-documentation-lifecycle-standard-v1.md)
remain authoritative.

## Scope and Boundaries

The work covered local Git topology, closed remote task branches, archive-ref
recovery evidence, and documentation lifecycle classification. It did not
change Cloud runtime behavior, public APIs, Provider execution, WordPress
ownership, M4 runtime state, production, deployment, or human acceptance.

The work used the normal single-session lane. The stable M4 operations
worktree received Git fast-forwards only; no M4 command, image build, preview,
Provider call, or production operation was run.

## Delivery Sequence

| PR | Result |
| --- | --- |
| `#836` | Moved 20 dated Admin records into the Admin history collection. |
| `#837` | Moved 6 dated Portal records into the Portal history collection. |
| `#838` | Moved 5 dated production records while retaining executable and reusable release evidence at fixed paths. |
| `#839` | Added archive-ref retention, exact-bundle, and review-before-deletion rules. |
| `#840` | Added a normalized top-level `Status:` to 31 dated root documents. |
| `#841` | Moved 20 completed trial and rehearsal records while retaining 9 active contracts, runbooks, checklists, handoffs, and templates. |
| `#842` | Moved 6 P5 engineering records while retaining fixed-path test/policy evidence and active `v1` contracts. |

Every PR passed protected required checks and was squash-merged into `master`.
Feature and merge patch IDs were checked for equivalence before the related
remote task branches were removed.

## Documentation Outcome

At the verified checkpoint before `#840`, the `docs/` root contained 258
Markdown files, including 143 dated files; 31 lacked a normalized top-level
`Status:`. The history tree contained 70 Markdown files.

After `#842`:

- the `docs/` root contained 232 Markdown files;
- 117 dated root files remained and all 117 had a normalized `Status:`;
- `docs/history/` contained 98 Markdown files;
- the trial collection contained 20 records plus its index; and
- the refactor collection contained 6 records plus its index.

File movement was not the goal. Active authority, tested fixed paths, negative
guards, reusable runbooks, and high-link records with little migration benefit
were deliberately retained.

## Git and Recovery Outcome

The final worktree topology contained exactly two clean worktrees:

- the current task worktree; and
- the stable M4 operations worktree on `master`, aligned with `origin/master`.

Eighteen reviewed remote branches were removed across the closeout: 3
superseded no-PR branches, 8 closed `release-fix/*` branches, and 7 merged
documentation task branches for `#836` through `#842`. Seven Dependabot
branches remained because their pull requests were still open.

The archive-ref baseline contained 173 refs. The final audit contained 188:
the additional 15 refs preserve the exact heads archived after the baseline.
No archive ref was deleted, because retention eligibility had not been reached
and eligibility would not itself authorize deletion.

Verified private recovery bundles under
`/Users/muze/gitee/.archives/npcink-ai-cloud-stage-transition-20260822/` include:

| Bundle | Scope | SHA-256 |
| --- | --- | --- |
| `no-pr-branches-before-cleanup.bundle` | Three superseded no-PR branches | `c9ba1a9b913f655684d236af2d9a82184206a49fd27f8093001a84b8a3622940` |
| `archive-refs-baseline-20260822.bundle` | All 173 baseline archive refs | `66fee41bb1f7f3d3e02f95b0f72725128f89472b70bab90c3f880253fe4ca54c` |
| `merged-doc-pr-branches-836-839-20260822.bundle` | Merged branch heads for `#836`-`#839` | `5cfff2f8e90c7c7116122e0d01779f3a1504c6d397c5167dbf8354789f34f1d0` |
| `closed-release-fix-and-doc-status-branches-20260822.bundle` | Eight closed release branches and `#840` | `a0b25665b3c3bbea479b76e0e1c01dc69ee0add55064873baad17975bd11e22e` |
| `trial-history-pr-841-20260822.bundle` | Merged branch head for `#841` | `64613fdc8aa9b177032750851a11964a801cbc73c304c7707c83e85194e91689` |
| `refactor-history-pr-842-20260822.bundle` | Merged branch head for `#842` | `c91adfa6d968ea509727758bba7db4379fe264379f111f6903b08eb162a2ee54` |

Each bundle was restricted to mode `600` and passed `git bundle verify`.

## Development Lessons

### Inventory before mutation

Worktrees must be classified before branches, and branches before deletion.
Tracked changes, untracked data, ignored runtime state, refs, PR ownership, and
worktree roles are separate facts. A clean-looking Git status does not prove
that a worktree or branch is disposable.

### Classify consumers, not filenames

A date, `closeout`, or `retrospective` suffix is only a review signal. Current
scripts, tests, policy markers, inbound links, and operator use decide whether
a document can move. This kept P5-B1, P5-B8, the P5 audit, active `v1`
contracts, trial runbooks, and Nightly contracts at stable paths.

### Normalize status before moving

The first inventory treated an exact `^Status:` match as if it meant a document
had no status. Several documents instead used a `## Status` section, Chinese
status text, or a blockquote. The corrected method added one machine-readable
top-level lifecycle status while preserving the original evidence statement.
Historical acceptance claims were retained as `Original status` when needed.

### Prefer bounded thematic PRs

Admin, Portal, production, status normalization, trials, and P5 evidence were
separate PRs. Each batch started from the latest `origin/master`, updated its
own inbound links, ran the narrowest documentation gates, and waited for
protected checks. This made review and rollback substantially clearer than a
single repository-wide move.

### Treat path churn as risk

Moving three post-P5/system handoffs would have required rewriting 38
cross-layer links without resolving a current consumer failure. The batch was
split and then stopped. A smaller root directory is useful only while it makes
current authority easier to find.

### Preserve before deleting

Remote deletion followed an exact sequence: resolve PR and ref state, create a
dated archive ref, create and verify a bundle for the reviewed set, record mode,
size, and digest, delete only exact branch names, and re-audit. Squash merges
were validated by patch equivalence rather than ancestry assumptions.

### Read observed state after automation

The `#841` wait command briefly reported a behind state while auto-merge was
completing. A fresh PR and `origin/master` read showed the PR already merged.
Observed repository state, not an earlier transient message, determined the
next action.

## Stopping Decision

Further movement would now be primarily cosmetic. The remaining dated records
are status-classified, discoverable through current indexes, or intentionally
retained because of fixed-path consumers and high link density. No active
consumer is failing because of their location.

Repository hygiene therefore stops here. The next priority returns to the
normal WordPress Ability -> Addon -> Cloud runtime -> hosted model -> reviewed
editor-adoption loop and the real usage, error, Provider, and quality evidence
needed to validate it.

Reopen documentation cleanup only when at least one of these conditions occurs:

- a historical record is repeatedly mistaken for current authority;
- navigation or a repository-local link is broken;
- onboarding or investigation repeatedly loses time to duplicate authority;
- an active consumer needs a governed path change; or
- a product/release change naturally owns the affected documents.

## Closeout Receipt

```text
REPOSITORY_HYGIENE_RECEIPT
- baseline/master: 4e2e3d914a2afeb6fe88b0b456dd0a2116fe6447
- worktree/owner: two clean retained worktrees; current task plus M4 operations master
- candidates reviewed by lifecycle class: Admin, Portal, production, trial, P5, dated root status, local and remote branches
- active authority retained: fixed-path policy/test evidence, active v1 contracts, runbooks, checklists, negative guards, ADRs
- historical evidence retained or moved: PRs #836-#842; 26 records moved by #841/#842 after status normalization
- commands/scripts removed and replacements: none
- task contracts default/active/archived: unchanged
- local generated state removed or deferred: unchanged
- focused local gates: link/path scans, status and move-set assertions, git diff checks, release-policy checks
- PR/CI/merge evidence: #836-#842 merged after protected required checks
- M4/production/human evidence: not applicable; M4 operations worktree received Git fast-forwards only
- residual risks and next review queue: three high-link post-refactor handoffs and cross-module retrospectives retained; reopen only through the value gate
- rollback: revert the relevant documentation PR; restore deleted branch heads from verified bundles if required
- lane/worktree release: cleanup stopped; two-worktree target topology retained
```
