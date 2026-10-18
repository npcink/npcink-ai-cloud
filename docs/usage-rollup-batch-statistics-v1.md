# Usage Rollup Batch Statistics v1

Status: active implementation contract.

## Scope and reason

`UsageRollupService.generate_rollups` builds the existing summary, profile,
and instance projections. Calling the interactive statistics readers once per
catalog item previously repeated their catalog, aggregate, and latency SQL.
The batch path groups those reads per site and per window. It does not change
runtime admission, usage-meter events, credit ledger, callbacks, cadence,
database schema, or connection-pool settings.

## Read and output contract

- Read catalog instances, profiles, and routing bindings once per invocation.
  Read the latest health snapshots twice, retaining the two existing ID tie
  choices: summary chooses the latest ID; profile/instance choose the earliest.
  Both reads use the invocation's catalog IDs. Health summaries already iterate
  that catalog; orphan snapshots cannot contribute to their output. Explicit
  instance/Profile/observability readers keep their requested instance scope.
- Use the invocation's captured `now` for both UTC windows and all generated
  payload timestamps. Boundaries remain inclusive. Each new invocation reads
  fresh state; this is not a process-wide or cross-request cache.
- For each site scope (including the global scope), SQL groups run metrics by
  profile and Provider-call metrics by instance. Reuse the interactive SQL
  expressions and row conversion, including database-specific run latency,
  null handling, averages, rounding, costs, and distinct active-site counts.
- Compute summary aggregates separately. Summary Provider metrics require
  both run admission and call creation within the window; instance metrics
  and health calls filter only call creation. Profile metrics remain based on
  runs for that profile, while its health uses its candidate instances.
- Read rolling-24-hour Provider calls once per site scope and reuse them for
  health and instance latency. Stream only profile/latency scalar columns for
  run percentiles, without loading run input/result payloads. Reuse the exact
  existing percentile and health builders, not averages of grouped percentiles.
- Release the scoped reader before processing the next site. Memory remains
  proportional to one scope's recent calls/latencies and the catalog, not the
  Cartesian product of sites and catalog items. This is not a total row cap;
  unusually busy 24-hour histories still need separate memory validation.
- Keep empty catalog/traffic results, routing candidate order/duplicates,
  missing candidates/bindings, site-specific/global outputs, and output keys.
  The internal batch reader rejects unsupported scopes/windows/filters.
- Rollup writes use the bounded save path below and one final transaction
  commit. A failed round still rolls back all its writes. This change does not
  strengthen the database's ordinary transaction isolation or promise a
  transaction-wide snapshot under concurrent writes.

Interactive statistics continue to use ordinary fresh readers. Cloud remains
the owner of runtime/service evidence; no WordPress registry, approval, prompt,
workflow, or final-write authority moves to Cloud.

## Bounded rollup saving

Only `generate_rollups` uses the batch save entry point. It buffers at most
256 summary/profile/instance payloads and flushes each site's remainder before
advancing to the next scope. Its internal `write_batch_size` keyword accepts
1 through 256 for focused verification; it does not add a scheduler setting or
change any public API. Memory includes the current batch's new and old JSON,
in addition to the existing per-scope statistics reader. A row bound is not a
byte bound; unusually large payloads still require memory validation.

Each distinct-key batch reads its existing rows once, assigns the same fields
as the single-row saver, and flushes once. Retain ORM dirty checking, database
insert defaults, and the update-time `generated_at` expression. Unchanged
values must not cause an UPDATE or change their database timestamp, including
values that the existing ORM comparison considers equal. The payload timestamp
still uses the invocation's captured clock. Do not replace this with an
unconditional native upsert or silently change duplicate/concurrent-insert
conflict behavior. Batch input keys are distinct; repeated site scopes remain
separate batches with the existing count and overwrite behavior.

Every batch belongs to the original session. There is exactly one commit at
the end of a successful round; a later failure rolls back earlier inserts and
updates together. The existing `write` timing includes buffering, batch reads,
flushes, and the final commit. Separate commit/flush/connection-occupancy
measurements belong to the isolated experiment, not invented from that total.
Other router/diagnostics/probe/alert projection writers keep the single-row
saver. No schema, retention, cadence, metering, credit or callback changes.

Driver `executemany` or multi-row insert grouping can reduce cursor events;
report batch size, event count, parameter-set count, and actual affected rows
separately. Fewer events do not mean fewer updated rows or prove a fixed number
of server executions/network round trips.

## Latest health lookup and index

Explicit instance lists use one parameterized SQL batch: an instance-values CTE,
an indexed seek for each instance's maximum `measured_at`, then a seek for its
minimum or maximum ID at that time. The `(instance_id, measured_at, id)` B-tree
supports both tie choices without loading or aggregating each instance's full
history. Duplicate requested IDs do not duplicate output; missing/empty scopes,
empty-string IDs, and original row ordering remain unchanged. Each invocation
reads fresh database state. This is not a cross-request or cross-round cache.

The generic repository's `instance_ids=None` still means every non-null
historical instance, including instances absent from the catalog. Its global
aggregation remains as a compatibility path. It must not silently become a
catalog-only read. Usage summary and rollup know their catalog already and can
use the scoped path without changing the generated health summary.

Migration `20261017_0088` adds only
`ix_health_snapshots_instance_measured_id`; retain the existing single-column
indexes. PostgreSQL builds and drops it `CONCURRENTLY` in Alembic's autocommit
block. SQLite uses ordinary index DDL. A retry after a completed build reuses
only a valid, ready, non-unique B-tree with exactly those columns and no partial,
sorting, or INCLUDE variation. An invalid or mismatched index stops migration;
inspect the named index and repair only that exact build before retrying. Do
not hide failed concurrent builds with `IF NOT EXISTS` or delete other indexes.

Concurrent index construction still consumes CPU, I/O and storage and can wait
for transactions; it is not an authorization for production DDL. Future release
planning must check disk, migration timeout/cancellation, index validity and
rollback. Historical rows and their meanings are not changed. The new index
also adds maintenance work to health writes; include append/WAL costs in the
runtime comparison rather than declaring success from read timing alone.

Rollback application source and downgrade this index through a reviewed
migration/release path; no health data, usage, ledger or callbacks are deleted.
The unoptimized global lookup continues to work without the new index, and
the scoped query remains correct if the index has been removed.

## Verification and rollback

`tests/domain/test_usage_rollup.py` compares persisted batch payloads with the
ordinary readers at a fixed clock, including site selection, empty traffic,
inclusive boundaries, differing run/call timestamps, retries/errors, missing
finishes, fallback, cost rounding, health ties, and repeated rounds. It also
asserts statistics SELECT counts stay constant as instances/profiles grow.
Existing usage and repository tests cover the unchanged interactive consumers.
The health lookup contract compares complete selected rows with history,
including tie IDs, backdated larger IDs, orphan/null/missing instances, duplicate
and empty scopes, and fresh appends. Rollup payloads also compare against the
global-health reference. Query counters count both `SELECT` and `WITH`, so a
CTE must not disappear from the two-read and query-growth gates. Validate the
same contract and migration upgrade/retry/downgrade against isolated PostgreSQL.

M4 acceptance additionally requires PostgreSQL behavior and an isolated old/new
1/2/4-concurrency comparison with identical fixture/resource limits. Record
latency, timeouts, pool wait, rollup phase times/query counts, memory, and
meter/ledger/callback integrity. A shorter rollup alone does not establish
greater sustainable production capacity. For business-latency conclusions,
keep the offered background work fixed: an unbounded rollup loop executes
more rounds after an optimization and is a separate saturation test. Report
its actual round count rather than presenting it as an equal-work comparison.
Keep request counts within the existing admission/rate limits. A cell with
rejections is not a valid latency comparison; preserve that evidence and
reduce the experimental workload instead of weakening protection.

GitHub required checks and merged
clean-master promotion remain separate gates; production is not authorized.

The batch-statistics source change can be reverted without data, secret, or
scheduler changes. The latest-health index has its own migration downgrade
described above; application correctness does not depend on removing it.
