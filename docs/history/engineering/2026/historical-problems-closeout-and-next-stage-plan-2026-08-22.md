# Historical Problems Closeout And Next-Stage Plan — 2026-08-22

Status: dated cross-session synthesis and development guide; not production,
M4, runtime, human-value, entitlement, or release authorization.

## 1. Purpose and reading rule

This document closes the historical discussion across the Portal/UI,
WordPress–Cloud diagnostics, platform-administrator observation, release
efficiency, and editor-monitoring conversations. It records what is complete,
what remains open, why it remains open, and the safest order for the next
stage.

It is a dated plan, not a replacement for the active Cloud boundaries,
development-validation model, M4 standard, production release policy, or
customer-journey/quality contracts. Dated evidence expires: before acting,
re-read current `origin/master`, open PRs, worktree state, M4 status, and
runtime evidence.

## 2. Baseline checked for this closeout

The documentation work was based on a clean worktree at the then-current
`origin/master` revision:

```text
origin/master: 8d9ac6db perf: compress M4 preview frontend assets (#831)
production:    badac570 (dated production baseline; recheck before release)
```

The historical production PR `#827` was open/blocked at the time of review.
It is not a vehicle for this documentation work and must not be reused to
repair or publish unrelated changes. The repository's protected workflow,
not this document, decides whether any future production promotion is valid.

The primary worktree contained four pre-existing, uncommitted Portal/readiness
files. They were deliberately left untouched; this closeout changes only
documentation and its index.

## 3. What the historical work actually accomplished

The conversations produced a coherent operating direction rather than one
large feature branch:

| Area | Closed outcome | Evidence level |
| --- | --- | --- |
| Portal identity and context | Sign-in, verification, account/site context, recoverable lone-site selection, and capacity wording were clarified in the current master line (including PRs `#826` and `#830`). | merged implementation/CI; recheck consumer and M4 before claiming acceptance |
| First-user readiness | The readiness matrix covers inactive, paused, cross-account, connector credential, entitlement, and temporary-service failures. | merged tests/contracts; not a promise that every production path is currently green |
| Development workflow | Local-first validation and explicit development/merge/release lanes were made easier to reason about. | merged policy/tooling |
| Release discipline | Authorization, queue/setup, CI, bundle, transfer, cutover, and health phases were separated; promotion is a frozen envelope. | active policy and dated receipts |
| Technical editor monitoring | Two Local WordPress consumers completed bounded title/summary/rewrite technical flows with metadata-only evidence, zero pending records at the checkpoint, and fail-closed Provider dispatch. | dated technical evidence, not human-value evidence |
| Repository hygiene | Dirty user work was preserved with clean, locked auxiliary worktrees; cleanup is lifecycle-based rather than deletion-by-appearance. | active worktree standard and dated receipts |

These outcomes are intentionally separate from “customers found it useful,”
“production is ready,” and “the next release is authorized.”

## 4. Historical items still open

### 4.1 The old Portal chain is not one deliverable

The historical Portal work accumulated several commits and conflict domains:
workspace presentation, connector diagnostics/auth, QQ/image projection, and
retention/cleanup. Some Portal and readiness slices are already represented in
current `master`, but the complete five-commit historical chain has not been
rebuilt as a clean, current-base, independently verifiable delivery. It must
not be moved as a batch merely because its old branch is convenient.

**Why open:** the branch crossed ownership boundaries and was behind current
`master`; merging it wholesale would reintroduce duplicate or obsolete hunks,
blur consumer evidence, and make rollback ambiguous.

### 4.2 Development-efficiency sample size is insufficient

The observation plan still needs at least 10 compatible natural development
tasks (target 20) before deciding that CI cache, shard, or orchestration work
is justified.

**Why open:** a small or mixed sample cannot distinguish a repeated bottleneck
from a one-off queue, setup, review, or environment delay. We must not invent
tasks or rerun broad gates just to fill a table.

### 4.3 Release-efficiency claim is not yet stable

The desired 15–30 minute fix-to-production experience needs 2–3 complete,
real runtime-bug receipts. One optimized release is useful evidence, not a
stable distribution.

**Why open:** release time is a chain of authorization, queue, CI, artifact,
transfer, host mutation, and health verification. A single success cannot
justify new automation or remove a required safety gate.

### 4.4 Editor observation is technical, not decision-grade or human-value

The historical editor checkpoint contains six complete technical sessions and
is below the documented natural-observation and decision thresholds (50
complete sessions for observation confidence; 200 for decision-grade quality
analysis). No technical event proves usefulness, retention, willingness to pay,
or customer satisfaction.

**Why open:** technical monitoring was deliberately separated from subjective
scoring. Natural use may continue, but no paid Provider calls, traffic, ratings,
or production deployments may be manufactured to reach a number.

### 4.5 Temporary observation resources need an explicit close decision

The dated Provider ledger was recorded as `claimed=6`, `remaining=24`,
`status=open`. It stays open until the operator explicitly ends the bounded
authorization. The long-lived Local Addon mounts also require a planned
maintenance window before repointing to a verified stable checkout.

**Why open:** automatic closure or symlink switching could silently revoke a
declared budget, interrupt Local sites, or destroy the evidence chain.

### 4.6 Deferred operational observations remain observations

Environment-drift auditing, mechanical promotion-freeze enforcement, and the
worker 30-second graceful-stop bound remain deferred/observational items. One
M4 slow-load observation is not enough to justify Turbopack, production-mode,
or bundle-architecture work.

**Why open:** these changes add operational complexity. They require repeated,
like-for-like failures crossing the relevant threshold, not a plausible theory
or one anomalous run.

## 5. Why some historical requests were not completed wholesale

The common reasons are deliberate safeguards:

1. **Current-base truth:** old branches can contain valid ideas and invalid
   ancestry at the same time. We preserve the ideas and re-slice them from
   current reviewed source.
2. **Evidence separation:** implementation, consumer behavior, runtime,
   monitoring, M4 acceptance, production, and human value are different truth
   levels. A screenshot, HTTP 200, candidate M4 run, or green unit test cannot
   stand in for another level.
3. **Bounded real-world resources:** Provider calls, credits, production
   traffic, and operator attention are finite. We do not create synthetic
   activity to make a plan look complete.
4. **Frozen release envelopes:** once a production promotion starts, unrelated
   documentation, workflow, or product fixes cannot be added to it. A blocker
   gets a separately reviewed release-fix and is backported through `master`.
5. **Single-operator safety:** clean locked worktrees and narrow slices reduce
   accidental loss, cross-session conflicts, and rollback uncertainty.

## 6. Next-stage sequence

### Stage 0 — Protect boundaries and establish a current baseline

**Goal:** every action starts from clean current source without losing the
operator's uncommitted work.

- leave dirty primary worktrees untouched;
- inspect current `origin/master`, open PRs, worktree locks, and M4 status;
- classify any remaining Portal idea into one conflict domain;
- write a compact change envelope: outcome, non-goals, public contracts,
  expected files, gate, and rollback.

**Exit condition:** one bounded slice, one owner, one consumer, and one
narrowest useful verification gate are named. No old multi-commit chain is
published as a batch.

### Stage 1 — Deliver one current-base functional slice

**Goal:** convert the highest-value unresolved problem into reviewed source and
consumer truth.

Recommended order:

1. connector diagnostics/auth recovery if it blocks support diagnosis;
2. Portal workspace clarity only where it changes the next safe operator/user
   action;
3. QQ/image or other metadata projection only as a read-only boundary slice;
4. retention cleanup only with explicit invariants and rollback evidence.

For each slice: run deterministic tests first, then the focused Local consumer
path, then the relevant M4 candidate lane when its risk classification calls
for it. Publish a focused PR; production remains separate.

### Stage 2 — Observe naturally in three independent streams

Keep these streams separate:

| Stream | Next checkpoint | Decision only after |
| --- | --- | --- |
| Development efficiency | 10 compatible natural tasks; target 20 | repeated bottleneck crosses the Phase 4 threshold |
| Release efficiency | next real runtime bug | 2–3 complete fix-to-production receipts |
| Editor monitoring | natural multi-day window | below 50 sessions: observation only; 200 sessions: decision-grade discussion |

Each receipt records revision, lane, commands, failures/retries, Provider and
credit counts (if applicable), consumer result, highest evidence state, and
rollback. Use `not measured` instead of guessing human time or value.

### Stage 3 — Decide, consolidate, or stop

At each checkpoint, compare like-for-like samples and classify proposed work as
keep, modify, defer, or stop. Only then consider CI/cache/shard changes, new
release automation, or M4 performance work. Close the Provider ledger only
after the operator ends authorization; repoint Local mounts only during a
planned maintenance window and verify both sites afterward.

## 7. Reusable development rules

- Trace ownership and the user task/state machine before changing UI copy or
  layout.
- Keep account, membership, principal, and site identity distinct; do not use
  an anonymous cohort label as business identity.
- Treat Local, candidate, PR CI, merged `master`, M4 accepted, production, and
  human-value evidence as independent states.
- Prefer deterministic synthetic recovery coverage before paid Provider or
  production validation.
- Collect only the metadata needed for diagnosis and improvement; never retain
  prompts, generated text, article content, credentials, tokens, or raw bodies
  in observation records.
- Prefer the narrowest focused gate and reuse valid evidence; do not replay a
  broad gate without a distinct risk question.
- Keep Cloud as hosted runtime/evidence truth. It is not a second WordPress
  control plane, workflow registry, prompt/router owner, approval system, or
  final-write owner.
- Treat production promotion as a frozen envelope with a known rollback.
- In a dirty worktree, use a clean, locked auxiliary worktree; stage only the
  files belonging to the current task.
- Never infer human value from technical adoption, event counts, credits, or
  successful HTTP responses.

## 8. Explicit stop conditions

Stop and report instead of expanding scope when any of the following occurs:

- a request would manufacture Provider calls, production traffic, user ratings,
  or deployment timing samples;
- a change would combine unrelated Portal, connector, projection, retention,
  and release concerns;
- a budget, ledger, monitoring, or WordPress write boundary is ambiguous;
- a second independent blocker appears in the same task;
- a proposed CI/M4/release infrastructure change lacks repeated evidence;
- a production promotion would need an unrelated fix or documentation change;
- a worktree is locked, mounted, dirty, or owned by another active task.

## 9. Closeout and acceptance for this document

This documentation task is complete when:

- the historical open items and reasons are recorded without overstating
  current runtime truth;
- the next stages have a bounded goal, owner/evidence expectation, and stop
  line;
- the documentation index links this record;
- `git diff --check` and the documentation/release-policy gates pass;
- only the two documentation files are committed and pushed;
- no M4, WordPress, Provider, production, prompt, model, router, or monitoring
  state is changed.

The next implementation task should begin by rechecking the current baseline,
then selecting one Stage 1 slice. It should not treat this document as an
authorization to merge, deploy, close a ledger, or start a new observation
automation.
