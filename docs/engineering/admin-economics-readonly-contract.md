# Read-only Admin economics

Scope: `/admin/economics` is a platform-wide diagnostic projection, not a price,
commercial ledger, entitlement, or accounting system. It grants no WordPress or
commercial write authority and does not enable paused capabilities.

## API

The Admin BFF permits only GET `economics/usage-by-family` and
`economics/revenue`, requiring `can_manage_billing`. The backend paths are
`/internal/service/admin/economics/{usage-by-family|revenue}` and require existing
internal authentication. No bill-writing endpoint exists. Invalid or missing
`month` is rejected; months use UTC half-open `[start, next-month)` bounds.
Supported years are 0001–9998. Browser month input is restricted to 1000–9998.

Both routes use the existing envelope with `data.month`. Usage returns
`generated_at`, `families`, `provider_call_total_usd` and `note`. Each family has
`runs`, `tokens_total`, `provider_call_count`, `provider_call_cost_usd`.
Meter events supply runs/tokens by their creation time; provider-call records
supply calls/cost by their creation time, joined to their retained run's family.
Search/image/audio execution kinds and Zhihu provider calls use explicit buckets.
These are different denominators. Zero recorded cost is not proof of free usage;
retention, missing calls and incomplete configured prices limit the projection.
Historical paused families are readable evidence only.

Revenue returns `generated_at`, `subscription_revenue_cny`,
`credit_pack_revenue_cny`, `refunds_cny`, `net_revenue_cny`,
`active_paid_accounts`, `trialing_accounts`, `account_counts_scope`, `currency`
and `note`. Paid/refunded orders contribute by paid time; successful refunds
subtract by succeeded time. Only exact CNY records contribute; no conversion is
performed. Credit-pack orders are recognized by `purchase_kind=credit_pack` or
literal `pack_` plan prefix. Current paid/trial counts deduplicate account IDs
within each status among non-Free subscriptions. An account may appear in both
statuses. Counts are stored-status snapshots, not selected-month history or
proof of current payment; no expiry reconciliation runs during these reads.

Queries aggregate inside PostgreSQL in read-only transactions. They do not call
subscription lifecycle services, mutate records, or expose customer-level rows.
No schema, registry, tariff or commercial write path changes are required.

## Browser-only bills

Third-party bill names, amounts, mappings and derived estimates remain in React
memory and localStorage under `npcink_economics_bills_{month}`. Requests contain
only the selected month. No upload, synchronization, remote persistence, logging
or price suggestions are provided. Browser profiles share local scratch data;
operators needing separation must use separate profiles. Storage errors preserve
in-memory edits and explicitly warn that persistence is not guaranteed.

Each bill allocates by token share only if all selected families have positive
tokens; otherwise it uses nonnegative metered-run shares consistently. Missing
mappings or zero total weight leave the bill unallocated. No token/run conversion
constant is invented. Amounts must be finite and nonnegative. Empty bills do not
imply zero provider cost. Estimated margin uses entered CNY bills against net CNY
receipts; missing revenue or bills displays unknown, and zero/nonpositive revenue
has no margin ratio. USD provider-cost evidence is never added to CNY bills.

Both API sources have independent loading/error states. Refresh retains local
bills; month changes never reuse previous-month API values. Bill changes trigger
no network requests. The page has one title, a compact monthly toolbar, four
summary metrics, one usage table and local bill workbench. Definitions are
secondary; all actions affect reads or this browser's draft only.

## Verification

Route authentication, UTC bounds, invalid input and GET-only behavior are API
tested. Allocation tests cover unit consistency, conservation, unknown weights,
invalid amounts and zero-revenue semantics. PC browser tests cover persistence,
month isolation, no bill egress, partial failure, retry, invalid storage, bilingual
copy and overflow. The opt-in PostgreSQL proof uses the existing guarded
random-schema fixture and seed-only synthetic data, then reads back unchanged
commercial state. An unconfigured local skip is not PostgreSQL evidence.
