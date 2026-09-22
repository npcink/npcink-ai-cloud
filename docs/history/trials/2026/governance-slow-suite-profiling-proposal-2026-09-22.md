# Governance Inventory: Slow Suite Profiling Proposal - 2026-09-22

Status: planning evidence for the 2026-09-22 gate-timing baseline follow-up.
Measurements were taken on the authoring Mac (Apple Silicon, local venv from
the frozen lockfile); the encryption-cutover suite needs no Docker because its
harness fakes the Docker CLI. Numbers are order-of-magnitude evidence for
planning, not CI evidence.

## Suite 1: `tests/contract/test_runtime_data_encryption_cutover_contract.py`

Measured locally: 33 passed in 306s; slowest tests 16.4-17.4s each, with a
uniform 10-17s distribution. Instrumenting one slowest test showed **507 fake
`docker` CLI invocations** inside a single 18.5s test, about 36ms per spawn
(bash fixture startup plus script logic). The suite's cost is process-spawn
overhead in the fail-closed simulation harness, not sleeps (the file contains
only two 0.01s sleeps, both in assertion helpers) and not cryptography.

Assessment: the granular docker call sequence is the behavior under test, so
reducing spawns means redesigning either the executable under test or the
fidelity of the harness - both out of proportion to the benefit. The suite is
evidence-critical and runs inside one CI shard (~306s serial against a
284-348s shard band, so it effectively caps that shard).

Options, in preference order:

1. **Accept** the cost. The suite is uniform, healthy, and proves cutover
   safety end to end.
2. **Spike pytest-xdist for this file only** as a follow-up: fixtures use
   isolated fixture roots, so worker isolation plausibly holds; 33 tests
   across workers could cut wall time roughly 3-4x. This adds a test
   dependency and needs a dedicated review; do not bundle it.
3. Do not thin out the fake harness; call-pattern fidelity is the evidence.

## Suite 2: `tests/api/test_wordpress_ai_connector_runtime.py`

CI weighted cost 281.6s for 80 tests (~3.5s per test). Static analysis found
no sleep loops. Candidate costs, unranked pending one instrumented run:

- per-test `TestClient` + `create_app` + `init_schema` lifecycle (full DDL
  per test) - the classic dominant cost for API suites of this shape;
- real PBKDF2 secret hashing: `SECRET_HASH_ITERATIONS = 210_000` measured at
  **43ms per hash** on the authoring Mac, hit through site-auth seeding and
  the callback HMAC path (`build_secret_hash` has 21 call sites in `app/`);
  tens of hashes across 80 tests plausibly costs 10-30s;
- PIL image fixture generation for vision-contract tests (small count).

Proposals, in preference order:

1. **Instrument once before changing code**: run the file once with
   `--durations=25` on the M4 focused lane (`m4:preview:test -- --focused`)
   or a temporary CI shard step, and rank fixture/setup vs call costs. One
   run answers all ranking questions.
2. If hashing ranks high: introduce a **Settings-driven test override** for
   `SECRET_HASH_ITERATIONS` (for example 1_000 in test settings). This is
   security-adjacent and needs its own reviewed PR with focused tests; it
   must not change production defaults or hash-format parsing.
3. If schema setup ranks high: consider a session-scoped schema with
   per-test transaction rollback. This is a larger refactor of the API test
   harness; only start it with duration data in hand.
4. `tests/api/test_portal_routes.py` (264.3s weighted) likely shares the
   same profile; whatever lands for the connector suite should be evaluated
   for it in the same follow-up.

## Context: shard-level view

The weighted inventory is ~2707s across 219 files, executed as 4 weighted
shards (284-348s on the sampled run, balance within about 10%). The
encryption-cutover suite alone is ~277s of one shard, so total-wall-clock
improvements require either reducing that suite or rebalancing weights after
any fix. Shard weights are maintained by `pnpm run ci:pytest:weights:refresh`
and should be refreshed after any of the above changes lands.
