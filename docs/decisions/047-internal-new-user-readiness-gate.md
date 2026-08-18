# ADR-047: Use a deterministic internal new-user readiness gate

## Status

Accepted

## Date

2026-08-18

## Context

The first external users should not be the first people to discover Portal
session, site-filter, entitlement, connector, quota, or recovery defects. The
project has no real users yet, so the development process needs a safe way to
exercise those states without provider spend, production writes, or invented
customer data.

The most important product distinction is that package and service rights are
account-owned while usage and connection evidence can be site-scoped. A site
selector must therefore be a data-evidence filter, not a second entitlement
scope. Failures must also be tested for disclosure and recovery behavior, not
only HTTP status.

## Decision

Adopt `docs/internal-new-user-readiness-gate-v1.md` as the active internal
development standard. The gate uses:

1. a ten-scenario deterministic metadata-only matrix;
2. explicit account/site ownership assertions;
3. stable fault error/status/disclosure/recovery contracts;
4. focused Portal browser regressions using synthetic route mocks;
5. required GitHub checks and clean-master M4 acceptance for runtime-bearing
   changes.

Evidence states remain separate: local verified, candidate M4, PR verified,
merged `master`, and accepted M4. A passing local test or direct M4 sync cannot
be reported as accepted source.

## Alternatives considered

### Wait for real users

Rejected. It delays discovery of deterministic authorization, localization,
retry, and state-ownership defects until after external exposure.

### Use production or paid Provider traffic to simulate failures

Rejected. It creates unnecessary privacy, cost, and cleanup risk and does not
prove the Portal's deterministic recovery behavior.

### Build a second Cloud entitlement/site-control plane for the matrix

Rejected. The matrix must test the existing ownership boundary, not introduce
another source of truth or move WordPress control-plane authority into Cloud.

### Run the full repository and M4 suite after every small test edit

Rejected. The validation tier selects the smallest gate that answers the risk;
full gates remain merge or high-risk controls, not an inner-loop substitute.

## Consequences

Positive:

- deterministic failures can be reproduced before external users arrive;
- account/site semantics are documented and executable;
- customer-facing error copy is reviewed for localization and disclosure;
- M4 remains a realistic runtime witness without becoming source truth.

Trade-offs:

- synthetic mocks do not prove real mailbox, OAuth, or Provider behavior;
- frontend browser evidence may require the dependency-equipped CI/M4 lane;
- the matrix requires maintenance when a public error contract changes.

## Related evidence

- PR #786: readiness matrix;
- PR #787: Portal site-filter routing semantics;
- PR #788: fault injection contracts and customer-safe error mapping;
- PR #789: localized Portal browser regression;
- M4 accepted revisions are recorded in each task's promotion status and
  observation receipt.
