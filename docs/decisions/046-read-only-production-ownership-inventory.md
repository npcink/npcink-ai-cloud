# ADR-046: Use a Read-Only Production Ownership Inventory

## Status

Accepted

## Date

2026-08-17

## Context

Principal-owned Portal authorization intentionally keeps historical sites
unbound when verified Addon evidence does not identify one owner. The
production release policy therefore requires a read-only inventory before an
existing user/site dataset is migrated or real-user Portal access is enabled.

The production database is reachable only through protected runtime
configuration on the production host. Developer machines do not receive its
credentials, and `Deploy Production` must not be used as a diagnostic query
button because dispatch authorizes runtime mutation.

## Decision

Add an operator-initiated `ownership-inventory` action to the existing
`Production Maintenance` workflow.

The action:

- uses the protected production SSH identity and existing serialized
  maintenance lane;
- validates that `current` resolves to one direct managed release;
- streams a checked-in Python query to the running API container without
  copying a file to the host or rebuilding an image;
- starts a PostgreSQL `READ ONLY` transaction before querying;
- emits aggregate counts and at most 100 samples containing only opaque
  principal, account, and site IDs;
- never emits email addresses, site URLs, customer content, credentials,
  Provider subjects, or secret values;
- fails closed for unsafe identifiers, malformed binding lifecycle, duplicate
  current bindings, invalid current bindings, or an active multi-user site
  without exactly one lifecycle-valid principal binding;
- reports single-member unbound sites and sites without valid members as
  warnings without assigning an owner.

The action performs no ownership inference or remediation. A blocked result
stops production migration and real-user enablement until separately verified
Addon evidence and an operator-reviewed repair establish the intended owner.

## Alternatives Considered

### Query production directly from a developer machine

Rejected. It would distribute database or SSH credentials outside the
protected production environment and make evidence collection depend on local
operator state.

### Add an Admin or Portal ownership-repair endpoint

Rejected. Inventory is release evidence, not a customer-facing control plane.
An endpoint would expand Cloud mutation authority and make accidental or
inferred assignment easier.

### Run the inventory inside `Deploy Production`

Rejected. A diagnostic query must be available before the exact human deploy
authorization. Coupling it to deployment would either mutate too early or turn
the deployment workflow into a general maintenance interface.

### Automatically bind single-member accounts

Rejected. Account membership, login history, payment, usage, and other
circumstantial evidence do not prove site ownership. Unproven ownership remains
unbound and fail closed.

## Consequences

- Production ownership evidence can be collected without sharing secrets or
  deploying application code.
- The result is repeatable, bounded, and suitable for release records.
- A workflow-only change must reach `production` before the action is
  available, but its exact release plan is `no_deploy` and requires no host
  update.
- Any future remediation remains a separate reviewed operation with its own
  rollback and evidence contract.
