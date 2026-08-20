# Development and Validation Operating Model v1

Status: active engineering guide.

Purpose: provide one durable entry point for feature development, bug fixes,
M4 Preview validation, Git publication, CI feedback, and post-merge
acceptance. This guide summarizes the development-system lessons learned during
the July 2026 M4 and CI remediation work. It links to the normative runbooks
and ADRs instead of duplicating their implementation detail.

This guide does not approve production deployment, change Cloud product
ownership, or replace any security, release, M4, or WordPress boundary.

## 1. The Operating Model

The approved topology is:

| Surface | Responsibility |
| --- | --- |
| Authoring Mac | source editing, narrow source/static checks, Git, PR, and operator commands |
| GitHub `master` | reviewed development integration truth |
| M4 | disposable Docker build, runtime, migration, focused integration test, and preview evidence |
| M4 frontend slots | bounded, read-only visual candidates sharing the accepted primary backend |
| Cloudflare Access preview | protected human browser access to the M4 preview |
| Local WordPress | abilities, workflows, settings, approval, preflight, and final-write truth |
| Production | a separate operator-approved release target, never an automatic consequence of development |

The core rule is:

> Source moves from the authoring Mac to M4 for evidence. Runtime fixes move
> back through Git to `master` for acceptance. M4 never becomes source truth.

This split is valuable because it removes routine Docker load from the
authoring Mac while preserving a persistent, realistic integration runtime.
It is only useful while the workflow remains faster than running a release
rehearsal after every edit.

### 1.1 Three Workflow Lanes

Every task starts in one explicit workflow lane. The lane describes the
requested outcome; changed paths classify risk and runtime needs but cannot
promote or authorize the task by themselves.

| Lane | Requested outcome | Target elapsed time | Required authority |
| --- | --- | --- | --- |
| `development` | produce a coherent, focused, locally verified candidate and any risk-required preview evidence | 45 minutes | local evidence; candidate M4 only when the changed Cloud seam requires runtime feedback |
| `merge` | publish a focused PR, pass required checks, merge to `master`, and complete clean-master M4 acceptance when applicable | 90 minutes | GitHub required checks; M4 for runtime-bearing Cloud changes |
| `release` | execute a separately approved production promotion and verification | 120 minutes | production policy and explicit operator authorization |

The elapsed targets are split-and-report prompts, not service-level guarantees
and never permission to skip a required gate. When a target is exceeded, name
the dominant delay and either reduce the task to one independently valuable
slice or ask the operator to expand the budget. A task that encounters a
second independent blocker stops scope expansion: preserve the first seam's
evidence and move unrelated repairs to follow-up.

The default lane is `development`. Enter `merge` only when publication or merge
is explicitly requested. Enter `release` only when a production outcome is
explicitly requested. Review or CI discoveries outside the change envelope go
to backlog unless they directly block the requested lane's safety or
correctness.

Plan the lane with the existing router:

```bash
pnpm run check:changed -- --plan --workflow-lane development
pnpm run check:changed -- --plan --workflow-lane merge
pnpm run check:changed -- --plan --workflow-lane release
```

The plan reports `workflow_lane`, `target_elapsed_minutes`, `pr_required`,
`production_required`, `closeout_authority`, and `stop_conditions`. These fields
do not mutate GitHub, M4, or production.

The authoritative details are:

- [AI Development Validation Tiers v1](ai-development-validation-tiers-v1.md);
- [M4 Preview AI Development Standard](m4-preview-ai-development-standard-v1.md);
- [M4 Preview Development Workflow](m4-preview-development-v1.md);
- [ADR-023: Candidate and Accepted Promotion](decisions/023-m4-preview-candidate-acceptance-promotion.md);
- [ADR-024: Risk-Tiered Validation Authority](decisions/024-risk-tiered-development-validation-authority.md);
- [ADR-025: Source-Only Authoring and AI Checkpoint Dispatch](decisions/025-source-only-authoring-and-ai-m4-checkpoint-dispatch.md);
- [Parallel AI Collaboration Standard](parallel-ai-collaboration-standard-v1.md);
- [CI Pytest Sharding](ci-pytest-sharding-v1.md);
- [Development and Delivery Efficiency Standard](development-delivery-efficiency-standard-v1.md);
- [Release CI Open-Source Patterns](release-ci-open-source-patterns-2026-07.md).

## 2. Evidence States Are Not Interchangeable

Every task moves through explicit evidence states:

| State | What it proves | What it does not prove |
| --- | --- | --- |
| `local verified` | the changed source seam passed its narrow local check | Docker/runtime behavior or merge eligibility |
| `local-ready` | a parallel builder produced a clean focused commit and complete handoff receipt | current-base integration, PR checks, M4 behavior, or merge eligibility |
| `candidate validated on M4` | the current worktree behaved in the M4 integration runtime | the source was committed, reviewed, or merged |
| `PR verified` | the pushed revision passed required GitHub checks | the change is in `master` or visible on M4 |
| `merged into master` | the reviewed change is integration truth | M4 is running that merged revision |
| `accepted on M4` | clean current `master` was promoted and the relevant smoke passed | production release or GA |
| `production validated` | the separately approved production process completed | external customer acceptance or product benefit |

Do not collapse these states into the word "done." A completion report names
the highest state actually evidenced.

The distinction prevents the most expensive historical failure mode: a fix
works on M4, but never reaches Git, so the next deployment silently removes it.
Direct `sync` and `deploy` therefore create a candidate. Only a merged PR plus
`m4:preview:promote` creates accepted M4 evidence.

## 3. Session Entry and Change Envelope

Before editing:

1. run `git status --short --branch`;
2. read `README.md`, `AGENTS.md`, this guide, and only the Cloud boundary
   documents selected by the expected changed seam;
3. fetch `origin` when the current integration baseline matters;
4. preserve all existing user changes;
5. create a clean `codex/*` worktree from current `origin/master` when the
   active checkout is dirty, stale, or on unrelated work; otherwise reuse the
   clean current task worktree;
6. immediately lock any auxiliary worktree created by the session with
   `git worktree lock --reason "codex:<task-id>" <absolute-worktree-path>` and
   verify its reason in `git worktree list --porcelain`;
7. state the change envelope before modifying files.

The default change envelope records:

- focused repository and module;
- intended outcome;
- explicit non-goals;
- public contracts touched;
- expected files;
- verification and rollback.

Add forbidden files, external systems, cross-repository matrix requirements,
or environment restrictions only when the task actually touches those seams.

For `pnpm run check:anti-drift`, contract selection is deterministic:

1. `--contract <path>` selects an explicit task contract;
2. otherwise, exactly one root `task-contract-*.json` selects the active task
   contract;
3. with no root task contract, the checker uses
   `config/cloud-anti-drift-default-contract-v1.json`;
4. multiple root task contracts are ambiguous and fail closed until the caller
   passes `--contract` or archives completed contracts under `docs/history/`.

The default contract is the repository-wide boundary baseline. A dated task
contract is a temporary change envelope and must not remain at the repository
root after that task closes.

Never obtain a clean tree by resetting, stashing, checking out over, or broadly
staging user work. A clean focused worktree is cheaper than reconstructing
ownership after unrelated changes are mixed.

The worktree lock is a lifecycle guard against accidental automation or
operator cleanup. Keep it through implementation, review, and merge. Unlock
only after the task has ended, the PR is confirmed merged, and the worktree is
clean. No-deliverable closeout and stale-lock recovery follow the
[Single-Session Worktree Lifecycle](single-session-worktree-lifecycle-v1.md);
path names and modification times are not cleanup authority. Explicit parallel
handoffs add the rules in the parallel collaboration standard.
The default topology and read-only audit command are defined in
[Single-Session Worktree Lifecycle](single-session-worktree-lifecycle-v1.md).

## 4. Select the Smallest Valid Development Lane

| Change | First feedback | Runtime checkpoint |
| --- | --- | --- |
| Documentation or repository policy | links, formatting, policy contract | no M4 action by default |
| WordPress-only PHP/UI | focused plugin test and Local browser | no Cloud sync unless the Cloud contract changed |
| Ordinary Cloud Python/frontend/worker source | exact local test, lint, or type check | `pnpm run m4:preview:sync` |
| Dependency, lock, Dockerfile, Compose, proxy, or deployment input | focused source/static gate | `pnpm run m4:preview:deploy` |
| Migration, persistence, worker, recovery, or network behavior | focused contract plus risk-specific checks | M4 runtime evidence; full gate only when justified |
| CI-only change | focused script/contract replay | GitHub Actions is the runtime; do not deploy M4 |

### Optional local structural index

A local structural index such as CodeGraph may accelerate architecture
discovery in a large Python and TypeScript repository. It remains advisory:

1. Prefer one clean, current `origin/master` reference worktree instead of
   indexing every feature, preview, or temporary worktree.
2. Do not assume the reference index represents the active feature worktree.
   Re-read the exact active-worktree files before changing code.
3. Use native search and direct file inspection for string-based routes,
   dynamic configuration, generated contracts, cross-repository seams, and
   any relationship the index cannot prove.
4. Do not use index results as test-selection, merge, release, runtime, or
   acceptance authority.
5. Keep the index local, ignored, reversible, and absent from CI, M4,
   production, release, and shared runtime environments.
6. Treat a missing, stale, or unavailable index as a navigation fallback, not
   a development blocker.

In explicitly enabled parallel mode, a frontend-only appearance change may use
the bounded ephemeral-slot exception defined by the M4 standard. Single-session
work uses its focused local/browser lane and the primary M4 lane only when its
declared risk requires M4.

### Appearance-only preview-first lane

The authoritative L0/L1/L2 classification, upward-reclassification triggers,
and preview-versus-closeout receipts are defined in
[AI Development Validation Tiers v1](ai-development-validation-tiers-v1.md).
The guidance below explains the appearance-only application of that standard.

For a bounded Admin appearance change, separate two clocks:

1. **Visible preview** answers whether the operator wants the composition. Aim
   to provide a route-focused PC preview within 15 minutes of a coherent edit.
2. **Engineering closeout** answers whether the chosen composition may merge,
   become M4 accepted, or ship. It may continue after visual direction is
   confirmed and remains subject to the required GitHub, M4, and release gates.

This lane applies only when the diff changes copy, spacing, color, iconography,
or route-local composition and does not change shared primitives, geometry
tokens, action hierarchy, interaction behavior, state ownership, API/data
contracts, credentials, destructive actions, dependencies, or runtime inputs.

The preview checkpoint is:

```text
exact source/static check
  -> focused target-route PC browser check
  -> visible candidate for operator review
```

Do not block that visible candidate on the whole Admin visual matrix, unrelated
backend CI, PR merge, or clean-master M4 promotion. Those controls still run at
the closeout stage required by the declared risk and requested outcome. If the
focused browser check exposes overflow, broken states, console/network errors,
or a shared-seam change, stop using this lane and reclassify the work as
`material` or `shared` under the Admin UI standard.

The 15-minute target is a feedback objective, not evidence that the change is
merged, accepted, deployed, or human-approved. Record those states separately.

`sync` is the default for ordinary source. It must fail closed when a changed
fingerprint requires `deploy`. Do not choose a cold rebuild merely because it
feels more complete.

## 5. Feature and Bug-Fix Loop

Use the same loop for a new feature and a defect. Stop at the boundary of the
declared workflow lane; later steps are not implied by completing earlier ones:

1. reproduce or precisely state the observed and expected behavior;
2. trace the full consumer path before editing;
3. change only the owning seam in the authoring worktree;
4. run the narrowest useful local check;
5. dispatch the appropriate M4 candidate checkpoint when Cloud runtime
   behavior is involved;
6. validate the actual consumer: API, worker, browser, or disposable Local
   WordPress;
7. repeat until the source and runtime evidence agree;
8. finish the `development` lane by reporting the verified candidate, dominant
   delay, and any explicitly deferred findings;
9. only in the `merge` or `release` lane, inspect the diff and stage only named
   task files, then commit, push, and publish a focused PR using the repository
   PR template;
10. let required GitHub checks decide merge eligibility; while they run, use
    `pnpm run pr:wait -- --pr <number>` so unresolved review threads surface
    before the final check completes;
11. merge into `master`;
12. when required by the runtime lane, promote clean current `master` to M4 and
    run the relevant smoke;
13. only in the `release` lane and after explicit operator authorization,
    follow the frozen production promotion plan;
14. report exact states, revisions, tests, limitations, and rollback.

Do not commit every experimental save, and do not wait until after merge to
discover whether the feature works in the real integration runtime. Candidate
validation is intentionally before merge; accepted promotion is intentionally
after merge.

### Optional parallel builder and integrator variation

Only when the operator explicitly declares a multi-session queue, split this
loop at the
`local-ready` boundary:

1. each builder performs steps 1-4 in one owned conflict domain, inspects and
   exactly stages the diff, commits it, verifies a clean worktree, and sends
   the standard local-ready receipt;
2. the builder stops changing that domain and does not publish a merge-ready
   PR or mutate shared M4;
3. the single integrator accepts at most two waiting ready items, admits one
   item at a time, refreshes it against current `origin/master`, and performs
   the remaining runtime, PR, CI, merge, and acceptance steps;
4. failures return to the named builder through an explicit handback, or the
   integrator owns the repair after an acknowledged ownership transfer.

This variation shortens the critical delivery path by keeping parallel work
away from the serialized merge and shared-runtime lanes. It does not weaken
the evidence required by any later state.

## 6. Consumer Paths Must Stay Separate

The correct endpoint depends on the consumer:

| Consumer | Endpoint | Reason |
| --- | --- | --- |
| Human preview | `https://cloud.mqzjmax.top` | Cloudflare Access provides protected browser login |
| Disposable Local WordPress connector | `http://127.0.0.1:18010` | foreground SSH tunnel returns the expected JSON API |
| M4 operator transport | the documented private SSH/Tailscale path | management transport, not an application endpoint |
| Production WordPress | the approved production Cloud endpoint | production only, never a local-development shortcut |

Start the local connector path with:

```bash
pnpm run m4:preview:tunnel
```

Cloudflare Access can return an HTML login or redirect where an automated
connector expects JSON. Therefore the protected browser hostname is not a
substitute for the local WordPress tunnel. Conversely, loopback is not a
public preview URL; it is intentionally local to the machine that owns the
tunnel.

Keep the tunnel foreground and disposable. Do not add Access service tokens to
the addon, expose M4 application ports to LAN/Tailscale, or create a permanent
second tunnel controller for convenience.

## 7. Test Depth Is Chosen by Risk

The inner loop and the acceptance loop answer different questions:

1. an exact test or static check answers whether the changed seam is coherent;
2. a focused M4 test answers whether that seam works in the Docker/runtime
   environment;
3. GitHub required checks answer whether the revision may merge;
4. post-merge promotion answers whether visible M4 runtime source equals clean
   reviewed `master`;
5. a full M4 suite answers an additional M4-specific high-risk question.

Use the local changed-file router when the correct first gate is not obvious:

```bash
pnpm run check:changed -- --plan
pnpm run check:changed -- --doctor
pnpm run check:changed
```

Run `--doctor` before a material gate when the worktree is new or its local
tooling state is uncertain. It reports required local prerequisites as
`ready` or `missing` and external/operator-owned prerequisites as advisory
`operator_required` entries. The doctor is read-only: it does not bootstrap a
virtual environment, install frontend dependencies, start Docker, read secret
values, or mutate M4/GitHub state.

For a task that needs a durable local plan and closeout receipt, create an
ignored structured envelope instead of leaving a temporary root task contract:

```bash
pnpm run ai:task:plan -- \
  --task-id <task-id> \
  --module "<focused module>" \
  --outcome "<intended outcome>" \
  --non-goal "<explicit non-goal>" \
  --public-contract "<contract touched>" \
  --rollback "<rollback>"
pnpm run ai:task:verify -- .runtime/ai-tasks/<task-id>.json
pnpm run ai:task:receipt -- .runtime/ai-tasks/<task-id>.json
```

The envelope records the changed-file plan, validation tier, matched domains,
required context, resource budgets, exact gate results, source state, and
rollback. Verification rebuilds the plan from the current trusted rules and
fails closed when the base revision, changed-file set, or selected command
definition differs from the saved envelope. Content fingerprints preserve valid
evidence across a commit that does not change the verified files. The plan also
exposes a machine-readable `runtime_lane`: `none`, `github-actions`,
`m4:preview:sync`, or `m4:preview:deploy`.

Verification normally runs the selected gates. When the latest successful run
has the same base revision, source fingerprint, and exact command plan, the
operator may explicitly pass `--reuse-current-evidence` after confirming that
the environment and risk question are unchanged. That reuse is recorded in the
ignored envelope; a matching commit alone never authorizes reuse. The receipt
may report `local verified`; it does not
promote local evidence into PR, merged, M4, production, or human acceptance.

The plan is read-only. Execution runs only local focused gates; it reports M4
sync/deploy and browser work as explicit follow-ups and never mutates M4,
production, Cloudflare, Provider budgets, or external systems automatically.

The normal bug-fix target is:

```bash
pnpm run m4:preview:test -- --focused <test-path-or-node-id>
```

Use `--contract`, `--domain`, or `--full` only when the broader suite answers a
real risk question. Do not run the same full contract/domain suite multiple
times for one revision without recording the different evidence each run
provides.

Historical reference measurements from this workflow were:

- ordinary source sync: about 18.41 seconds;
- post-merge source promotion: about 23.05 seconds;
- full M4 contract/domain gate: about nine minutes.

These observations are not guarantees. They show why focused feedback should
remain the inner loop and the full suite should remain a closeout or high-risk
gate.

### Time and paid operations are validation resources

Validation strength is not measured by how many commands ran. Elapsed time,
paid Provider calls, image builds, vulnerability-database downloads, full CI or
M4 suites, production mutations, and shared-runtime operations are finite task
resources. Before using a material one, declare the relevant budget and the
question that the operation must answer.

Use these rules:

1. Reuse valid evidence that is bound to the same source revision, tree,
   artifact digest, environment, and risk question. Do not rebuild or rescan an
   unchanged exact bundle merely to reproduce an already-recorded result.
2. A broad gate is justified only when its combined result is the required
   authority. During diagnosis, run the smallest failed seam instead of
   restarting all earlier successful work.
3. If a broad command proves an earlier stage and later fails, record the
   earlier evidence separately but do not report the whole command as passed.
   Diagnose the later failure and keep unrelated product work out of the change
   envelope.
4. After the initial attempt, allow at most one automatic retry for the same
   external-transfer failure. Two consecutive failures with the same signature
   end blind retries: preserve logs and partial progress, then use a documented
   resumable/cache recovery lane or stop and ask the operator. A third attempt
   requires a materially different recovery plan or explicit operator choice.
5. Set explicit limits for paid or stateful operations, including Provider
   calls, production deploys, migration attempts, and WordPress writes. Do not
   manufacture calls or mutations to complete a sample count.
6. Report the material causes of wall-clock delay, including operator wait,
   external download time, rebuild time, full-suite time, and avoidable reruns.
   Time cost is part of the closeout evidence, not an invisible implementation
   detail.

Stable assertions also reduce wasted reruns. Release and integration smoke must
prefer versioned, machine-readable, language-independent markers over localized
copy, layout text, or other presentation details unless the presentation itself
is the declared consumer contract.

The normative rules for artifact-identity reuse, path-aware fail-closed CI,
release-plan phase selection, compatible timing samples, and optimization stop
lines are defined in the
[Development and Delivery Efficiency Standard](development-delivery-efficiency-standard-v1.md).
This operating model defines the evidence states; the efficiency standard
governs how to shorten the path between them.

## 8. CI Feedback Is a Governed Closed Loop

The pytest scheduling loop is:

```text
master full CI
  -> upload per-shard JUnit and selected-file artifacts
  -> report predicted/actual balance and material file drift
  -> observe natural successful master runs
  -> refresh variance-aware weights in a focused PR when warranted
  -> required checks and merge
  -> observe the refreshed master assignment
```

The repeatable refresh command is:

```bash
pnpm run ci:pytest:weights:refresh -- --recent-master 5
```

The loop is automated for collection and diagnosis, but deliberately keeps
weight changes behind human review and a PR. A single slow hosted runner must
not rewrite scheduling truth.

PR `#248` closed the first imbalance remediation cycle. Its merge commit was
`c02bde02`. The first natural post-merge `master` run, `30141177591`, completed
successfully with:

- pytest job wall times of about 8:43, 8:12, and 8:05;
- recorded JUnit times of 493.139, 438.812, and 435.754 seconds;
- an actual maximum-to-minimum recorded-time ratio of 1.13.

The result met the `<= 1.30` target. Three file-drift warnings represented
tests completing materially faster than their conservative predictions, not a
new critical-path regression. Continue natural observation; do not manufacture
full runs solely to complete a sample count.

The complete backend lane currently uses four shards after collected-case-aware
three-shard assignment remained balanced but still exceeded the feedback and
timeout budget. Split sustained slow files or remove repeated fixture setup
before considering a fifth shard or more scheduling metadata.

## 9. Lessons From the Remediation History

### Fix source, not only the runtime

An M4-side edit is temporary and unreviewed. Reproduce on M4, implement on the
authoring Mac, validate the candidate, merge through Git, then promote.

### Verify the consumer that reported the defect

An admin mutation succeeding does not prove that Portal or WordPress shows the
new balance. An API health response does not prove that the browser receives
JSON through its selected route. Trace write, canonical storage, projection,
cache/refresh, and final consumer rendering.

### Do not diagnose a transport with the wrong probe

A successful TCP connection does not prove a successful HTTP response. Test
M4-local HTTP, the authoring-Mac tunnel, and the protected browser path
separately. Record which layer failed.

### Stable commands require a stable operations checkout

A missing `m4:preview:tunnel` script in an older checkout was a source-version
problem, not an M4 problem. Run deployment and promotion commands from a
long-lived clean operations worktree kept at current `master`; do not rely on
an arbitrary feature or dirty checkout.

### Error presentation is part of correctness

One root failure should not appear as duplicate independent notices. Preserve
one canonical diagnostic and make secondary surfaces reference it instead of
re-emitting the same message.

### PR structure is a contract

Required PR sections are not cosmetic. Use:

```bash
pnpm run pr:publish -- --title "<title>" --body-file <path>
```

The publisher and template preserve scope, boundary, verification, and risk
evidence. Do not bypass them with ad hoc PR text when protected automation
expects the contract.

### Full validation is valuable when it is informative

A nine-minute suite is reasonable as an integration gate and wasteful as a
save-time loop. Optimize selection, sharding, fixture reuse, and parallel
feedback before deleting coverage or adding infrastructure.

### Runtime convenience must not create another control plane

M4, tunnels, caches, Cloudflare, and CI are delivery and evidence mechanisms.
They do not own Git, WordPress settings, approvals, workflows, prompts, or
production release decisions.

## 10. When M4 Remains Worthwhile

Keep M4 as the normal Cloud integration runtime while:

- ordinary edit-to-preview normally stays below two minutes;
- focused bug-fix feedback normally stays below five minutes;
- network, tunnel, and synchronization friction stays below ten minutes per
  working day;
- full gates remain occasional instead of becoming the edit loop;
- one operator does not experience material queueing;
- M4 catches Docker, database, Redis, worker, proxy, browser, or WordPress
  integration defects that source-only checks cannot.

First diagnose transfer, tunnel, rebuild frequency, test scope, resource
pressure, or architecture parity when these thresholds fail.

A dedicated cloud development server becomes justified when persistent uptime,
public webhook reachability, multiple concurrent stateful isolated environments,
x86_64 production parity, or weekly M4 downtime is the dominant constraint.
It should not be purchased merely to avoid using the focused workflow already
available.

## 11. Failure and Recovery

- Candidate failure: fix or revert in the authoring worktree, then sync again.
- Broken merged `master`: use a reviewed revert or focused fix PR, then
  promote corrected `master`.
- M4/Docker restart: inspect `m4:preview:status`, then use
  `m4:preview:recover` when the expected containers still exist.
- Missing container or changed build fingerprint: use `m4:preview:deploy`.
- Stale operation lock: inspect the recorded owner/process before removing only
  the exact managed lock.
- Tunnel failure: keep source work intact, verify SSH/Tailscale reachability,
  restart the foreground tunnel, and retest HTTP.
- CI imbalance: collect natural successful runs, inspect the advisory report,
  and refresh through a focused PR only when thresholds persist.

Never patch source on M4, silently substitute local Docker, broadly prune
Docker/volumes, print protected environment values, or alter production,
Cloudflare, DNS, Access, or Tunnel state as an unreported recovery.

## 12. Completion Checklist

Before reporting a feature or fix complete:

- [ ] focused module and product boundary remained intact;
- [ ] unrelated dirty work was preserved;
- [ ] every auxiliary task worktree created by this session recorded
      `locked codex:<task-id>` immediately after creation;
- [ ] the narrowest meaningful gate passed;
- [ ] candidate M4 behavior was verified when the Cloud runtime was involved;
- [ ] the actual browser, worker, API, or WordPress consumer was checked;
- [ ] only task files were staged;
- [ ] focused commit and PR were published with the required template;
- [ ] GitHub required checks passed and the PR merged into `master`;
- [ ] current clean `master` was promoted when M4 acceptance was required;
- [ ] status shows the expected revision, clean source, and acceptance state;
- [ ] the task worktree remained locked while its PR was open, or was unlocked
      only after the documented merged/clean closeout conditions were met;
- [ ] production and external human acceptance were reported separately;
- [ ] known limitations and rollback were recorded.

For a documentation-only closeout, M4 candidate and promotion steps are
normally not applicable. Validate the document links, repository contracts,
formatting, and protected docs-only CI instead.

## 13. Development-Stage Closeout

Task completion and development-stage completion are different scopes. In the
default single-session mode, a stage closes after its admitted tasks are
merged or explicitly withdrawn, required clean-master M4 acceptance is
complete, no stage candidate remains active, and remaining work or rollback is
recorded.

When the operator explicitly declares a multi-session queue, the additional
ownership, double-release, scheduling, and release-handoff rules are normative
in [Parallel AI Collaboration Standard Section 11](parallel-ai-collaboration-standard-v1.md#11-development-stage-closeout-and-release-handoff).

Before declaring a development stage closed:

1. inventory every batch already admitted to that stage;
2. confirm that each batch is merged, explicitly withdrawn, or handed to a
   later stage;
3. confirm clean-current-`master` M4 acceptance where required;
4. confirm that no stage candidate remains active;
5. record local-only candidates, retained worktrees, blockers, rollback, and
   next work;
6. record the operator decision that selects the next priority.

If the next queue is controlled production validation, create a durable
handoff but do not treat that record as deployment authorization. Freeze the
exact candidate only after the stage-close conditions hold, then follow the
current production release policy and checklist.
