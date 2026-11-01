# PR And Dependency Update Policy

Status: active.

## Decision

Human-authored pull requests and Dependabot-authored pull requests use separate
presentation contracts but the same protected-branch quality gates.

Human PRs must retain the `Scope`, `Boundary`, `Verification`, and `Risk`
headings from `.github/pull_request_template.md`.

Dependabot is not exempt from semantic validation. A bot PR is accepted only
when all of the following are true:

- GitHub identifies the author as the Dependabot bot;
- the head repository is the same repository as the base;
- the head branch begins with `dependabot/`;
- the base branch is `master`;
- every changed file is a dependency manifest, lockfile, Dependabot
  configuration file, or GitHub Actions workflow;
- the generated body retains the package name and the old/new version
  statement.

If any condition fails, the bot lane fails closed. Adding human headings does
not convert an invalid Dependabot change into an accepted dependency update.

## Rationale

Dependabot generates useful security and release evidence but does not populate
the project's human PR template. Requiring human headings on every bot update
created repetitive manual work and delayed security patches. A blanket bot
exemption would be unsafe because it could allow an unexpected source change to
bypass the change envelope.

The trusted-bot lane therefore validates identity, repository origin, branch,
target, changed-file scope, and version intent. Code review, Cloud CI, CodeQL,
secret scanning, and branch protection remain unchanged.

The lane validates the envelope, not the wisdom of the version jump. A bot PR
that rewrites a declared upper bound passes every condition above, so the range
question is deliberately left to the operator workflow rather than added as a
seventh acceptance condition.

## Operator Workflow

1. Review the package, old version, new version, advisory, and changed files.
2. When the update crosses a declared range, review it as a change of intent.
   An explicit upper bound does not block Dependabot; it rewrites the bound.
   Measured 2026-09-19/20: `pymilvus>=2.4,<3.0` became `>=2.4,<4.0` to admit
   3.0.1, and `gunicorn>=23.0,<24.0` became `>=23.0,<27.0` to admit 26.2.0 —
   both presented as routine version updates. A bound the repository wrote
   deliberately is a decision, so a major update that rewrites one needs its own
   evaluation: read the changelog across the skipped majors and confirm nothing
   the consumer relies on changed. Do not merge it on the strength of a green
   bot lane.
3. Require all protected checks to pass.
4. Merge security patches before routine version updates when both are queued.
5. For runtime or lockfile changes, deploy the merged `master` revision to M4
   and run the relevant runtime smoke checks.
6. Read default-branch alerts again after GitHub refreshes the dependency graph;
   record state, resolved version, manifest and scope. The same alert may remain
   open while moving to another installed version. A merged PR is not evidence
   that its alert closed. When the published range and version-specific
   mechanism disagree, preserve a bounded reproducer and consumer API evidence,
   report the unresolved alert, and seek upstream range clarification through
   an authorized channel. Do not suppress it or force an incompatible global
   override solely to obtain a green scan.

Do not deploy production merely because a Dependabot PR merged. Production
promotion remains governed by `docs/cloud-production-release-policy-v1.md`.

## Coupled packages and inherited failures

Review the resolved consumers together: React and React DOM need matching
renderer versions; Vitest and its coverage provider need compatible exact
peers. A frozen install and ordinary test run can both pass without exercising
the coverage plugin. Run the actual coverage path when that peer changes, and
check installed container versions after the dependency-aware M4 deployment.

For a transitive security override across major versions, scope the override
to the actual parent, inspect removed APIs against that parent's calls, and
exercise the consumer as well as the advisory counterexample. Resolve the
test dependency through the parent so an unrelated safe copy cannot hide the
old version. Record any remaining audit findings without suppressing them;
remove the override once the parent admits a fixed compatible version and
the consumer regression still passes. See the [minimatch #123 record](history/engineering/2026/minimatch-alert-123-remediation-2026-11-01.md).

Serialize updates that overlap a manifest or lockfile. Refresh each on current
master and inspect its final diff so it preserves previously integrated source
and dependencies. For major updates, check the release's runtime floors,
removed APIs/options and changed assertion/mock behavior against actual usage.
Do not change tests merely to make a new runner green.

When full CI exposes an application or test-contract regression inherited from
master, preserve and reproduce the failure before classifying it. Repair source
or test files in a separate focused human PR, then refresh the dependency PR on
that merged fix. Do not skip the failed check, weaken the assertion, or put
application/test source into the trusted-bot lane. A test-only correction can
retain an exact dictionary assertion while adding newly contracted fields.
If a failure depends on first import or environment initialization, reproduce
the exact test in a fresh process and its file in isolation; a prior full-suite
pass may only reflect cached modules. Keep the original failure evidence and
security assertion when correcting fixture setup order.

Editing a PR body can retrigger its required contract check. Re-read checks for
the current head and body before merging; an earlier green result is not a
reason to bypass a newly expected check. Aggregate merged dependencies into one
clean-master M4 acceptance checkpoint when their independent candidate evidence
is already complete and no changed risk requires another broad run.

## Verification

Run:

```bash
pnpm run test:pr-body-contract
pnpm run check:release-policy
```

The regression suite covers the human contract, valid npm and GitHub Actions
updates, source-file injection, external head repositories, non-Dependabot
branches, and missing version evidence.

## Rollback

Revert the focused contract commit. The previous behavior will again require
human headings for all PRs; it must never be replaced with an unconditional
Dependabot bypass.
