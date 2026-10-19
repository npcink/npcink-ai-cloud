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

## Product boundary

Cloud owns hosted runtime execution, providers, usage/entitlement evidence,
health, Site Knowledge runtime/detail, artifacts, and read-only projections.

Cloud must **not** become a second WordPress control plane, ability/workflow
registry, approval/preflight/audit truth, prompt/router/preset owner, or
WordPress write owner. See [cloud-content-generation-boundary-v1.md](docs/cloud-content-generation-boundary-v1.md).

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
- Do not directly edit production application code on the server.
- Any emergency server fix must be backported to Git before the next deploy.
- Do not commit SMTP passwords, provider keys, database credentials, internal
  tokens, SSH keys, or `.env.deploy`.
- Do not push or deploy to Gitee. Current project source control is GitHub-only.
- After changing release policy, run `pnpm run check:release-policy`.
- Never Deploy Production unless a human explicitly authorizes that exact action.

## Detailed procedures (do not duplicate here)

Long session, M4, and gate procedures:
[docs/engineering/agents-session-protocol-detail.md](docs/engineering/agents-session-protocol-detail.md)

Docs index: [docs/README.md](docs/README.md)
