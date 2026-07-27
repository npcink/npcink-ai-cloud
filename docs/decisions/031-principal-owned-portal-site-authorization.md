# ADR-031: Require Principal-Owned Portal Site Authorization

## Status

Accepted. Supersedes the account-wide site-authorization portion of ADR-016.

## Date

2026-07-27.

## Context

Cloud product identity is limited to `platform_admin` and `user`, but the
Portal previously authorized site access through account membership alone. Any
active user in an account could therefore read and operate every site in that
account, including a site connected by another user.

That behavior did not match the product rule that a user manages only sites
explicitly bound to that user. It also made the Admin copy inaccurate when it
described site-level binding that did not exist in storage.

Account membership and site ownership answer different questions:

- membership proves that a principal belongs to a commercial account and
  carries bounded actions;
- site binding proves that the same principal owns Portal access to one
  connected site.

Neither relation changes WordPress user, role, approval, or write truth.

## Decision

1. Portal site authorization requires all of the following:
   - active `Principal`;
   - active `AccountUserMembership` for the site's account;
   - required membership action, when the operation declares one;
   - active `PrincipalSiteBinding` for the exact principal and site.
2. One site has at most one active principal binding. A second user cannot
   claim an already bound site by reconnecting it.
3. A verified WordPress Addon exchange creates the binding atomically with the
   site/account connection and runtime-key exchange.
4. Removing a site releases both its principal binding and account binding.
   The former user no longer has Portal access after removal.
5. The internal account-membership operation may accept an optional `site_id`
   so bounded operator/bootstrap workflows can explicitly assign an existing
   site. Creating membership alone does not grant access to every account site.
6. Migration backfill assigns an existing site only when its account has
   exactly one active user. Multi-user and otherwise ambiguous accounts remain
   unbound and fail closed until an explicit verified or operator binding.
7. Product copy uses only `platform_admin` and `user`. WordPress-local
   administrator terminology may remain only where it describes WordPress
   ownership rather than a Cloud product identity.

## Alternatives Considered

### Keep account-wide site access

Rejected because it lets one user manage sites connected by another user and
cannot satisfy the stated ownership boundary.

### Put `principal_id` directly on `sites`

Rejected because site identity, account ownership history, and Portal user
authorization have separate lifecycles. A binding history keeps those resource
dimensions explicit.

### Reuse the retired `site_user_grants` table

Rejected because its earlier semantics and routes were removed during the P4
contraction. A narrowly named ownership relation avoids reviving the former
general-purpose grant surface.

### Guess ownership for every existing site

Rejected because a multi-user account contains no durable evidence identifying
which user connected a legacy site. Ambiguous authorization must fail closed.

## Consequences

- A user sees only explicitly bound sites, even when another user belongs to
  the same account.
- Membership actions continue to control what an owner may do; site binding
  does not create new roles or capabilities.
- An archived/removed site is no longer manageable through Portal after its
  binding is released.
- Platform administrators retain the bounded Cloud service surface and may use
  explicit internal bootstrap/assignment operations without gaining WordPress
  role authority.
- Existing multi-user accounts may require explicit site reassignment after
  migration.

## Verification

- Migration tests cover single-member backfill, ambiguous multi-member
  fail-closed behavior, uniqueness, lifecycle constraints, and downgrade.
- Portal tests prove user A cannot access user B's site in the same account
  while user B can.
- Addon tests cover same-owner reconnect and conflicting-owner rejection.
- Portal route, session, billing, usage, audit, support, and removal tests run
  through the same principal-site authorization resolver.
- Frontend contracts reject legacy `site_admin` product identity copy.

## Rollback

Revert the application changes, then downgrade migration `20260727_0072`.
Downgrade removes only principal-site binding history and the new platform
administrator role check. It does not delete principals, memberships, accounts,
sites, subscriptions, billing data, or WordPress data.
