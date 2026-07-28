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
6. Package versions accept only `max_cost_cny_per_period`, and operator top-ups
   accept only `cost_cny_increment`. Because the product has no external users
   or production package/top-up history, the unreleased
   `max_cost_per_period` and `cost_increment` compatibility inputs are removed
   instead of becoming permanent dual contracts.
   Existing usage without a CNY snapshot may be converted for read-only
   provider-cost reporting using the currently resolved accounting rate and
   must be identified as legacy conversion. This provider evidence fallback is
   not a package-budget or top-up compatibility path.
7. Browser code formats already-snapshotted CNY amounts. It does not own an
   exchange-rate table or perform arbitrary USD/CNY conversion.

## Non-Goals

- No real-time foreign-exchange feed or user-selectable display currency.
- No rewrite of historical provider events, orders, or payment snapshots.
- No claim that the accounting rate is an Alipay settlement or bank rate.
- No change to AI-credit denomination, entitlement truth, or WordPress control
  ownership.

## Compatibility And Storage

No schema migration is required. A one-time data cleanup removes the unreleased
USD keys from internal plan versions, entitlement snapshots, and top-up
metadata; there is no external package or top-up data to convert. The rate uses the existing
`service_settings.config_json` record, cost snapshots use the existing usage
event payload and currency fields, and package/top-up JSON uses only the CNY
fields.

## Verification

- Unit tests cover validation, normalization, deterministic rate versions, and
  decimal conversion.
- Runtime tests require paired USD and CNY cost events with the same immutable
  rate snapshot.
- Service-route tests cover explicit fallback state and operator updates.
- Service-route tests reject removed USD package-budget and top-up inputs.
- A migration contract test proves that the one-time cleanup preserves CNY and
  unrelated metadata while removing only the unreleased USD keys.
- Frontend contracts reject browser-owned exchange rates and require the
  accounting settings route to pass through the Admin proxy.

## Rollback

The Admin accounting panel and CNY budget input may be hidden without deleting
stored settings or event evidence. Stop emitting new `cost_cny` events only
after readers again use raw USD explicitly; do not delete snapshotted rate
metadata. Reintroducing a second package or top-up currency contract requires a
new decision and migration plan.
