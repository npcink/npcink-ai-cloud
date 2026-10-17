# Background Lightweight Mode v1

Status: operator-requested runtime defaults. Integration is separate from M4
acceptance and production deployment; merging does not change production.
Scope: existing ops cadence, with no new scheduler, service, API or database.

## Schedule

| Task | New default | Preserved responsibility |
| --- | --- | --- |
| Router diagnostics summary | 3600 seconds | Existing bounded read-only diagnostic batches |
| Latency probe summary | 3600 seconds | Existing bounded latency evidence |
| Provider degradation summary | 3600 seconds | Existing rule/metadata projection; effective hourly lookback at least 60 minutes |
| Editor-assist quality analysis | Manual only | Existing seven-day metadata-only analysis and natural-sample gate |
| Provider health scan | Unchanged, 900 seconds | Health freshness and routing support |
| Usage rollup | Unchanged, 3600 seconds | Usage projections; live accounting/entitlement enforcement unaffected |
| Retention/artifact cleanup and reconciliation | Unchanged | Data lifecycle, recovery and storage guarantees |
| Payment order expiration | Unchanged, 60 seconds | Pending-order expiration correctness |
| Runtime and callback workers | Unchanged | Durable execution, callback retry/recovery and worker heartbeats |

Diagnostic work is less frequent, so those projections update less often. This
is not a new real-time alerting guarantee. The degradation task uses the larger of its configured lookback and actual
schedule interval (rounded up to minutes, bounded to the existing 24-hour
query limit). This gives 60 minutes for hourly diagnostics while preserving
the old 30-minute lookback under an explicit 15-minute interval. It is still
a rolling window, not a durable gap-free event processor. Schedules longer
than 24 hours require separate coverage planning.

`Settings`, `.env.example` and production Compose fallbacks agree on the new
defaults. Existing explicit environment values win, including an old 900-second interval. The degradation runner reports its
effective `window_minutes` in cadence evidence; a configured window shorter
than its interval is raised within the 24-hour bound. A future operator-approved
rollout must inspect these non-secret effective values and set the three
intervals to 3600 explicitly when needed. This task does not alter any `.env.deploy` or live
configuration. Do not set intervals to zero as a disabling mechanism.

## Manual quality analysis

In an already-authorized named runtime/container, run exactly once:

```bash
python -m app.workers.ops_cadence --manual-task editor_assist_quality_detection
```

The command prints bounded JSON evidence and exits. It does not start a second
worker, impersonate worker freshness, write a cadence success record, generate
traffic or change Provider/prompt/router/WordPress state. Unknown task names
are rejected before runtime initialization. The existing richer
`python -m app.ops.editor_assist_quality_status --window-hours 168` command
and read-only Admin detail remain available. Natural metadata collection and
its existing retention do not stop.

The cadence summary keeps automatic tasks under `items`/`totals`. It lists
quality separately under `manual_tasks` with `execution_mode=manual`, making
intentional non-scheduling explicit. Existing quality audit history remains
unchanged and is not interpreted as a currently missing/stale scheduled task.
All required automatic freshness checks remain in force; the three optional
summaries use their configured hourly interval in that calculation.

## Verification and measurement

Focused regressions cover default values, the 15/60-minute boundary, absence
of daily quality invocation, explicit one-shot execution, cadence freshness,
retention/usage/artifact/order work and existing callback/worker contracts.
All Provider-facing tests use deterministic fixtures. Do not create paid calls
merely to prove scheduler behavior.

The historical resource measurements are in the
[resource sampling retrospective](history/engineering/2026/resource-sampling-and-session-closeout-retrospective-2026-10-17.md).
This mode reduces default diagnostic executions from four to one per hour;
it does not prove a 75% CPU, memory or database saving. A 60-minute lookback
also changes the work per degradation summary. Use an approved passive window
and correlate `usage_rollup` with task logs before claiming capacity gains.

For M4 candidate/promotion use the
[M4 operating standard](m4-preview-ai-development-standard-v1.md), explicit
runtime ownership and connection priority; never overwrite another task's
candidate or seize its lock. Production remains separately authorized.

## Rollback

Revert the reviewed config/cadence/Compose changes and this runbook through a
PR. Explicit diagnostic interval overrides can restore the old frequency,
but restoring automatic quality scheduling requires a reviewed source change.
No schema migration, historical event deletion, callback change or new runtime
service is part of either direction.
