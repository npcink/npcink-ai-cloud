# CI Pytest Sharding v1

Status: active engineering standard.

## Purpose and boundary

The default branch keeps the complete backend pytest gate, but distributes
`tests/api`, `tests/contract`, and `tests/domain` across three deterministic
file-level shards.

This mechanism is CI scheduling evidence only. It must not change test
assertions, skip coverage, weaken release gates, or introduce a second runtime
control plane. The stable required check remains `backend`.

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

Pull requests that enter the complete backend pytest lane also collect branch
coverage while the existing three shards run. No fourth pytest execution is
added. Each shard uploads one coverage.py data file; `CI observability` combines
the three files and compares the result with the pull request diff.

The report is intentionally bounded:

- source scope is Python under `app/**` only;
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
  tests/dev/test_report_changed_code_coverage.py \
  tests/contract/test_ci_efficiency_contract.py
bash -n scripts/refresh-pytest-duration-weights.sh
pnpm run check:fast
```

Before committing generated weights, inspect `source_run_ids`, verify that each
run is a successful `master` push with three timing artifacts, and replay the
new assignment against a held-out run when diagnosing a regression.
