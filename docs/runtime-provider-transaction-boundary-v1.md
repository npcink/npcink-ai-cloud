# Runtime Provider Transaction Boundary v1

Status: active runtime implementation contract.

## Scope and reason

`RuntimeProviderExecutionService.execute_candidate_chain` and its direct
`execute_provider` helper release their SQLAlchemy connection before adapter
I/O. This covers the hosted candidate chain and its internal prompt translation
and planning calls. It does not change the other dispatch entry points listed
in `tests/domain/test_provider_dispatch_contract.py`.

The default per-process PostgreSQL pool is two connections plus one overflow,
with a ten-second acquisition timeout. In the 2026-10-17 isolated M4 baseline,
four simultaneous inline text requests with a fifteen-second Fake Provider
caused one pool timeout, both with and without `usage_rollup`. A connection
remained checked out for approximately fifteen seconds. Increasing worker or
pool counts alone would retain that connection lifetime.

## Transaction checkpoints

For every actual adapter call:

1. Keep the existing provisioned-site, entitlement, quota, concurrency,
   idempotency, routing, cancellation and request-contract checks.
2. Reserve the configured Provider spend budget. Candidate-chain context
   preflight still runs before any upstream call.
3. Commit the current transaction before adapter I/O. This persists the admitted
   run, acceptance meter/ledger, budget claims, worker claim if applicable, and
   evidence from earlier retry/fallback attempts. It releases the pooled
   connection and transaction row locks.
4. Invoke the already-built adapter request. Do not query through the Session
   between the checkpoint and adapter call. The existing Session remains usable
   and reacquires a connection when the result/error path first needs the DB.
5. Retain the existing Provider-call evidence, usage meters, credit ledger,
   spend reconciliation, retry/fallback and output validation logic. The caller
   commits the final evidence, terminal state and callback scheduling together.
   A later attempt checkpoints earlier attempt evidence before its own I/O.

`execute_provider` checkpoints when its caller supplies a Session. Its existing
claim/reconciliation semantics are otherwise unchanged. Stateless helper use
without a Session does not create a transaction.

No pool tuning, migrations, new queues or runtime API fields are introduced.
WordPress retains local ability, workflow, approval and final-write ownership;
Cloud remains hosted runtime and accounting evidence only.

## Durability and failures

An in-flight idempotent replay can observe the admitted `running` run. It reuses
the run and does not issue another Provider call, acceptance meter or debit.
Already consumed credits and active runs are visible to later admission checks.
Provider budget reservations are committed before dispatch so concurrent
requests can see them after the reservation row locks are released.

Known Provider errors still use the existing error taxonomy, retry/fallback
policy, call evidence and spend reconciliation. Context overflow continues to
avoid an upstream call. Callbacks are scheduled only by terminal transitions;
the dispatch checkpoint does not fabricate a terminal result or callback.

An unexpected exception or process loss after dispatch may leave a durable
`running` run and conservative spend reservation. Completion and upstream cost
are then uncertain. Do not automatically replay that run or manufacture usage
evidence or a successful result. Inline runs have two time-based fallbacks, and
neither claims a Provider outcome:

- the 180 s inline lease stops admission from counting the row, so an orphan
  cannot hold a site's whole concurrency budget;
- after a per-run grace derived from the configured Provider budget and never
  shorter than 30 minutes, the runtime queue worker applies a bounded auto-fail
  (`runtime.stale_running_auto_failed`) under a row lock. The worker rechecks
  status, execution pattern and age before writing. It records a normal failed
  terminal state and schedules the normal terminal callback for that failure; it
  creates no Provider-call evidence, usage meter, credit, or result.

Existing runtime diagnostics and the operator's `mark_stale_running_failed`
recovery still cover runs inside the grace window and require evidence and a
reason. A transaction rollback after dispatch cannot undo the committed
admission or earlier attempt evidence. This is an intentional checkpoint
boundary, not an all-or-nothing transaction spanning an external Provider.

## Verification and operation

The transaction regression tests inspect the actual checked-out connection
count during Fake Provider execution, read the checkpoint from another Session,
and cover spend reservations/reconciliation, in-flight and completed replays,
credit/concurrency limits, retry evidence and uncertain-failure recovery.
Existing Provider execution, worker lifecycle, API metering and callback tests
remain the compatibility gates.

M4 performance acceptance uses isolated synthetic PostgreSQL/Redis data,
separate API/rollup/callback processes, protected HTTP requests and a zero-paid
Fake Provider: 1/2/4 concurrency with and without a running `usage_rollup`, then
four-way fifteen-second probes. Record response P95, connection acquisition
wait/timeouts, connection hold time, idempotency, meters, ledger and signed
callback completeness. Keep the default pools unchanged for comparability.

These fixtures do not certify a production Linux host, paid Provider latency,
other execution kinds, or external callback networking. The benchmark must not
write shared M4 data or production. Source edits stay on the authoring Mac;
shared M4 sync/promotion requires an idle, operator-authorized operation lane.

Rollback is a reviewed revert of the focused implementation commit followed by
normal M4 acceptance. There is no schema or secret rollback. Do not delete or
replay runs/claims already checkpointed by this revision. Production deployment
requires its separate authorization.

## Other budgeted dispatches and cost evidence

Admin exact-model diagnostics, explicit capability probes and the retained Advisor dispatch also commit spend claims before Provider I/O. They do not enable paused entrypoints. Unknown or partial-rate costs keep the conservative reservation; a zero placeholder without pricing evidence must not release it. Complete-rate or provider-reported zero remains a known zero. Health projections retain legacy numeric totals and add cost completeness flags rather than invent historical prices.
