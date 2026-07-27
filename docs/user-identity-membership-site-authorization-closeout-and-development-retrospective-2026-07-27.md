# User Identity, Membership, and Site Authorization Closeout — 2026-07-27

Status: the underlying user-system remediation source was merged into
`master`, and the then-current clean `master` was accepted on M4. Production
deployment and real-user acceptance were not performed by this closeout.

Scope: the July 2026 review and remediation of Cloud Portal user identity,
authentication, account membership, site ownership, and the adjacent
payment/feature-authorization seams.

This is a historical evidence record and development retrospective. It does
not replace the normative identity contract in `README.md`, ADR-016, ADR-031,
the payment contracts, or the production release policy.

## 1. Executive Summary

The user-system review did not end with one missing permission check. It
exposed four different ownership questions that had previously been too easy
to collapse into one "user belongs to an account" assumption:

1. Who is the stable Cloud identity?
2. Which commercial accounts may that identity enter?
3. Which exact sites may that identity operate?
4. Which commercial state and feature actions may be read or mutated?

The final model keeps exactly two product identities:

- `platform_admin`: manages the bounded Cloud platform and operator surface;
- `user`: manages only the account and site resources explicitly authorized
  for that principal.

Permission differences are represented by membership actions and exact
resource bindings, not by inventing more roles.

The closeout sequence established the following invariants:

- `principal_id` is the stable Cloud identity; email and provider subjects are
  mutable login aliases.
- Global principal state and per-account membership state have separate
  lifecycles.
- Account membership is required but is not sufficient for site access.
- Portal site operations require an active binding for the exact principal,
  site, and current account.
- A site has at most one active Portal user binding.
- Verified Addon exchange creates the binding; Portal removal releases it.
- Billing reads and billing mutations are separate capabilities.
- Payment/refund state changes remain account/payment-ledger truth and cannot
  be used to manufacture user or site authority.
- WordPress remains the local role, approval, preflight, and final-write truth.

The final source was merged by PR `#304` as
`1fbf3f5b27d62490946c22d1fdb2e0495f3da2be`. Clean `master` was promoted to
M4 with `acceptance_state=accepted`, `promotion_pr=304`,
`source_dirty=false`, and Alembic revision `20260727_0072 (head)`.

## 2. Product and Ownership Boundary

The most important design step was to stop using one identifier or relation to
answer several different authorization questions.

| Object | What it proves or owns | What it must not imply |
| --- | --- | --- |
| `Principal` | stable Cloud actor and global active/disabled state | account access, site ownership, or payment authority |
| email/provider binding | a login alias maps to one principal | a new principal, account membership, or site control |
| `PlatformAdminGrant` | the principal may use the bounded Cloud operator surface | WordPress administrator status or local write authority |
| `AccountUserMembership` | the principal belongs to one account and has bounded actions | access to every site in that account |
| `PrincipalSiteBinding` | the principal owns Portal access to one exact site in its current account | a new role or a transfer of WordPress ownership |
| `SiteAccountBinding` | the site is commercially attached to an account | identity of the Portal user who may operate it |
| subscription/credit/payment ledger | account-owned commercial and entitlement evidence | user identity or site authorization |
| WordPress user and capabilities | local WordPress role and write truth | Cloud product identity |

The effective Portal site-access rule is:

```text
active principal
AND active account
AND active membership for the site's current account
AND required membership action, when the operation declares one
AND active principal-site binding for the exact principal, site, and account
AND an operation-compatible site lifecycle state
```

Every missing term fails closed. Account membership is deliberately only one
term in the expression.

## 3. Historical Remediation Sequence

### 3.1 Stable principal identity

Earlier identity work froze `principals.principal_id` as the canonical Cloud
actor. Email, QQ/OpenID/UnionID-style subjects, accounts, memberships, and sites
remain separate identifiers.

This avoided a parallel user ID and made later session invalidation, provider
binding, audit actors, account membership, and site ownership converge on one
principal.

### 3.2 Portal authentication hardening — PR #292

PR `#292`, merged as `eeb92d9f`, hardened the login and account-security
lifecycle:

- one-time verification-code issuance and consumption;
- transaction-scoped rate-limit and pending-code serialization;
- session-version rotation and other-session invalidation;
- email-change and final-login-method protections;
- provider binding immutability and conflict handling;
- bounded auth-record retention;
- stricter email alias validation.

Migration `20260726_0070` added the required persistence constraints and
cleanup policy.

The reusable lesson was that login identity, login alias, one-time credential,
and browser session are separate state machines. A route returning `200` is not
enough; replay, replacement, expiry, concurrency, and session invalidation must
all be tested.

### 3.3 Payment and refund integrity — PR #299

PR `#299`, merged as `a17fb819`, was adjacent to the user-system review rather
than part of identity ownership. It nevertheless closed a dangerous seam where
commercial transitions could otherwise drift from account entitlement truth:

- verified real-mode Alipay refund requests use stable request identity;
- provider responses are checked against the order and amount;
- refund windows and unconsumed-credit eligibility are enforced;
- late but timely verified payment callbacks reconcile correctly;
- ambiguous provider outcomes fail closed and require reconciliation.

This preserved the boundary that payment proves a commercial transition for an
account. It never proves a different user identity, membership, or site
binding.

### 3.4 Principal and membership lifecycle isolation — PR #301

PR `#301`, merged as `da6828ca`, separated global principal state from
per-account membership state:

- a globally disabled principal cannot regain access through registration;
- a revoked membership cannot be silently reactivated by an unrelated
  identity flow;
- membership updates do not mutate global principal profile/session truth;
- existing custom membership capabilities are preserved;
- `view_billing` and `manage_billing` are distinct actions.

Migration `20260727_0071` added the billing-mutation capability only to
memberships that carried the complete legacy action set. It did not broaden
partial custom memberships.

The reusable lesson was to model state at its real scope. "Disabled user" and
"removed from one account" are different operations and must not share one
write path.

### 3.5 Principal-owned site authorization — PR #304

PR `#304`, merged as `1fbf3f5b`, closed the remaining account-wide
authorization gap:

- `principal_site_bindings` records exact Portal site ownership;
- site access requires membership plus the exact active binding;
- same-account membership no longer grants another user's site;
- a second user cannot take an active binding through Addon reconnect;
- verified Addon exchange establishes the binding atomically with connection
  and runtime-key work;
- Portal removal releases principal and account bindings and revokes access;
- internal bootstrap/assignment accepts an explicit `site_id`;
- Cloud UI and API copy use only `platform_admin` and `user`;
- new first-install platform administrator IDs use canonical `prn_<uuid4 hex>`.

Migration `20260727_0072`:

- creates the binding history and active-site uniqueness constraint;
- enforces active/released lifecycle consistency;
- constrains platform administrator role storage to `platform_admin`;
- backfills only accounts with exactly one active principal;
- leaves multi-user and otherwise ambiguous accounts unbound.

Existing installations that explicitly use `platform:internal_root` remain
compatible. Automatic identity rotation was rejected because it could orphan
persisted grants and split audit history.

### 3.6 Feature authorization remains a separate projection

The user-system review also clarified how feature access fits the model:

- account subscriptions, entitlement snapshots, credits, and usage limits own
  commercial feature availability;
- membership actions govern which Portal account/site operations the user may
  request;
- principal-site binding proves the user may act on the selected site;
- runtime and feature endpoints must combine the authorized site context with
  the applicable entitlement rather than treating either one as sufficient.

This avoids two opposite errors: a valid subscription must not grant a user
another user's site, and a valid site binding must not invent a package,
credit, or feature entitlement.

## 4. Problems Found and Their Root Causes

| Problem | Root cause | Durable correction |
| --- | --- | --- |
| An account member could reach every site in the account | membership was used as both tenant access and resource ownership | add exact principal-site binding and require both relations |
| Re-registration could undermine disabled/revoked state | identity creation and access restoration shared a broad path | isolate global principal and per-account membership lifecycle |
| Billing viewers could mutate billing state | read and mutation semantics shared one capability | split `view_billing` and `manage_billing` |
| Another user could attempt Addon reconnect for an owned site | site/account connection did not encode Portal user ownership | serialize on the site and reject conflicting active binding |
| Removed users could retain an authorization record | site removal and user-site access had different lifecycle owners | release both principal-site and site-account bindings atomically |
| Ambiguous legacy ownership tempted automatic backfill | storage proved account membership but not which user connected a site | backfill only the single-member case; fail closed otherwise |
| Cloud copy still described a `site_admin` product role | UI vocabulary outlived the frozen two-identity contract | contract-test identity copy and retain administrator wording only for WordPress-local truth |
| New and legacy administrator IDs had incompatible needs | canonical identity format and persisted historical grants were treated as one migration problem | canonicalize new installs; preserve legacy configured actors until an explicit migration is approved |
| Payment success could be mistaken for access authority | commercial evidence and authorization evidence were insufficiently separated conceptually | keep payment/account ledger truth independent from identity and site authorization |

## 5. Migration and Compatibility Strategy

The migration sequence demonstrates a safer pattern for security-sensitive
data-model changes:

1. Add service invariants and focused negative tests.
2. Add database constraints for invariants that storage can enforce.
3. Inspect legacy rows before creating a stricter constraint.
4. Backfill only when existing evidence identifies one unambiguous result.
5. Leave ambiguous rows unavailable rather than guessing.
6. Preserve history instead of overwriting ownership in place.
7. Provide an exact downgrade that removes the new contract without deleting
   principals, accounts, sites, billing, or WordPress data.

For `0072`, a multi-user account does not contain enough evidence to identify
the user who originally connected each legacy site. The correct migration
result is therefore an unbound site requiring explicit verified or operator
assignment.

This is a general rule:

> A migration may normalize evidence already present in storage. It must not
> invent security authority that storage never recorded.

## 6. Verification Model and Evidence

The closeout used several independent evidence layers:

| Evidence state | Observed result |
| --- | --- |
| focused source/static checks | Ruff, frontend type check, identity-copy contracts, migration head, and diff checks passed |
| focused user-system regression | 356 tests passed before publication |
| broad local contract/domain evidence | 1463 passed, 3 skipped |
| post-rebase regression | 243 passed after rebasing onto the then-current `origin/master` |
| M4 candidate | migration and cross-user/Add-on ownership tests passed on PostgreSQL with clean candidate source |
| GitHub required checks | backend shards, frontend, CodeQL, secret scan, dependency audit, PostgreSQL regression, and production-image smoke passed |
| integration truth | PR `#304` merged into `master` |
| accepted M4 | PR `304`, clean `master@1fbf3f5b`, Alembic `0072`, focused post-merge tests passed |
| production | not deployed or validated by this closeout |
| real-user acceptance | not performed |

The evidence states are intentionally not collapsed into "done." M4 candidate
behavior did not prove merge. A merged PR did not prove that M4 was running the
merged source. Acceptance required a clean current `master` promotion and
post-merge focused tests.

One operational failure reinforced this distinction: the first promotion
attempts failed while the local Tailscale client was stopped. The source and CI
remained valid, but accepted M4 evidence was unavailable until the approved
private relay path was restored and promotion completed. The public maintenance
address and local Docker were not substituted.

## 7. Reusable Development Method

### 7.1 Audit read-only before editing

Trace the real path before proposing roles or tables:

```text
browser or Addon
-> public/internal route
-> authentication context
-> domain authorization
-> repository query
-> database constraints
-> response projection
-> frontend copy and actions
```

Check negative paths at every seam. A route guard is insufficient when another
caller can reach the domain method. A domain check is insufficient when a race
can create conflicting rows. A database constraint is insufficient when the
read query ignores one part of the invariant.

### 7.2 Ask one ownership question per relation

Before adding a field, write down:

- What entity owns this state?
- What evidence creates it?
- What operation releases or invalidates it?
- Is it global, account-scoped, site-scoped, or request-scoped?
- Does it grant identity, membership, resource access, capability, or
  commercial value?

If one relation answers several of these questions, the design probably grants
too much.

### 7.3 Test denial and zero side effects

Positive tests prove that a valid user can work. Security regressions are
caught by denial tests:

- user A cannot read or mutate user B's site;
- the denial still holds inside the same account;
- conflicting Addon exchange does not create a subscription, rotate a key, or
  consume authority;
- revoked membership and disabled principal remain denied;
- removal makes the previous owner immediately unauthorized;
- replay and idempotency cannot cross principals;
- payment callbacks cannot change identity or site ownership.

For failed writes, assert both the error and the absence of partial side
effects.

### 7.4 Revalidate mutable facts inside the transaction

Authorization checked when an Addon code is issued may be stale when it is
exchanged. Site ownership, account state, membership, subscription, capacity,
and one-time-code status must be revalidated under the transaction that
performs the business transition.

### 7.5 Use constraints as the final guard, not the only guard

Service errors should be explicit and stable, while database constraints stop
races and corrupted write paths. For principal-site ownership this means:

- lock the site row before changing ownership;
- reject an existing different owner in the domain;
- enforce one unreleased binding per site in storage;
- require lifecycle consistency;
- include principal, site, and current account in authorization reads.

### 7.6 Treat copy as a projection of the contract

`platform_admin` and `user` are product identities, not presentation
preferences. Frontend key names, labels, metrics, and help text must project the
same contract. WordPress-local "administrator" wording may remain only when it
describes WordPress authority.

Contract tests are appropriate for critical identity and commercial wording
because later UI refactors otherwise reintroduce retired semantics.

### 7.7 Preserve unrelated work and publish narrow changes

The active checkout contained unrelated dirty work. The safe workflow was:

- inventory worktrees;
- create a clean topic worktree from current `origin/master`;
- stage only named files;
- use the repository PR template and publisher;
- let protected checks determine merge eligibility;
- promote from a stable clean operations checkout after merge.

Do not reset, stash, overwrite, or broadly stage another task's work to obtain
a clean tree.

## 8. Approaches Rejected

### Add more user roles

Rejected. Product identity remains `platform_admin` and `user`. More granular
authority belongs in bounded actions and resource bindings.

### Let membership imply every site

Rejected. Tenant entry and resource ownership are different proofs.

### Store `principal_id` directly on `sites`

Rejected. Site identity, account ownership history, and Portal user
authorization have different lifecycles. A binding history preserves those
dimensions.

### Guess legacy ownership

Rejected. An apparently convenient migration would silently grant authority.

### Auto-rotate legacy platform administrator IDs

Rejected for this stage. Rotation requires a separate plan for persisted
grants, sessions, audit actors, rollback, and operator recovery.

### Fix only the UI or route guard

Rejected. Authorization must remain correct for every caller and under
concurrent writes.

### Treat green CI or HTTP 200 as production acceptance

Rejected. Source, candidate runtime, merge, accepted M4, production, and
real-user evidence remain separate.

## 9. Residual Risks and Next Validation Stage

The source remediation can close, but these operational questions remain:

1. Inventory existing multi-user accounts with unbound sites. Do not assign
   ownership without operator-confirmed evidence.
2. Run a controlled two-user validation covering registration, login, site A
   and site B binding, same-account isolation, Addon conflict, removal,
   reconnect, disabled principal, and revoked membership.
3. Verify that usage, billing, orders, refunds, audit, support, media, and
   diagnostics all derive their site context through the same authorization
   boundary.
4. Keep legacy `platform:internal_root` under observation. Design a separate
   migration only if rotation becomes necessary.
5. Perform production migration and smoke only through an explicitly approved
   production release.
6. Validate real payment/refund behavior with an approved merchant or sandbox
   before enabling real customer refunds.

These items are not evidence of a known open source defect. They are the next
controlled validation layer.

## 10. Checklist for Future User-System Changes

Before editing:

- [ ] Confirm the change still uses only `platform_admin` and `user`.
- [ ] Identify whether the state is global, account, site, commercial, or
  WordPress-local truth.
- [ ] Trace route, domain, repository, constraint, projection, and UI.
- [ ] Preserve dirty work in a separate clean worktree.

Authorization:

- [ ] Active principal is required.
- [ ] Active membership is required for the exact current account.
- [ ] Read and mutation actions are distinct where risk differs.
- [ ] Site operations require the exact active principal-site-account binding.
- [ ] Disabled, revoked, released, archived, and transferred states fail
  closed.
- [ ] Admin browser exposure remains allowlisted.

Persistence and concurrency:

- [ ] Mutable authorization is rechecked inside the write transaction.
- [ ] The owning resource is locked before ownership changes.
- [ ] Storage constraints cover uniqueness and lifecycle.
- [ ] Failed writes leave zero partial business side effects.
- [ ] Migration backfill uses evidence, not guesses.
- [ ] Downgrade and rollback preserve unrelated data.

Consumers:

- [ ] Site lists contain only explicitly bound sites.
- [ ] Billing, payment, usage, audit, support, media, and diagnostics use the
  authorized site context.
- [ ] Idempotency and replay are scoped to the principal and operation.
- [ ] API `identity_type`, role values, and UI copy remain aligned.
- [ ] WordPress roles and writes remain local truth.

Delivery:

- [ ] Run the narrowest focused tests first.
- [ ] Use M4 for migration/runtime evidence when required.
- [ ] Publish with the repository PR contract.
- [ ] Wait for required GitHub checks and merge.
- [ ] Promote clean current `master` for accepted M4 evidence.
- [ ] Report production and real-user validation separately.

## 11. References

- `README.md` — current identity contract.
- `docs/decisions/016-fail-closed-portal-admin-service-boundaries.md`.
- `docs/decisions/031-principal-owned-portal-site-authorization.md`.
- `docs/portal-auth-verification-closeout-2026-07-08.md`.
- `docs/account-entitlement-site-relink-and-frontend-release-retrospective-2026-07-26.md`.
- `docs/cloud-payment-entitlement-v1.md`.
- `docs/payment-gateway-contract-v1.md`.
- `docs/development-validation-operating-model-v1.md`.
- PR `#292` — Portal user authentication hardening.
- PR `#299` — payment and refund integrity.
- PR `#301` — Portal membership isolation.
- PR `#304` — principal-owned site authorization and accepted M4 closeout.

## 12. Rollback and Document Maintenance

This document records history and should not be used as a runtime rollback
script. The exact code rollback remains:

- revert the owning merged PR;
- downgrade only its corresponding Alembic revision after checking current
  data dependencies;
- redeploy through the reviewed release path;
- re-run the relevant authorization and commercial smoke.

If the identity or ownership contract changes, write a new ADR that supersedes
ADR-031 where necessary. Keep this retrospective intact and add a dated
follow-up rather than rewriting historical evidence.
