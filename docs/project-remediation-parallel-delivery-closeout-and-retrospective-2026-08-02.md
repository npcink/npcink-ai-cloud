# Project Remediation and Parallel Delivery Closeout

Status: historical closeout and engineering retrospective.

Date: 2026-08-02.

Purpose: summarize the remediation work that followed the late-July structural
audit, record what the project actually improved, identify the work that is
still incomplete, and turn the delivery lessons into a reusable development
method.

This document is evidence and guidance, not production authorization. Current
normative authority remains with:

- [AGENTS.md](../AGENTS.md);
- [Development and Validation Operating Model](development-validation-operating-model-v1.md);
- [Parallel AI Collaboration Standard](parallel-ai-collaboration-standard-v1.md);
- [M4 Preview AI Development Standard](m4-preview-ai-development-standard-v1.md);
- [Cloud Admin UI Review and Delivery Playbook](cloud-admin-ui-review-and-delivery-playbook-v1.md);
- [Production Release Policy](cloud-production-release-policy-v1.md).

If a dated fact here differs from current Git, CI, M4, or production state,
recheck the current authority. This closeout does not start production Issue
`#406`, declare GA, or convert M4 acceptance into production evidence.

## 1. Original Problem Statement

The starting audit did not conclude that the project had too many tests. It
identified a validation and structure imbalance:

1. frontend behavior tests existed but the default CI path did not run the
   most valuable Vitest and Playwright journeys;
2. backend responsibilities were concentrated in very large services and
   repositories;
3. several Admin pages mixed route assembly, remote data, local drafts,
   validation, mutation, and rendering in one controller;
4. many frontend contracts inspected source text rather than behavior;
5. coverage had no useful baseline for deciding which critical paths were
   untested;
6. API tests and engineering commands had grown into large maintenance
   surfaces;
7. production delivery contained a broad but intentional operations surface
   that could not be safely reduced without an inventory.

The risk was long-term change cost and false confidence, not a proven P0
failure derived from line count. The initial snapshot was also behind upstream
and dirty, so every implementation batch had to refresh against a clean current
baseline before it could become integration truth.

## 2. Target Outcome

The remediation target was deliberately narrower than a rewrite:

```text
real behavior gates first
  -> bounded query and controller extraction
  -> operator journeys that preserve context
  -> exact local evidence
  -> one M4 candidate owner
  -> one protected merge lane
  -> clean-master M4 acceptance
```

The desired project state is:

- critical frontend behavior fails CI before merge;
- large modules stop gaining unrelated responsibilities and are split one seam
  at a time behind compatible interfaces;
- Admin pages follow a clear queue, detail, configuration, or diagnostic job;
- the operator can find an object, judge it, act, see a trustworthy result, and
  return to the original queue context;
- local, CI, M4 candidate, merged, accepted M4, production, and human evidence
  remain distinct;
- parallel sessions increase investigation throughput without creating more
  than one source, merge, or runtime truth.

## 3. What Was Delivered

The following table lists representative merged outcomes. It is not a claim
that every historical debt is closed.

| Workstream | Representative delivery | Result |
| --- | --- | --- |
| Frontend validation | PRs `#348` and `#359` | Existing unit tests and critical Playwright recovery paths became protected CI evidence. |
| Coverage and test structure | PRs `#365`, `#382`, and `#397` | A backend coverage baseline was recorded and oversized route tests began splitting by capability. |
| Backend responsibility extraction | PRs `#367`, `#372`, and `#385` | Runtime diagnostics plus account/site query seams moved behind narrower collaborators without a big-bang rewrite. |
| Frontend controller extraction | PRs `#374`, `#380`, and `#394` | Account and AI-resource page state moved toward focused controllers and workbench state. |
| Engineering entry governance | PR `#383` | The large command surface gained an inventory and lifecycle discipline instead of speculative bulk deletion. |
| Admin operator workflows | PRs `#387`, `#396`-`#400`, `#405`, `#408`, `#416`, and `#419` | Support and service-status work became denser queue/inspector workflows with fewer ambiguous actions. |
| Plans and commercial truth | PRs `#388`, `#390`, `#392`, `#393`, `#395`, `#411`, and `#414` | Raw maintenance surfaces and legacy comparison/cost semantics were replaced by bounded structured contracts. |
| Portal reliability | PRs `#366`, `#389`, `#403`, `#410`, `#412`, and `#413` | Payment-return recovery, loading truth, verification cooldown, and locale-aware expiry display received behavior gates. |
| Media intelligence | PRs `#381`, `#391`, `#399`, `#407`, and `#409` | Media retrieval reused evidence, added local semantic embeddings, and improved bounded ranking while remaining suggestion-only. |
| M4 safety and evidence | PRs `#369`, `#418`, `#420`, `#458`, and `#459` | Observation receipts, browser preflight, shared-volume consumer guards, stale-asset prevention, and atomic preview config reduced false acceptance and destructive recovery risk. |
| Parallel delivery | PRs `#361`, `#386`, and `#443` | The Three Uniques, worktree lifecycle locks, builder/integrator roles, and bounded ready queue became repository policy. |
| Admin return context | PRs `#455` and `#457` | Support, subscriptions, accounts, and sites gained a shared fail-closed queue-to-detail return contract. |

The final Batch 2 acceptance chain was intentionally explicit:

- PR `#457` merged as `5b65f3883a6113558f9e327cc60838a7b7289784`;
- required GitHub checks succeeded;
- clean merged `master` was promoted to M4 with `promotion_pr=457`;
- M4 reported `source_branch=master`, `source_dirty=false`, HTTP 200, and
  Alembic `20260801_0078` at that observation time;
- the M4 Accounts read facade passed 4/4 as backend/runtime health evidence;
- the frontend navigation contract was supported by same-revision local PC
  journeys 14/14 and Admin visual journeys 43/43;
- M4 browser transport was degraded and correctly recorded as `not_counted`.

Later commits may have advanced `master` and M4. The receipt proves Batch 2's
accepted chain at closeout; it is not a permanent current-state assertion.

## 4. The Method That Worked

### 4.1 Fix the validation gap before increasing refactor depth

Adding behavior gates early made later extractions safer. A structural change
without an observable user or runtime contract merely moves uncertainty. The
effective order was:

1. add the smallest real behavior test;
2. establish local and CI evidence;
3. extract one responsibility;
4. preserve the public facade or route contract;
5. validate the actual consumer;
6. merge and promote before starting the dependent batch.

### 4.2 Split one responsibility, not one large file

Line count identified hotspots but did not define module boundaries. Useful
extractions followed responsibilities already visible in behavior:

- runtime diagnostics and backlog queries;
- account and site read queries;
- page form/controller state;
- AI-resource directory and workbench state;
- support and subscription queue semantics.

This avoided simultaneous API, database, behavior, and UI changes. A facade
could remain while a new collaborator took one coherent responsibility.

### 4.3 Optimize Admin for the operator job

The strongest Admin changes began with a route model and operator chain rather
than visual styling:

```text
queue -> select -> inspect -> act -> confirm result -> return to queue
```

Dense tables and workbenches were appropriate for comparable operational
records. Cards, banners, and extra actions were removed when they did not help
the next decision. Server/API/domain code retained sorting, pagination,
permission, cost, and readiness truth; the frontend did not manufacture it.

### 4.4 Treat navigation context as a security contract

`return_to` was not implemented as arbitrary URL plumbing. The shared contract
uses exact allowlists, safe defaults, bounded values, canonical encoding, and
single-level nesting where the Account-to-Site journey requires it. It rejects
external URLs, protocol-relative paths, backslashes, control characters,
fragments, malformed or recursive values, duplicate nesting, and unsafe
account path segments.

The Site payload owns the authoritative parent account identity. URL input does
not. Direct or tampered access falls back to a safe queue rather than guessing
navigation history. This preserves the filtered operator journey without
creating an open redirect or an unbounded URL accumulator.

### 4.5 Parallelize discovery, serialize truth-changing lanes

The project had many active AI sessions, but useful concurrency came from
disjoint investigation and local implementation. Three resources remained
unique:

1. one implementation owner per conflict domain;
2. one protected human merge lane;
3. one shared M4/stateful-runtime operation owner.

Builders could reach clean committed `local-ready` in parallel. The integrator
admitted one item, refreshed it onto current `master`, scheduled M4, published
one merge-ready PR, and held the lane through accepted promotion. This reduced
rebase churn, candidate overwrites, and ambiguous completion claims.

### 4.6 Make evidence revision-specific

Every source change after candidate validation invalidated the candidate claim
for that behavior. Review fixes therefore repeated only the affected local gate
and smallest valid M4 dispatch. A green old candidate was history, not evidence
for the new head.

Likewise, baseline drift was handled as a source-control event:

1. stop before M4 or publication;
2. inspect upstream file and contract overlap;
3. create an exact-file checkpoint if the worktree is dirty;
4. rebase the focused worktree;
5. stop on conflict;
6. rerun affected gates on the final base.

### 4.7 Fail closed around shared runtime incidents

The M4 frontend-volume incident showed why apparently convenient cleanup is
dangerous. An expired frontend preview slot still consumed a shared volume.
The correct response was to inspect container labels and the governed slot
status, release the exact slot through its tool, and then improve the deploy
guard. The implementation subsequently learned to:

- enumerate exact volume consumers before mutation;
- reject unknown, active, expired, or drifted external consumers rather than
  deleting them automatically;
- use canonical container identity;
- hold slot operation locks across the consumer-check-to-remove window;
- remain compatible with the remote Bash version;
- preserve exact lock ownership evidence during recovery.

No manual `docker rm`, prune, volume deletion, or fabricated lock cleanup was
needed.

### 4.8 Say when browser evidence does not count

M4 browser tests repeatedly exposed low-throughput Tailscale or SSH transport.
The frontend and proxy could respond quickly on M4 while large development
assets stalled across the relay. A complete DOM, login redirect, or HTTP 200
was not treated as a passing journey.

The durable rule is:

- classify the transport first;
- record degraded throughput as `browser_evidence=not_counted`;
- do not refresh snapshots or change product code to hide transport behavior;
- use same-revision local production Playwright or an approved authenticated
  browser for product assertions;
- keep backend health smoke separate from frontend journey proof.

## 5. Work Review Report

### Original objective

Reduce real regression risk first, then lower structural complexity through
small reversible batches while several AI sessions share one repository, one
protected merge path, and one M4 runtime.

### Completion

- [x] Critical frontend unit and browser paths entered protected validation.
- [x] Representative backend and frontend hotspots were split by bounded
  responsibility.
- [x] Admin operator workflows gained denser, more direct queue/detail flows.
- [x] Parallel ownership, worktree, merge-lane, and M4 rules became durable
  repository policy.
- [x] Candidate, PR, merged, accepted M4, production, and human evidence were
  reported separately.
- [x] Support/subscription/account/site return context closed through PRs
  `#455` and `#457`.
- [ ] All original god classes and monolithic pages are decomposed.
- [ ] Source-regex contract debt has been broadly converted to behavior tests.
- [ ] A repository-wide coverage policy is mature enough for a global hard
  threshold.
- [ ] Production validation or GA is authorized or complete.

### Problems found

| Severity | Specific problem | Root cause | Correction |
| --- | --- | --- | --- |
| Must correct | Early parallel work repeatedly waited on or collided with merge and M4 ownership. | Concurrency was measured by active sessions rather than independent conflict domains and scarce lanes. | Keep the Three Uniques, one integrator, and a bounded ready queue. |
| Must correct | A deploy stopped after an old frontend slot held a shared volume; later cleanup exposed Bash 3 and lock-recovery edge cases. | Runtime lifecycle assumptions were not proven before destructive volume refresh and cleanup code was not exercised in the real shell environment. | Guard consumers before mutation, hold slot locks through removal, test the remote shell contract, and fail closed without manual cleanup. |
| Must correct | Some browser runs timed out after HTTP and DOM success and could have been misreported as product failures or passes. | Transport health, asset throughput, and product assertions were initially collapsed into one browser result. | Run bounded preflight and mark degraded journeys `not_counted`; use another same-revision product evidence lane. |
| Should correct | Several batches discovered necessary snapshots or stale cross-route assertions after the initial envelope. | The first scope inventory focused on owning source and missed generated or shared consumer evidence. | Search all consumers and generated baselines before editing; require explicit exact-scope amendments when a gate finds more. |
| Should correct | Moving `master` repeatedly forced ready work to refresh and rerun gates. | Too many local-ready items approached publication while one protected lane remained scarce. | Admit one item, keep at most two waiting, checkpoint dirty coherent work, and rebase only when admitted. |
| Should correct | Large source-regex contract suites still provide rename-sensitive confidence. | Static checks were easier to add than component or journey fixtures. | Retain true boundary checks but convert high-value behavior claims incrementally to Vitest and Playwright. |
| Suggested improvement | M4 focused backend smoke sometimes had no direct frontend seam. | The runtime lane was required for a Cloud frontend candidate even when the behavior was browser-only and remote transport was degraded. | State exactly what backend smoke proves and keep product acceptance with same-revision browser or local production evidence. |

### What went well

- Fail-closed stops preserved source, locks, migrations, and other sessions'
  candidates during several ambiguous incidents.
- Exact worktrees, commits, PR heads, merge revisions, and promotion receipts
  made handoffs auditable.
- Review feedback was handled in the same PR and same contract instead of
  spawning competing fixes.
- The project resisted broad rewrites and production shortcuts even while many
  useful changes were ready.
- UI decisions increasingly followed operator jobs and server-owned truth
  rather than generic visual polish.

### Next review focus

1. Measure whether the largest remaining classes and pages are still gaining
   new responsibilities; enforce "no new responsibility" before forcing a
   line-count target.
2. Track changed-code behavior coverage for extracted collaborators and hooks,
   not a mechanical whole-repository percentage.
3. Continue converting high-value source-text contracts into real function,
   component, API, and journey tests while retaining boundary prohibitions.
4. Start Overview anomaly pre-filtering only through a new explicit batch
   envelope; a completed release receipt is not automatic authorization.
5. Keep production Issue `#406` behind a frozen exact candidate, protected
   configuration proof, rollback, backup, Environment approval, production
   WordPress/payment smoke, and observation period.

## 6. Durable Operating Pattern

For future remediation batches:

```text
read current truth
  -> declare owner and exact contract
  -> use a locked clean worktree
  -> write red behavior evidence
  -> implement one responsibility
  -> run narrow local gates
  -> review five axes
  -> refresh current master and exact scope
  -> acquire M4 for one revision
  -> release M4
  -> acquire the protected merge lane
  -> resolve review on the same PR
  -> merge
  -> promote clean current master
  -> release M4 and merge lane independently
  -> admit the next batch explicitly
```

The optimization target is not the number of simultaneous edits. It is the
amount of reviewed, accepted, reversible user value delivered without losing
source, runtime, or authorization truth.

## 7. Remaining Boundaries

This stage does not prove or authorize:

- completion of every original structural hotspot;
- deletion of migration history or broad engineering scripts;
- a global coverage threshold;
- trusted Admin identity propagation, named or multiple administrators, or
  per-session revocation;
- a second WordPress control plane or Cloud-owned final writes;
- production deployment, production validation, customer acceptance, or GA;
- automatic cleanup of old worktrees, branches, slots, containers, volumes,
  locks, or test evidence.

These remain separate decisions with their own owner, envelope, verification,
and rollback.
