# Historical Issue Closure and Release Evidence Standard v1

Status: active engineering standard.

## Purpose

This standard defines how Npcink AI Cloud closes issues carried by handoffs,
retrospectives, release notes, and cross-repository work. It prevents a dated
document, a local checkout, or a merged pull request from being mistaken for
current integration, production, runtime, or consumer truth.

It complements the
[Development and Validation Operating Model](development-validation-operating-model-v1.md),
[AI Development Validation Tiers](ai-development-validation-tiers-v1.md),
[Cloud Production Release Policy](cloud-production-release-policy-v1.md),
[Repository Hygiene and Documentation Lifecycle Standard](repository-hygiene-and-documentation-lifecycle-standard-v1.md),
[Single-Session Worktree Lifecycle](single-session-worktree-lifecycle-v1.md),
and [Release Checklist](../deploy/RELEASE_CHECKLIST.md).

## 1. Freeze the Closure Envelope

Before changing source or declaring an issue closed, record:

- the finite issue list and the repository or module that owns each item;
- the intended outcome and explicit non-goals;
- public contracts and release surfaces that may change;
- the expected files, validation tier, rollback path, and bounded external
  operations;
- whether Cloud source, production, WordPress.org, M4, Provider, or another
  external system is in scope.

New findings are triaged separately unless they block an item in the frozen
ledger. Closure work must not grow into an unbounded cleanup campaign.

## 2. Use the Correct Authority for Each Claim

Evidence is consulted in this order for the claim it actually proves:

1. the active worktree proves only the task's uncommitted or committed change;
2. current `origin/master` proves Cloud integration source;
3. current `origin/production` proves Cloud production source;
4. GitHub pull requests, required checks, and workflow runs prove protected
   merge and automation conclusions;
5. live health, smoke, and consumer observations prove runtime behavior for
   the named revision and environment;
6. dated handoffs and retrospectives prove historical context only.

Fetch the relevant remotes before auditing closure. Never infer current state
from the branch that happened to be visible when the session started.

## 3. Maintain an Issue Evidence Matrix

Every historical item must have a row with these fields:

| Field | Required meaning |
| --- | --- |
| Issue | Stable description of the original problem |
| Owner | Repository and module that own the correction |
| Source state | Local, PR, merged to `master`, or other exact source state |
| Release state | Production branch, deployment, package registry, or WordPress.org state |
| Consumer evidence | Runtime or end-to-end observation, including the tested revision |
| Remaining blocker | Missing credential, approval, environment, or follow-up; `none` only when proved |

Use exact revisions, PR numbers, workflow URLs, package or SVN revisions, and
runtime revision projections where available. A source fix and a successful
consumer observation are related evidence, not interchangeable states.

## 4. Close Cross-Repository Items Independently

Cloud state does not prove an Addon release, and an Addon tag does not prove a
Cloud deployment. For WordPress.org releases, verify at minimum:

- the plugin version and declared stable tag;
- the WordPress.org SVN revision;
- the immutable tag URL;
- the source PR or commit for any repaired asset or translation metadata.

Record retained fixtures or media artifacts separately from active code
defects. Their existence is not evidence that a fixed defect remains open.

## 5. Change CVE Allowlists Atomically

A CVE allowlist addition, change, or retirement is one governed unit. Update
together:

- the allowlist entry and expiry or retirement intent;
- exact contract expectations and required reason templates;
- executable governed/retired CVE sets;
- focused contract tests;
- release-policy assertions when the production contract changes.

Run the narrowest focused gate first. An expired CVE disappearing from a scan
is not enough if stale policy or test expectations still authorize it.

## 6. Defend Production Pushes with an Exact-SHA Wait

Production deployment automation must use both a preflight and a bounded
workflow-level wait for the exact pushed production SHA:

- poll only the authoritative production workflow conclusion for that SHA;
- fail immediately on an explicit failed conclusion;
- fail closed when the bounded timeout expires;
- report the timeout and polling interval in the workflow contract;
- never treat a successful check for a different revision as authorization.

This wait reduces the race between a protected production push and deployment
dispatch. It does not bypass required checks or replace operator authorization.

## 7. Inspect the Protected Promotion Lane First

Before publishing a production promotion:

1. inspect all open PRs targeting `production`;
2. identify their base revision, conflicts, scope, checks, and current owner;
3. close a PR only when evidence shows it is objectively superseded or
   conflicting, and record that reason;
4. freeze the new promotion envelope before publishing it.

Do not promote an unrelated accumulated `master` delta merely to ship one
repair. When only a bounded, already-reviewed repair is authorized, create a
current-production-based `release-fix/*` branch, cherry-pick the reviewed
`master` commit, and preserve the required backport and protected-merge chain.

## 8. Treat the Release Plan as Authority

Run the governed release-plan command and record its exact result. Never guess
that a documentation, workflow, or policy change is `no_deploy`.

Before bundle construction, deployment, paid Provider use, or shared-runtime
operations, declare the relevant time and attempt budget. After two
consecutive failures with the same external-transfer signature, stop automatic
retries and preserve the evidence. Reuse successful sub-gate evidence when a
later unrelated assertion fails.

## 9. Keep Validation States Separate

The following states must be reported independently:

- changed locally;
- committed and pushed;
- PR checks green;
- merged to `master`;
- promoted to `production`;
- deployed successfully;
- health endpoint green;
- focused or small-customer preflight passed;
- formal authenticated smoke passed;
- end-to-end consumer path accepted.

Missing credentials, one-time codes, human approval, or unavailable fixtures
leave the affected state `deferred` or `blocked`. They never become an inferred
pass because adjacent checks are green.

## 10. Preserve Shell and Worktree Hygiene

- Use a clean, locked auxiliary worktree when the visible worktree contains
  unrelated changes.
- Stage only named task files; never use `git add -A` in a mixed worktree.
- Avoid shell variable names with special or environment meaning. In zsh, do
  not assign to `path`; use names such as `target_file` or `target_path`.
- Inspect status and diff statistics before staging, cached file names before
  committing, and the committed file list after committing.
- Keep an auxiliary worktree locked until its PR is merged and the worktree is
  clean; audit before removal.

## 11. Closeout Receipt

Each closure document should contain this compact receipt:

```text
Scope:
Issue ledger:
Source evidence:
Release evidence:
Runtime/consumer evidence:
Deferred evidence:
External-operation budget and actual use:
Rollback:
Final state:
```

The final state must identify any historical item that remains open. If none
remain, say so only for the frozen ledger and named evidence date.

## 12. Stop and Roll Back

Stop the closure when:

- the authoritative branch or repository cannot be fetched;
- the promotion includes unreviewed or unrelated scope;
- required credentials or human approval are absent;
- the release plan or protected checks fail;
- two external-transfer attempts fail with the same signature;
- runtime revision evidence does not match the intended release.

Rollback uses the owning system's governed path: revert source through a PR,
redeploy the last accepted production revision, restore a retired allowlist
only with its complete contract, or publish a corrected plugin tag under the
WordPress.org release process. Never rewrite evidence to make an incomplete
release appear complete.
