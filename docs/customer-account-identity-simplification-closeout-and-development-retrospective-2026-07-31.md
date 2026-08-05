# Customer Account and Identity Simplification Closeout and Development Retrospective — 2026-07-31

Status: implementation merged into `master` and the clean merged revision was
accepted on M4.

Scope: the validation-stage contraction from separate Accounts and Portal-user
operator surfaces to one customer workspace, together with the one-account,
one-login-identity product rule and the retained organization expansion seam.

This is a historical evidence record and reusable development method. It does
not replace:

- [ADR-003: Stable Cloud principal identity](decisions/003-stable-cloud-principal-identity.md);
- [ADR-036: Single-account, single-identity validation stage](decisions/036-single-account-single-identity-validation-stage.md);
- [Customer Account and Identity Stage Standard v1](customer-account-identity-stage-standard-v1.md);
- [Cloud Admin Information Architecture v2](cloud-admin-information-architecture-v2.md);
- [Development and Validation Operating Model v1](development-validation-operating-model-v1.md).

It does not authorize organization support, production deployment, or changes
to WordPress-local identity and write authority.

## 1. Executive conclusion

The original standalone `/admin/portal-users` surface was not inherently
wrong. It was optimized for a product stage in which operators might need to
manage many identities independently from customer accounts. That was not the
actual validation-stage job.

At the time of this change:

- there were no real customers or historical compatibility obligations;
- the product intentionally supported one account and one login identity;
- the operator needed to understand one customer, its login state, sites,
  package, subscription, and access posture in one place;
- organization membership was only a future possibility.

The correct contraction was therefore:

```text
one Principal -> one active owner Membership -> one Account
```

`/admin/accounts` became the only customer-directory product surface. Principal,
Account, and Membership remained separate domain and persistence objects.

This distinction is the central design result:

> Simplify current product behavior without destroying the future data model.

The implementation removed the premature product surface, not the identity
boundary. A future organization remains an Account with multiple Principal
memberships. It does not require merging identity into Account now or adding a
new organization identity type later.

## 2. Historical problem and product repositioning

### 2.1 What the two old surfaces implied

The old Admin navigation exposed:

- `/admin/accounts` for commercial customer records;
- `/admin/portal-users` for registered login identities.

That separation reflected backend entities, but it split one current operator
job into two directories. An operator had to reconcile Account status, email,
Principal state, membership, sites, and subscription evidence manually.

The standalone user directory also elevated registration source and identity
records into a top-level product taxonomy. In the validation stage, the
operator was not managing an independent population of users. The operator was
trying to answer:

1. Who is this customer?
2. Can the customer log in?
3. Is the account relationship valid?
4. What service state and next action apply?

Those questions belong in one customer workspace.

### 2.2 Why merging database entities was rejected

The UI consolidation did not justify merging Principal fields into Account:

- email and provider subjects are login aliases;
- Principal owns global login/session state;
- Account owns commercial, site, subscription, credit, and billing context;
- Membership owns the relationship and its role/capabilities.

Putting login aliases on Account would make the current UI superficially
simple but turn future organization support into a destructive schema
redesign. The chosen design instead kept the stable internal identifiers:

- `principal_id`;
- `account_id`;
- `membership_id`.

The Admin projection may present these objects as one customer. Domain and
repository interfaces must not pretend they are one object.

### 2.3 Why organization support was deferred

Real organization support is not the act of adding `admin` and `member`
strings. It requires a coherent lifecycle:

- invitation and acceptance;
- ownership transfer;
- member removal;
- role escalation and downgrade;
- account selection and switching;
- recovery when an owner loses access;
- authorization at every action boundary.

Building only roles or an organization page would create empty architecture
and false support claims. The stage restriction stays until validated demand
requires more than one human per Account or more than one Account per human.

## 3. Delivered contract

### 3.1 Creation

Portal registration and interactive Admin customer creation atomically:

1. normalize or create the Principal;
2. create the Account;
3. create one active Membership with `role='owner'`;
4. return the three identifiers.

Interactive Admin creation requires the primary login email. Low-level
technical provisioning may still produce an unattached Account, but the Admin
projection must call that state incomplete rather than inventing an identity.

### 3.2 Relationship guards

Before an active relationship is created, the service checks:

- the Principal has no other active Account membership;
- the Account has no other active Principal membership.

Existing Principal and Account rows are locked before the check. Violations
fail with structured `409` conflicts:

- `service.single_account_membership_limit`;
- `service.single_identity_account_limit`.

The one-to-one rule is a validation-stage product rule. It is enforced in the
service layer rather than with permanent single-column uniqueness constraints.
The underlying relationship table and list-oriented repository APIs therefore
remain usable when a future ADR authorizes organization membership.

### 3.3 Admin consolidation

`/admin/accounts` now owns:

- customer and Account status;
- primary login email and Principal status;
- relationship health;
- last-login evidence;
- site, package, and subscription posture;
- identity audit;
- explicit destructive disable-access action.

The standalone `/admin/portal-users` frontend route, navigation, feature
implementation, tests, route measurement entry, and command evidence were
removed. Principal-oriented backend lookup, audit, and disable interfaces were
retained as internal support seams.

Disabling the Principal invalidates Portal access and active identity
relationships. It does not delete the Account, sites, commercial records, or
WordPress users.

### 3.4 Migration

Migration `20260731_0077_single_account_owner_role.py` changes existing
customer Membership role values from `user` to `owner`. Its downgrade restores
`user`.

This migration changes role vocabulary only. It does not merge tables, invent
organization membership, attach identities to ambiguous Accounts, or delete
commercial history.

## 4. Implementation history

The focused branch used five coherent checkpoints:

| Checkpoint | Purpose |
| --- | --- |
| `b4255d27` | implement the product contraction, ADR, standard, Admin merge, service guards, migration, and focused tests |
| `fd8b089c` | correct unused code and the Admin information-architecture route-count contract |
| `d9b810c5` | narrow Account membership before projecting identity evidence and satisfy static typing |
| `0ab9022b` | remove stale Portal-user command inventory, route measurement, and current information-architecture references |
| `5868ba4f` | remove unreachable legacy multi-identity Portal test scenarios and state the superseding-ADR requirement |

The squash merge was:

- PR: `#425`, `Unify customer accounts and login identities`;
- merged at: `2026-07-31T03:21:13Z`;
- merge revision:
  `94c287f927992741a75c3f47d0c09acc10ef3107`;
- final diff: 55 files, 1,313 insertions, 3,488 deletions.

The negative line count is an intentional outcome. The change removed a
parallel customer product surface and its obsolete validation assets instead
of preserving them behind redirects, feature flags, or compatibility code.

## 5. What the CI corrections taught us

### 5.1 A route removal is a repository-wide contract change

Deleting a page is not complete when the route file disappears. Current truth
was also encoded in:

- navigation;
- overview links;
- Admin route count;
- UI manifest;
- translations;
- route-bundle measurement;
- engineering command inventory;
- unit and browser contracts;
- synthetic fixtures;
- architecture documentation.

The durable practice is to search the removed route and concept across the
whole repository before publication:

```bash
rg -n "portal-users|Portal Users|portal users" .
```

Each hit must be classified as one of:

- current product truth to update or remove;
- retained internal support interface;
- historical evidence that should remain;
- generated or local output outside source truth.

Do not blindly eliminate historical references. Do not leave current command
or route inventories describing removed product behavior.

### 5.2 Tests can preserve an obsolete product assumption

Several old Portal tests created:

- multiple active Principals in one Account; or
- one active Principal in multiple Accounts.

After the one-to-one guard landed, those fixtures could no longer reach the
later behavior they intended to test. Weak responses would have been:

- bypass the new guard in tests;
- add a test-only compatibility switch;
- weaken production rules;
- mark the scenarios skipped indefinitely.

The correct response was to classify the tests against the accepted stage
contract. They were not compatibility evidence because no users or historical
behavior had to be preserved. The unreachable scenarios were removed.

They may return only with a superseding organization ADR and complete role,
invitation, account-selection, recovery, and authorization contracts.

This yields a general rule:

> A failing old test is evidence of a conflict. It is not automatically
> evidence that the new product contract is wrong.

First decide whether the test protects a required invariant, a real
compatibility promise, or an obsolete product assumption.

### 5.3 Type errors often reveal an unresolved state choice

The Admin projection initially allowed membership lookup to remain optional
too deep into the projection path. Static typing exposed that the implementation
had not narrowed the relationship state before using it.

The correction was not a type cast. The code first classified the membership
relationship, then projected identity evidence only from the narrowed valid
state.

For operator surfaces, missing and conflicting relations must be explicit
states. Choosing the first row, using an empty identifier, or silencing the
type checker hides a data-quality problem.

### 5.4 A focused gate does not replace global contract search

Focused identity, Admin, and visual checks gave fast inner-loop evidence.
GitHub CI still found stale repository-wide route and command assumptions.

For a cross-surface contraction, the pre-publication gate should include:

1. focused domain and API tests;
2. Admin structural and visual gates;
3. static type/lint checks;
4. migration-head and round-trip checks;
5. repository-wide search for retired concepts;
6. engineering command inventory checks;
7. full required CI before merge.

The lesson is not to run every expensive gate after every edit. It is to match
the closeout gate to the size of the contract being removed.

## 6. Reusable architecture method

### 6.1 Start from the current product job

Before preserving or adding an entity-oriented page, write:

- the operator or customer job;
- the decision the page supports;
- the evidence needed to make that decision;
- the action that follows;
- why the job cannot be completed in an existing workspace.

Backend entity separation does not automatically justify separate navigation.
Product surfaces should follow user and operator jobs while APIs preserve
domain ownership.

### 6.2 Separate stage policy from durable structure

Classify every proposed constraint:

| Constraint type | Preferred owner |
| --- | --- |
| permanent identity invariant | database, domain, and contract |
| transactional business invariant | service boundary plus database support where appropriate |
| validation-stage product limit | service boundary with explicit error |
| UI presentation simplification | projection and frontend |
| future option | typed seam and ADR trigger, not inactive UI |

The one-account, one-identity limit belongs to the third category. The
Principal/Account/Membership separation belongs to the first.

This classification prevents a short-term product decision from becoming an
expensive database limitation.

### 6.3 Write both the decision and the operating standard

The documentation split is intentional:

- ADR-036 records context, alternatives, decision, consequences, and rollback;
- the stage standard records the active object ownership, mutation rules,
  errors, Admin behavior, retained interfaces, expansion triggers, and gates;
- this retrospective records implementation history, failures, evidence, and
  reusable development method.

Future changes should update the artifact whose authority actually changes.
Do not turn the historical retrospective into current normative truth.

### 6.4 Keep future seams typed but dormant

Keeping an expansion seam means:

- identifiers remain separate;
- Membership remains a real relation;
- repository methods can list by Principal and Account;
- service guards have explicit names and error codes;
- current UI does not promise unsupported multi-member behavior;
- a future ADR can remove stage guards without reconstructing identity.

It does not mean:

- render hidden organization controls;
- add unused role values;
- create speculative invitation tables;
- retain duplicate product routes;
- maintain unreachable multi-user test matrices.

### 6.5 Treat destructive identity actions by their real scope

Principal disable, Membership revoke, Account suspension, site release, and
WordPress user removal are different operations.

Every destructive action must say:

- which object changes;
- which sessions or capabilities are invalidated;
- which commercial and site records remain;
- whether recovery is possible;
- what audit receipt proves the action.

The consolidated Accounts workspace may present these actions together, but
their domain write paths must remain separate.

## 7. Validation and release evidence

The implementation used independent evidence layers:

| Evidence state | Result |
| --- | --- |
| focused backend | identity guards, owner lifecycle, Admin creation/projection, email search, and role contracts passed |
| Portal regression after final test retirement | `tests/api/test_portal_routes.py`: 78 passed |
| combined post-rebase focus | Portal route file plus key Admin creation test: 79 passed |
| static checks | Ruff and Mypy passed across 258 source files |
| Admin structural gate | `pnpm run check:admin-ui` passed |
| Admin PC visual gate | 26 passed |
| migration | single Alembic head; owner/user round trip passed on initialized SQLite; M4 PostgreSQL upgraded to `20260731_0077` |
| GitHub required checks | frontend, backend shards, aggregate backend, static analysis, PostgreSQL regression, image smoke, dependency audit, CodeQL, secret scan, PR contract, and CI observability passed |
| integration truth | PR `#425` merged into `master` |
| accepted M4 | `acceptance_state=accepted`, `promotion_pr=425`, clean `master@94c287f9`, Alembic `0077`, `/=200`, `/health/live=200` |
| production | not deployed or validated |
| real-user acceptance | not performed |

Two limitations remain part of the record:

1. local `check:fast` did not start because the isolated source worktree did
   not contain the required `.env`; local Docker was not used as a substitute
   for the approved M4 lane;
2. a fresh full SQLite migration chain stopped in unrelated historical
   migration `0038`, whose ALTER operation is unsupported by SQLite. The
   current migration's round trip and the real PostgreSQL upgrade passed.

These limitations do not invalidate the accepted result, but they must not be
rewritten as passing local evidence.

## 8. Delivery workflow for similar contractions

Use this sequence when removing a premature product surface while preserving a
future architecture seam:

### 8.1 Investigation

1. Start from a clean current `origin/master` worktree.
2. Read the active ADRs, standards, route manifest, command inventory, and
   real operator path.
3. Trace UI, API, domain, repository, migration, test, and documentation
   consumers.
4. Identify whether compatibility obligations actually exist.
5. Write the current product job and the future expansion trigger separately.

### 8.2 Decision

1. State the simplest current behavior.
2. Identify durable entities that must remain separate.
3. Decide whether each restriction is permanent, transactional, or
   stage-specific.
4. Record rejected alternatives and rollback in an ADR.
5. Write an executable standard with errors, interfaces, UI behavior, and
   gates.

### 8.3 Implementation

1. Add service invariants and focused negative tests.
2. Make creation atomic and lock rows that participate in the invariant.
3. Update projections to expose missing/conflicting state explicitly.
4. Consolidate the product surface around the real operator job.
5. Remove retired UI, navigation, fixtures, tests, commands, and current
   documentation.
6. Retain internal typed seams only when they have a named support or future
   role.

### 8.4 Verification and publication

1. Run the narrowest useful checks during editing.
2. Search the repository for retired route and terminology drift.
3. Run the full closeout gates required by the affected contracts.
4. Validate the candidate on M4 when Cloud source or migration behavior
   changed.
5. Publish through the required PR template and let GitHub checks decide merge
   eligibility.
6. Rebase when `master` advances, rerun source-sensitive checks, and dispatch
   the candidate again.
7. Promote only clean current `master` after merge.
8. Report accepted M4 separately from production and human acceptance.

## 9. Organization expansion checklist

Do not remove the stage guards until a new ADR answers all of these:

- What user evidence proves multi-human or multi-account demand?
- Is Account still the organization/tenant boundary?
- How are invitations issued, expired, accepted, and audited?
- How is ownership transferred without orphaning the Account?
- What happens when the last owner is removed or disabled?
- Which actions belong to owner, admin, and member capabilities?
- How does a Principal select and switch the active Account?
- How are sessions and caches scoped to the selected Account?
- How do site bindings behave across member removal and ownership transfer?
- What recovery path exists for compromised or lost owner access?
- Which migrations are unambiguous, and which legacy rows must fail closed?
- Which customer and operator surfaces need to change?

Organization work must remove only the service-layer stage restrictions. It
must retain stable Principal identity, Account commercial ownership, and
Membership relationship semantics.

## 10. Work review report

### Original goal

Simplify the validation-stage account and self-registration model, merge the
standalone Portal-user operator surface into Customers, preserve safe
organization expansion seams, and leave durable guidance for later humans and
AI agents.

### Completion

- [x] Merged Portal-user product operations into `/admin/accounts`.
- [x] Enforced one active Principal per Account and one active Account per
  Principal.
- [x] Standardized the current Membership role as `owner`.
- [x] Preserved separate Principal, Account, Membership, and Site ownership.
- [x] Retained bounded Principal support/audit interfaces.
- [x] Removed stale frontend, command, fixture, and test product assumptions.
- [x] Wrote ADR-036 and the active stage standard.
- [x] Passed required GitHub checks and accepted clean merged `master` on M4.
- [ ] Production deployment was not performed because it was outside this
  task's authorization.
- [ ] Organization membership was not implemented because validated demand and
  the required lifecycle design do not yet exist.

### Problems found

| Severity | Specific problem | Root cause | Correction |
| --- | --- | --- | --- |
| Must correct | The first publication still contained a stale Admin route-count contract and an unused import. | The initial closeout focused on the changed route and did not replay every repository-wide current-truth consumer before publication. | Added the missing contract correction and made retired-concept search part of the contraction checklist. |
| Must correct | Five old Portal scenarios, totaling 646 removed lines, created multi-identity relationships that the new service contract deliberately rejects. | Tests were initially treated as generic regression assets instead of being classified as current invariants, compatibility commitments, or obsolete assumptions. | Removed unreachable scenarios and documented that they may return only with the superseding organization contract. |
| Should correct | Command inventory, route-bundle measurement, and information-architecture text still referred to Portal Users after the page was removed. | Product routes were removed before the repository's operational metadata was treated as part of the same public contract. | Retired the command and measurement evidence and updated current information architecture in the same PR. |
| Should correct | The first Admin identity projection left an optional Membership state unresolved until Mypy rejected it. | Projection code tried to render data before classifying the relationship as healthy, missing, or conflicting. | Narrow relationship state before projecting identity evidence; do not silence the type checker. |
| Should correct | The first post-merge promotion attempt ran from a detached temporary worktree and was rejected. | The candidate and accepted lanes were understood, but the promotion command's clean-`master` checkout precondition was not checked before invocation. | Use the dedicated clean M4 operations worktree, verify branch and revision first, then promote. |
| Suggested improvement | Local `check:fast` could not start in the isolated worktree because `.env` was absent. | Environment-dependent combined gates were selected without first confirming their local prerequisites. | Check prerequisites early, use narrow source gates honestly, and rely on approved M4/GitHub authority without local Docker substitution. |

### What worked well

- The user's lack of compatibility obligations was treated as a real design
  input, allowing obsolete surface area to be deleted instead of hidden.
- The current product was simplified without collapsing durable identity and
  tenant boundaries.
- Service-layer named guards preserved a reversible path to organization
  membership.
- Creation, locking, errors, Admin state projection, migration, UI, tests, and
  docs were changed as one coherent contract.
- The original dirty worktree remained untouched; all task changes used an
  isolated branch and exact staging.
- CI feedback was used to find stale assumptions rather than to weaken the new
  invariant.
- Candidate behavior, merge truth, accepted M4, production, and human
  acceptance were reported as separate states.

### Next focus

1. Keep `/admin/accounts` as the only customer directory during validation.
2. Do not reintroduce Portal Users, organization roles, invitations, or account
   switching without validated demand and a superseding ADR.
3. When touching identity tests, classify each scenario against the active
   stage standard before preserving compatibility.
4. For future route removals, search UI, navigation, manifests, commands,
   measurement, fixtures, tests, and current docs before first publication.
5. For accepted M4 promotion, verify clean `master`, exact `origin/master`
   revision, and the dedicated operations worktree before invoking promotion.

## 11. Final boundary

This stage is closed at:

```text
PR #425
master@94c287f927992741a75c3f47d0c09acc10ef3107
acceptance_state=accepted
promotion_pr=425
alembic_revision=20260731_0077
```

That is development-integration and M4 acceptance evidence. It is not
production release evidence.

The next correct action is ordinary product validation of the single-account,
single-identity flow. Organization architecture should remain dormant until
real usage produces one of the expansion triggers in the active standard.
