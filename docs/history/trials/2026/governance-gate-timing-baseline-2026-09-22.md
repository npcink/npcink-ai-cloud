# Governance Inventory: Gate Timing Baseline - 2026-09-22

Status: read-only planning evidence. No gate was re-executed to produce this
record (budget rule: a broad rerun must answer a distinct risk question).
All wall-clock numbers come from GitHub Actions run metadata read via `gh`,
and test-level numbers from the checked-in weighted shard table
`ci/pytest-backend-durations.json` (schema v3, mean-plus-stddev aggregated
over 5 Actions runs). Collected at `origin/master` revision `1d6100f6`.

## CI wall-clock samples (master, 2026-09-22)

| Class | Run | Total | Notable job durations |
| --- | --- | --- | --- |
| Full backend + frontend | 35690984238 (05:30) | 6m23s | backend-pytest shards 284/302/327/348s; frontend 69s; backend-static 52s; PG16 encryption cutover 47s; python-dep-audit 14s |
| Docs-only | 35741465495 (14:36) | 1m46s | backend-docs 8s; frontend 75s; CI observability 8s |
| Lighter runs | 05:08 / 05:51 / 06:11 / 08:21 | 1m06s-2m44s | class-dependent lane skipping |
| Failed full run | 35734832070 (13:38) | 7m25s | failure; excluded from baseline |
| CodeQL (3 samples) | 05:51 / 06:11 / 08:21 | 3m08s-3m12s | consistent |

Reading: master CI wall time is class-driven and healthy — about 1.5-3 min
for docs/light classes, about 6.5 min for a full backend+frontend
validation, with the four pytest shards balanced within about 10% of each
other (284-348s). The shard weights table (`ci/pytest-backend-durations.json`)
is demonstrably doing its job on the sampled run.

## Weighted test inventory

- 219 files, 2183 test nodes, weighted sum 2707s (~45 min). The
  mean-plus-stddev aggregation overweights versus a pure mean, so treat
  ~45 min as an upper-bound serial estimate.
- Top 3 files carry 822s, about 30% of the weighted total:
  - 281.6s `tests/api/test_wordpress_ai_connector_runtime.py`
  - 276.6s `tests/contract/test_runtime_data_encryption_cutover_contract.py`
  - 264.3s `tests/api/test_portal_routes.py`
- Slowest single nodes: 56.4s (connector p2 text-source contract),
  53.3s (web admin invalid session claim), then a 31/31/30s cluster in the
  connector runtime and web-routes suites.
- Maintenance path already exists: `pnpm run ci:pytest:weights:refresh`
  regenerates the table from recent Actions runs (min 3 runs).

## Structural notes

- Local `check:fast` is `test:contract && test:domain` executed as
  sequential dockerized pytest processes — no sharding. The ~45 min
  weighted serial inventory is what CI absorbs in ~6 min through 4 parallel
  shards; locally the same coverage is proportionally slower. This is the
  main gap between the "narrowest gate first" doctrine and the
  integration-closeout reality.
- `check:seam`/`check:perimeter` additionally render the production Compose
  config with secrets; they were not sampled here and keep their existing
  evidence from prior closeouts.
- One of the nine sampled Cloud CI runs on 2026-09-22 failed (13:38);
  cause was not investigated for this baseline.

## Candidate optimizations (non-binding, each needs its own risk question)

1. Profile the two >250s suites (encryption cutover, connector runtime) for
   sleep/timeout-dominated waits; a contract-level time budget or
   marker-based split would cut the shard ceiling.
2. The 53s single test (web admin invalid session claim) suggests fixture
   setup cost worth one focused look.
3. Surface shard-timing trend lines in the existing CI observability
   summaries so balance drift is visible without manual pulls.
4. A sharded local mode mirroring the CI shard selection would cut the
   local full-lane wall time roughly 4x on multicore machines; it changes
   only how the same tests execute, not what passes.
