# ADR-028: Use `ai_credits` as the canonical commercial meter

## Status

Accepted

## Date

2026-07-28

## Context

Cloud combines hard resource limits (such as sites, concurrency, and batch
size) with a variable consumption meter for hosted AI services. The previous
implementation mixed generic `credit`, `credits`, and `point` names with
already-established `ai_credits` package fields. That made the customer
language, ledger schema, Portal DTOs, and operator view unnecessarily easy to
misread as separate meters.

The product is for Chinese customers. The customer-facing unit must not imply a
cash wallet, permanent stored value, financial credit, or a hard resource
limit.

## Decision

- The canonical internal meter is `ai_credits`.
- Ledger deltas and aggregates use names such as `ai_credit_delta`,
  `consumed_ai_credits`, `granted_ai_credits`, and `total_ai_credits`.
- Paid grant persistence uses `original_ai_credits`,
  `remaining_ai_credits`, and `refunded_ai_credits`; migration `0073` renames
  the existing columns without changing values or expiry behavior.
- `ai_credits` is the ledger unit for grants, adjustments, and other direct AI
  credit entries. Source quantities such as tokens, calls, documents, and
  chunks remain their own units.
- Customer-visible Chinese copy is **AI 积分**. Package allowance is “套餐 AI
  积分”, a purchase is an “AI 积分包”, and history is “AI 积分明细”.
- Site count, concurrency, vector capacity, and batch size remain separate
  resource limits; they are never represented as AI credits.

The stable `/credit-ledger` paths remain unchanged. The Addon-facing read-only
projection is `ai_credit_usage_detail`; it accepts only the `ai_credits` unit.
The Addon remains a read-only summary and link surface, without a legacy
wrapper or generic-credit fallback.

## Consequences

Portal/Admin DTOs expose the canonical AI-credit field names. Callers must not
reintroduce the old generic numeric aliases. The migration is reversible at the
schema level and does not alter balances, ledger history, subscription periods,
or payment/refund decisions.

## Alternatives considered

### Points / 点数

Too generic: it can be confused with tokens, arbitrary score points, or hard
limits.

### Credits / 信用点

The Chinese term can imply financial or reputation credit and does not clearly
describe AI-service consumption.

### Quota / 额度

Correct only for hard resource limits, not the variable cross-service meter.
