# Development and Delivery Efficiency Standard v1

Status: active engineering standard.

Purpose: make feature development, bug fixing, CI, M4 preview, image delivery,
and production release faster without weakening evidence, product boundaries,
or rollback safety. This standard defines what may be skipped, what may be
reused, how time is measured, and when optimization should stop.

This standard does not authorize M4 or production operations. It does not make
Cloud a WordPress control plane, and it does not replace the validation-tier,
M4, CI, or production-release authorities linked below.

## 1. Optimize Two Clocks Separately

Every task has two clocks:

| Clock | Starts | Ends | Primary question |
| --- | --- | --- | --- |
| Feedback clock | a coherent source edit is ready | the affected consumer gives useful evidence | Can the developer make the next correct decision? |
| Engineering closeout clock | the task begins | the requested evidence state is reached | Is the change reviewed, accepted, or released at the required authority? |

Do not report one number as “release time” when it combines authoring, operator
wait, CI queueing, review, merge, deployment mutation, observation, or unrelated
retries. Report material phases separately and name the highest evidence state
actually reached.

Fast feedback comes from the narrowest valid test. Safe closeout comes from the
required authority. Neither clock is improved by replaying evidence that still
applies to the same revision and risk question.

## 2. Use the Smallest Valid Lane

Start with the exact seam that changed and expand only when risk requires it:

1. run an exact unit, contract, lint, type, or route check;
2. exercise the real consumer when source-only evidence is insufficient;
3. use M4 source sync for ordinary Cloud source changes;
4. use M4 deploy only for build/runtime inputs or when sync fails closed;
5. let GitHub required checks decide merge eligibility;
6. promote clean merged `master` for accepted M4 evidence;
7. use production only after separate operator authorization.

Documentation and CI-only changes do not use M4 by default. A production run
must never be manufactured merely to complete an optimization sample.

The detailed risk classification remains in
[AI Development Validation Tiers](ai-development-validation-tiers-v1.md), and
the end-to-end state model remains in the
[Development and Validation Operating Model](development-validation-operating-model-v1.md).

## 3. Reuse Evidence by Identity

Evidence may be reused only when all identities relevant to its claim still
match. Depending on the operation, these include:

- source revision or exact tested Git tree;
- dependency and build-input fingerprint;
- bundle or image digest;
- SBOM and vulnerability database or policy identity;
- environment and architecture;
- workflow, event, executed-job set, release lane, and release action;
- the risk question the evidence answers.

For an unchanged image digest, reuse its valid build, SBOM, and vulnerability
scan evidence instead of rebuilding or rescanning it. Do not reuse a scan when
the image, policy, scanner authority, or required vulnerability data identity
has changed.

For CI or release timing, compare only compatible receipts. The comparator
must fail closed when workflow structure, executed job sets, lane, action, or
other governed identity differs. Never weaken compatibility checks to obtain a
more attractive result.

Before adding a new efficiency tool, inventory the repository's existing
router, task envelope, receipt, PR waiter, M4 fingerprint, release plan, and
timing commands. Extend the existing owner when it already covers the seam;
parallel convenience tools create drift and additional maintenance cost.

Local evidence reuse must be explicit. A successful run may be reused only
when the base revision, source fingerprint, exact command plan, environment,
and risk question still match. Record the reuse event. A matching commit alone
is insufficient, and the normal verification path continues to execute gates
unless the operator deliberately selects the governed reuse option.

## 4. Make CI Path-Aware and Fail Closed

Pull-request CI may skip work that cannot be affected by the changed paths,
provided protected branches retain the aggregate required-check authority.

For ordinary backend Python changes, focused contract selection may use the
static import closure, parent-package initialization, exact source references,
and explicit repository-wide scan contracts. Selection must fall back to the
full governed suite for:

- deleted, renamed, unknown, or unparseable paths;
- selector, CI, deployment, script, or contract changes;
- dynamic relationships the selector cannot prove;
- any ambiguous ownership or incomplete dependency result.

Required check names remain stable. A skipped internal job is not a skipped
required check: the aggregate check must still report a truthful result.

Do not add shards merely because one run was slow. First inspect fixture setup,
one sustained slow test file, imbalance, and duplicated work. Use natural
successful runs to distinguish hosted-runner variance from a repeatable
bottleneck.

## 5. Build and Scan Once per Artifact Identity

An application image should be built once for an exact content identity, then
promoted by digest. The release path should:

1. resolve whether the required digest and valid scan evidence already exist;
2. build, generate SBOM, and scan only when that identity is missing or stale;
3. preserve provenance between the tested artifact and the promoted artifact;
4. transfer only artifacts absent from the destination;
5. skip remote image loading when the exact digest is already available;
6. fail closed if identity or evidence cannot be proven.

Cache hits are an optimization, not a new source of truth. Git, the immutable
artifact identity, and governed evidence remain authoritative.

## 6. Execute a Release Plan, Not a Fixed Ritual

Every deployment derives an explicit release plan from the changed inputs and
the target state. The plan determines whether each phase is required:

| Phase | Run when | May skip when |
| --- | --- | --- |
| Bundle creation and transfer | the target lacks a required artifact | the exact artifact is already present |
| Remote image load | the runtime cannot resolve the required digest | the exact digest is already locally available |
| Database migration | migration inputs changed or the target has pending migrations | no migration is pending and the plan proves it |
| Service cutover | the deployed service revision or runtime configuration changes | the service is intentionally preserved, such as an unrelated frontend-only release |
| Health and release smoke | a corresponding service was mutated or the release policy requires the assertion | that service was not touched and the approved plan marks the check not applicable |

Skipping must be a machine-readable plan result, not an operator guess.
Migration safety, rollback readiness, and the health of a mutated service are
not optional efficiency targets.

Frontend-only releases should preserve an unchanged backend. Ordinary source
sync should not restart unrelated services such as Ollama. Build/runtime input
changes use the deploy lane; source-only changes use the sync lane.

## 7. Smoke Tests Have Different Jobs

Smoke is not a single test copied into every environment:

- local smoke gives rapid deterministic development feedback;
- M4 smoke proves the relevant Docker, database, Redis, worker, proxy, browser,
  or WordPress integration seam;
- production smoke proves that the separately authorized mutation is healthy
  in production.

A local pass cannot prove production health. A production release does not
need to replay every local test. Run the smallest environment-specific smoke
that verifies the mutation and consumer at that evidence state.

## 8. Measure Comparable Work

Timing receipts must separate at least:

- workflow queue and setup;
- tests or build work;
- bundle generation;
- artifact transfer;
- remote image load;
- migration;
- cutover;
- health and smoke;
- operator or approval wait when known.

For local consumer acceptance, use the repository's bounded command recorder:

```bash
pnpm run timing:acceptance -- \
  --receipt .tmp/acceptance-timing.json \
  --stage wordpress_readiness \
  --question "Are WordPress, Addon, Toolbox, and Cloud ready?" \
  -- env NPCINK_WP_ROOT="/path/to/public" python3 scripts/wordpress_editor_readiness.py --json
```

Each invocation appends one `npcink.acceptance_timing.v1` event with UTC
timestamps, monotonic duration, exit code, status, and the bounded command.
The recorder does not capture stdout/stderr or inspect the child process
environment separately; the command list is retained in the receipt, including
any inline `env` assignments. Do not put secrets in command arguments. A failed
command remains a useful failed-stage receipt and is not automatically retried.

For production, distinguish total workflow duration from the recorded mutation
sequence and from the sum of non-duplicated phases. For CI, record the executed
job set, shard topology, critical-path job, and selected versus full test scope.

Use naturally occurring ordinary backend PRs and authorized production
releases as after-samples. A CI selector change that intentionally falls back
to full tests is a control sample, not proof of focused-selection speed. A
historical two-shard run and a current three-shard run are context, not an
exact comparison.

## 9. Resource and Retry Budgets

Elapsed time, paid Provider calls, full gates, image builds, vulnerability
downloads, shared M4 mutations, and production operations are bounded task
resources.

Before consuming a material resource, state the risk question it answers. Reuse
valid evidence for the same revision and question. When a broad gate fails
after proving an earlier sub-gate, preserve the earlier result and rerun only
the failed seam when supported.

After two consecutive failures with the same external-transfer signature,
stop automatic retries. Preserve evidence and use a documented resumable or
cache-recovery lane, or report the blocker. Do not hide time cost through
unbounded retries.

Run environment diagnosis before a material gate in a new or uncertain
worktree. Diagnosis must derive required tools from the actual planned
commands, not only file extensions: an inventory-only change can still require
`python3`. Report local requirements separately from advisory operator-owned
M4 or GitHub prerequisites. The doctor remains read-only and must not install,
start, connect, or expose secret values.

## 10. Optimization Decision and Stop Lines

Keep an optimization when natural comparable evidence shows a material
critical-path gain without weakening authority or adding disproportionate
maintenance cost. Use these decision guides, not promises:

- ordinary backend PR: a repeatable improvement greater than two minutes or
  25 percent is material;
- production full/runtime lane: a repeatable improvement greater than 60–90
  seconds is material;
- production improvement below 30 seconds normally does not justify additional
  release complexity;
- if the critical path moves to one impacted test file, optimize that hotspot
  instead of adding another system-wide selector or shard;
- if mis-selection, ambiguous fallback, or maintenance burden becomes common,
  simplify or revert the optimization.

Stop broad optimization when the remaining cost is dominated by required
authority, external variance, or infrequent work. Continue only for a measured
bottleneck with an owner, hypothesis, bounded experiment, rollback, and natural
validation opportunity.

Use an observation phase before changing CI shards, caches, or merge/runtime
topology. Collect at least ten compatible natural task samples and prefer
twenty before making a structural decision. Repeated environmental failures
may justify an earlier bounded fix after three comparable occurrences; one
slow run or one runner/cache incident does not justify another system-wide
mechanism.

## 11. Closeout Requirements

An efficiency change closes with:

1. the original baseline and its compatibility identity;
2. the changed mechanism and explicit safety fallback;
3. focused local and required-check evidence;
4. measured after-samples, or an honest statement that they have not occurred;
5. added maintenance cost and rollback;
6. the next observation trigger and stop decision.

Do not claim projected savings as measured savings. Do not call M4, CI, and
production evidence interchangeable. A process optimization is successful only
when the delivery path is faster enough to matter and remains understandable,
safe, and reversible.

## 12. Related Authority

- [Development and Validation Operating Model](development-validation-operating-model-v1.md)
- [AI Development Validation Tiers](ai-development-validation-tiers-v1.md)
- [CI Pytest Sharding](ci-pytest-sharding-v1.md)
- [M4 Preview AI Development Standard](m4-preview-ai-development-standard-v1.md)
- [Cloud Production Release Policy](cloud-production-release-policy-v1.md)
- [Release CI Open-Source Patterns](release-ci-open-source-patterns-2026-07.md)
