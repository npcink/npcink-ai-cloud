# Worker database connection recovery v1

Status: active implementation contract; source and development evidence do not
prove production deployment.

## Scope

The long-running `runtime_queue`, `callback_dispatch` and scheduled
`ops_cadence` workers opt in to bounded database connection acquisition retries.
A short connection timeout previously escaped maintenance reads and terminated
these processes. Their restart policy remains the last resort after exhaustion.

Only `get_session` acquisition **before its body starts** is retried. Each failed
Session is closed before waiting, and every attempt creates a fresh Session.
There are at most five attempts, with delays of 1, 2, 4 and 8 seconds plus
0–0.25 seconds of jitter per delay. Existing per-connect/pool timeouts remain
unchanged; the delay budget is at most 16 seconds, excluding connection time.

The retry scope uses a ContextVar and resets on normal or exceptional exit.
API requests, scripts, `ops_cadence --manual-task`, and unrelated worker threads
retain their original lazy acquisition and error behavior. The explicit startup
`require_database_connection` check remains fail-fast.

## Error and side-effect boundaries

Retry only connection-class SQLSTATEs (`08*`), shutdown/unavailable states
`57P01`/`57P02`/`57P03`, connection exhaustion `53300`, invalidated connections
without a server SQLSTATE, and the driver's SQLSTATE-less
`connection timeout expired` OperationalError. Authentication, unknown errors,
configuration errors and pool saturation are not silently retried.

After the Session is yielded, SQL statements, commit/rollback, Provider calls,
queue consumption and HTTP callbacks are never replayed by this mechanism.
Reacquisition by an already-yielded Session also keeps its existing failure
behavior. Even a transient-looking business exception propagates normally.
Do not wrap an entire worker iteration or cadence task in a database retry:
external effects or commit outcomes may already be uncertain. Preserve the
[Provider transaction boundary](runtime-provider-transaction-boundary-v1.md),
callback claims, accounting and existing recovery rules.

Retry logs contain only the worker ID, attempt count, wait and exception type;
never log the original driver message, SQL, parameters or database URL. No
successful heartbeat is fabricated while the worker waits for a connection.
Exhaustion propagates the original exception to the existing process policy.

## Diagnosis and verification

Use bounded, read-only incident evidence: align worker exception timestamps,
container/process start times, ECS disk reads, kernel/OOM records and RDS
CPU/memory/connections/IOPS over the same time window. RDS IOPS and ECS local
disk IOPS describe different machines. A healthy database after restart or a
low-resolution historical graph does not disprove transient network failures;
a connection timeout alone does not prove a database capacity shortage.
If historical OS/process metrics are absent, record the gap rather than
attributing disk activity to one service. Separate source-level scan reductions
from a demonstrated production root cause.

Regression gates cover fresh-session cleanup before each backoff, exhaustion,
authentication/configuration failures, scope isolation, secret-free logs,
business-body non-replay, and all three worker entrypoints recovering from
injected connection failures with no real Provider or callback traffic.
Run core/worker regressions plus the existing Provider dispatch contract.
Use the normal L2 candidate validation lane; do not fault-inject a production
database or host. Production rollout and any resource/monitoring configuration
changes require separate exact authorization.

Rollback is a reviewed source revert through the normal release process. There
is no migration, new setting, worker-count change or pool-size increase.
