# ADR-033: CNY Accounting And Provider Cost Evidence

## Status

Accepted.

## Date

2026-07-28.

## Context

Customer prices are denominated in CNY, while hosted model providers may report
cost in USD. A hard-coded browser conversion made displayed values convenient
but did not identify the rate source, effective date, or version. Package cost
budgets were also labelled in USD, forcing operators to compare customer price
and internal cost in different currencies.

The provider amount is still important evidence. Replacing it with only a
converted value would weaken reconciliation and make historical totals change
when the current rate changes.

## Decision

1. Customer price, package model-cost budget, Admin summaries, and operator
   decisions use CNY.
2. Cloud keeps the original provider cost as the `cost` meter in USD and emits
   a paired `cost_cny` meter for new provider calls.
3. Both cost events snapshot `cost_usd`, `cost_cny`, and an `accounting_fx`
   object containing base and quote currencies, rate, effective time, source,
   version, and fallback state. Later rate changes do not rewrite those events.
4. One global operator-managed USD/CNY accounting rate is stored through the
   existing Cloud `service_settings` service-plane contract. It is not a
   WordPress setting or a public runtime control.
5. Until an operator saves a rate, Cloud uses an explicit versioned fallback of
   `7.200000` effective `2026-07-01T00:00:00Z`. Admin must show that this is a
   fallback requiring review; it is not represented as a live market or
   settlement rate.
6. Package versions write `max_cost_cny_per_period`. The legacy
   `max_cost_per_period` field remains readable and is not reinterpreted as CNY.
   New operator top-up history writes `cost_cny`; legacy `cost` top-up metadata
   remains USD evidence and is not relabelled. The top-up API accepts the new
   `cost_cny_increment`; its legacy `cost_increment` input is treated as USD
   and converted with a snapshotted accounting rate.
   Existing usage without a CNY snapshot may be converted for read-only
   reporting using the currently resolved accounting rate and must be
   identified as legacy conversion.
7. Browser code formats already-snapshotted CNY amounts. It does not own an
   exchange-rate table or perform arbitrary USD/CNY conversion.

## Non-Goals

- No real-time foreign-exchange feed or user-selectable display currency.
- No rewrite of historical provider events, orders, or payment snapshots.
- No claim that the accounting rate is an Alipay settlement or bank rate.
- No change to AI-credit denomination, entitlement truth, or WordPress control
  ownership.

## Compatibility And Storage

No schema migration is required. The rate uses the existing
`service_settings.config_json` record, cost snapshots use the existing usage
event payload and currency fields, and the new CNY budget is additive JSON.
Legacy USD fields stay readable during the compatibility period.

## Verification

- Unit tests cover validation, normalization, deterministic rate versions, and
  decimal conversion.
- Runtime tests require paired USD and CNY cost events with the same immutable
  rate snapshot.
- Service-route tests cover explicit fallback state and operator updates.
- Frontend contracts reject browser-owned exchange rates and require the
  accounting settings route to pass through the Admin proxy.

## Rollback

The Admin accounting panel and CNY budget input may be hidden without deleting
stored settings or event evidence. Stop emitting new `cost_cny` events only
after readers again use raw USD explicitly; do not relabel legacy
`max_cost_per_period` values or delete snapshotted rate metadata.
