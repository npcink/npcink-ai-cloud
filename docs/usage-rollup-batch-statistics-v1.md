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
- Rollup writes retain the existing upsert path and one final transaction
  commit. A failed round still rolls back all its writes. This change does not
  strengthen the database's ordinary transaction isolation or promise a
  transaction-wide snapshot under concurrent writes.

Interactive statistics continue to use ordinary fresh readers. Cloud remains
the owner of runtime/service evidence; no WordPress registry, approval, prompt,
workflow, or final-write authority moves to Cloud.

## Verification and rollback

`tests/domain/test_usage_rollup.py` compares persisted batch payloads with the
ordinary readers at a fixed clock, including site selection, empty traffic,
inclusive boundaries, differing run/call timestamps, retries/errors, missing
finishes, fallback, cost rounding, health ties, and repeated rounds. It also
asserts statistics SELECT counts stay constant as instances/profiles grow.
Existing usage and repository tests cover the unchanged interactive consumers.

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

Rollback by reverting this focused PR. No migration, secret, or scheduler
configuration rollback is required.
