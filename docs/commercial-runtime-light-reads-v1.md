# Commercial runtime light reads v1

Status: active.

## Scope

Commercial admission and paid-credit allocation read only the period evidence
needed by their existing calculations. Administrative and billing detail
readers continue to return full rows. This changes no public API, schema,
entitlement policy, transaction boundary, runtime ownership, or callback owner.

`CommercialUsageQueries.list_runtime_usage_facts` loads the primary key plus
`meter_key`, `ability_family`, `execution_kind`, and `quantity`.
`CommercialCreditLedgerQueries.list_runtime_credit_facts` loads the primary
key plus `source_type` and `ai_credit_delta`. Large `payload_json` and
`metadata_json` values are excluded from these SELECT lists. Deferred-column
access raises rather than silently issuing per-row queries. Consumers needing
full detail must use the existing full reader.

## Invariants

- Site/account, subscription, inclusive period boundaries, event types, and
  descending timestamp/primary-key ordering match the previous readers.
- Nightly usage still truncates each qualifying quantity with `int(float(...))`
  before adding. There is no SQL SUM or extra SQL nightly-only predicate.
- Package credits still skip purchase/refund sources, accumulate floats in
  the original order, and round the result to six decimal places.
- The ORM identity map remains authoritative for attributes already loaded in
  the current Session. With `autoflush=False`, dirty loaded values remain
  visible, pending inserts remain invisible until the existing writer flushes,
  and these readers neither flush nor commit. Raw scalar projections or
  server-side sums would change this behavior.
- The existing usage/ledger writers retain their flush, deduplication,
  idempotency, paid-credit allocation, and rollback behavior. The current
  flushed debit is included when calculating allocation. No value is cached
  across requests or across a Provider wait.
- Metering, callback scheduling/delivery, and failure rollback retain their
  current transaction owners. No callback or Provider code changes here.

## Verification and limits

`tests/domain/test_commercial_runtime_light_reads.py` compares the full and
light readers, inclusive boundaries, tied-row ordering, cancellation-sensitive
float addition, fractional nightly quantities, deferred JSON, identity-map
changes, unflushed inserts, flushed evidence, and rollback. Existing commercial
quota/paid-allocation and runtime transaction tests cover the consuming paths.

For performance validation, freeze the base and candidate sources and reuse
identical isolated M4 fixtures, 500 ms zero-fee Provider, 1/2/4 concurrent
requests, separate API/rollup/callback processes, and one fixed usage_rollup
per active cell. The callback receiver verifies signatures without adding an
extra key-derivation operation per delivery; the sender retains its real work
and resumes immediately after non-empty batches. Record P95, request-level
pool wait/connection hold, timeouts, CPU throttling, and complete per-run
meter/ledger/callback evidence. Do not change shared data or production.

This reduces columns and JSON decoding, not row count or query count. Memory
and CPU still grow with period history. A small-history benchmark can show
little or no latency benefit; it cannot establish production capacity. Any
later aggregation/cache proposal must separately prove the identity-map,
rounding, current-debit, isolation, and rollback contracts above.

Rollback is a normal revert of this change followed by the approved M4 source
promotion; no migration or data repair is required.

## M4 comparison, 2026-10-18

Frozen application base: `db4baabd189ad4454787972d4157d3a08b15c14f`. The
subsequent master `878720f5` adds documentation only. Candidate and base
archives differ only in the three commercial implementation files and the
new contract tests; their hashes are retained with the operator-local receipt.

Pgy direct transfer was explicitly authorized for this round. The isolated
experiment held its own operation lock, checked frontend leases and shared
service/container identities, and reused existing images without builds. API,
rollup and callback processes shared a 1 CPU / 1408 MiB runner; private
PostgreSQL used 0.9 CPU / 896 MiB and Redis 0.1 CPU / 64 MiB. The fixture had
5 sites, 251 instances, 16 profiles, 1.5 million health rows and 1,608 seeded
rollups. Provider delay was 500 ms with no paid runtime calls.

Three repetitions used AB/BA/AB ordering, 80 formal requests plus 4 warmups
and 2 idempotent replays per cell, with the existing rate limit unchanged.
Each aggregate below has 240 formal requests; P95 is nearest rank over the
pooled requests, not the average of cell percentiles. Hold is the sum of all
connection holds for one request; queue excludes connection creation/pre-ping.

| Concurrency | One rollup | Request P95 ms, before → after | Hold P95 ms, before → after | Queue P95 ms, before → after |
| --- | --- | --- | --- | --- |
| 1 | no | 571.038 → 570.076 | 58.282 → 55.719 | 0.056 → 0.047 |
| 1 | yes | 571.730 → 570.028 | 59.026 → 55.417 | 0.048 → 0.053 |
| 2 | no | 594.252 → 594.431 | 75.250 → 79.785 | 0.041 → 0.042 |
| 2 | yes | 590.498 → 590.612 | 76.095 → 80.399 | 0.041 → 0.045 |
| 4 | no | 659.473 → 622.918 | 113.629 → 100.337 | 26.473 → 22.541 |
| 4 | yes | 645.738 → 638.638 | 99.921 → 101.752 | 20.725 → 25.713 |

Four-way idle cell P95 values were 650.753/688.741/638.769 ms before and
635.917/619.712/606.604 ms after. With one rollup they were
616.129/654.983/638.046 ms before and 664.909/622.415/624.400 ms after.
The pooled reductions are about 5.5% idle and 1.1% with a rollup. Two-way
latency is essentially unchanged, and two-way/active four-way connection
hold or queue tails do not consistently improve. This supports bounded
column trimming, not a general throughput or production capacity claim.

The active rollup lasts roughly 0.3 seconds: only 12 of 240 four-way formal
requests overlap it per variant. The active-cell result therefore describes
one fixed background round, not a rollup continuously running for all 80
requests. CPU throttling remains present; the runner shares its quota with
the real callback sender work. Do not infer causation from overlapping
cgroup counters or add them across roles/requests.

All 36 cells passed: 2,880 formal requests, 144 warmups and 72 replays;
3,024 unique runs/Provider calls, 21,168 meter events, 6,048 ledger entries
and 3,024 signed successful callbacks were reconciled per run. Each cell's
injected 503 recovered using the same callback identity. No API failures,
timeouts, 429s or pool timeouts occurred. Every formal request retained eight
connection holds and 72 cursor events, with no connection held during the
Provider wait. The experiment lasted 1,581.220 seconds; only its owned
containers/network/volume/scratch were removed after checksum-verified export,
and shared service state remained unchanged.

The local receipt is under the operator's
`~/.codex/task-receipts/npcink-ai-cloud/2026-10-18-commercial-runtime-light-reads/`:
protocol, frozen archive identities, per-request traces, aggregate analysis,
closeout and export hash verification. The exported archive SHA256 is
`5a09ee76ad57dd12c812bc065b457b98572cb9e578f8be5e828d46fb1b9a61e9`.

The PostgreSQL test harness must patch the actual pytest-imported fixture
module and assert its scratch database count/dialect. A first harness that
reported zero PostgreSQL databases was rejected as SQLite evidence; it is
not counted as PostgreSQL coverage. The corrected recheck is retained
separately in `pg-recheck/`.

Validation passed: 42 focused M4 regressions; the corrected isolated recheck
passed 19 commercial tests on 19 PostgreSQL databases plus 8 probe tests.
Changed Python Ruff/targeted mypy, release policy and documentation
reachability passed. The local `check:fast` Docker wrapper could not run
because the authoring Mac has no running Docker daemon; required GitHub
backend integration checks remain the merge authority.
