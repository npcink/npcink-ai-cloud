# Portal Preview Source and Repository Cleanup Retrospective - 2026-08-25

Status: dated repository and delivery evidence; not future deletion authority.

Current authority:

- [Single-Session Worktree Lifecycle](../../../single-session-worktree-lifecycle-v1.md)
- [Repository Stage-Transition Cleanup Standard](../../../repository-stage-transition-cleanup-standard-v1.md)
- [M4 Preview AI Development Standard](../../../m4-preview-ai-development-standard-v1.md)
- [Cloud Portal Customer Workspace UI Standard](../../../cloud-portal-customer-workspace-ui-standard-v1.md)

## Context

Portal account, billing, usage, site detail, Site Knowledge, and status surfaces
were iterated through several branches and M4 candidate checkpoints. The visible
result repeatedly appeared to return to an older layout even after newer work
had been implemented and merged.

The durable problem was not one CSS regression. Browser route, local checkout,
topic branch, merged `master`, M4 candidate source, and M4 accepted source were
different facts, but they were not always named together when an effect was
presented for review. Historical worktrees and branches remained registered
after their tasks ended, making an old checkout look like another active AI
session and making source selection unnecessarily ambiguous.

## Product and Interface Lessons

The Portal changes produced several reusable product rules:

- state the page's customer job before changing its layout;
- account entitlements and purchased knowledge capacity belong to the account,
  while bound sites share and explain that account capacity;
- put site-level usage decomposition on the account usage surface as
  progressive disclosure instead of making a site status page carry account
  billing responsibility;
- passive warning copy must lead to a named next action;
- align secondary actions with the data they explain, while keeping the main
  number and primary task visually dominant;
- remove duplicate service/status surfaces when they do not own a distinct
  customer decision; and
- treat browser review as semantic validation, not only visual approval.

The account usage decomposition therefore belongs near the knowledge usage
summary, with a compact right-aligned action opening shared dialog content.
Connection lifecycle, service operation, recorded errors, and quota pressure
remain separately owned facts. A generic `needs attention` label is not a
substitute for naming the affected object and the action available to the
customer.

## Source and Preview Lessons

One open AI conversation does not imply one Git worktree. Git worktrees persist
until explicitly closed, and a stable M4 operations worktree is intentionally
long-lived. Before asking for review, record:

```text
route=<browser route>
checkout=<absolute source path>
branch=<source branch>
revision=<exact source revision>
source_dirty=<true|false>
m4_state=<not used|candidate|accepted>
```

A direct M4 sync proves only the dispatched candidate. A merge proves
repository integration. A clean-current-`master` promotion proves M4
acceptance. None of those states can be inferred from the route alone, and no
candidate should be described as current after source changes without another
coherent dispatch and source-status check.

## Cleanup Evidence

The operator explicitly authorized a bounded repository cleanup after the
Portal result was accepted.

| Measure | Before | After |
| --- | ---: | ---: |
| Registered worktrees | 6 | 3 |
| Worktrees requiring manual review | 0 | 0 |
| Historical remote branches removed | 0 | 21 |
| Historical local active branches archived and removed in the final batch | 0 | 19 |

The three removed worktrees were clean historical production or release
checkouts. The final retained topology was:

1. the current primary checkout, retained because it contained unpublished
   commits and uncommitted documentation;
2. one locked task worktree, retained because it contained uncommitted internal
   link ranking work; and
3. the clean stable M4 operations checkout on current `origin/master`.

The remote cleanup excluded `master`, `production`, the current unpublished
branch, seven dependency-bot branches with open PRs, and one closed but
unmerged production candidate. Each deleted remote branch had an exact SHA
match with its merged PR head and no open PR. The deletion used one atomic
remote push followed by pruning and absence checks.

Recovery evidence was stored outside the repository at:

```text
/Users/muze/.local/share/codex/git-archives/npcink-ai-cloud/20260825-production-remote-cleanup/
```

The directory contains two verified mode-`600` bundles:

- `production-remote-cleanup.bundle`, 26,206,601 bytes, SHA-256
  `7c2b787b5b48aefa71122c6198aea23c125c468a1d4f43e2098f7195a9cdb23a`;
- `local-merged-branches.bundle`, 26,196,208 bytes, SHA-256
  `690d0d1f9bfefd803a7dd3d292da9a71b5d6214ef3a922d1be482ce9c7ed6b16`.

The archive refs use the dated `refs/archive/local-branches/20260825/*` and
`refs/archive/remote-branches/20260825/*` namespaces. Their retention and any
future removal require the active cleanup standard; this record is not expiry
or deletion authorization.

## Corrections During Cleanup

- The first zsh audit loop assigned to the special lowercase `path` variable,
  which replaced the shell path array and stopped before mutation. Cleanup
  scripts should use names such as `wt_path` and treat a protective stop as
  successful safety behavior.
- `worktree:audit` correctly failed closed on locks, dirty state, runtime roles,
  and squash-merged commits that were not ancestors of `origin/master`. Merged
  PR head equality supplied separate evidence; it did not weaken the audit.
- Removing remote branches exposed local branches with `[gone]` upstreams.
  Remote and local cleanup therefore need separate post-operation audits.
- A clean historical production directory was not removed merely because its
  PR was merged. Exact path, HEAD, branch, lock, runtime role, PR state, archive
  coverage, and release condition were checked first.

## Standard Development Loop

For future Portal delivery:

1. define the page job, state ownership, and next action;
2. implement one coherent checkpoint in one owned worktree;
3. run the narrowest source and browser gate;
4. dispatch the exact checkpoint to M4 when required and report its source
   identity;
5. merge through protected GitHub checks;
6. promote clean current `origin/master` before calling M4 accepted;
7. close the task worktree while PR and ownership evidence are fresh; and
8. clean remote branches only as a separately authorized, archived, exact-set
   operation.

This loop prevents interface design, source integration, runtime preview, and
repository cleanup from being collapsed into one ambiguous state.

## Boundary and Non-Claims

The cleanup changed Git topology and private recovery evidence only. It did not
modify Portal behavior, Cloud ownership, M4 runtime, production source, account
entitlements, usage records, or WordPress state. The retained dirty work was not
stashed, reset, switched, or edited. The final operational classification was
`KEEP_ACTIVE` because two retained development checkouts still contained
unpublished work.
