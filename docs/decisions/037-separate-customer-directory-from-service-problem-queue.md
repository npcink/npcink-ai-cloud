# ADR-037: Separate the customer directory from the service problem queue

## Status

Accepted.

## Date

2026-07-31.

## Context

`/admin/accounts` and `/admin/coverage` answer different operator questions:

- Customers: “Who is this customer, and where is its complete record?”
- Service status: “Which customers may have a problem, why, and what is the
  next action?”

The validation-stage Customers page had gradually accumulated risk sorting,
service reasons, an inline inspector, identity audit, and destructive
disable-access actions. This duplicated the service queue and made “all
customers” behave like a second problem queue.

The project has no customer population or historical frontend compatibility
burden. We can therefore choose the clearest information architecture without
preserving obsolete list composition or URL filters.

ADR-036 remains authoritative for the Principal, Account, Membership, and
single-owner validation-stage model. This record refines only its Admin-surface
placement: the account-list inspector described there is no longer the owner of
identity audit or disable-access actions.

## Decision

### Customers

`/admin/accounts` is the canonical customer directory.

It owns:

- find and filter customers by customer information;
- create one customer, owner identity, and optional Free package;
- show a compact identity and service-footprint summary;
- open `/admin/accounts/{accountId}`.

It does not own:

- risk ordering;
- service-problem reasons;
- problem prioritization;
- a row-selection inspector;
- identity audit;
- destructive access actions.

The default order is customer display name. The detail link is the one primary
row action.

Creation opens in the shared Admin dialog. Operators enter customer and owner
information but do not supply an Account ID; the Cloud commercial domain
generates an opaque identifier and the completed flow opens that customer
detail.

### Service status

`/admin/coverage` is the canonical cross-customer service problem queue.

It owns:

- customers needing action by default;
- severity, problem reason, impact, and priority;
- identity, access, account-status, package, subscription, billing, site, and
  key-coverage problems;
- one contextual action that routes to the owning customer or subscription
  detail.

Aligned and inactive customers remain available as explicit filters, but they
are not the default view.

### Customer detail

Customer-specific work belongs in `/admin/accounts/{accountId}`.

Overview, Commercial, Credits and usage, Sites, Access, and Audit are distinct
task tabs. Customer information and the direct Suspend or Restore account
action belong in Overview. Package management belongs only in Commercial;
duplicate header shortcuts and a More menu containing one action are excluded.

The customer detail adds an Access tab that owns:

- primary identity and owner-membership evidence;
- bounded read-only identity audit;
- explicitly disclosed disable-access action and mutation receipt.

Service-status identity problems link directly to
`/admin/accounts/{accountId}#customer-access`.

### Data boundary

The Cloud service may add identity and relationship evidence to the existing
Admin coverage and account-detail projections. Principal, Account, and
Membership remain separate domain objects. This decision does not add a
WordPress write owner, payment flow, organization control plane, or second
customer source of truth.

## Alternatives considered

### Merge Service status into Customers

Rejected. A directory and a problem queue have different defaults, columns,
sort orders, and success conditions. Merging them would recreate tabs or
switches inside one overloaded route while weakening both jobs.

### Keep risk and identity actions in the customer list

Rejected. Operators would have two places to discover the same problems, and
destructive actions would appear before a specific customer record had been
opened.

### Remove aligned customers from the service projection

Rejected. Explicit all/aligned views are useful for verification and diagnosis.
They remain secondary filters rather than the default workload.

## Consequences

- Customers becomes a stable register even as service-problem rules evolve.
- Service status is the single cross-customer prioritization surface.
- Problem actions consistently land in the record that owns the mutation.
- Identity audit and disable remain Principal-scoped but are presented only in
  the owning customer detail.
- Old risk, coverage, package, expiry, and focus URL parameters on
  `/admin/accounts` are not compatibility contracts.

## Verification

The implementation must prove:

- the customer list is a semantic directory table with customer-name ordering;
- the list has no risk reason, inspector, identity audit, or disable action;
- the service queue defaults to customers needing action;
- identity, access, and suspended-account problems appear in the service queue;
- identity problem actions route to `#customer-access`;
- account detail returns identity evidence and exposes audit/disable in its
  Access tab;
- Cloud object ownership and WordPress-write boundaries remain unchanged.

## Rollback

Revert the focused frontend, projection, test, and documentation changes
together. No schema or data migration is involved. Do not restore the old
account-list inspector without a new operator-job decision.
