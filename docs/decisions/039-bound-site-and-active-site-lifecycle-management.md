# ADR-039: Separate Bound-Site Capacity From Active-Site Lifecycle

## Status

Accepted. Supersedes decision 4 of ADR-016 only for bounded customer site
activation and deactivation. Customer key CRUD and manual Portal site creation
remain removed.

## Date

2026-08-09.

## Context

The WordPress Addon exchange previously treated the active-site quota as a
connection quota. When every active slot was used, a verified installation
could be bound in Cloud but the exchange failed before returning its connection
credential. The Addon therefore reported a missing or invalid key even though
the real condition was that the account needed to choose which bound site
should consume an active slot.

Binding and activation represent different facts:

- binding records verified ownership and retains connection, usage, and audit
  evidence;
- activation authorizes hosted runtime service and consumes plan capacity.

The Portal already owns account entitlement and Cloud service state. WordPress
must remain the local write and approval control plane, while the Addon remains
a connector for the current installation rather than an account-wide site
manager.

## Decision

Cloud maintains two separately reported capacities for each account:

- `active_limit` is the subscription entitlement and counts active sites;
- `bound_limit` is the anti-abuse ceiling `max(3, active_limit * 3)` and counts
  active, inactive, provisioning, and suspended bound sites.

A verified Addon exchange may create a binding and issue or rotate the hidden
runtime credential while the active quota is full. A new or archived site is
automatically activated only when an active slot is available. Otherwise it is
stored as inactive and the exchange returns the credential plus:

- `activation_state`;
- `activation_required`;
- `activation_reason`;
- active and bound capacity.

Reconnecting an existing inactive site rotates its credential but never
silently activates it. The Addon stores the credential, shows a connected but
activation-required state, and waits for the administrator to activate the site
in Cloud and explicitly verify the local connection.

The Portal session lists every site explicitly bound to the principal and
projects lifecycle status, allowed actions, and opaque account-capacity scope.
It does not expose the internal account identifier. Customers with the existing
`provision_sites` action may call:

```http
PATCH /portal/v1/sites/{site_id}/lifecycle
Idempotency-Key: <request key>
Content-Type: application/json

{
  "status": "active" | "inactive",
  "replace_site_ids": ["site_id"]
}
```

Deactivation preserves the binding, credential, usage, and audit evidence.
Activation at quota requires the caller to provide exactly the number of active
sites that must be deactivated. Cloud validates that every replacement is an
active site in the same account and is explicitly bound to the same principal,
then performs all transitions in one account-locked transaction. It never
chooses or deactivates a replacement implicitly.

Suspended sites remain operator-owned and archived sites must reconnect through
the verified Addon flow. Runtime request acceptance continues to require both
an active site and an active key.

Runtime error projection follows a credential-first disclosure rule. Cloud
first proves that the supplied active key belongs to the supplied `site_id`.
Only then may it return lifecycle-specific recovery such as
`auth.site_inactive`, `auth.site_suspended`, or `auth.site_not_ready`. A request
without a matching key returns `auth.invalid_key` without disclosing whether a
different site record exists. This preserves actionable customer recovery
without creating a site-ID enumeration surface.

## Alternatives Considered

### Reject Addon exchange when active quota is full

Rejected. It conflates verified binding with runtime activation, discards a
valid credential exchange, and produces misleading local recovery behavior.

### Automatically deactivate the oldest or least-used site

Rejected. Cloud cannot infer customer intent from age or usage. Silent
replacement could interrupt a production site.

### Put account-wide lifecycle management in the WordPress Addon

Rejected. The Addon represents one local installation and must not become a
second Cloud account control plane. Account-wide capacity and activation remain
in the Portal.

### Make bound-site capacity unlimited

Rejected. Inactive bindings retain credentials and operational evidence. A
separate bounded ceiling limits abuse without consuming paid active capacity.

## Consequences

- customers can retain more bound installations than they can run
  simultaneously;
- active quota is a reversible service allocation rather than a connection
  failure;
- explicit swaps remain deterministic, auditable, and race-safe;
- the Portal gains one narrow lifecycle write but no WordPress content, prompt,
  workflow, ability, approval, or local settings ownership;
- the Addon stores inactive credentials but keeps hosted runtime features
  unverified until a later successful probe;
- no schema migration or compatibility path is required before launch.
- customer-facing lifecycle messages become more specific without weakening
  runtime authorization or public identifier privacy.

## Verification

- API tests cover quota-full exchange, credential issuance, inactive reconnect,
  missing replacement conflict, exact explicit swap, deactivation, permission,
  suspended/archived rejection, and public response projection;
- Portal browser tests cover active and bound capacity plus lifecycle controls;
- Addon behavior tests cover exchange parsing, encrypted credential retention,
  activation-required presentation, and later successful verification;
- M4 candidate validation proves the API and Portal behavior against the shared
  preview runtime before merge acceptance.

## Rollback

Revert the Cloud lifecycle route, Portal controls, exchange projection, Addon
activation state, tests, and this ADR through normal Git review. Do not edit
site status, credentials, or binding history directly on a server as a rollback
substitute.
