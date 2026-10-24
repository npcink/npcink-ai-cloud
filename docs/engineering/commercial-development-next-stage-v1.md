# Commercial development next stage v1

Status: active bounded rollout contract. The operator approved existing sales
and the shared trial on 2026-10-23. Other commercial expansion stays frozen;
this exception does not authorize production operations or claim Phase 1 completion.

## Current bounded rollout (2026-10-23)

The operator explicitly approved self-serve access for all eligible normal
accounts: existing Plus/Pro monthly packages (current defaults CNY 15/29),
existing credit packs, and the shared 14-day Plus/Pro trial. There is no
invitation list or minimum account age. Account permission, published sales
status, subscription eligibility and the existing one-trial-per-customer
checks remain applicable. Plus/Pro share one trial window; upgrading during
that window does not restart or extend it. Trial credit caps remain 3000/5000.

The three-user Free validation continues with its original 300 credits per
30 days and one site. Its H1/H2/H3 results do not gate this rollout. If a member
chooses a paid-package trial or purchase, record the change separately rather
than merging that usage into the unchanged Free cohort.

This delivery integrates the existing sales-status candidate (#1205) with the
B01 order limits and emergency stop. Diagnose actual catalog/rights responses
before writing data: account offer listing already initializes missing defaults,
and effective credit packs include ServiceSetting overrides. No pre-seed
migration or broad SQL activation is required by the source contract.

New purchase routes share the existing account rate limiter (3 requests/60s),
after authorization and successful idempotent replay. Emergency stop blocks new
purchases and trials in both Portal and domain paths, without failing catalog,
history, existing settlement or refund reads/writes. Clearing it must preserve
withdrawn offers and disabled credit packs. Compose env-file changes require
container recreation; restart alone does not inject a changed environment.

Validate public/account catalogs, separate new users starting each trial,
shared trial expiry, direct checkout, signed notification replay, ledger grants,
refund reversal/unknown-result recovery, and stop/recovery together. Simulated
or local signed callbacks are application evidence only. Verify the actual
Alipay runtime mode without exposing credentials before any real acceptance.
Real transaction tests and production operations require a separately specified
environment, transaction and authorization. No price change, real WeChat API,
new marketing system, broad commercial expansion or paused-feature restoration
is included in this rollout.

## Deferred follow-on order (not implementation authorization)

1. Admin sales status → Portal catalog → checkout/trial eligibility.
2. Payment confirmation, credit delivery, closing and refunds, including recovery.
3. Support, payment/refund, trial/expiry and quota notifications, with deduplication.
4. Account-centered Admin operations linking subscriptions, orders, ledger and support.
5. Revenue/refunds, estimated provider cost and actual supplier bill analysis.

Future expansion requires explicit scheduling and authorization. An authorized
batch uses current master, focused tests, consumer evidence and a separate
reviewable PR. Overlapping unfinished work must be reconciled before starting
the dependent batch. Preserve other sessions' dirty work and shared M4 ownership.
Record local, CI, M4 candidate, merged, M4 accepted, production and human evidence
separately. Production sales activation, real transactions/refunds and production
Deploy require their own explicit authorization. Existing paused capabilities
remain paused.

## Batch 1 contract

- The standard Plus/Pro Offer is the persisted sales-status truth. `active`
  permits new purchases only when the linked plan is active, the linked version
  belongs to it and is published, the Offer is self-serve and within its validity
  interval. `draft`/`retired` do not permit new purchases or trials.
- Missing legacy default Offers may still be initialized. An existing Offer is
  never retargeted or reactivated by catalog reads, checkout or trial bootstrap.
  Publishing price/rights preserves an existing Offer's sales status.
- Admin plan detail returns the canonical sales Offer even when withdrawn.
  `PATCH /internal/service/admin/plans/{plan_id}/sales` accepts exactly
  `{"status":"active"}` or `{"status":"retired"}`, requires internal/admin
  authentication and an idempotency key, and records a service audit event.
  The browser proxy requires `can_manage_catalog` for this route.
- Public and account catalogs filter unpurchasable Offers. Direct checkout and
  new self-serve trial requests enforce the same availability; a disabled or
  approval-only trial cannot be started through a direct request.
- Withdrawal does not cancel existing orders, subscriptions or active trials.
  Replayed checkout requests return their original orders; successful settlement
  uses the order's existing price and target-version snapshot.
- Credit packs already support Admin overrides in `ServiceSetting`; the Python
  catalog is the default, not a second editable source. Reuse the current
  catalog/update/order paths. Test withdrawal and original-order snapshots.
- This batch does not change the existing live plan-parameter update policy.
  Immutable historical entitlement versions need a separately scoped change.

## Corrections to older commercialization drafts

The development freeze is a development policy, not a claim that sales are
runtime-disabled or DB Offers are all draft. The bounded exception must not
pre-seed ACTIVE Offers into production or implicitly enable production sales.
Current Alipay return handling redirects to
`/portal/account?payment_return=alipay#payment-orders` (#1224). Legacy billing
returns are forwarded to the account order section. The return parameter is a
navigation hint, not payment truth; the notice refreshes server-owned order
status. Do not copy older `payment_return=success|failed` examples as settlement
evidence.
Use current code for payment settings and credit-pack overrides rather than
older env/static-catalog assumptions. Admin IA code or a healthy M4 candidate
does not prove accepted deployment. Treat previous plans as inputs to verify.
