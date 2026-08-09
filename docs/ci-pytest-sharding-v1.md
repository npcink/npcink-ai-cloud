# CI Pytest Sharding v1

Status: active engineering standard.

## Purpose and boundary

The default branch keeps the complete backend pytest gate, but distributes
`tests/api`, `tests/contract`, and `tests/domain` across three deterministic
file-level shards.

This mechanism is CI scheduling evidence only. It must not change test
assertions, skip coverage, weaken release gates, or introduce a second runtime
control plane. The stable required check remains `backend`.

Targeted pull requests use a separate four-lane fast gate:

1. changed-source static and anti-drift checks;
2. deterministic contract shard 1;
3. deterministic contract shard 2;
4. impacted API/domain tests selected from changed paths.

The lanes run in parallel and still aggregate into the stable required
`backend` check. `scripts/select-pr-backend-tests.py` owns the impacted-test
mapping. Central API/bootstrap files intentionally select all `tests/api`;
unknown future `app/api/**` files also fall back to all API tests with a
warning. A missing mapping therefore costs time but cannot silently reduce
coverage.

The complete backend lane remains three shards and is still selected for CI
configuration, dependencies, migrations, core models, and other high-risk
surfaces. Targeted-lane optimization must not change that authority.

## Weight source

`ci/pytest-backend-durations.json` is generated from complete
`pytest-backend-timing-shard-*` artifacts belonging to successful `master`
pushes.

The normal source is the five most recent full runs:

```bash
pnpm run ci:pytest:weights:refresh -- --recent-master 5
```

For a reproducible investigation, provide the exact successful run IDs:

```bash
pnpm run ci:pytest:weights:refresh -- \
  <run-id-1> <run-id-2> <run-id-3> <run-id-4> <run-id-5>
```

The generator first sums all shard reports within each run. For every file it
stores the five-run mean plus population standard deviation. This safety margin
prevents a high-variance file from being grouped with several other hotspots
merely because its median run was fast. Runs without all three shard reports
are rejected in explicit mode and skipped in recent-master discovery mode. The
checked-in payload records every source run ID and the aggregation method.

One run must not become the durable weight source. GitHub-hosted runner speed
can vary enough to make one otherwise successful run an outlier.

Median aggregation remains available in the Python generator for bounded
diagnostics, but it is not the checked-in scheduling default.

## Drift observation

Every full CI run uploads its JUnit XML and selected-file list. The
`CI observability` job downloads those artifacts after the stable backend gate
finishes and reports:

- selected file count by shard;
- predicted and actual recorded test seconds;
- predicted and actual maximum-to-minimum ratio;
- files whose absolute drift exceeds 10 seconds and relative drift exceeds
  25 percent.

An actual shard ratio above `1.30`, or any material file drift, creates an
advisory Actions warning. This warning does not fail the required gate because
one runner can be temporarily slow.

## Changed-code coverage observation

Pull requests that enter the complete backend pytest lane and change Python
under `app/**` also collect branch coverage while the existing three shards
run. No fourth pytest execution is added. Each shard uploads one coverage.py
data file; `CI observability` combines the three files and compares the result
with the pull request diff. Pull requests without changed `app/**` Python keep
the original pytest command and publish a no-app-changes observation without
installing or running coverage.py.

The report is intentionally bounded:

- source scope is Python under `app/**` only;
- coverage.py traces only the changed Python files plus the lightweight
  `app/__init__.py` combine sentinel, not every `app/**` module executed by the
  test suite;
- the diff uses the checked-out PR merge candidate so changed line numbers
  match the source revision exercised by pytest;
- line coverage counts changed executable lines, excluding comments, blank
  lines, and other non-executable lines;
- branch coverage counts coverage.py branch arcs whose source line changed;
- the Markdown summary and JSON artifact are trend evidence only;
- no percentage threshold is configured and low coverage does not fail CI;
- missing, malformed, or incomplete coverage artifacts fail the reporting seam
  rather than publishing a misleading percentage.

Coverage collection runs only for pull requests. Natural `master` pushes keep
the existing timing and weight-refresh loop without paying the coverage
instrumentation cost. The stable required check remains `backend`; this pilot
does not change test selection, assertions, or release authority.

### Changed-code coverage observation cycle

Treat changed-code coverage as a bounded pilot until several naturally
occurring pull requests change Python under `app/**`. Do not manufacture pull
requests or full CI runs to complete the sample.

For each useful natural sample, retain enough evidence to distinguish test
cost from hosted-runner variation:

- changed Python file count, changed executable lines, and changed branch arcs;
- whether the report identified a real missing test or changed a review
  decision;
- each shard's wall time and JUnit recorded test time;
- `CI observability` time and any artifact, combine, rename, or diff-mapping
  anomaly.

Do not infer coverage overhead from one run. Compare multiple natural samples
and separate runner setup or scheduling variance from recorded pytest time and
coverage instrumentation. The initial implementation and cost correction are
recorded in the
[2026-08-08 changed-code coverage retrospective](ai-development-changed-code-coverage-retrospective-2026-08-08.md).

Keep `threshold=null` during this observation cycle. A low percentage remains
advisory; incomplete or invalid evidence remains fail closed. Introducing a
merge threshold requires a separate reviewed change with stable natural
samples, critical-module justification, false-positive analysis, and an
explicit rollback.

Keep the pilot while its reports are accurate, its incremental cost remains
small, and it sometimes changes testing or review decisions. First narrow or
repair it, then remove it if natural samples show persistent material PR
latency, repeated artifact or line-mapping errors, or maintenance cost greater
than review value. Those conditions do not by themselves justify a dashboard,
database, external coverage service, or another test execution.

## Refresh and escalation rules

1. Refresh weights through a focused PR; never push generated weights directly
   to `master`.
2. After a refresh, observe three naturally occurring successful full
   `master` runs. Do not manufacture an expensive run solely for timing data.
3. Treat the three-run median as the decision value. The target is
   `max/min <= 1.30`, with the slowest shard normally below 10 minutes.
4. If imbalance remains, first split consistently slow test files by coherent
   test scenario or remove repeated expensive fixture setup. Keep all
   assertions and recovery semantics.
5. Add a fourth shard only when three shards are balanced but the critical path
   still misses the agreed feedback target. Changing from three to four jobs
   increases runner concurrency by 33 percent.

The first files to investigate are the sustained timing leaders shown by the
rolling report, not files selected from one isolated run. Node-ID sharding is a
last resort because it adds a second scheduling manifest and more drift risk.

## Verification

For changes to this mechanism, run:

```bash
.venv/bin/python -m pytest -q \
  tests/dev/test_select_pytest_shard.py \
  tests/dev/test_select_pr_backend_tests.py \
  tests/dev/test_wait_pr_readiness.py \
  tests/dev/test_report_changed_code_coverage.py \
  tests/contract/test_ci_efficiency_contract.py
bash -n scripts/check-pr-backend-gate.sh scripts/refresh-pytest-duration-weights.sh
```

When `.github/workflows/ci.yml` changes, the pull request intentionally enters
the complete backend lane. That exact GitHub Actions run is the orchestration
and integration authority; do not duplicate it with local Docker or M4.

Before committing generated weights, inspect `source_run_ids`, verify that each
run is a successful `master` push with three timing artifacts, and replay the
new assignment against a held-out run when diagnosing a regression.

For changed-code coverage policy or reporting changes, also verify the empty
target path, fully unexecuted changed-module fallback, malformed/incomplete
artifact failure, and Markdown/JSON agreement. GitHub Actions remains the
runtime evidence for CI orchestration; M4 is not part of this mechanism.
