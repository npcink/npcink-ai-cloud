# ADR-040: Reuse Tree-Bound Production PR CI Evidence

## Status

Accepted.

## Date

2026-08-10.

## Context

Every production promotion already runs the complete Cloud CI suite as a pull
request targeting `production`. After squash merge, the exact production push
ran the same complete backend and frontend suites again before building the
SHA-bound deploy bundle.

The 2026-08-09 Portal session release showed the cost clearly. The final
production PR suite took about 13 minutes. The byte-identical production push
then ran the same 764-test shard again; hosted-runner slow-tail variance doubled
that shard from about 11 minutes to about 23 minutes. The actual deployment
took about four minutes. Repeated test execution, not host mutation, dominated
the release path.

Reusing a green branch status by name or commit message would be unsafe. A
production release must prove which PR ran, which merge candidate tree was
tested, which applicable gates passed, and whether the final production tree is
identical.

## Decision

The production-promotion PR's final Cloud CI aggregation job emits a versioned
receipt after the applicable gates pass. The receipt binds:

- repository, production PR number, base ref, and head SHA;
- Cloud CI run ID and workflow path;
- the actual checked-out merge-candidate commit and Git tree;
- secret-scan plus complete backend/frontend or static-terms gate results.

On the exact production push, Cloud CI:

1. resolves exactly one merged same-repository PR targeting `production` for
   the production commit;
2. finds a successful pull-request Cloud CI run for that PR head;
3. downloads the exact PR/head-named receipt from that run;
4. verifies all receipt and GitHub identities;
5. requires the production commit tree to equal the tested PR tree;
6. builds and scans the exact production deploy bundle only after the evidence
   check succeeds.

The production push retains its own secret scan and separate CodeQL workflow.
The manual deploy workflow requires both exact-production-SHA Cloud CI and
CodeQL success before it downloads the bundle. Manual authorization and exact
SHA-bound bundle verification remain unchanged. Every non-static production PR
is forced into the complete backend lane regardless of ordinary diff targeting;
complete pytest/frontend execution is skipped only on the byte-identical
post-merge push.

## Alternatives Considered

### Keep both complete executions

Rejected as the default. It provides little new information when the Git trees
are identical and exposes the critical release path to hosted-runner variance.

### Trust the production PR head SHA only

Rejected. The PR tests GitHub's merge candidate, so head identity alone does
not prove that the production base or final tree is the tested result.

### Trust successful checks attached to any matching SHA

Rejected. A SHA may have been tested in another PR or against another base.
The versioned receipt binds the production PR, workflow run, gate results, and
tested tree explicitly.

### Build the deploy bundle in the production PR

Deferred. Reusing a PR-head image artifact would require an additional artifact
identity and supply-chain design. Building the exact production SHA-bound
bundle on the production push remains a short, clear authority boundary.

## Consequences

- Normal production push Cloud CI should approach the bundle-build critical
  path instead of the complete pytest critical path.
- Production-promotion PR CI remains the complete integration authority.
- Missing, expired, ambiguous, forked, or tree-mismatched evidence stops the
  production push and therefore stops manual deployment.
- Production PR evidence artifacts require a retention window long enough for
  the intended immediate promotion flow; delayed releases may require a fresh
  production PR run rather than a bypass.
- Natural `master` runs remain the only durable pytest weight source, so reused
  production pushes do not distort scheduling data.

## Rollback

Revert this ADR, the receipt verifier, workflow conditions, contract tests, and
release-policy text through the normal reviewed `master` PR. Restore complete
backend/frontend execution on production pushes before the next production
promotion. Do not bypass a production push that cannot verify its receipt.
