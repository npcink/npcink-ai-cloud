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

The refund window is enforced when the refund is requested. Paid credit packs
are refundable only while none of their purchased credits have been consumed.
Credit-pack purchase and payment confirmation both require the target
subscription to remain `active` or `trialing`.

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

## 7. Account-scoped Admin full refunds

The operator-authorized Admin entry lives at customer detail → Commercial →
Payment orders and refunds (`/admin/accounts/{account_id}#payment-orders`).
It covers existing Alipay CNY orders; no Portal self-refund surface is added.

- `GET /internal/service/admin/accounts/{account_id}/payment-orders` is a
  read-only, bounded list (`limit` 1–20, default 5; non-negative `offset`). It
  includes payment/refund status, amount, deadline, blocking reason and safe
  order/refund references. Historical orders are retained; gateway payloads,
  payment settings, checkout URLs and arbitrary metadata are not returned.
- `POST /internal/service/admin/accounts/{account_id}/payment-orders/{order_id}/refunds`
  accepts exactly a trimmed, non-empty `reason` of at most 500 characters.
  It requires internal authentication and an HTTP idempotency key. The browser
  proxy additionally requires a platform-admin session with `can_manage_billing`
  for both routes. Manual `mark-paid`/`mark-succeeded` remain unexposed.
- The server verifies account/order ownership, uses the original full amount
  and delegates execution to the existing refund domain. Refund windows,
  downstream package-order dependencies, purchased-credit consumption, locking,
  signed gateway results and entitlement reversal remain authoritative.
- One deterministic, domain idempotency key per order protects the Admin full
  refund across refreshes, new HTTP request keys and operator tabs. Repeating
  that action returns its existing refund; it never reissues the gateway call.
  An existing refund from any other entry blocks a new Admin refund. This
  bounded surface does not introduce partial refunds or retry failed refunds.
- The confirmation shows the customer, original order, amount and consequence.
  Busy controls reject duplicate clicks. A transport failure means unconfirmed,
  not failed or refunded; recovery only reads the same account's original
  refund. `requested`/`unknown` require provider reconciliation using the stable
  reference. Refresh does not query Alipay or manufacture successful settlement.
- Refund and readback success are separate. A stale/failed order read disables
  new refund actions; the UI retains the uncertainty and a read-only refresh.
  Only verified `succeeded` is shown as a successful refund. The operator can
  then refresh customer entitlement; monetary return still needs their actual
  Alipay acceptance.

This source contract authorizes neither production deployment/configuration nor
an agent-executed real refund. The operator performs the real transaction test.
