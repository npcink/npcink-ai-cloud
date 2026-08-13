# Production Release Feedback Loop Closeout and Standard — 2026-08-13

Status: dated closeout evidence plus reusable operating guidance.

Purpose: record the August 11–13 deployment-identity, CI-diagnostics, release-
readiness, promotion, and exact-SHA preflight work. This document explains why
the release path took much longer than expected, which changes are now durable,
and how a future session should detect failures before expensive transfer or
production mutation.

This document does not authorize a deployment, does not contain secret values,
and does not make deferred formal smoke passing evidence. Current authority
remains the [Cloud Production Release Policy](cloud-production-release-policy-v1.md),
[Development and Delivery Efficiency Standard](development-delivery-efficiency-standard-v1.md),
[CI Pytest Sharding](ci-pytest-sharding-v1.md), and
[ADR-045](decisions/045-production-readiness-and-release-feedback-loop.md).

## 1. Outcome and evidence state

The work closed the following chain:

```text
deployment identity unknown
-> backend/frontend release identity projected
-> release gates moved earlier
-> pytest shards bounded and diagnosable
-> readiness evidence made fail-closed
-> reviewed master promoted to production
-> exact production SHA preflighted
-> release_action=no_deploy
-> no production-host mutation
```

Key source milestones included:

| Outcome | Representative merged change |
| --- | --- |
| Backend and frontend deployment identity became observable | `#639`, `#641`, `#647` |
| Early release and exact-check gates were introduced | `#651`, `#655`, `#660`, `#662` |
| Pytest timeout, shard diagnostics, and failed-lane recovery were improved | `#664` |
| Readiness evidence became complete, secret-name ready, and correctly classified | `#666`, `#668`, `#670`, `#672` |
| Certificate readiness moved before bundle transfer | `#674` |
| Readiness accepted first-install but rejected malformed live paths | `#676`, `#678`, `#679`, `#681` |
| JSON boolean timestamps stopped passing as integers | `#683` |
| Reviewed source reached `production` | `#685`, production SHA `571170fbb2e24631e0bce7ddedc2b1e9add218f7` |

The exact production preflight for that SHA returned:

```text
release_preflight=ready
release_action=no_deploy
active_deploy=none
```

That result is successful release planning, not a failed deployment. The exact
change set affected release workflow, tests, and documentation but did not
require a runtime or static mutation. The correct action was therefore to stop
without dispatching `Deploy Production`.

Formal authenticated smoke remained `deferred` and `not-passed`. The preflight
reported missing protected secret names for `NPCINK_CLOUD_ADMIN_KEY` and
`NPCINK_CLOUD_PORTAL_LOGIN_CODE`. Their values were not read, printed, or moved
through chat.

## 2. Why the earlier release took nearly three hours

The elapsed time was not one three-hour deployment command. It combined several
different clocks that were initially treated as one release attempt:

1. source and deployment identity investigation;
2. production promotion PR creation and protected CI;
3. complete pytest shard execution, including one hosted-runner timeout and a
   failed-job-only rerun;
4. exact production push CI and bundle preparation;
5. bundle transfer to the host;
6. a late certificate-readiness failure;
7. diagnosis, source correction, another reviewed promotion, and repeated
   exact-SHA evidence.

The primary avoidable waste was not pytest sharding itself. It was discovering
an existing host-readiness problem after costly build and transfer work. Once
the source changed to fix that ordering, GitHub correctly required a new
revision and new merge evidence. That safety behavior lengthened the session
but must not be bypassed.

Observed CI evidence also separated deterministic failures from variance:

- complete pytest shards generally finished in roughly 8–12 minutes;
- one earlier shard reached the 20-minute timeout without an assertion failure;
- rerunning only the failed job succeeded in about 10 minutes;
- later exact runs completed all three shards successfully.

The lesson is to report phase time, not label the entire wall clock as
"deployment time." Human diagnosis, CI authority, transfer, mutation, and smoke
are distinct costs with different remedies.

## 3. Root causes and corrections

### 3.1 Deployment identity was not available at the consumer surface

`backend_release` and `backend_revision` originally appeared as `unknown`, so
operators could not quickly determine whether the visible Admin frontend, API,
and host release belonged to the same source. The correction projected bounded
release identity through completed liveness/health evidence while preserving
the full Git revision as diagnostic truth.

The release directory name remains deliberately verbose and machine-oriented.
Admin presentation may abbreviate it later, but storage, API truth, receipts,
logs, rollback evidence, and copyable detail must retain the complete identity.

### 3.2 Expensive work ran before cheap readiness checks

The release discovered a stale certificate-renewal readiness receipt only after
the exact bundle had been built and transferred. The correction moved the
read-only certificate check after authenticated SSH setup but before bundle
download, transfer, or host mutation.

The check does not renew certificates or repair the Edge. It validates the
receipt contract, domain, status, timestamp, ownership, mode, and current-
release path safety. A failure is evidence to repair through the governed
maintenance lane, not permission for deployment to modify certificate truth.

### 3.3 Readiness parsers were too permissive at filesystem and JSON seams

Several follow-up reviews found inputs that looked superficially valid but were
not safe deployment state:

- `current` could resolve outside the managed release root;
- a nested release path could match a prefix while not being a direct child;
- `current` could be a regular file instead of a symbolic link;
- release basenames could include unsupported characters;
- Python `isinstance(value, int)` accepted JSON booleans because `bool` is an
  `int` subclass.

The durable rule is exact shape validation at every external seam. Managed
release paths must be direct children with validated basenames, symlink state
must be explicit, and JSON timestamps require `type(value) is int` when boolean
acceptance would be unsafe.

### 3.4 Promotion and review are part of release correctness

An earlier production promotion was stopped after automated review found the
boolean timestamp bug. A later promotion review found duplicate bundle
downloads: one before readiness and another after it. The duplicate defeated
the early-failure objective and doubled a potentially large transfer, so it was
removed before merge.

Production promotion must therefore be treated as implementation review, not a
mechanical branch copy. A P2 finding in readiness, identity, transfer ordering,
or mutation safety is stop-the-line even when all current checks are green.

### 3.5 Formal smoke credentials have a different lifecycle

The Portal login code is single-use and short-lived, while a deployment may run
longer than its TTL. Embedding formal smoke unconditionally inside deployment
would create false failures or pressure operators to expose credentials early.

The approved separation is:

```text
deployment with formal smoke default-off
-> complete exact-SHA deploy when release_action requires it
-> issue/store a fresh login code through the protected operator path
-> dispatch the separate exact-deployed-SHA Release Smoke workflow
```

Missing formal-smoke credentials must remain `missing` or `deferred`, never a
successful skip.

## 4. Standard release sequence

Future production work follows this order:

1. Confirm exact `master` revision and green required checks.
2. Create one new promotion branch from exact current `origin/production` and
   integrate exact current `origin/master`.
3. Run `pnpm run check:release-policy` before publication.
4. Publish with `pnpm run pr:publish`, explicitly setting `--base production`
   and including `Approved for production validation by operator.`.
5. Stop on any P0–P2 release/readiness review finding. Fix it in source and let
   the new revision run only the required evidence.
6. After merge, fetch exact `origin/production` and run:

   ```bash
   pnpm run production:release:preflight -- --sha <full-production-sha>
   ```

7. Treat `release_action` as authority:
   - `no_deploy`: no workflow dispatch and no host mutation;
   - `static`: use only the governed static publisher;
   - `runtime`: dispatch `Deploy Production` with exact SHA and confirmation.
8. Leave `finalized_runtime_network_repair=false` unless preflight and governed
   recovery evidence explicitly require it.
9. Keep formal smoke default-off during a potentially long deployment. Run the
   separate fail-closed smoke with a fresh Portal code when scheduled.
10. Record production source, deployed runtime identity, smoke state, and
    human evidence as separate states.

Do not reuse a closed or superseded promotion PR. Do not force a runtime deploy
to make the host revision visually match a workflow-only `production` commit.
`no_deploy` is an intentional terminal state for that release plan.

## 5. Early-failure checklist

Before spending CI, transfer, or production-mutation budget, verify the cheapest
facts first:

| Stage | Cheap question | Stop condition |
| --- | --- | --- |
| Session entry | Is the active worktree dirty or unrelated? | Use a clean locked worktree; never overwrite user changes. |
| Source | Does health expose full backend/frontend release identity? | Fix identity projection before diagnosing cache or deployment drift. |
| Promotion | Does the PR target `production` and contain the operator sentence? | Close/recreate an incorrectly targeted PR; do not retarget evidence casually. |
| Readiness | Is the receipt fresh, root-owned, mode `0600`, and contract-valid? | Stop before bundle transfer. |
| Filesystem | Is `current` an optional first-install absence or a valid direct-child symlink? | Reject regular files, broken links, traversal, nested paths, and invalid names. |
| JSON | Are timestamps exact integers rather than booleans or numeric strings? | Fail closed before mutation. |
| CI | Which exact shard or check failed? | Rerun only the failed seam when supported. |
| Release plan | Is action `no_deploy`, `static`, or `runtime`? | Never infer host mutation from operator desire alone. |
| Smoke | Are protected secret names ready and the login code fresh? | Report deferred/not-passed; never manufacture a green result. |

## 6. CI and retry discipline

Pytest sharding is worthwhile because it shortens the complete backend critical
path and produces file/node timing evidence, but it remains deliberately
bounded:

- retain three weighted complete shards and the stable `backend` aggregate;
- preserve targeted contract/impacted lanes for suitable PRs;
- use the complete lane for CI, deployment, migration, dependency, and other
  ambiguous high-risk changes;
- treat one slow run as runner variance until repeated natural evidence shows a
  stable hotspot;
- rerun only failed jobs, not the full workflow, when GitHub supports it;
- after two consecutive failures with the same external-transfer signature,
  stop automatic retry and use a documented recovery lane or report a blocker;
- add a fourth shard only after three balanced shards still miss the target.

This mechanism is valuable while it remains transparent. Do not add another
scheduler, hand-maintained node manifest, or bespoke diagnostics service merely
because one release was slow.

## 7. Timing and evidence receipt

Every materially slow release should record at least:

```text
RELEASE_FEEDBACK_RECEIPT
production_sha=<full SHA>
release_action=<no_deploy|static|runtime>
ci_queue_seconds=<value|not measured>
pytest_critical_path_seconds=<value|not measured>
review_wait_seconds=<value|not measured>
bundle_build_seconds=<value|not applicable|not measured>
bundle_transfer_seconds=<value|not applicable|not measured>
readiness_seconds=<value|not measured>
mutation_seconds=<value|not applicable|not measured>
health_seconds=<value|not applicable|not measured>
formal_smoke=<passed|failed|deferred>
failure_phase=<none|source|ci|review|readiness|transfer|mutation|health|smoke>
reruns=<exact failed lanes or none>
```

Do not infer exact human time from GitHub logs. Do not add overlapping phases
and call the sum wall-clock duration. Compare only receipts with compatible
workflow, lane, action, revision/tree, and executed-job identity.

## 8. What remains deliberately open

- Formal authenticated production smoke remains deferred until the protected
  production environment contains all required secret names and a fresh
  one-time Portal code is issued immediately before use.
- The production host may continue to show an earlier runtime revision after a
  `no_deploy` promotion. That is expected; production source truth and deployed
  runtime truth are related but not identical evidence states.
- The full release directory name remains unchanged. A later Admin-only display
  abbreviation may be considered, but it must preserve full copyable identity
  and must not change backend release contracts.
- Worker graceful-stop reduction remains unapproved until natural drain and
  shutdown evidence demonstrates a safe lower bound.

## 9. Closeout decision

The current optimization stage is complete. The principal failure mode—finding
host readiness problems after expensive artifact work—now has an early,
read-only, fail-closed gate. CI failures are attributable to named shards, exact
production plans can terminate at `no_deploy`, and deployment identity is
available for operator diagnosis.

Further release complexity is not the default next investment. Reopen this
area only when natural evidence shows a repeated bottleneck, false-positive
readiness failure, identity mismatch, unsafe shutdown behavior, or formal-smoke
gap with a concrete owner, hypothesis, bounded experiment, and rollback.
