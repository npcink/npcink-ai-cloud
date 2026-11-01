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

Parameter saves acquire Plan, then its PlanVersion collection in stable
`created_at DESC, plan_version_id DESC` order with `FOR UPDATE` and
`populate_existing`, then canonical Offer. They select the current published
version (or existing fallback) and compare the read token only after these locks;
hidden-field preservation, publication, Offer synchronization and success audit
remain in that transaction. Publish/repository version writes use requested
Plan → Version → Offer; sales and canonical Offer initialization use Plan → Offer
without acquiring a later Version lock. Existing parent/Offer ORM refreshes
remain. There is no process-local mutex or unordered dual-parent lock.

PostgreSQL uses row locks. SQLite uses a no-op Plan UPDATE before reading because
it ignores FOR UPDATE; the UPDATE explicitly preserves `updated_at`. No schema
migration is required. The token hashes target, Plan status/metadata, normalized
current version (including hidden fields, excluding timestamps), and the full
canonical sales Offer. Successful publication/sales changes rotate a durable
`Plan.metadata_json.admin_parameters_epoch`; repository Plan upserts preserve
and rotate an existing epoch. This prevents same-value publication and sales
ABA from reusing an old token without relying on timestamp precision.

GET performs existing read queries; a concurrent write may make a read token
conservatively stale. The write compares against a fresh locked projection.
The cross-parent repair and its PostgreSQL evidence limitation are described
below. Offer withdrawal remains withdrawn when price/rights are republished.
Paid-package zero-price validation is retained.

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
  authentication, existing same-key/body-conflict rejection, and preservation
  of the existing cross-parent version move API behavior.
- `frontend/tests/vitest/admin-plan-sales-proxy.test.ts`: capability and exact
  revision/key forwarding.
- `frontend/tests/e2e/admin-plan-concurrency.spec.ts`: mocked API, real Chromium,
  PC1440/1056 light and PC1440 dark normal/conflict, failed/successful read
  recovery, retained input, explicit restart and serial save.
- `tests/integration/test_admin_plan_postgres.py`: **pending PostgreSQL execution**;
  dual transactions, rollback, missing Offer initialization, and actual withdrawal
  transaction lock waits observed through `pg_blocking_pids` for parameter,
  publication and bootstrap writers; two cross-parent orderings measure Version
  lock waits and check final ownership, values and successful audit counts.

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
  tests/integration/test_admin_plan_postgres.py
```

The supported Portal selector activates the runner's existing safe environment
injection and executes the isolated Portal index control alongside the nine
Plan tests. The runner captures its own disposable database URL/environment,
clears runtime settings, and injects the two test variables internally. No URL,
password or runtime-setting override belongs in argv, logs or the receipt.
Expect ten executed tests (nine Plan + one Portal), **not skips**. The M4 CLI
accepts target selectors only; do not pass pytest flags such as `--deselect`,
`-v` or `-s` through it. The builder verified argument handling using `--dry-run`
only; actual isolated PostgreSQL execution remains the integrator's gate.

## Cross-parent version movement repair; PostgreSQL proof pending

Independent review identified a requested-parent-only lock scope. The existing
`POST /internal/service/plans/{plan_id}/versions` accepts an arbitrary existing
`plan_version_id`; the Admin proxy exposes it behind `can_manage_catalog`.
`PlanVersionPayload`, the publish handler and repository do not reject an ID
already belonging to another Plan. The model has an ordinary Plan foreign key
and `(plan_id, version_label)` uniqueness, not immutable parent ownership.
The repository characterization contract retains full field replacement.

A disposable local SQLite API check on this candidate published `shared_version`
under `plan_a`, then under `plan_b`: both returned 200; the persisted row belonged
to `plan_b` with the second credits value and `plan_a` had no current version.
This proves reachability, not production usage or PostgreSQL concurrency.

Review found an unlocked projection window in the first candidate: parameter
save could read an old version before publication under a different Plan moved
and changed it, then later refresh and assign it back. The repair locks actual
child rows before revision projection. Under PostgreSQL READ COMMITTED, a locking
SELECT waiting on a moved row should recheck its `plan_id` predicate and exclude
the moved-out row; `populate_existing` also avoids cached values being reused.
This expected database behavior still requires the isolated PostgreSQL tests.

The two new cases pause a real writer before commit and observe
`pg_blocking_pids` / `pg_stat_activity` for the other writer's Version FOR UPDATE
wait. Retarget-first must produce a parameter revision conflict, retain the new
parent/20000 credits and record only the successful retarget audit. Parameters-
first must allow the 15000-credit save followed by the legitimate retarget to
20000, with two successful audits. Custom agency Plans isolate Version locking
from a shared canonical paid Offer. The old parent must end without that version.

Local regression checks pass, but SQLite's database write lock cannot prove this
PostgreSQL schedule. Local selection collected nine Plan cases plus the Portal
control and skipped all ten for lack of the explicit runner environment. No PG
pass or admission is claimed. Existing cross-parent moves remain allowed;
ordinary GET is unchanged. Integrator runs the supported command above before
deciding admission; no customer, payment or production operation is required.

## Dated 1A integration acceptance — 2026-11-02

The pending PostgreSQL statements above preserve the builder's original local
handoff state. The integrator subsequently merged PR
[#1346](https://github.com/npcink/npcink-ai-cloud/pull/1346) into
`42fef5409423fb6dc403b1ebfd3304feda5dbd28` and accepted it on M4. Actual isolated
PostgreSQL executed **10/10** (nine Plan and one Portal control), packaged real
Chromium executed **3/3**, exact-head CI had 21 successes and 10 policy skips.
Candidate `8ab6ca916c6075b485122ab16a77b37529bd0105` and merged master have the same
full tree. This supersedes the earlier PG-pending status for 1A; it is neither
production nor human product acceptance. Later 1B work follows the
[evidence/draft contract](admin-plan-parameter-evidence-drafts-v1.md) with its own
local/CI/M4/merge states.
