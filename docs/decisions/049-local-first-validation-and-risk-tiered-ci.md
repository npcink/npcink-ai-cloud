# ADR-049: Local-First Validation and Risk-Tiered CI

## Status

Accepted

## Date

2026-08-21

## Context

The project is developed by one operator with frequent local iteration. The
repository already has a risk-aware `check:changed` router, but its role was
not obvious from the command surface, while GitHub Actions remained the first
place where a long backend shard could fail or time out. A production-safe
release gate is valuable, but using the same breadth during every development
edit slows feedback and makes a remote runner a debugging environment.

The recent production-promotion candidate demonstrated the distinction: most
checks passed, while one backend pytest shard ended with exit code 124 after a
long remote run. That evidence blocked the PR but did not identify a local
reproduction. The failure must be diagnosed separately from the production
release decision.

## Decision

Use three explicit validation lanes:

1. `development`: run `pnpm run verify:local` before publishing. This is an
   alias for the existing `check:changed` router and executes only the focused
   local gates selected from the current diff. It never creates a PR, invokes
   GitHub Actions, mutates M4, or touches production.
2. `merge`: publish only a locally verified candidate. GitHub required checks
   remain the independent merge authority and may be broader where the changed
   risk requires it.
3. `release`: keep the exact-SHA production preflight, bundle, explicit
   operator authorization, deployment, and post-deploy observation as a
   separate strict lane.

This ADR makes the local-first contract discoverable without creating a second
validation engine. `check:changed` remains the single owner of path/risk
classification and command selection.

## Alternatives Considered

### Run the full GitHub matrix for every edit

Rejected: it makes remote CI the first debugging loop and allows long or
unavailable runners to block ordinary iteration.

### Replace GitHub with local full Docker validation

Rejected: local Docker does not reproduce the clean hosted runner, security
scans, or protected merge environment, and it would add unnecessary load to
the authoring machine.

### Create a second local validation tool

Rejected: parallel routers would drift. The new command is only a discoverable
alias for `check:changed`.

## Consequences

- Developers have one obvious pre-publish command.
- Local failures are expected to be reproducible before GitHub is used.
- GitHub remains necessary for independent clean-environment and security
  evidence; it is not replaced.
- Production release controls remain strict and are not shortened by this
  development optimization.
- A future CI optimization may make ordinary PR checks path-aware, but it must
  preserve the required full checks for L2 and release-sensitive changes.

## Verification and Rollback

- Verify the command inventory contract and `pnpm run verify:local -- --plan`.
- Roll back by removing the alias and this ADR; the underlying `check:changed`
  router remains unchanged.
