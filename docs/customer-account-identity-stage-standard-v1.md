# Customer Account and Identity Stage Standard v1

Status: active validation-stage standard.

Purpose: keep customer onboarding and Admin operations simple now while
preserving a safe path to future organization accounts.

Authority:

- [ADR-003: Stable Cloud principal identity](decisions/003-stable-cloud-principal-identity.md)
  owns permanent Principal identity semantics.
- [ADR-036: Single-account, single-identity validation stage](decisions/036-single-account-single-identity-validation-stage.md)
  owns the current product restriction and Admin consolidation.

## 1. Current product contract

The current customer model is:

```text
one Principal -> one active owner Membership -> one Account
```

The product must not expose:

- multiple customer accounts for one login;
- multiple login identities for one customer;
- account switching;
- invitations;
- organization roles;
- custom permissions.

The storage model must continue to keep Principal, Account, and Membership
separate.

## 2. Object ownership

| Object | Owns | Does not own |
| --- | --- | --- |
| Principal | stable login identity, email/provider aliases, session version, login state | commercial tenant, subscription, credits, WordPress users |
| Account | customer/tenant, sites, package and subscription context, credits and billing | human login identity |
| Membership | Principal-to-Account relationship, current owner role, bounded actions, relationship status | global Principal status or Account commercial state |
| Site | connected WordPress installation and runtime connection state | global human identity or organization membership |

`principal_id`, `account_id`, and `membership_id` must remain explicit in
domain and repository interfaces even when the Admin projection shows them as
one customer.

## 3. Creation and mutation rules

Customer registration and interactive Admin customer creation must atomically:

1. normalize or create the Principal;
2. create the Account;
3. create one active Membership with `role='owner'`;
4. return a structured response with all three identifiers.

Before activating a Membership, the service must check:

- the Principal has no other active Account membership;
- the Account has no other active Principal membership.

Mutation paths must lock an existing Principal and Account row before this
check. The service-layer limit is a transactional product rule, not a
best-effort UI validation.

Violations return HTTP `409` with:

- `service.single_account_membership_limit` when the Principal already owns
  another Account;
- `service.single_identity_account_limit` when the Account already has another
  owner identity.

Do not add single-column database uniqueness constraints for these stage
limits. Repository methods must continue to support lists by Principal and by
Account.

## 4. Membership roles

The only current role is:

- `owner`: the one customer identity that may use all currently launched
  customer capabilities.

Do not use `user` as a Membership role. `user` remains the product identity
type; role and identity type are separate concepts.

Future organization work may add `admin` and `member` only with an explicit
authorization and lifecycle proposal. Prefer capability checks at action
boundaries rather than scattered role-name comparisons.

## 5. Admin surface

`/admin/accounts` is the canonical customer directory.

The queue must show, in one scan:

- customer identity and Account status;
- primary login email and Principal status;
- package/site/subscription posture;
- whether the one-to-one relationship is healthy, missing, or conflicting;
- the next bounded operator action.

Normal actions:

- primary: open customer detail;
- secondary: inspect the current customer;
- low frequency: view identity audit;
- destructive: disable the Principal after an explicit reason and
  confirmation.

Disabling a Principal invalidates Portal sessions and revokes active customer
membership and provider bindings. It does not delete the Account, sites, or
WordPress users.

The standalone `/admin/portal-users` frontend route must not be reintroduced
without a new operator job that cannot be served from the customer workspace.

## 6. Internal interfaces retained

Keep typed internal interfaces for:

- `get_principal_identity_by_ref`;
- `get_principal_identity_by_email`;
- `list_principals`;
- `get_account`;
- `list_accounts`;
- `get_account_user_membership`;
- `list_account_user_memberships`;
- Principal audit;
- Principal disable.

The internal Principal directory API may remain for support tooling and
diagnosis. It must not become a second customer source of truth or a public
organization API.

## 7. Organization expansion trigger

Do not implement organization behavior until validated demand requires at
least one of:

- more than one human needs access to the same Account;
- one human needs access to more than one Account;
- ownership transfer or invitation lifecycle is required;
- distinct owner/admin/member authorization is required.

At that point:

1. write a new ADR that supersedes the stage limits;
2. design invitation, acceptance, removal, ownership transfer, account
   selection, and recovery together;
3. add Membership roles and capabilities;
4. remove only the service-layer one-to-one guards;
5. retain Principal and Account identity semantics.

## 8. Required gates

Changes to this boundary require:

- focused identity and Portal API tests;
- focused Admin account projection tests;
- migration-head validation when role storage changes;
- frontend unit, contract, type, lint, and Admin UI gates;
- PC browser evidence for material customer queue changes;
- M4 candidate sync for Cloud source behavior;
- an update to ADR-036 or a superseding ADR when the current stage changes.

Legacy tests that construct multiple active Principals in one Account or one
active Principal in multiple Accounts are not validation-stage compatibility
coverage. Reintroduce those scenarios only together with the superseding
organization ADR, role model, invitation lifecycle, and account-selection
contract.
