# ADR-058: Registration-Verified Account Free Entitlement

## Status

Accepted by operator on 2026-10-06. Implementation is a development candidate;
this decision does not claim merge, M4 acceptance, or production availability.

Supersedes [ADR-029](029-addon-verified-free-entitlement-activation.md) only for
the timing of account-owned Free activation. Verified site connection and
runtime-key provisioning remain governed by ADR-029 and ADR-030.

## Context

The four-week free trial uses normal email/QQ registration and the existing
Free package. It does not introduce invite lists, a trial package, weekly
quotas, or payments. A user should see account-owned entitlement immediately
after verified registration, independently of a WordPress site connection.
This also preserves the account boundary for future connectors without
implementing another platform in this task.

ADR-029 correctly separated identity proof from site-control proof, but also
deferred account entitlement until Addon exchange. Identity proof is now the
activation boundary for Free; it remains insufficient proof to create a site
or issue its runtime credentials.

## Decision

- Email registration verification and first QQ identity registration bind
  the existing active Free subscription and entitlement snapshot in the same
  transaction as Principal, Account and Membership creation.
- Registration creates no Site, site binding, runtime API key or payment order.
  Legacy site fields remain rejected. Public session structure and the existing
  account-entitlements endpoint stay unchanged.
- A successful email/QQ login, including the existing-user registration path,
  backfills active accessible accounts only when they have no subscription
  history. Account row locks serialize this with other logins and Addon exchange;
  access state is refreshed after the lock before granting entitlement.
- Existing Free, paid, suspended or canceled subscription history is not
  overwritten. Login does not top up credits or restart periods. Existing
  renewal/reconciliation rules continue to own period progression.
- Addon authorization and exchange keep one-time code/state, return-host,
  active-access, ownership, capacity and key checks. The historical
  no-subscription fallback remains; ordinary new accounts already have Free,
  so their exchange reports free_entitlement_activated=false.
- The server-rendered Portal activation marker becomes
  registration-verified-free-activation-v2; its release smoke and source
  contracts use the same marker. No public session schema changes.
- Portal shows account package and credits without a site, with a separate
  site-connection instruction. Free credit exhaustion points to usage and
  period recovery; it does not require payment.

The canonical Free package remains 300 AI credits per 30-day period, one site,
and its existing resource/concurrency rules. This is not 300 generations.
Provider account budgets remain separate pre-dispatch guards whose enabled
state and numeric values must be confirmed by the operator before trial.

## Verification and consequences

Cover email/QQ registration, legacy-login backfill and repeat login, active and
inactive history preservation, disabled/revoked access, atomic rollback,
normal and legacy Addon exchange, no-site entitlement visibility and Free
quota messaging. Concurrency is additionally tested in an isolated schema on
the disposable M4 PostgreSQL database; SQLite tests alone do not prove row locks.

Registered users can see Free before connecting. Abandoned registrations now
create account entitlement, but no site or key. No new abuse-control system is
introduced; existing identity controls, Free limits and configured Provider
budgets remain applicable. Future controls require actual evidence and a
separate change.

The [trial plan](../trial-stage-commercial-validation-plan-2026-10-06.md) and
[mechanism inventory](../trial-account-and-quota-mechanism-2026-10-06.md) record
the four-week scope and operator prerequisites.

## Rollback

Revert this task's registration/login binding, Portal copy and test changes
through reviewed Git. No schema migration or bulk backfill needs reversal.
Previously granted Free subscriptions remain legitimate account state; do not
delete, reset or revoke them as part of a source rollback. Keep site validation
and runtime-key safeguards throughout rollback.
