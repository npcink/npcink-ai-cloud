# ADR-034: Keep Existing Sites Unbound During Ownership Bootstrap

## Status

Accepted. Supersedes decision 6 of
[ADR-031](031-principal-owned-portal-site-authorization.md).

## Date

2026-07-28.

## Context

ADR-031 introduced `principal_site_bindings` so Portal access to a site no
longer follows account membership alone. Its original migration decision
automatically assigned a historical site when the account had exactly one
active user.

That shortcut still inferred resource ownership from account membership.
Membership proves account access, not that the principal controlled the
WordPress installation that connected the site. The project has no production
users or compatibility requirement, so there is no reason to preserve this
weaker bootstrap behavior before release.

## Decision

Migration `20260727_0072` creates the binding table, indexes, lifecycle
constraints, and canonical platform-admin role constraint, but inserts no
`principal_site_bindings` rows.

Every existing site remains unbound after migration. Portal access stays
fail closed until one of these explicit paths creates a binding:

1. a verified WordPress Addon exchange binds the authenticated principal to
   the exact site; or
2. a separately authorized operator action explicitly assigns the principal
   and site.

Account membership, member count, recent login, email, payment, usage, site
creation time, or other circumstantial evidence never selects an owner.

## Alternatives Considered

### Keep the single-member backfill

Rejected. A single possible account member is not evidence that the principal
controlled the WordPress installation. It also contradicts the release
checklist's ownership-inventory rule.

### Add a new compatibility migration

Rejected. Revision `0072` has not been released to users, and the project has
no compatibility requirement. Editing the unreleased migration is smaller and
leaves no dead compatibility path.

### Delete historical sites

Rejected. An unbound site is safe and preserves operational evidence. Deletion
would destroy history without improving authorization.

## Consequences

- migration never grants Portal site access;
- a fresh database and any pre-release historical data use the same
  fail-closed rule;
- the normal verified Addon exchange remains the primary ownership proof;
- operator assignment remains explicit and auditable;
- WordPress roles, permissions, approval, and write authority remain local;
- no new identity type, registry, workflow, or compatibility layer is added.

## Verification

- the `0072` migration test seeds both single-member and multi-member accounts
  and proves the new binding table remains empty;
- the same test inserts one explicit verified binding and proves uniqueness
  and lifecycle constraints still fail closed;
- existing Portal and Addon authorization tests continue to prove that only an
  active exact binding grants site access.

## Rollback

Before release, revert this ADR and the focused migration/test change through
normal Git review. Do not introduce an automatic ownership repair on a server.
