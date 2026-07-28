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

## Operator Workflow

1. Review the package, old version, new version, advisory, and changed files.
2. Require all protected checks to pass.
3. Merge security patches before routine version updates when both are queued.
4. For runtime or lockfile changes, deploy the merged `master` revision to M4
   and run the relevant runtime smoke checks.
5. Confirm default-branch alerts resolve after GitHub refreshes the dependency
   graph.

Do not deploy production merely because a Dependabot PR merged. Production
promotion remains governed by `docs/cloud-production-release-policy-v1.md`.

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
