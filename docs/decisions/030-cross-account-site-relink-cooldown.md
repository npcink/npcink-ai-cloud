# ADR-030: Cross-Account Site Relink Cooldown

## Status

Accepted.

## Date

2026-07-26.

## Context

ADR-029 makes the verified WordPress addon exchange the boundary for creating
or reconnecting a site and activating a never-subscribed account's Free
entitlement. It does not define when a WordPress site previously connected to
one account may be connected to another account.

Free entitlement belongs to the account. Treating a site as the owner of Free
credit would make reconnects move or regrant account value. At the same time,
allowing another account to claim a site immediately after disconnect would
make routine reconnects an account-takeover and promotional-abuse seam.

The policy needs to preserve three distinct facts:

- account entitlement;
- current site ownership;
- verified control of the WordPress host.

Elapsed time is not evidence that an active owner released a site, and an
operator exception is not evidence that the destination account controls the
WordPress host.

## Decision

Free entitlement and credit remain account-owned. Connecting, disconnecting,
or transferring a site never moves an existing subscription, entitlement
snapshot, or credit ledger entry and never regrants Free based on the site.

The same account may reconnect its site without a cooldown. A different
account may connect it only when all of these conditions hold:

1. the current account explicitly removed the site, leaving it archived with a
   durable ownership-release timestamp;
2. the site's stored cross-account cooldown has expired;
3. the global cross-account relink policy is enabled;
4. the destination account completes the normal short-lived, host-bound Addon
   issue and exchange flow;
5. the destination account still passes membership, entitlement, capacity,
   replay, and other existing checks at exchange time.

Active, inactive, provisioning, or suspended sites do not become transferable
when time passes. They remain bound until the current account explicitly
removes them.

The default cooldown is 90 days and may be configured from 90 through 365
days. Removal snapshots the then-current default onto the site and its released
binding record. Later global changes are prospective and do not rewrite
existing unlock timestamps.

Cloud stores durable site-account binding history. A successful cross-account
exchange releases the old binding, creates the new active binding, updates the
site account, clears the release/cooldown fields, rotates the runtime key, and
records an audit event in one transaction.

The bounded admin surface may:

- clear one released site's remaining cooldown immediately;
- set an exact unlock timestamp for one released site;
- reset one released site to the current global default;
- enable or disable cross-account relinking and change the future default.

These are policy overrides, not a manual approval queue. Clearing or changing a
cooldown does not transfer a site; the destination must still complete the
verified Addon exchange.

Before expiry, the Addon issue endpoint returns a conflict with
`retry_after_at` and the stored cooldown duration. It does not disclose the
previous account.

## Alternatives Considered

### Bind Free entitlement to the site

Rejected because account packages, subscription history, and credit ledgers are
account truth. Moving value with a hostname would create duplicate-grant and
ownership ambiguity.

### Apply the cooldown to same-account reconnects

Rejected because it would turn normal reinstall, key rotation, or recovery into
an availability problem without reducing cross-account abuse.

### Allow automatic transfer after 90 days without explicit removal

Rejected because elapsed time is not an ownership-release signal. Suspended or
temporarily inactive customer sites must not become claimable.

### Require an operator to approve every transfer

Rejected because the stored release/cooldown state plus the verified host-bound
exchange provides a deterministic path. Operators retain bounded exception
controls without becoming part of the normal flow.

### Rewrite all existing unlock dates when the global default changes

Rejected because it would retroactively lengthen or shorten already-communicated
release boundaries. Per-site reset is the explicit mechanism for that change.

## Boundary

Cloud owns account entitlement, site ownership history, cooldown policy,
host-bound Addon exchange, runtime keys, capacity, and audit evidence.
WordPress proves control of the normalized host during exchange; it does not
own entitlement or the cooldown policy.

The admin controls are an operator configuration surface over existing Cloud
commercial truth. They do not create a second WordPress control plane, local
ability registry, workflow registry, approval authority, or WordPress write
owner.

This decision adds no CAPTCHA, device fingerprinting, KYC, general risk engine,
or new infrastructure.

## Consequences

- Routine same-account reconnects remain immediate.
- Cross-account relinks are deterministic but cannot bypass explicit release,
  stored cooldown, or verified Addon exchange.
- Existing released sites keep a stable unlock timestamp when the global
  default changes.
- Operators can resolve exceptional ownership cases without introducing a
  review queue.
- Site-account binding history is retained for commercial and audit evidence.
- The schema requires migration `20260726_0069`.

## Rollback

Downgrade migration `20260726_0069` only as part of a reviewed source rollback,
then revert the models, repository, service, routes, admin UI, tests, README,
and this ADR through the normal GitHub workflow. Do not clear cooldowns,
reassign sites, or remove binding history directly on a production server as a
rollback substitute.
