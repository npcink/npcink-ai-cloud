# ADR-055: Provider Account-Level Spend Budget Kill Switch

## Status

Accepted. This decision records the design only; implementation, and any
paid-provider authorization it precedes, remain separate operator decisions.

## Date

2026-09-22.

## Context

Cloud already separates three evidence layers: customer sales prices in CNY
commercial orders, AI credits as customer entitlement, and provider usage and
cost evidence recorded as the USD `cost` meter with a CNY accounting snapshot
([ADR-033](033-cny-accounting-and-provider-cost-evidence.md)).

Existing limits each protect one slice:

- package and plan budgets (`max_runs_per_period`, `max_tokens_per_period`,
  `max_cost_cny_per_period`) bound what one customer's plan may consume;
- AI-credit exhaustion fails closed per customer;
- the local experiment ledger (`scripts/provider_call_ledger.py`) bounds
  operator experiments with atomic claims and idempotent dispatch IDs, but it
  is a local script and is not on the production dispatch path.

No existing mechanism answers how much this provider account may spend in
total today and what stops it. The sum across all customers plus
non-customer dispatches — health checks, retries, operator experiments, and
future scheduled work — has no cloud-enforced daily or monthly hard cap, no
warning threshold, and no fail-closed state. Test-account versus paid-account
separation is procedural only. Before any paid provider call is authorized,
the worst-case spend must be a known, bounded number.

The realistic loss scenarios are configuration-driven rather than
adversarial: a routing profile that sends traffic to the most expensive
model, a retry storm that bills per attempt, or test and experiment
configuration that points at the paid account.

The price data this needs already exists. The `model_reference` table is
synced from models.dev with `usd_per_1m_tokens` prices, and provider
execution already records per-call conservative cost estimates whose
`cost_estimate_mode` handles unpriced and unreported models with a
conservative input rate. ADR-033 supplies the static operator-managed
accounting rate for CNY display.

## Decision

1. **Single enforcement point.** Every hosted provider dispatch passes one
   choke point in provider execution. The budget check runs there, before
   the call, against the same cost estimate the evidence path already
   computes. Any new dispatch path inherits the check by construction.

2. **No second pricing path.** Estimates use the existing `model_reference`
   prices and the existing conservative fallback for unpriced models. Cloud
   performs no runtime fetch of external prices or exchange rates; CNY
   display uses the ADR-033 static accounting rate. Overestimation is
   preferred to precision.

3. **Atomic claims, per account and period.** Budget state is one counter
   family: per provider connection, per UTC day and calendar month. A
   dispatch claims its estimate atomically before the call and reconciles to
   actual reported usage afterwards. Retried attempts are new claims.
   Unknown usage falls back to a conservative request-size estimate.

4. **Warn at 80%, stop at 100%.** Thresholds are operator-managed
   `service_settings`. At 80 percent Cloud emits a spend warning through the
   existing alert channel and shows an Admin banner. At 100 percent Cloud
   fails closed: new dispatches are rejected with an explicit error
   category; in-flight requests are not killed.

5. **Account isolation becomes a check, not a convention.** Provider
   connections carry an operator-set account class (paid or limited test).
   Paid-class dispatch requires a configured budget; experiment tooling must
   either claim from the same budget or target non-paid connections. The
   exact storage shape is finalized by the implementation PR, not here.

6. **Boundary.** The budget covers only dispatches Cloud initiates.
   Credentials leaked and replayed directly against the provider are stopped
   at the provider console; this decision reduces that loss window but does
   not replace key revocation.

## Non-Goals

- No customer-facing surface; customer exposure stays in AI credits and
  sales prices, which never reveal raw provider cost.
- No per-customer or per-model budgets; existing plan and credit layers own
  those.
- No change to models.dev synchronization or the `model_reference` contract.
- No live foreign-exchange feed and no automatic threshold tuning.
- No killing of in-flight requests.
- No claim that models.dev list prices equal upstream-gateway billing; the
  cap is an order-of-magnitude fuse biased toward stopping early.

## Simplicity Commitments

This decision is a fuse, not a subsystem. Implementation must not add a
second cost-estimation path, a second enforcement point, a new alert
pipeline, or a runtime dependency on external pricing. If inline claiming at
the dispatch choke point proves materially expensive, the sanctioned fallback
is a periodic sum-and-switch worker with a bounded overshoot window, recorded
here before it is built.

## Verification (for the implementation PR)

- unit tests for atomic claiming under concurrent dispatch, threshold
  fail-closed behavior, and the unpriced-model conservative fallback;
- a contract test that every provider dispatch path passes the choke point;
- an operator smoke showing a capped account rejects dispatch with the
  explicit error category and that the 80 percent warning is emitted.
