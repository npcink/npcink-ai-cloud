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

**Measured baseline (2026-10-23 Asia/Shanghai):** a full local Playwright run
against `master` `244cab8f` (clean detached worktree, `pnpm run build` plus the
`playwright.config.ts` webServer) produced **261 passed / 3 failed / 2 skipped**
in 5.3m. The older “~50 failing” figure was **not** reproduced and must not be
quoted as present truth. `master` `6f651189` is the only commit on top of that
baseline and touches no frontend or e2e file, so the numbers still describe the
current tip.

- The CI-gated selection (“Critical frontend paths”: `admin-operator-path`,
  `admin-navigation`, `admin-acceptance-matrix`, `admin-ai-advisor-pc-v2`, the
  four-title `portal-workspace-path` grep, and the changed-visual selection) is
  green on the same tree. None of the three failures below are inside it.
- The 2 skips are intentional gates, not debt: `agent-workflow-metadata-smoke`
  requires `NPCINK_CLOUD_FRONTEND_BASE_URL`, and `setup-first-install` requires
  the dedicated `NPCINK_CLOUD_SETUP_STATE_OVERRIDE=pending` lane.

Residual failures, each re-run to confirm it reproduces deterministically:

- `frontend/tests/e2e/admin-account-site-runtime.spec.ts` expected the backend
  prose `runtime evidence unavailable`, but the UI renders the localized
  load-failure copy. **Stale assertion**: since
  [#1119](https://github.com/npcink/npcink-ai-cloud/pull/1119)
  `resolveUiErrorMessage` treats backend prose as diagnostic data rather than
  product copy. Realigned in this change (test-only edit).
- `frontend/tests/e2e/portal-workspace-path.spec.ts` expected the audit scope
  description as page text. **Stale assertion**: since
  [#1198](https://github.com/npcink/npcink-ai-cloud/pull/1198) that description
  moved into the quiet header ⓘ hint, whose copy mounts only while the hint is
  open. Realigned in this change (test-only edit).
- `frontend/tests/e2e/portal-login.spec.ts` failed the `portal-register-current`
  screenshot baseline with ≈3% drift (35 680 px). **Deferred by design**:
  darwin-only baseline, and the spec is outside the CI e2e selection, so no
  `-linux` baseline exists.

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
- The runtime queue worker now applies a bounded auto-fail to inline runs stuck
  beyond `RUNTIME_STALE_RUNNING_AUTO_FAIL_AFTER_SECONDS`: it writes
  `runtime.stale_running_auto_failed` only after a row-lock recheck, creates no
  Provider usage, and lets the normal terminal callback fire. The effective
  threshold is per run — never shorter than 30 minutes and extended by the
  run's configured timeout/retry budget so a live Provider call is not raced.
- Phase 2 ops: keep the **read-only** inventory
  (`scripts/list-stale-inline-running-runs.py`) for M4 observation and use the
  operator `mark_stale_running_failed` path for rows inside the grace window.
  Do not weaken
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
