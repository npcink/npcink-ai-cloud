# AGENTS.md — Npcink AI Cloud

> 中文：本文件约束**所有** AI 编码代理（工具无关）。人类只做验收与生产授权。先读本文件，再按需打开链接细则。

**Read this file first** before editing. Tool-agnostic. Humans accept; agents implement.

## Current goal (Phase 1)

Prove the WordPress editor loop with real evidence:

`WordPress Ability → Cloud Addon → Cloud runtime → hosted model → reviewed editor adoption → bounded feedback`

Keep only usage, error, provider, and quality evidence needed for that loop.
Details: [phase-1-scope.md](docs/engineering/phase-1-scope.md),
[README Current Focus](README.md#current-focus),
[early-product-validation-and-minimal-telemetry-standard-v1.md](docs/early-product-validation-and-minimal-telemetry-standard-v1.md),
[wordpress-ai-loop-verification-checklist-2026-09-22.md](docs/wordpress-ai-loop-verification-checklist-2026-09-22.md).

Paused product entrypoints (retain code; do not re-enable via settings):
[reversible-feature-pauses-v1.md](docs/reversible-feature-pauses-v1.md),
[seo-specialist-pause-v1.md](docs/seo-specialist-pause-v1.md).

Commercial freeze (Phase 1): plans / credit-packs / subscriptions / orders / payments are
**frozen for new development** — do not start new commercial features, and do not delete or
disable the existing code. This is a development freeze, **not** a runtime pause: existing
commercial reads and credit/entitlement paths stay operational. Reversal is a human decision.

## Follow-on (Phase 2–3)

After Phase 1 loop evidence: continue Phase 2 portal e2e triage (assertion
batches through #1196 merged; screenshot baseline + residual failures need a
fresh master re-scan — see follow-on §2.1), watch the bounded auto-fail for
orphan `running` inline runs (the lease prevents lockout; the worker fails a
row after a per-run grace of at least 30 minutes), and polish Portal 502/busy
UX. Production Deploy stays human-gated.
Details: [phase-2-3-follow-on-v1.md](docs/engineering/phase-2-3-follow-on-v1.md).
Deferred orphan root-cause remains trigger-gated in
[deferred-engineering-triggers-v1.md](docs/deferred-engineering-triggers-v1.md)
Reviewed Item 8.

## Product boundary

Cloud owns hosted runtime execution, providers, usage/entitlement evidence,
health, Site Knowledge runtime/detail, artifacts, and read-only projections.

Cloud must **not** become a second WordPress control plane, ability/workflow
registry, approval/preflight/audit truth, prompt/router/preset owner, or
WordPress write owner. See [cloud-content-generation-boundary-v1.md](docs/cloud-content-generation-boundary-v1.md).

## Cross-repo floors (最低配)

跨仓发版/联调以 [docs/compatibility-matrix.md](docs/compatibility-matrix.md) 为单一真相源；Cloud 发版须更新该表一行；不做运行时硬拒。
决策摘要见同文档「决策摘要」节（一人开发不做运行时硬拒；契约变更默认旧契约保留约 3 个 Cloud 小版本后硬切、不做长期双契约；边界 Toolbox/编排门户/Addon；联调：Cloud 走 M4/`m4:preview:sync`+Air 隧道 `127.0.0.1:18010`，Addon/Toolbox 本机 symlink 不进 M4，纯 PHP 默认不同步 M4；有痛再完善）。

跨仓联调排障从 Cloud/门户往下时，优先用 `run_id` 关联；勿用 Toolbox/Addon 本地可读 trace（如 `web_search_*`）直接搜 Cloud（会与 Cloud 侧 `traceparent` hex/hash 对不上）。后续有痛再完善；不改 runtime/trace 代码。

## Hard stops (ask a human)

- No production Deploy, host mutation, or `production` promotion unless a human
  explicitly authorizes that exact action.
- No secrets in Git, PR bodies, logs, or chat.
- No paid Provider spend solely to manufacture observation data.
- No second CMS (Typecho/Hexo/Astro) in Phase 1.
- Do not treat M4 / CI / local green as production proof.
- Do not `git reset --hard` / wipe mixed worktrees unless the human names that
  exact operation.

## Session start (minimum)

1. `git status --short --branch`
2. Read this file and [README.md](README.md)
3. Open only the seam docs for the change; route with
   `pnpm run check:changed -- --plan <expected-files...>` when useful
4. State focused module, non-goals, and verification gate before editing

Default: one session, one module. Multi-session only when the operator declares
it: [parallel-ai-collaboration-standard-v1.md](docs/parallel-ai-collaboration-standard-v1.md).
Worktrees: [single-session-worktree-lifecycle-v1.md](docs/single-session-worktree-lifecycle-v1.md).
Lanes (development / merge / release):
[development-validation-operating-model-v1.md](docs/development-validation-operating-model-v1.md).

## Definition of Done

[docs/engineering/definition-of-done.md](docs/engineering/definition-of-done.md)

## PR contract

Required human headings (CI-enforced): **Scope**, **Boundary**, **Verification**,
**Risk**. See [docs/engineering/pr-contract.md](docs/engineering/pr-contract.md),
[docs/pr-and-dependency-update-policy.md](docs/pr-and-dependency-update-policy.md),
[`.github/pull_request_template.md`](.github/pull_request_template.md).
Prefer `pnpm run pr:publish` over ad-hoc bodies that drop headings.

## Verification commands

[docs/engineering/verification-commands.md](docs/engineering/verification-commands.md) —
only repository-real entry points. Prefer the narrowest gate for the seam.
Inventory governance: [engineering-command-inventory-standard-v1.md](docs/engineering-command-inventory-standard-v1.md).

## Evidence / receipts

Report local, CI, M4 candidate, merged, M4 accepted, production, and human
evidence as **separate** states. Do not collapse them.
Closeout and runbooks live under `docs/` and `docs/history/`; dated closeouts
are not automatic present truth unless an active standard names them.

## AI Production Operation Rules

Normative detail: [cloud-production-release-policy-v1.md](docs/cloud-production-release-policy-v1.md)
and [agents-session-protocol-detail.md](docs/engineering/agents-session-protocol-detail.md).

- Production source branch is `production`; development integration branch is
  `master`.
- New work branches must start from the latest `master`; never branch off an
  unmerged branch. Keep at most 1 unmerged branch per repo (exception: changes
  with zero file overlap may each branch from `master`).
- Do not directly edit production application code on the server.
- Any emergency server fix must be backported to Git before the next deploy.
- Do not commit SMTP passwords, provider keys, database credentials, internal
  tokens, SSH keys, or `.env.deploy`.
- Do not push or deploy to Gitee. Current project source control is GitHub-only.
- After changing release policy, run `pnpm run check:release-policy`.
- Never Deploy Production unless a human explicitly authorizes that exact action.

## Security review anti-false-positive checklist

When reporting security / system findings, follow this to avoid overstating risk:

1. **Label scope before severity** — each finding must say production / local-dev /
   smoke-only / default-value-only. Call **严重** only when the public surface is
   exploitable without misconfiguration theater.
2. **Compare same-repo counterexamples** — if another compose/path already binds
   loopback or uses strong secrets, treat the weak copy as debt, not “全线裸奔”.
3. **Secrets need two-step evidence** — (a) tracked in the current tree, and
   (b) present in full Git history (or `gitleaks --all`). Without (b), do not claim
   “可能泄密”. Host/IP/`root` in a public repo is **target exposure**, not key leak.
4. **Defaults ≠ live prod** — weak `config` defaults or empty `${VAR:-}` passthrough
   are misconfig footguns unless prod `env_file` / ops is shown to use them.
5. **Severity table** — **严重**: public exploit or confirmed real secret/private key
   in history; **中等**: needs LAN / misconfig / rolling window; **改进**: defense-in-depth,
   doc drift, missing non-secret keys.
6. **Tone** — if tests/prod login were not run, write “未核实”. Do not say “沦陷” /
   “裸奔” unless production entry is internet-facing and unauthenticated.
7. **Remediation scope** — by default land only **public-surface exposure** and
   **local-dev / smoke footgun** fixes (e.g. real SSH targets out of Git, bind
   loopback). Do **not** treat hardening (prod healthchecks, per-secret hash salts,
   CSP enforce, rejecting `*_API_KEY` env, Next security headers, weak-default
   startup guards, etc.) as the same default action; propose them separately and
   implement only after explicit user approval.

## Deferred security follow-ups (opt-in)

Do **not** start these unless the operator explicitly asks. Session closeout and
rationale:
[docs/history/engineering/2026/security-review-scoped-remediation-closeout-2026-10-23.md](docs/history/engineering/2026/security-review-scoped-remediation-closeout-2026-10-23.md).

- CSP enforce (Admin/Portal split; keep Report-Only until approved)
- Historical public-repo IP scrub (`git filter-repo`) — only with fork/mirror plan
- Small hardening leftovers (Next security headers, weak-default startup guards,
  env-key alignment, direct `cryptography` dependency)
- Go-live **acceptance checklist** for already-merged remediations (healthy
  probes, Admin-held provider keys, no non-empty prod `*_API_KEY`) — verification,
  not an automatic production deploy
- Unrelated business PRs (e.g. Portal #1199) stay on their own track

## Local deploy target and loopback conventions

Keep workstation UX easy without putting real SSH targets in Git:

- Real `NPCINK_CLOUD_DEPLOY_SSH_*` / domain values live in
  `.deploy-secrets/workspace-target.env.sh` (gitignored). One-time:
  copy `deploy/workspace-target.env.example` there, then keep using
  `source deploy/workspace-target.env.sh`.
- Tracked `deploy/workspace-target.env.sh` is a loader + placeholders only.
  Details: [deploy/WORKSPACE_TARGET.md](deploy/WORKSPACE_TARGET.md).
- Local `docker-compose.dev.yml` publishes Postgres/Redis/proxy on `127.0.0.1`
  only; URLs stay `http://127.0.0.1:8010`. Optional
  `NPCINK_CLOUD_DEV_POSTGRES_PASSWORD` in `.env`.
- Deploy-bundle smoke Postgres must bind loopback
  (`NPCINK_CLOUD_DEPLOY_SMOKE_POSTGRES_BIND`, default `127.0.0.1`).
- Do not commit real host IPs into docs or tracked env files; public product
  origin `https://cloud.npc.ink` in ops docs is fine. Dated `docs/history/**`
  may mention retired hosts — do not copy them into `.deploy-secrets/`.

## Detailed procedures (do not duplicate here)

Long session, M4, and gate procedures:
[docs/engineering/agents-session-protocol-detail.md](docs/engineering/agents-session-protocol-detail.md)

Docs index: [docs/README.md](docs/README.md)
