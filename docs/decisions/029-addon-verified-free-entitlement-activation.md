# ADR-029: Addon-Verified Free Entitlement Activation

## Status

Accepted.

## Date

2026-07-26.

## Context

Portal self-registration previously combined four different trust events:

- verification of an email address or first QQ login;
- creation of an active customer account and membership;
- creation of an active WordPress site;
- activation of the default Free entitlement with 300 credits per period.

The registration API could also accept a site URL and create an active site
without any request originating from that WordPress installation. This made an
identity proof look like a site-control proof, allocated service capacity
before a real runtime connection existed, and allowed abandoned or automated
registrations to create active commercial and runtime state.

The existing WordPress addon connection already has the stronger bounded proof
needed for activation: an authenticated Portal member selects an account, the
return URL is bound to the normalized site host, Cloud issues a short-lived
one-time code and hashed state, and the WordPress server exchanges that code.

## Decision

Separate identity registration from service activation.

Email verification or first QQ login creates:

- an active principal;
- an active account;
- an active membership with the existing bounded actions;
- a normal Portal session.

It does not create:

- an account subscription;
- an entitlement snapshot or credit budget;
- a site;
- a runtime API key.

`POST /portal/v1/register/code/request` accepts identity and locale fields
only. Legacy `site_url`, `site_name`, and `use_case` inputs fail closed instead
of being ignored. Registration responses may retain empty compatibility fields,
but they cannot carry a created site.

`POST /portal/v1/addon-connections` remains an authenticated authorization
step. It verifies active account, principal and membership state, the
`provision_sites` action, normalized site ownership, return-host binding,
current entitlement or default Free capacity, idempotency, and connection
code/state lifetime. It stores only a pending, encrypted one-time exchange
payload. It does not create or activate the site, bind Free, revoke or issue a
key, or return a key identifier.

`POST /portal/v1/addon-connections/exchange` is the activation boundary. In one
database transaction it:

1. verifies the one-time code, state, expiry, and replay status;
2. revalidates active account, principal, membership, and `provision_sites`;
3. activates `free/free_v1` only when the account has no subscription history;
4. validates the resulting active entitlement snapshot and site capacity;
5. creates or reconnects the WordPress site;
6. revokes replaced runtime keys, issues a new system-managed key, and marks
   the site active;
7. consumes the connection state and records the exchange audit event.

An account with inactive subscription history is not silently granted a new
Free subscription. Its addon exchange fails through the existing
subscription-required path and requires an explicit commercial resolution.

## Boundary

Cloud continues to own account, entitlement, site-runtime, key, capacity, and
audit truth. The WordPress addon supplies evidence that a real installation can
complete the host-bound exchange; it does not become entitlement or billing
truth.

This decision does not add KYC, CAPTCHA, device fingerprinting, a general risk
engine, a local ability or workflow registry, WordPress write authority, or a
second control plane. Additional anti-abuse controls require measured abuse
evidence and an independently reviewed contract.

Cross-account reuse of a previously connected site is governed separately by
[ADR-030](030-cross-account-site-relink-cooldown.md); that follow-up preserves
account-owned Free entitlement and adds an explicit-release cooldown without
weakening the verified Addon exchange.

## Consequences

- Registered users can log in immediately but initially see no connected site
  and no active package.
- Abandoned registration and abandoned addon authorization consume no site,
  key, or Free credit capacity.
- A successful addon exchange is the first point at which the service may
  expose an active site and 300-credit Free budget.
- Existing paid or otherwise active subscriptions keep their current
  entitlement and only use the exchange to connect or reconnect a site.
- No schema migration is required because the pending state already uses the
  bounded one-time OAuth-state store.
- Client copy must explain that registration creates the account and addon
  connection activates Free service.

## Rollback

Revert the registration payload, Portal registration service, addon
issue/exchange service, frontend copy/types, tests, README update, and this ADR
through the normal GitHub workflow. Do not restore registration-time site or
credit creation as an emergency server edit. If release evidence finds a
regression, keep new registration disabled or the addon activation path
unavailable until a reviewed source change is promoted.
