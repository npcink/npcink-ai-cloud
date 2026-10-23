# Commercial development next stage v1

Status: active. Operator approved continued development and sequential
implementation on 2026-10-23. This supersedes the commercial **development**
freeze; it does not authorize production operations or claim Phase 1 completion.

## Delivery order

1. Admin sales status → Portal catalog → checkout/trial eligibility.
2. Payment confirmation, credit delivery, closing and refunds, including recovery.
3. Support, payment/refund, trial/expiry and quota notifications, with deduplication.
4. Account-centered Admin operations linking subscriptions, orders, ledger and support.
5. Revenue/refunds, estimated provider cost and actual supplier bill analysis.

Each batch uses current master, focused tests, consumer evidence and a separate
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

The former development freeze was a development policy, not a claim that sales
were runtime-disabled or DB Offers were all draft. Restoring development must
not pre-seed ACTIVE Offers into production or implicitly enable sales.
Current payment return handling lives at `/portal/billing`; do not copy the
older `/portal/account?payment_return=success` examples as the current contract.
Use current code for payment settings and credit-pack overrides rather than
older env/static-catalog assumptions. Admin IA code or a healthy M4 candidate
does not prove accepted deployment. Treat previous plans as inputs to verify.
