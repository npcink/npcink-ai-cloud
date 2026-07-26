# Account, Entitlement, Site Relink, And Frontend Release Retrospective — 2026-07-26

## Status

Source implementation and public-frontend code closeout are merged into
`master`. M4 accepted promotion, production deployment, external review, and GA
remain separate gates.

This document consolidates the release-readiness audit and the decisions that
followed it. It records why registration, Free activation, site ownership,
cross-account relinking, public rule copy, and frontend failure behavior were
separated. It does not replace ADR-029, ADR-030, the release checklist, or
date-later deployment evidence.

## Executive conclusion

The source-level problems identified in the registration and public-frontend
review are closed:

- email verification or first QQ login creates a usable identity, account,
  membership, and Portal session, but no site, subscription, runtime key, or
  Free credit budget;
- the first successful, host-bound WordPress Addon exchange is the activation
  boundary for a never-subscribed account's default Free entitlement;
- Free entitlement and credits belong to the account, not to a hostname;
- the same account may reconnect immediately;
- another account requires explicit release, expiry of the released site's
  stored 90–365 day cooldown, an enabled global policy, and a new verified
  Addon exchange;
- operators may adjust policy or one released site's cooldown, but the normal
  path has no manual approval queue and an override never proves destination
  host control;
- public, Portal, and Admin surfaces explain the rule at the point where it
  affects a decision;
- unavailable commercial data fails closed instead of leaving a stale price or
  active package action;
- current reachable login, registration, protected-route, and Admin-gate states
  have deterministic visual contracts.

The frontend should now remain frozen at its v1 information architecture.
Further page or control expansion requires repeated user evidence and a new
bounded proposal. The remaining work is release validation, truthful operator
configuration, and user-value evidence.

## 1. Decision history

### 1.1 The release audit found a trust-boundary defect

The pre-release audit found that registration could combine four different
events:

1. proving access to an email address or completing first QQ login;
2. creating an account and membership;
3. claiming a WordPress site;
4. granting the default Free subscription and 300-credit periodic budget.

The registration API could also accept site fields and create active site state
without a request from that WordPress installation. This confused identity
proof with host-control proof and allocated commercial/runtime capacity before
a real connection existed.

The correction was not to add a broad risk engine or a manual review queue. It
was to move each state change to the strongest existing proof that actually
supports it.

### 1.2 “Pending account” was refined into a precise state model

The first proposed wording—“email verification leaves the account pending”—was
too broad. A verified user needs to enter Portal, select an account, and start
the Addon authorization flow. Making the whole identity or account inactive
would create an unnecessary authentication dead end.

The implemented model is:

| State | After verified registration | After verified Addon exchange |
| --- | --- | --- |
| Principal and login | active | active |
| Account and membership | active | active |
| Portal session | available | available |
| Site | absent | created or reconnected |
| Subscription and Free budget | absent | activated only for a never-subscribed account |
| Runtime key | absent | newly issued and system-managed |

In product language, the **service is pending activation**, not the verified
identity. This wording is both more accurate and easier for the user to recover
from: log in first, then connect the actual WordPress Addon.

ADR-029 makes
`POST /portal/v1/addon-connections/exchange` the atomic activation boundary.
Issue-time authorization stores only a short-lived pending exchange; it does
not provision a site, entitlement, or key. Exchange time revalidates account
access, host binding, replay protection, subscription history, capacity, and
site ownership before committing all activation state together.

### 1.3 Free belongs to the account; site ownership is separate

Binding Free to the site would allow value to move or be regranted when a
hostname changes account. The durable model keeps three facts independent:

- account entitlement and credit ledger;
- current and historical site-account ownership;
- verified control of the WordPress host.

This separation makes routine recovery simple without weakening
cross-account protection:

- the same account may reinstall, rotate a key, or reconnect immediately;
- an active, inactive, provisioning, or suspended site never becomes
  transferable merely because time passed;
- the current account must explicitly remove the site before cross-account
  cooling begins;
- the destination must still prove host control through the normal Addon
  exchange after the cooldown.

### 1.4 Cooldown is snapshotted policy, not a transfer approval

ADR-030 sets a 90-day default and permits a bounded 90–365 day configuration.
Removal snapshots the current default onto the released site and binding
history. Later global changes apply prospectively, so an already-communicated
unlock time is not silently rewritten.

The bounded Admin surface may:

- enable or disable future cross-account relinking;
- change the default for future removals;
- clear one released site's remaining cooldown;
- set an exact unlock time;
- reset one released site to the current global default.

These actions change policy evidence only. They do not transfer the site,
approve the destination account, move Free credits, or bypass the new
host-bound exchange.

### 1.5 Rules must be visible where decisions happen

The rule is deliberately repeated across different user contexts while its
truth remains centralized in Cloud:

| Surface | User decision supported |
| --- | --- |
| Public homepage/package notice | understand that registration alone does not grant Free service and that credits do not follow a site |
| Help | understand same-account recovery, cross-account prerequisites, automatic post-cooldown validation, and the lack of a normal manual-review step |
| Terms | understand that the current Cloud-displayed policy and cooldown govern the action |
| Registration and login | understand that the next step is connecting the WordPress Addon |
| Portal connection/removal | see ownership, cooldown, service-stop, and credit consequences immediately before acting |
| Admin service settings/site detail | change future defaults or a bounded per-site exception without implying transfer approval |

`frontend/tests/unit/public-entitlement-copy-contract.mjs` protects the
high-value public statements. This is the durability mechanism: a later layout
rewrite may move the wording, but it cannot silently remove the required
meaning without failing a contract test.

### 1.6 Frontend truth must fail closed

Public prices and package availability come from the canonical plan projection.
If `/open/plan-catalog` fails, is empty, or omits a tier, the frontend must not
invent a price or retain an active Free, Plus, or Pro action. The affected tier
renders unavailable. Agency remains a quote path because it neither invents a
price nor starts self-service checkout.

The same principle applies to visual evidence. Old screenshots of retired
branding or authenticated pages that the test never authenticated into are not
useful contracts. They were replaced with deterministic evidence for current
login/registration layouts, protected-route redirects, and the anonymous Admin
gate.

## 2. Delivery evidence

| Change | Merged evidence | Result |
| --- | --- | --- |
| Addon-verified Free activation | PR `#280`, `1b8eff04` | registration no longer creates site, subscription, credits, or runtime key |
| Activation transaction correction | PR `#282`, `8b8cc5aa` | Addon activation remains serialized and atomic |
| Cross-account relink governance | PR `#287`, `fe5e3d01` | explicit release, stored cooldown, binding history, and bounded overrides |
| User/Admin relink explanation | PR `#289`, `fd8949d4` | rule shown in the operational surfaces where it matters |
| Public rule-copy protection | PR `#291`, `aff34709` | homepage/help/terms meaning protected by contract tests |
| Public frontend release gaps | PR `#293`, `2d7566a8` | fail-closed pricing and current visual baselines merged |

Evidence state at this closeout:

| Gate | State |
| --- | --- |
| Focused source and frontend checks | passed for the merged changes |
| Required GitHub checks | passed |
| Integration source truth | merged into `master` |
| Accepted M4 state for current `master` | pending; the shared lane was occupied by another dirty candidate and was not overwritten |
| Production deployment and release smoke | not performed by this closeout |
| External QQ/legal/real-user acceptance | not proven |

The M4 limitation is an operations-lane conflict, not permission to collapse
the evidence states. A healthy candidate or a merged PR is not an accepted
current-`master` runtime.

## 3. Reusable development principles

### 3.1 Model trust events before modeling screens

Authentication, account creation, membership, site ownership, entitlement,
credits, and key issuance are separate state transitions. Write the proof
required for each transition before designing a combined onboarding endpoint or
page.

### 3.2 Grant value at the strongest existing proof

Email or QQ verifies an identity binding. It does not verify control of a
WordPress installation. The host-bound Addon exchange already supplies the
stronger proof, so activation belongs there. Prefer moving a state change to a
valid existing seam over adding a new review service or risk platform.

### 3.3 Make dependent activation atomic

Entitlement activation, capacity validation, site connection, key rotation,
one-time-code consumption, and audit evidence form one business transition.
Partial success would create hard-to-reconcile commercial and runtime truth.
Keep them in one transaction and revalidate mutable facts at exchange time.

### 3.4 Put value and ownership on the correct entity

Plans and credits belong to accounts. Hostnames and connection history belong
to sites. Login aliases belong to principals. Mixing these owners creates
duplicate grants, transfer ambiguity, and recovery failures.

### 3.5 Protect normal recovery while governing abuse

A rule that blocks same-account reinstall or key recovery for 90 days would
damage availability without reducing cross-account abuse. Apply friction only
to the risky transition, retain immediate same-owner recovery, and require
explicit release before time can matter.

### 3.6 Snapshot user-facing time boundaries

Changing a global default should not retroactively rewrite an already released
site's promised boundary. Snapshot the policy at the event, then provide an
explicit, audited per-object override for exceptional cases.

### 3.7 Treat critical copy as a contract

Rules about credits, activation, ownership, deletion, and cooldown affect user
decisions. They are not decorative marketing text. Keep canonical behavior in
the backend/ADR, place concise projections at decision points, and protect their
meaning with source contracts so page redesigns fail loudly.

### 3.8 Unknown commercial truth must become unavailable

When a price or offer cannot be loaded, “temporarily unavailable” is truthful.
A cached frontend number with an active action is not graceful degradation; it
is an unauthorized commercial claim.

### 3.9 Test reachable states, not aspirational screenshots

Visual baselines require deterministic data and authentication posture. If a
test cannot establish the state shown in its screenshot, the screenshot is
historical decoration rather than executable evidence.

### 3.10 Keep normative, operational, and historical documents distinct

- ADRs define durable decisions and rejected alternatives.
- Checklists define what must be verified for a related change or release.
- Closeout records identify exact source and test evidence.
- Retrospectives explain the decision path, mistakes, and reusable method.

This separation lets future developers learn from history without mistaking a
dated observation for current production truth.

## 4. Work review

### Original goals

- remove “registration immediately grants 300 credits”;
- prevent registration from directly creating an active site;
- activate Free only after a real Addon connection and bounded checks;
- keep Free account-owned;
- allow immediate same-account reconnect while governing cross-account reuse;
- provide configurable, deterministic cooldown without a manual approval queue;
- explain the rules in public, Portal, Addon-facing, and Admin contexts;
- freeze and protect the release-ready frontend.

### Completion

- [x] Registration and service activation are separate.
- [x] Site creation and Free activation occur only at verified Addon exchange.
- [x] Registration site fields fail closed.
- [x] Free, subscription history, and credits remain account-owned.
- [x] Same-account reconnect remains immediate.
- [x] Cross-account relink requires explicit release, stored cooldown, enabled
  policy, and verified exchange.
- [x] Global and per-site operator controls exist without creating an approval
  queue.
- [x] High-value rule copy is present and contract-protected.
- [x] Public package failure behavior and current visual states are protected.
- [x] The source sequence passed required checks and merged into `master`.
- [ ] Current clean `master` still needs accepted M4 promotion.
- [ ] Production, external review, legal facts, and real-user value remain
  separate work.

### Problems found

| Severity | Specific problem | Root cause | Improvement |
| --- | --- | --- | --- |
| Must keep visible | Registration previously created active commercial/runtime state from identity proof alone | Trust events were bundled around one onboarding screen instead of modeled independently | Require a proof-and-owner table for every new provisioning flow |
| Must keep visible | “Pending account” could be read as disabling the identity needed to start Addon authorization | Product wording described an implementation intuition rather than the required state transitions | Name the exact pending object: service activation, site, entitlement, or exchange |
| Should correct | Cross-account policy was discussed initially as a simple “cannot relink for three or six months” timer | Account entitlement, site release, and host control had not yet been separated | Require explicit release plus stored cooldown plus verified destination exchange |
| Should correct | Critical rules could have disappeared during later page rewrites | Copy was initially treated as page content rather than behavioral policy projection | Protect required meaning with contract tests and link it to accepted ADRs |
| Should correct | Legacy visual baselines showed retired or unreachable states | Screenshots were retained without deterministic authentication and current-source review | Baseline only states the test can establish and review desktop/mobile failure paths |
| Suggested improvement | M4 acceptance could not follow merge immediately because a shared dirty candidate occupied the lane | A single integration runtime has serialized ownership | Never overwrite another candidate; expose lane ownership and promote when clean, adding isolation only if measured queueing becomes material |

### What worked well

- The audit started from current code, contracts, release policy, and deployed
  evidence rather than a feature wish list.
- The solution reused the existing one-time, host-bound Addon exchange instead
  of adding CAPTCHA, KYC, device fingerprinting, or a general risk engine.
- ADR-029 and ADR-030 record both the chosen model and rejected shortcuts.
- Clean worktrees and named-file staging protected unrelated development.
- Backend state, public copy, Portal actions, Admin policy, and visual evidence
  were closed as one user journey without moving WordPress control truth into
  Cloud.
- GitHub checks, merge, M4 acceptance, production, and GA remained separate
  claims.

### If this work were restarted

The more efficient order would be:

1. inventory the identity, account, membership, site, subscription, credit, and
   key entities;
2. write the proof and owner for every state transition;
3. choose the strongest existing seam for each mutation;
4. specify fail-closed behavior and recovery before writing UI copy;
5. implement the backend transaction and focused domain/API contracts;
6. project the rule to public, Portal, and Admin decision points;
7. add deterministic desktop/mobile, success/partial/failure evidence;
8. publish through a focused PR and record each evidence state separately.

## 5. Next-stage guidance

The public frontend is complete enough for the current release boundary. Stop
adding sections, dashboards, page-builder machinery, or new self-service
commercial flows.

Next work should be limited to:

1. promote clean current `master` to M4 when the shared candidate lane is free,
   then run the relevant smoke;
2. publish only confirmed operating entity, contact, retention, deletion,
   refund, and third-party-service facts;
3. verify real email delivery and QQ callback/review behavior on the intended
   deployment;
4. complete the separately authorized production release smoke and exact
   revision/bundle checks;
5. run a bounded real-editor trial and measure useful outcomes rather than page
   count, model-call count, or nominal feature breadth.

Reopen account activation or site relink design only if production evidence
shows a concrete abuse, ownership, support, or recovery failure that the
current model cannot resolve.

## 6. Quick entry for future changes

For a future onboarding, entitlement, or relink change:

1. read ADR-029, ADR-030, and the frontend release checklist;
2. state which entity changes and what proof authorizes it;
3. confirm Free and credits remain account-owned;
4. preserve immediate same-account recovery;
5. keep cross-account relink fail-closed on release, cooldown, policy, exchange,
   membership, entitlement, capacity, and replay checks;
6. update decision-point copy and its contract tests together;
7. validate success, partial, unavailable, replay, and cooldown paths;
8. report local, PR, merged, accepted M4, production, and human evidence
   separately.

## References

- [ADR-029: Addon-Verified Free Entitlement Activation](decisions/029-addon-verified-free-entitlement-activation.md)
- [ADR-030: Cross-Account Site Relink Cooldown](decisions/030-cross-account-site-relink-cooldown.md)
- [Frontend Public And Portal Release Checklist](frontend-public-portal-release-checklist-v1.md)
- [Public Frontend Release Code Closeout](public-frontend-release-code-closeout-2026-07-26.md)
- [Public Frontend Development Retrospective And Standard](public-frontend-development-retrospective-and-standard-2026-07-25.md)
- [Development And Validation Operating Model](development-validation-operating-model-v1.md)
- [Cloud Production Release Policy](cloud-production-release-policy-v1.md)
