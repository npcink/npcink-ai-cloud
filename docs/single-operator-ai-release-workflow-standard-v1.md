# Single-Operator AI Release Workflow Standard v1

Status: active engineering and operator standard.

Purpose: define a short, visible, and reversible bug-fix-to-production path for
a project operated by one person with AI performing source work, tests, and
release preparation. The standard reduces hidden waiting and repeated work
without weakening GitHub branch protection, exact-revision evidence, rollback,
or the Cloud/WordPress ownership boundary.

This standard complements the [Development and Delivery Efficiency Standard](development-delivery-efficiency-standard-v1.md).
That standard governs optimization mechanics; this document governs the
operator-facing sequence and the evidence language for a single-operator
release.

## 1. Non-negotiable boundaries

- `master` is the reviewed development integration truth.
- `production` is a separately promoted release source; a push or merge never
  deploys production automatically.
- The operator is the sole production authorization owner in the current
  single-person model. The manual exact-confirmation dispatch is the visible
  human gate.
- The GitHub `production` Environment protects secrets and branch policy. It is
  not a hidden substitute for a second human reviewer. A required-reviewer rule
  is inappropriate for this operating model unless an independent reviewer is
  intentionally added and the workflow is updated accordingly.
- Cloud remains the hosted runtime enhancement layer. WordPress/local code
  remains the owner of abilities, workflows, prompts, presets, approval,
  preflight, final audit truth, and WordPress writes.
- Production application code is changed through Git. A server emergency fix
  must be backported before the next ordinary deployment.

## 2. Lifecycle and evidence states

Every release reports the highest state actually evidenced. These states are
not interchangeable:

| State | Proves | Does not prove |
| --- | --- | --- |
| `local_verified` | The changed seam passed its narrow local gate | Hosted CI, runtime, merge, or production |
| `consumer_verified` | The relevant local/M4/CI consumer exercised the change | Production health or user value |
| `pr_verified` | The pushed revision passed required GitHub checks | It is merged or deployed |
| `merged_master` | Reviewed source is in current `master` | M4 acceptance or production |
| `production_validated` | The separately authorized production workflow completed its required health gates | Stable human-value improvement |
| `human_value_observed` | Natural releases show the intended operator/customer outcome | Future releases will have identical timing |

Do not use “done” without naming the state and the exact revision, run, or
receipt that supports it.

## 3. The normal bug-fix path

### Step 0 — Write the change envelope

Before editing, record:

- focused module and responsible boundary;
- intended outcome and explicit non-goals;
- expected files and public contracts touched;
- validation lane and bounded resource budget;
- rollback revision or reviewed revert method.

If the active worktree is dirty or belongs to another task, use one clean
`codex/*` worktree. Lock it immediately and keep the lock until the PR is
merged and the worktree is clean.

### Step 1 — Fix and verify locally

Classify the change as L0, L1, or L2 using the validation tiers. Run the
narrowest useful gate first: a focused unit/contract test, lint, type check, or
policy check. Expand only when the changed seam or risk requires it.

Record the command and result. A local pass is feedback evidence, not merge or
production authority.

### Step 2 — Prove the consumer

Exercise the affected consumer when source-only evidence is insufficient. Use
the smallest valid environment:

- local for deterministic source feedback;
- M4 candidate for Cloud runtime, Docker, migration, or integration behavior;
- browser only for browser-visible behavior;
- Provider or WordPress only when that seam is in scope.

Do not run M4, Docker, Provider calls, or production merely to make a receipt
look complete. Mark the lane `not_run` or `not_applicable` when it is outside
scope.

### Step 3 — Open the master PR

Push the clean topic branch and publish from the repository template. The PR
must state scope, boundary, verification, risk, and rollback. Keep unrelated
discoveries out of the fix. Required GitHub checks are the merge authority.

Do not repeat an unchanged broad gate. Rerun after a changed revision only when
the rerun answers a distinct risk question, such as a correction made during
review.

### Step 4 — Merge and prepare production promotion

After `master` is green:

1. confirm the release scope is intentional;
2. create a production promotion PR from `master`;
3. keep the promotion envelope frozen;
4. include `Approved for production validation by operator.`;
5. state the exact target SHA, release-plan result, expected duration, and
   rollback revision.

Non-blocking findings become separate follow-up work. A real release blocker
requires a separately reviewed `release-fix`, backported to `master`, before
promotion continues. Do not turn a promotion into a second development cycle.

### Step 4A — Pause and consolidate before production when justified

An operator may intentionally pause after source reaches green `master` but
before a production promotion merges or a deployment starts. This is useful
when one bounded, adjacent user-facing change is already local-ready and a
second immediate production cycle would repeat the same promotion, artifact,
authorization, cutover, and health work.

The pause is valid only when all of these are recorded:

- current `origin/master` and `origin/production` revisions;
- production host mutation has not started, or the existing release has been
  closed independently before beginning another consolidation;
- the deferred change has a finite owner, scope, validation tier, and stop
  condition;
- security/CVE expiry, rollback, entitlement, Provider, or other time-bounded
  constraints remain visible;
- any open production PR has auto-merge disabled and is closed when its exact
  tree is objectively superseded.

Do not append product work to a frozen production PR. Do not reopen or reuse a
closed exact-tree promotion after `master` or `production` advances. Resume by
integrating the deferred slice through a focused master PR, then generate one
fresh production promotion whose parent equals current production and whose
tree equals current master. Protected production CI, exact-SHA preflight, and
new operator authorization are still required.

Pausing is not production validation, rollback, risk-exception renewal, or
permission to miss an expiry deadline. If the consolidation threatens a hard
security deadline, stop and request an explicit release-versus-deferral
decision rather than extending the pause silently.

### Step 5 — Run the exact-SHA preflight

Use the read-only exact-SHA preflight before dispatching production. It must
verify the current production revision, green CI/CodeQL, the matching release
plan, and the required artifact when the plan is runtime. It must not read or
print secret values and must not mutate the host.

Copy the reported `dispatch_expected_sha` into the manual workflow input. The
workflow must reject a different selected SHA before checkout or host mutation.

### Step 6 — Dispatch with one visible authorization

The operator manually dispatches `Deploy Production` with the exact
confirmation. The workflow may use the `production` Environment for secrets and
branch protection, but it must not silently wait for an absent second reviewer.

If the job displays `Waiting for approval` or remains pending unexpectedly:

1. translate the state to the operator: “production dispatch is blocked by an
   Environment protection rule; no host mutation has started”;
2. inspect Environment protection rules read-only;
3. confirm the allowed branch is `production` and no unintended reviewer rule
   is present;
4. stop rather than bypassing protection or retrying blindly;
5. record the wait as `operator_wait` or `blocked`, not as deploy time.

The original example run `31181387735` demonstrates why this matters: total
wall time was 1h36m45s, while approximately 1h26m07s was hidden dispatch/
Environment waiting and the actual job was about 10m38s.

### Step 7 — Execute the release plan

The exact production release plan is machine-readable and fail-closed:

| Plan | Meaning | Host mutation |
| --- | --- | --- |
| `no_deploy` | Docs/CI/policy-only change or no runtime input changed | None |
| `static` | Bounded static payload only | Static publisher only |
| `runtime` | Backend/frontend/config/migration/runtime input changed | Exact authorized deploy |
| `blocked` / `failed` | Required evidence or operation failed | None until recovery decision |

For `runtime`, build and scan the exact SHA-bound bundle once. Download and
revalidate it in the deploy job; do not rebuild inside deployment. Reuse an
artifact only when source/tree, content fingerprint, platform, scan identity,
and target state match. A cache hit is acceleration, not authority.

The deploy receipt separates bundle, transfer, image load, migration, cutover,
and health. Independent service stops may run in parallel, but graceful worker
drain and rollback safety remain bounded requirements.

### Step 8 — Verify health and close out

`installation_state=complete` (or the equivalent governed completion marker)
must be present before production is called validated. Production smoke proves
the mutated runtime is healthy; it does not prove user value.

The closeout records:

- exact source, PR, merge, production, and workflow identifiers;
- each phase duration and any known operator wait;
- local, CI, runtime, M4, Provider, WordPress, browser, production, and human
  evidence separately;
- mistakes, corrections, remaining risks, and rollback;
- the next natural observation trigger.

## 4. Timing and resource rules

Always separate these clocks:

1. AI authoring and debugging;
2. local feedback;
3. PR CI and review;
4. production promotion and authorization wait;
5. bundle/transfer/host mutation;
6. health and human observation.

Record workflow queue/setup separately from deploy mutation. A GitHub
`created_at` delta is a workflow/platform approximation, not exact human
decision time.

Before consuming a material resource, state the risk question it answers.
Resources include paid Provider calls, full CI gates, image builds/scans,
shared-runtime operations, and production mutations. Reuse valid evidence for
the same identity and question. After two consecutive failures with the same
external-transfer signature, stop automatic retries and use the documented
recovery lane or report the blocker.

## 5. Stop lines and observation policy

- Do not optimize another release phase from one anecdotal run.
- Treat a 15–30 minute end-to-end bug-fix target as a hypothesis until two or
  three natural runtime releases provide comparable receipts.
- Keep an optimization only when it creates a material critical-path gain
  without weakening authority or adding disproportionate maintenance cost.
- If the remaining cost is required authorization, external variance, or an
  infrequent phase, observe rather than adding infrastructure.
- Never create a synthetic production deployment or paid Provider call solely
  to manufacture timing or human-value evidence.

The next observation should be a real backend or frontend runtime bug, not a
documentation-only or `no_deploy` promotion. The receipt belongs in
`docs/observation-inbox/` and is later aggregated by the scheduled collector;
ordinary task sessions must not edit the shared five-day observation table.

## 6. Minimal observation receipt

Use the required session receipt structure and preserve unknowns explicitly:

```yaml
overall_state: local_verified|consumer_verified|pr_verified|merged_master|production_validated|human_value_observed
source_sha:
master_pr:
production_pr:
production_run:
release_plan: no_deploy|static|runtime|blocked|failed
operator_wait: passed|not_measured|blocked
bundle:
transfer:
host_cutover:
health:
m4: passed|not_run|not_applicable
provider: passed|not_run|not_applicable
wordpress: passed|not_run|not_applicable
human_value: passed|partial|awaiting_observation
critical_blockers: []
next_observation:
```

Never replace an unknown value with an estimate. Never call automation success
human acceptance, HTTP success user value, M4 candidate behavior M4 accepted,
or a production deployment a stable efficiency improvement.

## 7. Rollback and recovery

- Source rollback: reviewed revert of the merged commit or a new corrective
  PR; do not edit production source directly.
- Production rollback: use the governed previous-release/bundle path and the
  same exact-SHA and health evidence requirements.
- Environment drift: inspect protection rules read-only, restore the intended
  single-operator configuration through an explicit operator decision, and
  record the resulting state without exposing secret values.
- Transfer failure: after the retry budget is exhausted, preserve logs and use
  the documented cache/resume recovery lane or report a blocker.
- Failed health: stop claiming completion, preserve the evidence, and use the
  approved rollback or recovery procedure before another deployment attempt.

## 8. Related authority

- [Development and Delivery Efficiency Standard](development-delivery-efficiency-standard-v1.md)
- [Development and Validation Operating Model](development-validation-operating-model-v1.md)
- [AI Development Validation Tiers](ai-development-validation-tiers-v1.md)
- [Cloud Production Release Policy](cloud-production-release-policy-v1.md)
- [Single-Session Worktree Lifecycle](single-session-worktree-lifecycle-v1.md)
- [Release Checklist](../deploy/RELEASE_CHECKLIST.md)
- [Release-efficiency observation receipt — 2026-08-15](observation-inbox/2026-08-15-release-efficiency-observation.md)
