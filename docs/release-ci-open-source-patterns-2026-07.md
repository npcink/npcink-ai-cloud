# Release CI Open-Source Patterns 2026-07

Status: active engineering note.

Purpose: record the release-flow patterns borrowed from mature open-source CI
practice and how they map to Npcink AI Cloud without expanding Cloud product
scope.

## Boundary

This note is only about CI, release verification, and timing observability.

It does not approve:

- a second Cloud control plane
- a second local ability or workflow registry
- new runtime orchestration infrastructure
- new product/admin/portal surfaces
- replacing operator judgment for QQ login, mailbox delivery, or real payment
  account validation

Cloud remains the hosted runtime enhancement layer. The pipeline may answer
"is this release mechanically safe enough to proceed" and "where did the time
go"; it must not become product governance truth.

## Patterns Borrowed

### Path-aware gates

Mature projects avoid running every expensive gate for every small change. The
current Cloud CI keeps that pattern:

- pull requests use a targeted backend gate by default;
- pull requests run the full frontend install/lint/type/unit/contract chain only
  when frontend source, the shared Node workspace inputs, or the CI workflow
  changes; backend-only and release-tooling PRs retain the stable `frontend`
  check name through a no-work acknowledgement, except for backend files read
  directly by cross-layer frontend contracts, which run only those zero-install
  Node contract scripts;
- high-risk backend or release surfaces escalate to the full backend gate;
- `master`, `main`, and `production` pushes still run the full backend gate;
- the full backend gate is split into static checks and pytest shards only
  after scope classification says the full gate is required.

Production-targeting pull requests and integration-branch pushes continue to
run the complete frontend gate regardless of the path classifier. This keeps
ordinary PR feedback faster without weakening release branches.

### Timing as an artifact

Large CI systems treat timing data as release evidence instead of relying on
manual log reading. Cloud CI now emits:

- a run-level timing summary and optional versioned JSON receipt through
  `scripts/report-release-timing.py`;
- pytest JUnit artifacts for full backend shard runs;
- a slow-test markdown summary through `scripts/report-junit-timing.py`.

The same reporter parses the existing production deploy `[timing]` lines into
the versioned `npcink.release_timing.v1` receipt. Runtime production deploys
upload a 14-day artifact with exact recorded phases grouped as bundle,
transfer, image load, migration, cutover, health, and other. The enclosing
remote-sequence timer remains visible but is not added to category totals, so
its direct child phases are counted while their nested child timers remain raw
detail only. Wrapper-aware tracking keeps parallel child timers, such as
per-service shutdowns, attached to the same enclosing cutover phase instead of
mistaking them for nested siblings or top-level work. Nested remote work is
therefore not double-counted. Timing-report failure is advisory:
it must not convert a successful production mutation into a false deployment
failure or authorize a retry.

The production receipt exposes both `recorded_total_seconds` and
`remote_sequence_seconds`. The recorded total sums every non-duplicated local
and remote phase, including verification and transfer, and is the primary
comparison metric. The remote sequence remains a separate view of host-side
deployment work.

The optimization-before production baseline is successful `Deploy Production`
run `31364293862` for revision
`e1a5ed6148a9fdc788ec54518f4fcced8ea7b2e6`, full lane and runtime action. Its
replayed receipt records 226 seconds across all non-duplicated phases and 172
seconds for the remote sequence: bundle 11, transfer 48, image load 78,
migration 14, cutover 50, health 25, and other 0 seconds. Compare it only with
a later successful full-lane runtime production receipt; an M4, CI-only, or
different-lane run is not an optimization-after production sample.

After a normal backend PR completes, capture its exact completed run timing with:

```bash
pnpm run release:timing -- <run-id> --format json \
  --receipt-output artifacts/release-timing/backend-pr-<run-id>.json
```

Compare only compatible successful receipts:

```bash
pnpm run release:timing:compare -- \
  --baseline artifacts/release-timing/backend-pr-<baseline-run>.json \
  --candidate artifacts/release-timing/backend-pr-<candidate-run>.json \
  --format json \
  --output artifacts/release-timing/backend-comparison.json
```

The comparator fails closed when receipt kinds, workflow/event identities,
executed GitHub job sets, repositories, production lanes, release actions, or
successful completion states differ. It reports measured direction, absolute
delta, and percentage improvement; it does not choose samples or convert an
incompatible comparison into a speedup claim.

The immediate goal is observability. Test splitting is based on collected
slow-test evidence instead of guesses. `ci/pytest-backend-durations.json` stores
the current per-file duration weights generated from the production CI JUnit
artifact.

### Smoke automation with explicit human remainder

Production pushes now run a post-deploy preflight after the deploy job succeeds.
The preflight covers public service health, protected admin access, and the
safe public Alipay callback posture.

Formal release smoke runs automatically only when the corresponding GitHub
Actions secrets are configured. If they are missing, CI records the skip in the
job summary instead of printing secrets or blocking every deploy.

QQ login, mailbox delivery, and real Alipay account/payment confirmation remain
operator-tested because they depend on external accounts and provider state.

### Aggregate checks before more shards

Before adding pytest shard jobs, keep one stable required result name for the
release gate. When the backend suite is split, add a stable aggregate job that
depends on all shards and make the aggregate the required check. This prevents
branch protection from depending on changing shard names.

Cloud CI now follows this shape: `backend-scope` decides targeted versus full
backend, `backend-targeted` handles the cheap PR path, `backend-static` runs
anti-drift/Ruff/Mypy for the full path, `backend-pytest` runs three weighted
pytest shards, and the stable `backend` job aggregates the result for deploys
and branch protection.

## Follow-Up Order

1. Refresh `ci/pytest-backend-durations.json` from complete
   `pytest-backend-timing-shard-*` artifacts for the five most recent
   successful full `master` runs. The generator merges every shard within a
   run, then uses each file's mean plus population standard deviation. This
   keeps high-variance files from clustering while ensuring one run does not
   become durable scheduling truth. Use the repeatable entry point:

   ```bash
   pnpm run ci:pytest:weights:refresh -- --recent-master 5
   ```
2. Review the advisory `Pytest Shard Balance` summary. Refresh through a
   focused PR when `max/min > 1.30` or material per-file drift persists.
3. Observe three successful full `master` runs after refresh. Split sustained
   slow files before adding node-level scheduling metadata.
4. Add a fourth shard only if three shards are balanced but the critical path
   still misses the agreed feedback target.
5. Keep `production` deployment dependent on stable aggregate gates, not on
   individual shard names.

The normative command, warning thresholds, escalation order, and verification
gate are recorded in
[CI Pytest Sharding v1](ci-pytest-sharding-v1.md).

## Validation Record

PR #232 validated the fail-closed classifier and complete high-risk lane. All
required checks passed. Its backend pytest jobs completed in 9m09s, 13m38s,
and 6m37s, so file-level duration weights alone did not remove the long tail.
Keep the full coverage and use per-test timing evidence before changing the
oversized recovery-contract shard.

The documentation-only lane is validated separately by a Markdown-only pull
request. It must preserve the stable `backend` and `frontend` check names while
skipping Python dependency installation, frontend installation, production
image smoke, and the full pytest shards.

Do not add node-level sharding from a single slow run. Observe at least two
additional full runs after refreshing the weights. Escalate only if the longest
shard remains above 10 minutes and the fastest-to-slowest spread remains above
2x; keep all existing tests and recovery-contract semantics intact.

The first post-refresh `master` observation is Cloud CI run `30079632893`.
Its backend pytest jobs completed in 8m37s, 9m36s, and 6m56s. The longest job
fell below 10 minutes and the fastest-to-slowest ratio fell to about 1.38x, so
this run does not trigger node-level sharding. Use the next naturally occurring
full high-risk run as the second observation; do not manufacture an expensive
run only to satisfy the sample count.

## References

- FastAPI GitHub Actions test workflow:
  `https://github.com/fastapi/fastapi/blob/master/.github/workflows/test.yml`
- Sentry GitHub Actions workflows:
  `https://github.com/getsentry/sentry/tree/master/.github/workflows`
- pytest-split duration-based grouping:
  `https://github.com/jerry-git/pytest-split`
- GitHub Actions job summaries:
  `https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#adding-a-job-summary`
