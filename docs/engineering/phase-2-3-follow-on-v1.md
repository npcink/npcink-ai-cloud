# Phase 2–3 Follow-on (Cloud)

Status: active operator backlog pointer for agents after Phase 1 evidence work.
Does **not** replace [phase-1-scope.md](phase-1-scope.md). Production Deploy and
`production` promotion remain **human-gated** per [AGENTS.md](../../AGENTS.md)
and [cloud-production-release-policy-v1.md](../cloud-production-release-policy-v1.md).

## Phase 2 — Master quality debt (current)

Goal: make `master` e2e and long-lived M4 preview trustworthy enough that a
green CI / M4 sync is meaningful local evidence (still not production proof).

### 2.1 Portal / frontend e2e debt

**Progress (2026-10-22 Asia/Shanghai):** assertion-alignment batches through
[#1189](https://github.com/npcink/npcink-ai-cloud/pull/1189)–[#1196](https://github.com/npcink/npcink-ai-cloud/pull/1196)
are **merged** on `master` (tip includes `#1196` → `3009b068`). Those PRs
retargeted Playwright to current quiet billing / home / auth UX (Package
dialogs, Activate CTA, QQ login-options mocks, etc.). They did **not** claim
full-suite green.

Still open under this slice:

- **Login / register portal screenshot baseline** — deferred. Local drift was
  about ~3% pixels on register; needs an intentional snapshot update plus
  human visual acceptance. Do not regenerate casually inside an assertion PR.
- **Residual failures** — re-scan Playwright against **current master** before
  quoting a new failure count. Do not invent or carry forward the older
  “~50 failing” figure as present truth.

Working rules (unchanged):

- Re-run failing specs against current master (local Playwright webServer or
  M4 preview via tunnel). Prefer the narrowest shard.
- Classify each failure: product bug vs stale assertion vs flaky timing vs
  environment-only (M4 vs local).
- Fix in small PRs branched from latest `master` (one module per PR; respect
  the one-unmerged-branch rule except zero file-overlap). Merge only after
  explicit operator approval in chat — never agent-claimed merge.
- Pre-existing master failures that reproduce unchanged on master are
  acceptable to note and continue; **stop and report** on genuinely new
  failures introduced by a PR.
- Do not expand into full suite green-washing or paid Provider spend for
  observation.

### 2.2 Orphan `running` inline runs

- Symptom already mitigated for site lockout by the 180 s inline lease
  (`count_active_runs`); root cause remains trigger-gated in
  [deferred-engineering-triggers-v1.md](../deferred-engineering-triggers-v1.md)
  Reviewed Item 8.
- Phase 2 ops: inventory M4 `run_records` with `status=running` and
  `execution_pattern=inline` older than the lease; prefer a **read-only
  report**, then a small, explicit cleanup (mark-finished / failed) script or
  admin path that is **opt-in**, audited, and does not auto-terminate fresh
  runs. Do not weaken
  [runtime-provider-transaction-boundary-v1.md](../runtime-provider-transaction-boundary-v1.md).
- M4 sync/deploy already drains recent in-flight inline runs before API
  recreate (#1177); that is not a substitute for cleaning pre-lease orphans.

### 2.3 Portal 502 / busy UX polish

- When Cloud or the preview proxy returns 502 / overload / concurrency busy,
  Portal should show a plain, recoverable busy state (retry / later), not a
  blank or jargon page.
- Keep copy non-technical; no dashboard chrome on bind-style surfaces.
- Ship as a focused Portal PR after the highest-impact e2e debt is cleared or
  in parallel only when file overlap is zero.

## Phase 3 — Production readiness (later; user-gated)

- Only after Phase 2 debt is acceptably reduced and the operator asks.
- Production source branch remains `production`; never Deploy Production,
  host-mutate production, or promote without an **explicit human authorization
  of that exact action**.
- Treat M4 / CI / local green as candidate evidence only; keep receipts
  separate (local, CI, M4 candidate, merged, M4 accepted, production, human).

## Non-goals

- Manufacturing Provider traffic for dashboards.
- Changing the 180 s inline lease without a new human decision.
- Merging Dependabot or unrelated dependency bumps as part of this backlog
  unless the operator names them.
