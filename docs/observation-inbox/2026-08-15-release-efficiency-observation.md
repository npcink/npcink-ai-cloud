# Session Observation Receipt — 2026-08-15

## 1. Session Identity

- Session/task name: production release efficiency and single-operator release governance
- Repository: `npcink/npcink-ai-cloud`
- Branch: historical delivery branches `codex/ai-release-fast-loop-20260808` and `codex/single-operator-release-observation-20260813`; this receipt branch `codex/release-efficiency-observation-20260815`
- Focused module: GitHub Actions production deployment, SSH deployment orchestration, production release policy, and single-operator AI release reporting
- Observation date: 2026-08-15, Asia/Shanghai
- Responsible boundary: Cloud production release/tooling boundary. Cloud remains the hosted runtime enhancement layer; the human operator remains the sole production authorization owner; WordPress approval, workflow, prompt/preset, audit, and final-write truth did not move.

## 2. Original Objective

The original request was to explain why a small bug fix could require two to
three hours to reach the server when the code correction itself took about 15
minutes. GitHub Actions run
[`31181387735`](https://github.com/npcink/npcink-ai-cloud/actions/runs/31181387735)
was supplied as the concrete example. The operator then clarified that this is
a single-person project in which AI performs development, testing, and
deployment, and that the hidden `production` Environment wait was neither
understood nor clearly surfaced.

The expected outcome became:

1. remove the inappropriate second-human production wait while preserving
   explicit operator authorization and protected secrets;
2. reduce repeated production build and transport work;
3. make release waits and phases visible to the operator;
4. establish a reasonable single-operator bug-fix-to-production workflow;
5. observe natural releases before making further release-system changes.

## 3. Scope And Non-goals

Actual scope:

- inspected the original slow production Actions run and separated Environment
  wait, runner execution, and deploy-step time;
- changed the live GitHub `production` Environment by removing required
  reviewers while retaining the custom `production` branch policy and
  Environment secrets;
- updated production CI to create an exact-SHA deploy bundle for production
  use;
- updated the deploy workflow to download and revalidate that bundle and call
  the SSH deployer with `--skip-bundle-build`;
- enabled SSH connection multiplexing and concurrent application-container
  stops with per-service timing;
- corrected authorization timing so it is recorded at the first job step;
- added single-operator promotion-freeze, operator-facing release-plan, and
  natural observation-receipt rules.

Explicit non-goals:

- no automatic production deployment on push or merge;
- no bypass of GitHub required checks or exact operator confirmation;
- no new reviewer, approval service, deployment control plane, registry, or
  orchestration infrastructure;
- no direct production server source edit;
- no WordPress, Addon, Portal product, Provider adapter, database schema, or
  public runtime API change;
- no paid Provider call, synthetic release, or manufactured observation run;
- no modification of M4 state or of another repository;
- no modification of the unified aggregation document.

Systems involved:

- Cloud repository and GitHub Actions: yes;
- live GitHub Environment configuration: yes;
- production deployment workflow and production host: yes, through a later
  natural deployment of the exact promoted workflow;
- M4: no;
- Addon and WordPress: no;
- Portal product behavior: no;
- Provider calls: no paid or behavioral Provider validation;
- other repositories: no writes.

## 4. Work Completed

### Release acceleration delivery

PR [#592](https://github.com/npcink/npcink-ai-cloud/pull/592),
`Accelerate single-operator production releases`, merged into `master` as
`1366248506ae57f76868ca6b0748e9c741f40a4c`.

Implemented facts:

- production CI emits an exact-SHA deploy bundle;
- deployment downloads and verifies the exact CI artifact instead of rebuilding
  it inside the deployment job;
- the SSH deploy helper receives `--skip-bundle-build`;
- SSH/SCP commands use `ControlMaster=auto` and `ControlPersist=60`;
- application services stop concurrently while retaining the 30-second worker
  grace and emitting per-service timing;
- deployment emits explicit `installation_state=pending|complete` evidence;
- release policy, runbooks, checklist, policy checker, and contract tests were
  updated with the same contract.

The first review revision incorrectly recorded authorization latency after
checkout, CI lookup, and artifact download. Codex review identified this as
misleading. Commit `9fe598f28b1af5632249b8a9c5df970551b1fe86`
moved `Record authorization latency` to the first job step before the PR was
merged.

### Live Environment adjustment

The session removed the `required_reviewers` rule from the GitHub Environment
named `production`. Current API evidence on 2026-08-15 shows only the branch
policy protection rule, with a custom allowed branch named `production`.
Environment secret names remain present, including `PROD_SSH_KEY`,
`PROD_SSH_KNOWN_HOSTS`, and the bounded release secrets. Secret values were not
read. The current-state API proves the resulting configuration, but this
receipt does not claim an immutable audit event for the moment of removal.

### Single-operator governance delivery

PR [#687](https://github.com/npcink/npcink-ai-cloud/pull/687),
`Freeze single-operator production promotions`, merged into `master` as
`b8601b65d59ea9e53e71d9a37a0134705c39b202`.

It added:

- a frozen release envelope for ordinary `master` to `production` promotions;
- a rule that non-blocking release discoveries become separate follow-ups;
- a separate reviewed and backported `release-fix` requirement for actual
  release blockers;
- explicit operator-facing translations for `no_deploy`, `static`, runtime,
  blocked, and failed release states;
- a requirement to state runtime scope, expected duration, rollback revision,
  and exact authorization rather than silently waiting;
- an end-to-end natural observation receipt in the PR template and release
  policy;
- a prohibition on synthetic deployments or extra broad gates solely to
  manufacture timing evidence.

## 5. Verification Evidence

- Static checks: **passed**. `pnpm run check:release-policy` passed for both
  deliveries. `git diff --check` passed for the governance delivery. YAML was
  parsed successfully during PR #592 work after replacing an incompatible
  local Ruby invocation. Historical session output also recorded Bash syntax,
  changed-Python Ruff, and YAML checks as passed; their exact original command
  lines are not all retained in this receipt, so they are not promoted to
  stronger evidence than the merged CI and policy gate.
- Unit/integration tests: **passed**. PR #592 final Cloud CI run
  [`31263388840`](https://github.com/npcink/npcink-ai-cloud/actions/runs/31263388840)
  completed successfully. Its backend pytest shards passed in 7m34s, 8m15s,
  and 9m53s; frontend, backend static, PostgreSQL encryption regression,
  dependency audit, image smoke, secret scan, and observability also passed.
  Historical session output recorded a focused contract result of `159 passed`,
  but the exact invocation is not retained and is therefore supplementary.
  PR #687 Cloud CI run
  [`31676897148`](https://github.com/npcink/npcink-ai-cloud/actions/runs/31676897148)
  passed its documentation-targeted lane in 43 seconds; CodeQL and PR body
  contract also passed.
- Browser or local running: **not_run**. No browser surface or local application
  behavior was changed.
- Docker: **partial**. GitHub's Python 3.14 Alpine production image smoke passed
  for PR #592, and the later production deployment loaded and verified exact
  bundled images. No local Docker or M4 Docker run was performed in this
  session.
- Provider: **not_run**. No paid Provider request or Provider-output assertion
  was used. The production deploy executed its existing provider-refresh phase,
  but that is deployment behavior rather than a paid model-quality test.
- WordPress: **not_applicable**. No WordPress consumer, mutation, approval, or
  final-write path changed.
- M4: **not_run**. Changed-file routing selected GitHub Actions for the
  CI/release-tooling delivery, and the later governance delivery was
  documentation/repository policy only. No candidate, promotion, or acceptance
  receipt exists for this session.
- GitHub CI: **passed**. PR #592 and PR #687 are merged, with all required checks
  green. PR #592 required a second final CI run after the authorization-timing
  review correction; that rerun answered a changed-revision risk question and
  was not treated as reusable evidence for the earlier SHA.
- Production: **passed** for the optimized deployment path. The PR #592
  `deploy-production.yml` is byte-identical to the version promoted by
  production PR [#597](https://github.com/npcink/npcink-ai-cloud/pull/597),
  production commit `6fbc49be673c3636088368dd2361cb1722092368`.
  Natural production run
  [`31321596808`](https://github.com/npcink/npcink-ai-cloud/actions/runs/31321596808)
  completed successfully in 4m31s. The Deploy step took 3m52s, downloaded the
  exact bundle in 18s, uploaded the main bundle in 25s, stopped six application
  services concurrently in 30s, completed the remote deployment sequence in
  162s, emitted `installation_state=complete`, and passed the small-customer
  preflight. This proves the optimized workflow ran in production; it does not
  prove every future release will take the same time.
- Human acceptance: **partial**. The operator accepted the five implementation
  recommendations and explicitly approved the governance follow-up. The
  operator has not yet accepted a stable 15–30 minute bug-fix-to-production
  experience across two to three natural runtime releases.

Original performance evidence:

- run `31181387735` total: 1h36m45s;
- workflow dispatch to deploy-job start: approximately 1h26m07s;
- actual deploy job: approximately 10m38s;
- original Deploy step: 9m55s.

The large original delay was therefore an Environment authorization wait, not
bug-fix computation or runner execution.

## 6. Evidence Level

- implementation truth: **passed**. Both scoped changes are merged into
  `master`; the release acceleration implementation was also promoted into the
  production workflow.
- consumer truth: **passed** for the GitHub Actions deployment consumer. A real
  manually dispatched production workflow downloaded the exact artifact,
  invoked the SSH deployer, and completed preflight. No browser or WordPress
  consumer claim is made.
- runtime truth: **passed** for one natural production deployment of the exact
  optimized workflow. Repeated end-to-end bug-cycle runtime truth remains
  incomplete.
- evidence/monitoring truth: **partial**. Phase timing and authorization timing
  exist, and the observation policy is merged. A stable multi-release dataset
  has not yet been collected, and `created_at`-based authorization timing
  remains a workflow-level approximation rather than measured human effort.
- human-value truth: **partial**. The operator confirmed that the previous
  hidden wait was unacceptable and accepted the revised model. One deployment
  fell from 1h36m45s to 4m31s, but no two-to-three-release human workflow sample
  yet proves the whole fix-to-production loop consistently meets the desired
  experience.
- production truth: **passed** for PR #592's deployment acceleration via
  production commit `6fbc49be...` and run `31321596808`. PR #687 is
  documentation/repository policy merged to `master`; no separate production
  deployment was necessary or claimed for that delivery.

## 7. Problems Found And Corrections

| Severity | Problem | Root cause | Correction made | Remaining risk |
| --- | --- | --- | --- | --- |
| P0 | Production dispatch waited approximately 1h26m without a clear operator message. | The single-person repository retained a second-human `required_reviewers` Environment rule, and the Actions UI state was not translated for the operator. | Removed Environment required reviewers; retained manual exact confirmation, protected secrets, and production-only branch policy. | A future repository-setting change could reintroduce hidden reviewers; current configuration is observable but not contract-enforced by repository code. |
| P1 | The initial authorization metric was recorded after checkout, CI lookup, and artifact download. | Instrumentation was added around the perceived wait without tracing the exact critical path first. | Codex review identified the error; commit `9fe598f2` moved timing to the first job step and the review thread was resolved. | GitHub run `created_at` still combines dispatch/queue/platform timing and must not be presented as exact human decision time. |
| P1 | Early discussion risked treating the expected 4–6 minute deploy stage as the whole bug-fix-to-production cycle. | Deployment runtime and end-to-end delivery lead time were initially discussed at different points without a fixed state model. | Later analysis separated fix, PR CI, production promotion, authorization, bundle, host cutover, and health phases; PR #687 made this reporting mandatory. | The desired 15–30 minute end-to-end target is still a hypothesis awaiting natural runtime samples. |
| P1 | The first follow-up observation used PRs #683/#685, but the final release plan was `no_deploy`; it did not exercise a server update. | A workflow/readiness repair was selected as though every production promotion were a runtime deployment sample. | The analysis explicitly corrected the conclusion and recorded that `no_deploy` means no host mutation. | A real application/runtime bug cycle still needs an end-to-end receipt. |
| P1 | Production PR #685 expanded into eight files and 601 added lines, including release workflow development, and ran two approximately 11-minute complete CI cycles. | The release operation was allowed to become another development loop; review feedback was handled inside the promotion. | PR #687 added a frozen promotion envelope, separate follow-up rule, and separate reviewed/backported `release-fix` rule. | Enforcement is currently policy/template based. Add a mechanical gate only if this failure mode recurs; do not pre-emptively add more CI. |
| P2 | PR #592 required an additional complete CI run after review found the timing-placement issue. | The observable timing semantics were not independently reviewed before the first push. | Corrected the code and reran required checks for the changed SHA. | Review-before-publication could reduce reruns, but broad pre-PR duplication would itself waste time; use focused review of new metrics instead. |
| P2 | The first local YAML validation command used an unsupported Ruby/Psych keyword. | The command assumed a newer Ruby API than the authoring Mac provided. | Re-ran with the compatible loader; YAML and release policy passed. | Prefer repository-owned validation commands over ad hoc runtime-specific parsing. |
| P2 | The current API proves that Environment reviewers are absent, but the session did not preserve an immutable settings-change audit receipt. | Live configuration was corrected directly and evidence collection focused on resulting behavior. | Recorded current protection rules, allowed branch, and secret names without reading values. | A future governance task may add a read-only configuration audit, but it should not introduce a second deployment control plane. |

Self-review result: the core objective was achieved and later production
evidence confirms a large deployment-time reduction. The main methodological
error was optimizing and describing the deployment stage before consistently
separating it from total delivery lead time. The corrective governance now
forces those states apart.

## 8. What Remains Open

| Item | Current state | Why unresolved | Required next action | Owner/decision |
| --- | --- | --- | --- | --- |
| Natural end-to-end runtime release sample | awaiting_observation | The analyzed PR #683/#685 sample was `no_deploy`, not a server update. | On the next real backend/frontend runtime bug, record every required observation field through production health completion. | AI executes and reports; operator provides the single explicit production authorization. |
| Stable 15–30 minute delivery target | awaiting_observation | One optimized production deployment proves the deploy stage, not the complete bug-fix lead time. | Collect two to three natural runtime release receipts before changing the release system again. | Operator decides after aggregated evidence. |
| Mechanical promotion-freeze enforcement | open, deferred | Policy and PR template now define the rule, but no code gate rejects scope expansion automatically. | Add a focused contract only if promotion scope inflation repeats; otherwise avoid more CI complexity. | Future release retrospective decision. |
| Environment configuration drift detection | open, deferred | Required-reviewer absence is live GitHub state rather than repository source truth. | Periodically inspect Environment protection rules or add a read-only audit if drift recurs. | Repository operator. |
| Worker 30-second graceful stop | awaiting_observation | Parallel stop removed serial 90-second cost, but three workers still consume one 30-second critical-path window. | Preserve the bound until natural worker-drain evidence proves a shorter timeout safe. | Runtime/release owner with operator review. |

## 9. Reusable Development Experience

- Start release-performance work by splitting wall-clock time into platform
  wait, runner setup, artifact work, transfer, remote preparation, mutation,
  and health phases. The original 96-minute headline concealed an 86-minute
  policy wait and only about 10 minutes of runner work.
- In a single-operator project, keep one explicit human production decision.
  Environment secrets and branch policy may remain protected without pretending
  that a second reviewer exists.
- Build and scan an exact SHA-bound artifact once, then download and revalidate
  it for deployment. Reuse evidence only when repository, SHA, tree, checksum,
  and CI identity still match.
- Put timing probes at the boundary they claim to measure. A metric named
  authorization latency must precede artifact preparation.
- Parallelize independent container shutdowns but preserve the safe per-worker
  grace. Optimizing the critical path must not weaken shutdown correctness.
- Treat a production promotion as a frozen release envelope. Non-blocking
  discoveries go to follow-ups; actual blockers use a separately reviewed fix.
- Translate internal release-plan states into operator language. `no_deploy`
  means the source reached `production` and no server update is needed; it is
  not an incomplete deployment.
- Use the narrowest useful local gate, then rely on required GitHub checks for
  merge authority. A changed SHA after valid review feedback justifies a rerun;
  an unchanged SHA does not justify repeating the same broad suite.
- Protect unrelated user work by creating and locking a clean auxiliary
  worktree. The original dirty Portal worktree was never staged, reset, or
  edited by these release tasks.
- Keep evidence levels separate: Actions success proves automation, production
  health proves runtime, and operator acceptance or repeated delivery outcomes
  prove human value.

What worked well:

- the investigation used the concrete Actions job/step timestamps rather than
  assuming the deploy script consumed the full 96 minutes;
- the boundary remained intact while removing inappropriate ceremony;
- review feedback was accepted and corrected before merge;
- later natural production evidence was used instead of creating a synthetic
  deployment;
- the policy follow-up addressed a demonstrated failure mode without adding a
  new ADR, workflow, approval, or broad test lane.

## 10. Recommended Next Stage

| Priority | Action | Expected goal | Acceptance evidence |
| --- | --- | --- | --- |
| P1 | Run the next natural backend/frontend bug through the frozen full release path. | Measure real fix-to-production lead time without mixing release-system development into the promotion. | One complete observation receipt ending in `installation_state=complete` and production health success. |
| P1 | Collect two to three natural runtime release receipts before further optimization. | Determine whether 15–30 minutes is stable and identify a repeated bottleneck rather than reacting to one sample. | Aggregated phase durations with no inferred human time and an explicit operator judgment. |
| P1 | Keep production PRs pure promotions. | Prevent another 20+ minute scope-expansion and repeat-CI episode. | Production PR diff contains only intended reviewed release content/metadata; unrelated findings are separate follow-ups. |
| P2 | Observe worker drain during the existing 30-second parallel stop window. | Decide whether the remaining stop bound is necessary without risking queued work. | Natural per-worker drain/stop evidence from multiple successful deployments; no dropped-work signal. |
| P2 | Audit Environment rules only if hidden waiting or configuration drift reappears. | Preserve one visible operator authorization without building another control plane. | Read-only API evidence showing no required reviewers, `production` branch restriction, and expected secret names. |

## 11. Git And Delivery Receipt

- Changed files:
  - PR #592: `.github/pull_request_template.md`, `.github/workflows/ci.yml`, `.github/workflows/deploy-production.yml`, `deploy/PRODUCTION_GITHUB_DEPLOY.md`, `deploy/RELEASE_CHECKLIST.md`, `deploy/deploy-to-ssh-host.sh`, `docs/cloud-production-release-policy-v1.md`, `scripts/check-release-policy.sh`, `tests/contract/test_deploy_config_contract.py`, `tests/contract/test_production_secret_argv_contract.py`.
  - PR #687: `.github/pull_request_template.md`, `AGENTS.md`, `docs/cloud-production-release-policy-v1.md`.
  - This closeout: `docs/observation-inbox/2026-08-15-release-efficiency-observation.md` only.
- Verification commands:
  - `pnpm run check:release-policy` — passed for PR #592 and PR #687.
  - `git diff --check` — passed for PR #687 and this receipt.
  - GitHub required checks — passed for runs `31263388840` and `31676897148`.
  - Production Actions inspection — run `31321596808`, success, 4m31s.
- Commit SHA:
  - PR #592 final topic commit: `9fe598f28b1af5632249b8a9c5df970551b1fe86`.
  - PR #687 topic commit: `749cc27910b0601683f6048553c3c5f088abccaf`.
- PR URL:
  - https://github.com/npcink/npcink-ai-cloud/pull/592
  - https://github.com/npcink/npcink-ai-cloud/pull/687
- PR state: both merged.
- Merge commit:
  - PR #592: `1366248506ae57f76868ca6b0748e9c741f40a4c`.
  - PR #687: `b8601b65d59ea9e53e71d9a37a0134705c39b202`.
- Worktree state: the main worktree contained unrelated user/other-session Portal changes and was not modified. Historical auxiliary worktrees were kept isolated. This receipt uses the clean locked worktree `/Users/muze/gitee/.worktrees/npcink-ai-cloud-release-efficiency-observation-20260815`.
- Rollback method: revert the relevant merge commit through a reviewed PR. For the live Environment rule, restore a reviewer rule only through an explicit operator decision; do not silently reintroduce a second-human wait. Production runtime rollback remains the governed previous-release path in `docs/cloud-production-release-policy-v1.md`.

## 12. Aggregation Summary

```yaml
session: production release efficiency and single-operator release governance
repository: npcink/npcink-ai-cloud
focused_module: production release workflow, SSH deploy orchestration, and release governance
overall_state: merged_with_production_validation_and_natural_observation_pending
highest_evidence_level: production_validated_for_optimized_deploy_path
production_state: passed_run_31321596808_4m31s
m4_state: not_run
human_value_state: partial_awaiting_two_to_three_end_to_end_runtime_samples
critical_blockers: []
remaining_p0: []
remaining_p1:
  - collect_next_real_runtime_bug_fix_to_production_receipt
  - validate_stable_15_to_30_minute_end_to_end_target
  - keep_production_promotions_scope_frozen
recommended_next_action: observe the next natural runtime bug release without changing the release system
commit:
  - 9fe598f28b1af5632249b8a9c5df970551b1fe86
  - 749cc27910b0601683f6048553c3c5f088abccaf
pull_request:
  - https://github.com/npcink/npcink-ai-cloud/pull/592
  - https://github.com/npcink/npcink-ai-cloud/pull/687
```
