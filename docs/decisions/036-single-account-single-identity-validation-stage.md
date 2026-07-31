# ADR-036: Single-account, single-identity validation stage

## Status

Accepted.

## Date

2026-07-31.

## Context

Npcink AI Cloud is still in product validation. It has no real customer
population and no compatibility requirement for the current standalone
`/admin/portal-users` product surface.

The existing storage model already separates:

- `Principal`: one stable login identity;
- `Account`: the commercial customer and tenant boundary;
- `AccountUserMembership`: the relationship between the identity and account.

That separation is valuable, but the current product exposes more multi-account
and multi-member complexity than the validation stage needs. The standalone
Portal-user directory also groups users by registration source instead of the
operator's current job: understand one customer, its one login identity, and
its service state.

Future organization support remains plausible. An organization may later have
an owner, organization administrators, and organization members. That future
does not require a new organization identity type. It requires an Account with
multiple Principal memberships.

This decision narrows the launch-stage product behavior while preserving the
stable identity boundary in ADR-003. It supersedes ADR-003 only where that
record treated multi-account membership and the generic `user` membership role
as current product behavior.

## Decision

### Product behavior

During the validation stage:

1. one customer Account has at most one active Principal membership;
2. one Principal has at most one active Account membership;
3. the only accepted customer membership role is `owner`;
4. Portal registration creates the Principal, Account, and owner Membership in
   one transaction;
5. interactive Admin customer creation requires a primary login email and
   creates the same three-object relationship;
6. low-level internal account provisioning may create an unattached technical
   Account, but Admin must expose that state as incomplete rather than inventing
   an identity;
7. a second active account or identity relationship is rejected with a
   structured `409` conflict at the service boundary.

### Admin surface

`/admin/accounts` is the only customer-directory product surface.

The customer queue projects the primary identity beside Account, site,
subscription, and package evidence. The customer inspector owns low-frequency
identity audit and the destructive disable-access action.

The standalone `/admin/portal-users` frontend route is removed. The existing
Principal-oriented backend interfaces remain internal support and diagnostic
interfaces; they do not define a second customer product.

### Future organization model

Organization support must reuse the same objects:

```text
Principal N <- AccountUserMembership -> N Account
```

An organization is an Account, not an identity. Organization owner,
administrator, and member are Membership roles or capabilities. The product may
add those roles only when the organization workflow, authorization matrix,
invitation lifecycle, and recovery behavior are designed and tested.

The current one-to-one restriction is enforced in domain services, not through
new single-column database uniqueness constraints. Removing the stage
restriction must therefore not require rebuilding the relationship table.

## Alternatives considered

### Merge Principal columns into Account

Rejected. Email and provider subjects are login aliases, while Account owns
commercial, site, subscription, credit, and billing state. Combining them would
make future organization membership a destructive schema redesign.

### Keep a separate Portal-user product page

Rejected. It duplicates customer context, exposes a registration-source
taxonomy as navigation, and asks an operator to reconcile two directories for
one current customer.

### Build organization support now

Rejected. Invitation, account switching, member removal, role escalation,
ownership transfer, and recovery are not validation-stage requirements.
Empty organization architecture would increase surface area without current
user evidence.

### Add database uniqueness for one Principal and one Account

Rejected. A service-layer stage guard provides the current product restriction
without blocking the future many-to-many organization model.

## Consequences

- Admin customer rows can be understood without switching directories.
- Identity disable remains Principal-scoped and must clearly state its effect.
- Unattached or conflicting Account membership state is an operator-visible
  error, not silently selected data.
- Existing `role='user'` rows are migrated to `role='owner'`.
- Product and tests no longer claim current multi-account membership support.
- Repository query methods for Principal-, Account-, and Membership-oriented
  access remain available for future organization work.

## Verification

The implementation must prove:

- registration and interactive Admin creation produce one owner membership;
- a second active Account for one Principal returns `409`;
- a second active Principal for one Account returns `409`;
- revoking the existing relationship remains possible;
- the Admin account projection returns identity and relationship state;
- the standalone Admin Portal-user route and navigation entry are absent;
- Principal, Account, and Membership remain separate database entities;
- no production, WordPress write, or organization-control surface is added.

## Rollback

Revert the focused implementation and migration together. The rollback restores
the `user` role value and the standalone frontend route. It must not merge
Principal into Account or remove Membership, so no identity reconstruction is
required.
