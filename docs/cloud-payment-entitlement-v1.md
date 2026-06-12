# Cloud Payment Entitlement v1

Status: active
Date: 2026-06-12

## Scope

This specification freezes the minimal Cloud payment event domain that connects
external payment providers to Cloud commercial entitlement. It covers payment
orders, payment refunds, provider events, and entitlement grant/revoke effects.

It does not define a customer storefront, wallet, invoice system, dunning
center, seat lifecycle, WordPress write path, router ownership, prompt
ownership, or local approval bypass.

Cloud remains the entitlement truth. Payment providers only provide money
movement evidence.

## 1. Core Rule

Payment state must move through Cloud-owned durable records before entitlement
changes:

1. `payment_order` is created.
2. Provider payment success is verified and recorded as `payment_event`.
3. Cloud creates or activates the subscription and entitlement snapshot.
4. Refund is requested as `payment_refund`.
5. Provider refund success is verified and recorded as `payment_event`.
6. Cloud cancels the payment-created subscription and supersedes its
   entitlement snapshot.

Creating a payment order must not grant entitlement. Requesting a refund must
not revoke entitlement. Only confirmed provider success events may change
entitlement.

## 2. Tables

The minimal payment ledger is:

| Table | Purpose |
|-------|---------|
| `payment_orders` | One provider-facing order for a plan/version purchase. |
| `payment_refunds` | One provider-facing refund request for an order. |
| `payment_events` | Idempotent provider event evidence after verification. |

`account_subscriptions`, `account_entitlement_snapshots`, `usage_meter_events`,
and `billing_snapshots` remain the commercial entitlement and usage truth.

## 3. Provider Boundary

The initial provider id is `alipay`.

Provider events are untrusted until verified by the provider adapter. After
verification, service-plane code records the event and calls the commercial
payment domain. Provider response bodies, notify payloads, and query responses
must not directly mutate subscriptions or entitlement snapshots.

Provider ids, trade numbers, refund numbers, event ids, raw payload summaries,
and idempotency keys are audit evidence only. They are not WordPress truth and
not hosted runtime authorization truth.

## 4. Refund Policy

The first supported product policy is full refund inside a configured refund
window, defaulting to 14 days.

Full refund success cancels the subscription created by the payment order and
supersedes only entitlement snapshots for that subscription. It must not
supersede unrelated subscriptions for the same account.

Partial refunds may be recorded as payment evidence, but they must not revoke
entitlement unless a future contract explicitly defines partial entitlement
reduction.

## 5. Internal API

The current service-plane API is internal only:

```http
POST /internal/service/payments/orders
POST /internal/service/payments/orders/{order_id}/mark-paid
POST /internal/service/payments/orders/{order_id}/refunds
POST /internal/service/payments/refunds/{refund_id}/mark-succeeded
```

These routes require internal authentication and idempotency. They are not a
customer checkout surface.

Future customer-facing checkout endpoints may call the same domain services,
but must not bypass provider verification, payment event recording, or the
Cloud entitlement ledger.

## 6. Forbidden Items

Cloud payment must not:

- write WordPress content, settings, WooCommerce products, orders, or store
  configuration
- expose payment success as permission to bypass local plugin approvals
- let Alipay, a redemption-code marketplace, Redis, callback delivery, or a
  frontend session become entitlement truth
- turn package purchase into a second router, prompt, workflow, MCP, skill, or
  WordPress control plane
- revoke all account entitlement during refund when only one payment-created
  subscription is being refunded

The allowed Cloud role is payment evidence, entitlement grant/revoke, usage
metering, billing snapshots, and auditability.
