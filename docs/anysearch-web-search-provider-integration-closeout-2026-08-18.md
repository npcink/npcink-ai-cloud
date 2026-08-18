# AnySearch Web Search Provider Integration Closeout — 2026-08-18

Status: dated development closeout and retrospective. This document is not
production deployment, production configuration, billing, or human-value
acceptance authority.

The reusable rules extracted from this work are maintained in
[Cloud Web Search Provider Integration Standard](cloud-web-search-provider-integration-standard-v1.md).
The active runtime behavior remains defined by
[Cloud Web Search Runtime Contract](cloud-web-search-runtime-contract-v1.md).

## 1. Outcome

AnySearch was added as an optional Cloud-managed primary web-search provider.
The implementation was merged through PR
[#793](https://github.com/npcink/npcink-ai-cloud/pull/793) as squash commit
`76d8ddf888dd1ff4f790486e955f2f69f3208339`, promoted from clean `master` to
M4, and recorded as `acceptance_state=accepted` with `promotion_pr=793`.

The provider is not production-deployed or production-configured by this work.
No AnySearch key was committed, stored in the repository, written to an env
file, or persisted in a Provider Connection during the final live probe.

## 2. Delivered Behavior

The merged change added:

- `anysearch` as an allowed `web_search_provider`;
- a Bearer-authenticated `POST /v1/search` adapter;
- bounded query, language, region, and result-count fields;
- normalization of `data.results[].title/url/snippet/content` into the existing
  evidence contract;
- fail-closed handling for unsupported recency and domain filters;
- stable auth, quota, rate, timeout, network, unavailable, and invalid-response
  behavior;
- Provider Connection runtime projection and development env import;
- Admin external-service discovery using the existing shared connection UI;
- secret-redaction, runtime-projection, success, unsupported-filter, and quota
  regression tests;
- the AnySearch runtime boundary in the active web-search contract.

AnySearch MCP and Skill packages were intentionally excluded. Cloud remained a
runtime enhancement layer; WordPress approval and final-write ownership did not
move.

## 3. Evidence Timeline

### 3.1 Initial implementation and local verification

The first implementation modified 11 files across settings, the provider
adapter, Provider Connection projection, Admin discovery, documentation, and
tests. Focused local verification reached 104 passing tests after adding a
regression for the HTTP quota path. Targeted Ruff, Mypy, Admin UI, anti-drift,
and `git diff --check` passed.

Docker-backed `check:seam`, `check:perimeter`, and `pnpm run lint` did not enter
their test phases in the original checkout because the repository root lacked
`.env`. This was reported as an environment blocker rather than mislabeled as a
green gate. The M4 lane remained the required runtime lane; local Docker was
not used as a silent substitute.

### 3.2 First M4 failure and recovery

The first candidate sync transferred source successfully but failed during the
Alembic check:

```text
Can't locate revision identified by '20260817_0079'
```

The candidate branch was 31 commits behind current `origin/master`, contained
five unrelated unique commits, and ended at migration `0078`; the M4 database
was already at `20260817_0079`. The failure was therefore a source-baseline
mismatch, not an AnySearch runtime-test failure.

Automatic sync/deploy retries stopped. The documented existing-container
recovery lane restored API, frontend, proxy, and workers without rebuilding
images or changing the database.

### 3.3 Clean current-master isolation

The uncommitted AnySearch patch was moved through a recoverable Git stash into
a new locked worktree based on current `origin/master`. The patch applied
without conflict and migration `20260817_0079` was present.

On the current base:

- focused local tests: 105 passed;
- targeted Ruff: passed;
- Mypy: 293 source files passed;
- `check:admin-ui`: passed;
- `check:anti-drift`: passed;
- M4 candidate web-search tests: 40 passed;
- M4 candidate status: healthy, migration `0079`, clean source after commit.

The isolated feature commit was `40627cd82c246f435d33d32e099a97ee7c7f20e2`.
The transfer stash was removed only after its stable patch ID exactly matched
the committed patch.

### 3.4 Review correction

Final diff review found that `response.raise_for_status()` could leave a
non-null response assigned after an `HTTPStatusError`. Without correction, a
402 response could continue into success-body parsing and degrade a precise
quota error into `provider.invalid_response`.

The adapter now clears the error response from the success path, and a focused
402 regression proves `provider.quota_exhausted` including usage evidence. This
was the most important correctness correction found after the initial green
tests.

### 3.5 Protected merge

PR #793 used the repository template and protected publisher. Required checks
passed, including:

- PR body contract and Secret scan;
- CodeQL for Python and JavaScript/TypeScript;
- dependency and CVE checks;
- backend static analysis;
- frontend checks;
- PostgreSQL encryption regression;
- Python 3.14 Alpine production image smoke;
- specialized changed-domain gates;
- four backend pytest shards;
- CI observability.

The longest backend pytest shard completed in 10 minutes 54 seconds. No broad
CI rerun was requested.

### 3.6 M4 accepted master

After squash merge, the stable M4 operations worktree fast-forwarded to
`master@76d8ddf8`. Promotion required source sync only: runtime and frontend
image inputs, migration source, deployment orchestration, and configuration
inputs were unchanged, so no image rebuild or Alembic upgrade was required.

Final M4 evidence:

```text
acceptance_state=accepted
promotion_pr=793
source_revision=76d8ddf888dd1ff4f790486e955f2f69f3208339
source_branch=master
source_dirty=false
alembic_revision=20260817_0079 (head)
```

The post-merge focused web-search test passed 40 tests, and API, frontend,
proxy, PostgreSQL, and Redis were healthy.

### 3.7 Bounded real-upstream probe

After merge, an operator-provided test credential was used for one transient
authoring-Mac request. The key was read through hidden stdin and was not stored
in env, files, Git, or the database.

The request succeeded in approximately 1.04 seconds and returned three
normalized results. All three had a host, title, and snippet. The observed
hosts included `openai.com`, `help.openai.com`, and `cryptobriefing.com`.

This proves the bounded Bearer-auth request and documented response shape
worked for that request. It does not prove production reachability, production
cost, broad relevance, quota behavior, or human acceptance. Because the key
was pasted into a durable conversation before the probe, rotation was
recommended before any persistent configuration.

## 4. Evidence Matrix

| Evidence state | Result | Limit |
| --- | --- | --- |
| Local deterministic behavior | Passed | Authoring environment only |
| Real AnySearch API shape | Passed for one bounded request | Not production or broad-quality evidence |
| M4 candidate | Passed | Candidate evidence only |
| Protected PR CI | Passed | Repository merge authority only |
| Merged to `master` | Completed via PR #793 | Not production deployment |
| M4 accepted | Completed for merged commit `76d8ddf8` | Not production deployment |
| Production deployed | Not occurred | Requires separate production promotion |
| Production configured | Not occurred | Requires rotated credential and operator action |
| Human product acceptance | Not measured | Requires controlled real-user usage |

## 5. Principal Decisions

### 5.1 Integrate the API adapter, not the MCP/Skill surface

AnySearch was treated like Tavily at the Cloud runtime-provider seam. Its MCP
and Skill packages were not imported because doing so would expand ownership
and risk creating a second registry or tool control plane.

### 5.2 Preserve existing traffic

AnySearch was placed last in `WEB_SEARCH_PROVIDER_ORDER`. Explicit selection is
available for testing, while existing automatic provider preference remains
stable until measured data justifies a change.

### 5.3 Fail closed on unsupported filters

Recency and allow/block-domain filters were not guessed or silently dropped.
Requests requiring them fail with a stable provider-specific error until the
upstream contract is verified.

### 5.4 Separate implementation from rollout

Merged code, M4 acceptance, a real API probe, production deployment,
production credential configuration, and user acceptance were kept as separate
states. Development completion did not silently authorize production.

## 6. What Worked Well

- The change remained one bounded provider module with no new dependencies or
  infrastructure.
- Existing Provider Connection, Admin, evidence, error, and M4 seams were
  reused instead of adding parallel systems.
- Unsupported behavior was explicit and fail-closed.
- Secret-redaction tests covered both dry-run and persisted connection output.
- The final code review found a real error-path bug even after focused tests
  were green.
- Current-master isolation fixed the migration mismatch without rewriting old
  branch history or disturbing unrelated work.
- M4 candidate, protected CI, merge, promotion, and live-provider evidence were
  recorded separately.
- Only one paid/real Provider request was needed to validate the happy-path
  contract.

## 7. Problems and Corrective Lessons

### 7.1 A stale branch invalidates runtime evidence

The first M4 failure came from validating a runtime-sensitive feature on an old
branch whose migration history no longer matched M4. The correction is to
check `HEAD...origin/master` and migration presence before the first shared
runtime operation, not after it fails.

### 7.2 Green happy-path tests do not prove error control flow

The HTTP status-response bug survived the initial suite. Review exception
control flow explicitly and add at least one representative non-2xx regression
for a new adapter.

### 7.3 Environment blockers must stay visible

A broad command that exits before testing is neither green nor a product bug.
Preserve the narrower evidence, report the missing `.env`, and use the governed
M4 lane rather than manufacturing a local substitute.

### 7.4 Commit identity matters to M4 evidence

The first successful candidate used dirty source. After the identical content
was committed, one additional sync was justified solely to bind M4 status to a
clean revision. Repeating the focused suite was unnecessary until the distinct
post-merge acceptance smoke.

### 7.5 Secrets should not enter durable conversation

Hidden stdin prevented local persistence, but it cannot undo disclosure in a
chat transcript. Future real-provider testing should use a short-lived test
credential delivered through an approved secret channel and rotate it after
the probe.

## 8. Repeatable Development Method

1. Classify the service and freeze the Cloud/local ownership boundary.
2. Record known and unknown upstream API facts before implementation.
3. Start from current `origin/master` for runtime-sensitive work.
4. Extend every existing provider seam, not only the HTTP adapter.
5. Normalize untrusted output and fail closed on unsupported semantics.
6. Test happy path, representative non-2xx behavior, projection, and secret
   redaction.
7. Use one bounded real call only after deterministic tests pass.
8. Dispatch one coherent M4 candidate and stop on migration/baseline drift.
9. Publish through protected CI and bind auto-merge to the exact head commit.
10. Promote clean merged master to M4 and run the relevant post-merge smoke.
11. Report production and human acceptance separately.
12. Turn task-specific corrections into an active standard before closing the
    context.

## 9. Residual Risk and Next Stage

The smallest next stage is controlled rollout, not more adapter code:

1. rotate the credential disclosed during testing;
2. store the replacement only as an encrypted Provider Connection secret;
3. configure M4 or another internal environment first;
4. explicitly select AnySearch for a small Chinese/English/research/news canary;
5. observe success, P95 latency, relevance, duplicate rate, 401/402/429/5xx,
   and real cost;
6. keep AnySearch last in automatic order until evidence supports a priority
   change;
7. seek separate approval for production promotion and production credential
   configuration.

Do not add recency/domain support, change automatic priority, or expand into
MCP/Skill integration without new upstream and product evidence.

## 10. Rollback

- Before production configuration: no runtime rollback is required; leave the
  optional provider unconfigured.
- After configuration: disable or remove the AnySearch Provider Connection or
  select another provider.
- Source rollback: revert merge commit `76d8ddf8` through the normal protected
  review lane.
- Do not delete Provider Connection audit or usage evidence to simulate a
  rollback.
