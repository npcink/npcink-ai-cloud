# Single AI Session Workflow Standard v1

Status: active engineering guide for single-session AI development.

Purpose: make every task follow the same deterministic sequence so that the
trial-and-error costs seen in earlier releases (stale-branch CI re-runs,
branch-protection surprises, late review rework) do not recur. This standard
applies when exactly one human or AI development session is active against
this repository, which is the current default mode.

This standard does not change Cloud product ownership, GitHub branch
protection, M4 acceptance authority, production approval, or the requirement
to preserve user work. It is owned by the Cloud Addon/npcink-ai-cloud
development workflow and does not expand Cloud product scope.

## 1. Branch Creation Rule

Always create the topic branch from the latest `master`:

```bash
git fetch origin master
git switch -c <topic> origin/master
```

Never create a topic branch from another topic branch. Branch protection on
`master` is strict: a branch not based on the latest `origin/master` is
BLOCKED, and every forced rebase costs a full CI re-run (10-25 minutes).

If a topic branch was accidentally created from the wrong base, rebase it
before pushing anything:

```bash
git rebase --onto origin/master <old-base> <topic>
```

## 2. PR Publication

The repository already owns a deterministic publisher:
`scripts/publish-pr.sh` (also reachable as `npm run pr:publish` or
`make publish-pr PR_ARGS="..."`). Use it instead of manual
`gh pr create` / `gh pr merge` sequences.

```bash
bash scripts/publish-pr.sh --title "<title>" --body-file /path/to/body.md
```

The script enforces:

- the topic branch is not the base branch;
- the worktree is completely clean (`git status --porcelain`, including
  untracked files — move or commit stray files such as agent session
  artifacts before publishing);
- the branch includes the latest `origin/<base>` (fails fast with no
  BLOCKED PR and no stale CI re-run);
- the body file contains the `Scope`, `Boundary`, `Verification`, `Risk`
  headings; a `--base production` PR additionally requires the operator
  approval phrase;
- no open PR already exists for the branch;
- it then pushes, creates the PR, and requests squash auto-merge
  (`gh pr merge --auto --squash --match-head-commit`).

Dry-run first:

```bash
bash scripts/publish-pr.sh --title "<title>" --body-file /path/to/body.md --dry-run
```

The publisher refuses to re-publish a branch that already has an open PR
(its idempotency guard, `scripts/publish-pr.sh` lines 117-124). After a
force-push, re-request auto-merge for the new head manually:

```bash
gh pr merge <pr-url> --auto --squash --match-head-commit <new-head-sha>
```

Prefer batching local changes into one rebase before the first push.

## 3. Change-Scoped Testing

"Change what you touch; full-suite only at the release gate."

| Changed path | Local verification |
| --- | --- |
| `app/domain/commercial/mixins/*.py` | `ruff` + `mypy` + `pytest tests/domain/test_commercial_*.py tests/api/test_portal_routes.py tests/api/test_service_routes.py` |
| other `app/domain/commercial/*.py` | `ruff` + `mypy` + `pytest tests/domain/test_commercial_*.py` |
| other `app/domain/**` | `ruff` + `mypy` + `pytest tests/domain/ tests/api/` |
| `app/api/**` | `ruff` + `mypy` + `pytest tests/api/` |
| tests only | `pytest` on the changed test files |
| frontend / docs / scripts | static checks only |

CI (`scripts/check-pr-backend-gate.sh`) applies the same mapping in its
`backend-targeted` gate, so production code changes without an accompanying
test file still run the focused suites. The full `backend-pytest` gate runs
only for high-risk surfaces (`pyproject.toml`, migrations, core models,
Dockerfile, CI config) and on the `production` branch.

Run the full local suite only immediately before a release promotion:

```bash
.venv/bin/pytest tests/ -q
```

## 4. Pre-Merge Checklist

- [ ] Branch based on latest `origin/master` (script enforces).
- [ ] Worktree clean, including untracked files (script enforces; move stray
      files before publishing).
- [ ] Local ruff/mypy on changed files pass.
- [ ] Change-scoped pytest passes (Section 3 mapping).
- [ ] Body file contains `Scope`, `Boundary`, `Verification`, `Risk`.
- [ ] Published via `scripts/publish-pr.sh`; squash auto-merge requested.
- [ ] Cloud CI green on the final head; any review comment threads resolved
      (branch protection requires conversation resolution).
- [ ] PR is MERGED (auto-merge completes once required checks pass).

## 5. Known Traps

- **Stale branch**: the publisher fails fast; rebase onto
  `origin/master` before publishing, never after (a forced rebase after a
  PR exists invalidates CI and re-runs the whole gate).
- **Untracked files block publishing**: `git status --porcelain` must be
  empty; move agent/observation artifacts out of the tree first.
- **Review threads unresolved**: auto-merge stays BLOCKED even when all
  checks are green; resolve threads via the GitHub UI or GraphQL
  `resolveReviewThread`.
- **Force-push after a PR exists**: invalidates prior CI runs; batch all
  local changes into one rebase before the first push whenever possible.
- **Creating a branch from the current branch**: always use
  `git switch -c <topic> origin/master`.
