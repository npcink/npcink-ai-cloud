# Production Release Efficiency Phase 1-2 Closeout and Development Retrospective

Status: dated evidence and reusable development guidance; not production
authorization.

Date: 2026-08-23

Scope: PR #851, `master` merge, and post-merge M4 acceptance. This record
consolidates the release-efficiency discussions and implementation lessons
from the first two approved phases. It does not authorize a production deploy,
certificate renewal, or Formal Smoke execution.

## 1. Outcome

PR [#851](https://github.com/npcink/npcink-ai-cloud/pull/851) merged to
`master` with squash commit `423d536a78fb2532efb57065fefd9076ced24c5f`.
GitHub required checks completed with 18 successful, 0 failing, and 11
intentionally skipped checks.

The clean `master` revision was promoted to M4 with `--deploy` because
`package.json` is a runtime image input. M4 reported:

```text
acceptance_state=accepted
promotion_pr=851
source_branch=master
source_dirty=false
source_revision=423d536a78fb2532efb57065fefd9076ced24c5f
alembic_revision=20260817_0079 (head)
```

API, frontend, proxy, PostgreSQL, Redis, and workers were running; the API and
frontend health checks passed. No production release or production server
mutation occurred.

## 2. What Was Delivered

### Phase 1: early, read-only readiness evidence

`pnpm run production:promotion:preflight` now binds the candidate and current
production revisions, validates the exact release plan, runs complete Ruff and
release-policy checks, predicts `no_deploy` versus runtime scope, checks
deployment status, and dispatches read-only certificate readiness for the
static/runtime path. It rechecks the candidate and production revisions after
the wait so a moving branch cannot be mistaken for the original candidate.

The preflight fails closed. It does not create PRs, refresh certificates,
deploy, mutate WordPress, or expose secret names, values, counts, or derived
metadata in output.

### Phase 2: release-plan and bootstrap correctness

The release planner now classifies the PR #849 workflow/docs/policy set as
`no_deploy`, while unknown `scripts/**` remains `full`. `package.json` remains
a runtime-image input and is intentionally not allowlisted as `no_deploy`.

The certificate evidence path supports both workflow generations. The current
workflow uses a unique readiness request ID and run title. The bootstrap path
for older workflows binds evidence to a pre-dispatch run-ID baseline, the exact
production SHA, exactly one new successful run, and the protected
`[certificate-preflight:ok|warn] readiness receipt` marker.

## 3. Root Causes Behind Earlier Delays

The long elapsed time was not one slow command. It was the accumulation of
independent waits and safety checks:

1. **Late failure discovery.** Certificate or host readiness was checked after
   bundle transfer, so a preventable failure paid the transfer cost first.
2. **Unclear release identity.** Candidate SHA, production SHA, workflow run,
   and deployed revision were not always bound in one evidence chain.
3. **Workflow bootstrap gaps.** The first certificate-readiness workflow did
   not expose `readiness_request_id`, requiring a conservative legacy evidence
   path.
4. **Broad validation replay.** Re-running green suites after a distinct
   narrow failure consumed time without answering a new risk question.
5. **Runtime ownership contention.** M4 slot drift and shared locks could stop
   a candidate before mutation; recovery required operator authorization.
6. **Unnecessary image work.** A dependency or image-input change correctly
   requires a deploy path, while ordinary source changes should use sync and
   skip cold builds.

These causes are process and evidence-boundary problems as much as performance
problems. The remedy is earlier classification, exact identity, fail-closed
checks, and selective execution.

## 4. Reusable Development Rules

### 4.1 One change envelope

Before editing, state the focused module, intended outcome, explicit
non-goals, public contracts, expected files, verification, and rollback. Keep
one implementation owner per conflict domain and one owner for shared M4
mutation.

### 4.2 Three separate clocks

Track these independently:

| Clock | Question | Evidence |
| --- | --- | --- |
| Preview | Can a human inspect the candidate quickly? | focused local or candidate-M4 result |
| Merge | Is the reviewed revision integrated safely? | required GitHub checks and merged SHA |
| Release | May the exact revision change production? | production policy, operator authorization, and release receipt |

Never report a preview as merged, an M4 candidate as accepted, or a green
preflight as a production deployment.

### 4.3 Selective gates

Use the narrowest useful check first. Use `m4:preview:sync` for ordinary source
changes and `m4:preview:deploy` when dependencies, `package.json`, Docker,
Compose, proxy, migration, or deployment inputs change. Run the full integration
gate once when it answers an integration risk; do not replay it merely because
elapsed time feels uncomfortable.

### 4.4 Bind evidence to immutable identity

Every readiness, transfer, deploy, smoke, and timing record should include the
full candidate or deployed SHA. When a workflow lacks a request ID, use a
documented bootstrap contract based on the pre-dispatch baseline and exact
SHA. Recheck identity after any wait.

### 4.5 Keep secrets opaque

Preflight output may report readiness state and redacted reason codes only. It
must not print secret names, values, counts, hashes derived from secret
metadata, command arguments containing credentials, or raw provider output.

### 4.6 Keep release scope frozen

Once a production promotion starts, do not add documentation, workflow, or
repair changes. A blocking correction gets a separately reviewed
`release-fix`, is backported to `master`, and starts a fresh frozen promotion.

## 5. Verification Ladder

For future work, record the highest state reached:

```text
local verified
-> candidate validated on M4
-> PR verified
-> merged into master
-> accepted on M4
-> production validated
```

For this phase the final state is `accepted on M4`, not `production validated`.
The focused evidence included Ruff, release-policy, targeted tests, CodeQL,
GitHub required checks, clean-master promotion, M4 status, HTTP health,
container health, and Alembic head verification.

## 6. Deferred Work and Stop Conditions

The following are intentionally deferred:

- scheduled certificate warning collection;
- Formal Smoke automation and its protected production secret contract;
- additional CI sharding or cache redesign;
- production deployment of this revision.

Do not start these together. The next phase should first observe one ordinary,
explicitly authorized release using the merged preflight and compare
readiness, transfer, deploy, post-install, and smoke timings. Start Formal
Smoke only with an explicit production lane, a frozen exact-SHA contract, and
operator-approved protected secrets. If the current preflight produces false
positives, fix the exact receipt contract before adding retries or bypasses.

## 7. Timing Receipt

```text
RELEASE_EFFICIENCY_RECEIPT
revision=423d536a78fb2532efb57065fefd9076ced24c5f
pr=851
ci=18 successful; 0 failing; 11 skipped
m4_transfer=upload 3s; download 4s
m4_promotion=approximately 31s
m4_images=runtime 0; frontend 0
m4_health=api/frontend/postgres/redis/proxy healthy
production=not deployed
rollback=previous accepted M4 revision; production policy rollback remains operator-governed
```

This receipt is historical evidence. Recheck current `origin/master`, open
PRs, M4 status, and production state before using any dated value as present
truth.

## 8. Authority Map

- [Development and Validation Operating Model](../../../development-validation-operating-model-v1.md)
- [AI Development Validation Tiers](../../../ai-development-validation-tiers-v1.md)
- [Cloud Production Release Policy](../../../cloud-production-release-policy-v1.md)
- [M4 Preview AI Development Standard](../../../m4-preview-ai-development-standard-v1.md)
- [Production Release Optimization and Formal Smoke Handoff](../../../production-release-optimization-and-formal-smoke-handoff-v1.md)
- [ADR-050: Operator-Initiated Certificate Readiness Refresh](../../../decisions/050-operator-initiated-certificate-readiness-refresh.md)
