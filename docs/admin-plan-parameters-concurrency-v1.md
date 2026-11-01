# Admin plan parameter concurrency v1

Status: development candidate, 2026-11-01; B5-01 only. CI, merge, M4,
human visual acceptance and production remain separate gates.

The existing nine-field package editor updates the current live PlanVersion;
this contract prevents a stale full form from restoring another operator's
old credits, limits or price. It does not introduce immutable plan versions,
new commercial features, payment writes or new eligibility rules.

## Read and write contract

- `GET /internal/service/admin/plans/{plan_id}` adds `data.revision`, an opaque
  `plan-v1:<sha256>` token. The Admin proxy passes it through unchanged.
- `PATCH` on that path requires the exact read token in body `revision`, along
  with the existing nine parameters. Missing/empty token is HTTP 422; a token
  from another target or an outdated snapshot is HTTP 409 with
  `service.admin_plan_revision_conflict`. Neither case writes PlanVersion,
  canonical Offer or successful business audit.
- Internal authentication, `can_manage_catalog`, the original idempotency key
  forwarding and anti-replay semantics remain. Consumed keys return
  `auth.replay_blocked` before business revision validation; changed bodies do
  not bypass that rule. This interface does not replay successful responses.
- Deploy backend and frontend together. Old tabs/forms without a token must
  reload; they cannot bypass protection. The internal envelope remains `m6`;
  WordPress/Addon/Toolbox contracts are unchanged.

## Transaction and storage

Writers acquire Plan before canonical Offer, then refresh ORM state. Parameter
saves select the current published version (or existing fallback), compare the
read token and preserve hidden fields inside the same transaction as publication,
Offer synchronization and success audit. There is no unlocked read-to-write gap.
Publish, sales status, canonical Offer initialization and repository writes use
the same parent locking order. Offer locking also protects an existing canonical
Offer when publication retargets it. There is no process-local mutex.

PostgreSQL uses row locks. SQLite uses a no-op Plan UPDATE before reading because
it ignores FOR UPDATE; the UPDATE explicitly preserves `updated_at`. No schema
migration is required. The token hashes target, Plan status/metadata, normalized
current version (including hidden fields, excluding timestamps), and the full
canonical sales Offer. Successful publication/sales changes rotate a durable
`Plan.metadata_json.admin_parameters_epoch`; repository Plan upserts preserve
and rotate an existing epoch. This prevents same-value publication and sales
ABA from reusing an old token without relying on timestamp precision.

GET performs existing read queries; a concurrent write may make a read token
conservatively stale. It never authorizes a mixed snapshot overwrite: the write
compares against a fresh locked projection. Offer withdrawal remains withdrawn
when price/rights are republished. Paid-package zero-price validation is retained.

## Browser recovery and evidence

A confirmed revision conflict retains the target and draft and blocks Save.
“Read latest values (keep draft)” performs only the existing detail GET and stores
the new projection separately. Failure retains the draft and the save block.
Only “Discard draft and edit latest values” explicitly replaces inputs and
adopts the new revision. No automatic overwrite or retry occurs.

General draft navigation protection, unknown-result persistence/confirmation,
and broader success/directory validation remain batch 1B.

Focused regression files:

- `tests/domain/test_admin_plan_concurrency.py`: stale/same-field snapshots,
  simultaneous SQLite writers, missing Offer initializers, hidden-field and
  zero/decimal preservation, audit/Offer rollback, withdrawal and republication.
- `tests/api/test_admin_plan_management.py`: missing/wrong-target revision,
  authentication and existing same-key/body-conflict rejection.
- `frontend/tests/vitest/admin-plan-sales-proxy.test.ts`: capability and exact
  revision/key forwarding.
- `frontend/tests/e2e/admin-plan-concurrency.spec.ts`: mocked API, real Chromium,
  PC1440/1056 normal/conflict, failed/successful read recovery, retained input,
  explicit restart and serial save.
- `tests/integration/test_admin_plan_postgres.py`: **pending PostgreSQL execution**;
  dual transactions, rollback, missing Offer initialization, and actual withdrawal
  transaction lock waits observed through `pg_blocking_pids` for parameter,
  publication and bootstrap writers.

For the last file, use the existing isolated `portal_database` fixture in a
throwaway Compose PostgreSQL runner. Supply `NPCINK_TEST_PORTAL_POSTGRES_URL`
(secret injection, host `postgres`) and `NPCINK_TEST_PORTAL_ENVIRONMENT=test`, then
run `pytest tests/integration/test_admin_plan_postgres.py -v -s`. The M4 runner's
explicit target injection list is unchanged; invoking a new target without those
variables skips it. Skips are pending, never PG proof. Do not target live data.

An existing-runner invocation for the integrator (after candidate admission),
without adding a target to the runner's governed injection list, is:

```bash
pnpm run m4:preview:test -- --focused \
  tests/integration/test_portal_postgres_acceptance.py::test_activity_index_postgres_round_trip \
  tests/integration/test_admin_plan_postgres.py \
  --deselect=tests/integration/test_portal_postgres_acceptance.py::test_activity_index_postgres_round_trip \
  -v -s
```

The supported Portal selector activates the runner's existing safe environment
injection, then is explicitly deselected; only the seven new Plan tests execute.
The runner captures its own disposable database URL/environment, clears runtime
settings, and injects the two test variables internally. No URL, password or
runtime-setting override belongs in argv, logs or the receipt. Expect seven
executed tests and one deselection, **not skips**. The builder has not run this
M4 command or authorized any host/configuration mutation.
