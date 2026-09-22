# Backend Core Coverage Baseline — 2026-07-29

Status: observation baseline; no coverage threshold or CI gate is introduced.

## Decision

The measured backend core is not broadly untested. Most functions are reached,
but branch coverage is materially lower than executable-statement coverage.
The immediate refactor risk is therefore conditional behavior inside large
services and route modules, not a large set of completely untouched files.

The first structural pilot should extract only the read-only runtime
diagnostics/query responsibility behind the existing `RuntimeService` facade.
It should not include run repair, automatic repair, execution, media queue
pressure, API shape changes, or persistence changes.

## Snapshot and scope

- measured source revision:
  `790b63d1a745e51b8c64992003aaac928073c011`
  (`origin/master` after PR #363);
- report integration revision:
  `b4867e53abc0b09f871989d5d51a8f400fcfc7db`
  (`origin/master` after PR #364);
- `git diff` confirmed that PR #364 did not change any measured source,
  selected tests, `pyproject.toml`, or `uv.lock`, so the measurements remain
  valid for the report integration revision;
- source worktree: clean isolated topic worktree;
- Python: `3.14.6`;
- pytest: `9.1.1`;
- pytest-cov: `7.1.0`;
- coverage.py: `7.15.2`;
- primary tests: all 93 files under `tests/domain` and `tests/api`;
- primary result: `1647 passed, 3 skipped` in `323.07s`;
- migration-contract supplement:
  `tests/contract/test_runtime_data_encryption_migration.py`,
  `12 passed` in `10.26s`;
- repository supplement: the same domain/API suite measured specifically
  against `CommercialRepository`, `1647 passed, 3 skipped` in `327.45s`.

The primary source scope is:

- `app/domain/runtime`;
- `app/domain/commercial`;
- `app/api/routes`.

`app/adapters/repositories/commercial_repository.py` is reported separately
because the main commercial repository hotspot is outside
`app/domain/commercial`.

Generated `.coverage` databases and JSON reports stayed under a temporary
directory and are not repository artifacts.

## Results

Coverage.py reports executable statements through its line counters. The
function signal below is derived from the JSON function records:

- **touched**: at least one executable statement in the function ran;
- **fully covered**: the function has no missing executable statement or
  branch.

This derived signal is diagnostic only; it is not a new enforcement metric.

| Area | Executable statements | Branches | Functions touched | Functions fully covered |
| --- | ---: | ---: | ---: | ---: |
| Runtime domain | 3350 / 3745 (89.5%) | 834 / 1086 (76.8%) | 328 / 335 | 220 / 335 |
| Commercial domain | 5476 / 6249 (87.6%) | 1355 / 1966 (68.9%) | 451 / 469 | 206 / 469 |
| API routes | 4447 / 5325 (83.5%) | 840 / 1308 (64.2%) | 456 / 475 | 196 / 475 |
| `CommercialRepository` supplement | 1167 / 1303 (89.6%) | 395 / 566 (69.8%) | 156 / 162 | 92 / 162 |

Across the three primary areas, executable-statement coverage is
`13273 / 15319` (86.6%) and branch coverage is `3029 / 4360` (69.5%).
The roughly 17-point difference is the important baseline: conditional
variants are less protected than the headline line count suggests.

## Hotspots

| File | Current structural size | Missing executable statements | Missing branches | Interpretation |
| --- | ---: | ---: | ---: | --- |
| `app/api/routes/portal.py` | 4,927 physical lines | 341 | 207 | Largest branch deficit; route/auth/error combinations remain coupled. |
| `app/api/routes/service.py` | 5,607 physical lines | 383 | 155 | Largest statement deficit; many internal operator capabilities share one route module. |
| `app/domain/runtime/service.py` | 6,370 physical lines, 156 methods | 247 | 148 | Stronger than route coverage, but still a high-impact facade with mixed responsibilities. |
| `app/domain/commercial/mixins/_admin_mixin.py` | 3,107 physical lines | 138 | 103 | Admin commercial decisions and projections still carry many conditional variants. |
| `app/adapters/repositories/commercial_repository.py` | 4,047 physical lines, 159 methods | 136 | 171 | Most methods are reached, but optional filters and persistence branches are not fully characterized. |

Physical lines and executable statements are intentionally reported
separately. Comments, type declarations, multiline expressions, and
non-executable structure make them different measures.

### Runtime-specific finding

The read-only diagnostics/query methods are already among the best protected
parts of `RuntimeService`:

- `get_runtime_diagnostics_summary`: 100% statements and branches;
- `get_provider_runtime_evidence_summary`: 100% statements and branches;
- `get_runtime_telemetry_diagnostics`: 100% statements and branches;
- `get_runtime_backlog_diagnostics`: 100% statements, 87.5% branches;
- `list_runtime_diagnostic_runs`: 100% statements and branches;
- `list_runtime_guard_events`: 100% statements and branches;
- `get_abuse_guard_diagnostics`: 100% statements and branches;
- `_augment_runtime_diagnostics_summary`: 100% statements and branches.

The mutation side is not equally protected:

- `repair_run`: 70.3% statements, 43.8% branches;
- `_validate_operator_repair_evidence`: 0% statements and branches;
- `run_bounded_auto_repairs`: 84.4% statements, 87.5% branches.

This is why the first extraction boundary should stop before repair and
automatic mutation. The weak helper branches that should receive
characterization cases before moving are:

- `_derive_guard_breakdown_reason_codes`;
- `_resolve_backlog_scope_id`;
- `_classify_backlog_pressure`.

`get_media_derivative_queue_pressure` was not reached by this domain/API
scope. At measurement time it belonged to another session's active media
conflict domain and must not be pulled into the diagnostics pilot without an
explicit ownership handoff.

### Migration-test placement finding

The primary domain/API run initially showed only 25.2% executable-statement
coverage and 0% branch coverage for
`runtime_data_reencryption.py`. Repository inspection showed that its
behavioral protection lives in `tests/contract`, not in the primary test
directories. The focused contract test raised that module to:

- 240 / 254 executable statements (94.5%);
- 75 / 90 branches (83.3%);
- 12 passing contract tests.

The combined table uses the corrected contract-inclusive result. This is a
concrete reason not to enforce a global percentage before test ownership and
suite placement are understood.

## Reproduction

Use an isolated environment so the observation does not alter project
dependencies:

```bash
coverage_artifacts="$(mktemp -d /private/tmp/npcink-ai-cloud-coverage.XXXXXX)"
coverage_env="$coverage_artifacts/venv"

UV_PROJECT_ENVIRONMENT="$coverage_env" \
COVERAGE_FILE="$coverage_artifacts/.coverage" \
uv run --frozen --extra dev --with 'pytest-cov==7.1.0' \
  python -m pytest -q tests/domain tests/api \
  --cov=app/domain/runtime \
  --cov=app/domain/commercial \
  --cov=app/api/routes \
  --cov-branch \
  --cov-report=term \
  --cov-report="json:$coverage_artifacts/coverage.json"
```

Measure the repository hotspot independently:

```bash
UV_PROJECT_ENVIRONMENT="$coverage_env" \
COVERAGE_FILE="$coverage_artifacts/.coverage-commercial" \
uv run --frozen --extra dev --with 'pytest-cov==7.1.0' \
  python -m pytest -q tests/domain tests/api \
  --cov=app.adapters.repositories.commercial_repository \
  --cov-branch \
  --cov-report=term \
  --cov-report="json:$coverage_artifacts/commercial-repository-coverage.json"
```

Measure the migration utility with its owning contract suite:

```bash
UV_PROJECT_ENVIRONMENT="$coverage_env" \
COVERAGE_FILE="$coverage_artifacts/.coverage-reencryption-contract" \
uv run --frozen --extra dev --with 'pytest-cov==7.1.0' \
  python -m pytest -q \
  tests/contract/test_runtime_data_encryption_migration.py \
  --cov=app.domain.runtime.runtime_data_reencryption \
  --cov-branch \
  --cov-report=term \
  --cov-report="json:$coverage_artifacts/runtime-data-reencryption-contract.json"
```

Combine the primary and migration-contract execution data before aggregating
the three primary source areas:

```bash
combine_dir="$coverage_artifacts/combined"
mkdir -p "$combine_dir"
cp "$coverage_artifacts/.coverage" "$combine_dir/.coverage.primary"
cp "$coverage_artifacts/.coverage-reencryption-contract" \
  "$combine_dir/.coverage.contract"

COVERAGE_FILE="$combine_dir/.coverage" \
UV_PROJECT_ENVIRONMENT="$coverage_env" \
uv run --frozen --extra dev --with 'coverage==7.15.2' \
  python -m coverage combine "$combine_dir"

COVERAGE_FILE="$combine_dir/.coverage" \
UV_PROJECT_ENVIRONMENT="$coverage_env" \
uv run --frozen --extra dev --with 'coverage==7.15.2' \
  python -m coverage json -o "$combine_dir/combined-coverage.json"
```

The statement, branch, and function records used in the tables are all
available under `.files` in that JSON. The repository supplement remains
separate so it is not double-counted with commercial-domain callers.

The first exploratory command also included
`--cov=app/adapters/repositories/commercial_repository.py`. Coverage.py
correctly warned that this string was not an importable module name and did
not include it in the primary totals. The independent command above is the
corrected, reproducible form.

## Next implementation stage

### Goal

Reduce `RuntimeService` responsibility without changing any public runtime
contract or behavior.

### Bounded change

1. Start from fresh, clean `origin/master` after confirming that no
   runtime/media conflict-domain owner holds `app/domain/runtime/service.py`.
2. Add one internal read-only collaborator, tentatively
   `RuntimeDiagnosticsQueryService`.
3. Move only the eight read-only diagnostics/query methods listed above and
   the helpers they exclusively own.
4. Keep the existing `RuntimeService` methods as compatibility delegators.
5. Add characterization cases for the three weaker classifier/helper branch
   families before moving them.

Explicit non-goals:

- no route, response, DTO, error-code, or revision change;
- no database schema, migration, repository, queue, callback, or provider
  behavior change;
- no `repair_run` or automatic repair extraction;
- no media execution or media queue-pressure change;
- no broad formatting or adjacent cleanup.

### Acceptance target

- existing diagnostics domain and API tests pass without semantic changes;
- new characterization tests cover the selected missing classification
  branches;
- the facade remains the public construction and call surface;
- focused coverage for the extracted collaborator does not lose any currently
  covered statements or branches;
- the normal narrow local gate, M4 candidate checkpoint, required GitHub
  checks, merge, and clean-master M4 promotion are reported as distinct
  evidence states.

Likely focused tests:

- `tests/domain/test_runtime_abuse_guard.py`;
- `tests/domain/test_runtime_queue.py::test_runtime_backlog_diagnostics_group_by_scope_and_classify_bottlenecks`;
- the runtime diagnostics cases in `tests/api/test_service_observability_routes.py`.

After that pilot is merged and accepted, reassess the next responsibility
using fresh coverage and change history. Do not automatically continue into
repair mutation or `CommercialRepository`.

## Limitations

- This is a source-test observation, not M4, provider, browser, production, or
  user acceptance evidence.
- The main run intentionally excludes worker, integration, migration, and E2E
  suites; the reencryption supplement demonstrates why exclusions must remain
  visible.
- Coverage records execution, not assertion quality or business-value
  coverage.
- No global minimum is proposed. The next useful policy, if any, is
  changed-code non-regression for explicitly selected critical modules after
  several stable baselines.

This work remains inside the hosted runtime and read-only diagnostics boundary.
It does not create a second WordPress control plane, workflow registry, or
write authority.
