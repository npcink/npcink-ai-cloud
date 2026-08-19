# Npcink AI Cloud

Npcink AI Cloud is the hosted runtime enhancement layer for Npcink AI. It
owns hosted execution, provider adapters, usage and entitlement evidence,
health diagnostics, artifacts, and bounded Cloud operator/customer surfaces.

It is not a second WordPress control plane, ability registry, workflow
registry, prompt/preset source of truth, approval system, or final WordPress
write owner.

## Current Focus

The current product focus is the normal WordPress Ability -> Addon -> Cloud
runtime -> hosted model -> reviewed editor-adoption loop. Keep only the usage,
error, provider, and quality evidence needed to prove that loop.

Until that loop has sufficient real evidence:

- do not expand broad Admin governance, dashboard, alert-ranking, or commercial
  front-office scope;
- do not generate paid provider calls solely to manufacture observation data;
- do not add orchestration infrastructure or move local WordPress truth into
  Cloud;
- report local, CI, M4 candidate, merged, M4 accepted, production, and human
  evidence as separate states.

Current revisions, PRs, M4 ownership, and release state are time-sensitive.
Inspect the current `origin/master`, active tasks, open PRs, and M4 status before
using a dated closeout record as present truth.

## Documentation

Use the [documentation index](docs/README.md) as the entry point for active
contracts, engineering standards, operator runbooks, plans, ADRs, and historical
evidence.

Start with:

- [Development and Validation Operating Model](docs/development-validation-operating-model-v1.md)
- [Single-Session Worktree Lifecycle](docs/single-session-worktree-lifecycle-v1.md)
- [Parallel AI Collaboration Standard](docs/parallel-ai-collaboration-standard-v1.md) — read only when the operator explicitly enables multi-session work
- [Cloud Content Generation Boundary](docs/cloud-content-generation-boundary-v1.md)
- [Cloud Production Release Policy](docs/cloud-production-release-policy-v1.md)
- [M4 Preview AI Development Standard](docs/m4-preview-ai-development-standard-v1.md)
- [Internal New-User Readiness Gate](docs/internal-new-user-readiness-gate-v1.md)
- [Internal Readiness Final Handoff — 2026-08-18](docs/internal-readiness-final-handoff-2026-08-18.md)
- [Refactor Master Plan](docs/refactor-master-plan-v1.md)
- [Refactor Deletion Inventory](docs/refactor-deletion-inventory-v1.md)
- [Formal-user Observability Consent and Site Support Standard](docs/production-observability-consent-and-site-support-standard-v1.md)
- [Formal-user Observability Development Retrospective](docs/production-user-observability-development-retrospective-2026-08-19.md)

`docs/decisions/` contains architectural decisions. Do not delete old ADRs;
supersede them with a newer decision. Dated acceptance, closeout, validation,
trial, and retrospective documents are evidence records unless an active
standard explicitly names them as current authority.

## Product Boundary

Cloud may own:

- hosted model catalog, routing profiles, provider execution, and runtime runs;
- site-scoped authentication, usage metering, entitlement, billing snapshots,
  and service-plane audit evidence;
- health, runtime diagnostics, provider diagnostics, and bounded operator
  actions;
- Site Knowledge runtime/detail, media artifacts, signed transfer, retention,
  and cleanup evidence;
- read-only runtime metadata and quality projections.

WordPress and the local Npcink stack continue to own:

- ability and workflow definitions;
- prompts, presets, local settings, and routing adoption;
- proposal review, approval, preflight, and final audit truth;
- WordPress object mutation, media import, and publication;
- final-write authority.

The public product exposes only two identity types: `platform_admin` and
`user`. `Principal`, `Account`, `Membership`, and `Site` remain separate
service resources; a WordPress user ID is external site-scoped metadata, not a
Cloud identity.

## Repository Layout

| Path | Responsibility |
| --- | --- |
| `app/` | FastAPI routes, domains, repositories, providers, and workers |
| `frontend/` | public, Portal, and bounded Admin Next.js surfaces |
| `tests/` | contract, API, domain, deployment, and security evidence |
| `migrations/` | Alembic history; historical revisions are retained |
| `scripts/` | development, validation, M4, and repository tooling |
| `deploy/` | governed release, recovery, smoke, and operator runbooks |
| `docs/` | active contracts, ADRs, plans, runbooks, and evidence records |
| `site/` | static public-service assets |

Generated `.venv/`, `node_modules/`, `.next/`, `dist/`, `.tmp/`, `.runtime/`,
test reports, caches, and `*.egg-info/` directories are local state, not source
truth.

## Quick Start

Requirements:

- Python 3.12
- Node.js and the repository-pinned pnpm version
- Docker for local runtime work

Bootstrap and start the local core stack:

```bash
cp .env.example .env
make bootstrap-dev
pnpm install --frozen-lockfile
pnpm run dev
```

`pnpm run dev` starts PostgreSQL, Redis, API, frontend, and the bundled proxy.
Add worker profiles only when the task needs them:

```bash
pnpm run dev:runtime
pnpm run dev:callback
pnpm run dev:ops
```

Useful local endpoints:

- `http://127.0.0.1:8010/health/live`
- `http://127.0.0.1:8010/admin/login`
- `http://127.0.0.1:8010/portal/login`

For setup, service settings, PostgreSQL 18, and production-style configuration,
follow the [first-install runbook](docs/cloud-first-install-rds-pg18-runbook.md)
instead of copying values from a dated evidence record.

## Development Workflow

Every development session starts by:

1. running `git status --short --branch`;
2. reading `AGENTS.md`, this README, the development operating model, and the
   relevant boundary document;
3. refreshing `origin/master` when the integration baseline matters;
4. using the current worktree when it is clean and current, otherwise using
   one clean locked `codex/*` task worktree;
5. inspecting shared M4 state before a mutating M4 operation;
6. declaring a compact change envelope before editing.

Use the narrowest validation lane that answers the changed seam:

| Scope | First useful gate | Runtime expectation |
| --- | --- | --- |
| Documentation/policy | links, formatting, focused policy contract | no M4 by default |
| Backend contract/domain | focused pytest, Ruff, mypy | source-only M4 sync when runtime behavior changes |
| API/auth/perimeter | focused API tests plus `check:perimeter` | focused M4 consumer proof |
| Frontend/Admin | type-check, targeted lint, UI contracts | browser gate; M4 only when the declared risk requires it |
| Dependency/Docker/Compose/deploy | focused contract and release checks | M4 deploy only when fingerprint requires it |
| CI-only | focused script/contract replay | GitHub Actions is the runtime |

Common commands:

```bash
pnpm run check:changed -- --plan
pnpm run check:changed -- --doctor
pnpm run check:changed
pnpm run worktree:audit
pnpm run test:contract
pnpm run test:domain
pnpm run test:api
pnpm run check:fast
pnpm run check:seam
pnpm run check:perimeter
pnpm run check:anti-drift
pnpm run lint
pnpm run frontend:type-check
pnpm run frontend:lint
```

The complete command catalog and lifecycle metadata live in
[`config/engineering-command-inventory-v1.json`](config/engineering-command-inventory-v1.json)
and the [Engineering Command Inventory Standard](docs/engineering-command-inventory-standard-v1.md).

## M4 Preview and Evidence

The authoring Mac owns source edits, Git, and operator commands. M4 owns routine
Cloud Docker build, runtime, migration, and focused integration evidence. M4
never becomes source truth.

Normal source flow:

```text
local verified
  -> M4 candidate
  -> PR required checks
  -> merged into master
  -> clean-master M4 promotion
  -> M4 accepted
```

Use the governed commands from the M4 standard:

```bash
pnpm run m4:preview:sync
pnpm run m4:preview:test -- --focused <test-path-or-node-id>
pnpm run m4:preview:status
pnpm run m4:preview:promote -- --pr <merged-pr-number>
```

Do not seize operation locks, recover/retry/fallback without authority,
silently substitute local Docker, or report a direct sync as accepted source.
When the operator explicitly enables multiple sessions, also apply the
parallel collaboration standard before sharing M4 or the protected merge lane.

Key M4 decisions and measurements remain directly discoverable:

- [ADR-024 validation authority](docs/decisions/024-risk-tiered-development-validation-authority.md)
- [ADR-025 checkpoint dispatch](docs/decisions/025-source-only-authoring-and-ai-m4-checkpoint-dispatch.md)
- [ADR-026 private source relay](docs/decisions/026-private-source-relay-transfer.md)
- [ADR-027 package proxy cache](docs/decisions/027-m4-package-proxy-streaming-cache.md)
- [Package proxy validation](docs/m4-package-proxy-streaming-cache-validation-2026-07-25.md)

## Target Refactor Contracts

These are the accepted target contracts for the P0-P5 refactor. They define the
WordPress-first through P5 direction; other CMS adapters are post-P5 validation work.
A target contract is not evidence that implementation is complete.

- [Refactor master plan](docs/refactor-master-plan-v1.md)
- [WordPress-first Cloud runtime decision](docs/decisions/004-wordpress-first-cloud-runtime-refactor.md)
- [Multi-platform connector boundary](docs/multi-platform-connector-boundary-v1.md)
- [Media runtime boundary](docs/media-runtime-boundary-v1.md)
- [Refactor deletion inventory](docs/refactor-deletion-inventory-v1.md)

Evidence records (not target-contract completion proof):

- [Pre-refactor baseline](docs/refactor-baseline-2026-07-14.md)
- [P5 hardening and release audit](docs/p5-hardening-release-audit-2026-07-17.md)
- [P5-B1 hosted-profile cutover](docs/p5-b1-hosted-profile-contract-cutover-2026-07-17.md)

Bounded provider-connection operations and hosted
runtime-profile configuration remain current Cloud responsibilities. Broader
model-governance surfaces are not implied by those bounded operations.

Negative boundary contracts also remain visible from the repository entry
point: [prohibited Cloud bulk article generation](docs/cloud-bulk-article-run-v1.md)
and the [local-schedule Nightly Intelligence boundary](docs/nightly-site-inspection-morning-brief-v1.md).

## Admin and Portal

The Admin surface is a dense PC-first operator workbench for accounts, sites,
plans, subscriptions, billing inspection, provider operations, runtime
diagnostics, audit, and commercial decisions. Follow the
[Admin UI Standard](docs/cloud-admin-ui-standard-v1.md),
[Frontend Engineering Standard](docs/cloud-admin-frontend-engineering-standard-v1.md),
and `frontend/admin-ui-manifest.json` before changing Admin UI.

The Portal is a bounded customer workspace for login, site connection, usage,
entitlements, billing, support, Cloud audit, health, and diagnostics. It must
not expose WordPress ability, workflow, approval, prompt, preset, or final-write
controls.

## Release and Operations

Development integration targets `master`; production source targets
`production`. A merge, green CI run, M4 acceptance, or successful liveness
probe does not by itself authorize production deployment.

Primary operator references:

- [Operations Playbook](deploy/OPS_PLAYBOOK.md)
- [Release Checklist](deploy/RELEASE_CHECKLIST.md)
- [Production Release Policy](docs/cloud-production-release-policy-v1.md)
- [Production WordPress Connector Smoke](docs/production-wordpress-ai-connector-smoke-runbook-v1.md)
- [Provider Connection Runbook](docs/provider-connection-production-runbook-2026-06-30.md)

Publish a focused pull request with the repository template:

```bash
pnpm run pr:publish -- \
  --title "fix: describe the focused change" \
  --body-file /absolute/path/to/completed-pr-body.md
```

Never bypass required checks, directly edit production application source, or
commit `.env`, `.env.deploy`, credentials, tokens, provider keys, database
passwords, SSH keys, or encryption roots.

## Secrets and Local State

- Keep development-only values in ignored `.env.local` when local Docker needs
  them.
- Configure provider connections and service settings through their current
  Admin surfaces; retired provider/service `.env` fallbacks must not return.
- Runtime-data encryption key rotation follows `deploy/OPS_PLAYBOOK.md`; it is
  not an ordinary environment edit.
- Test fixtures belong under `tests/fixtures/`; runtime output belongs under
  ignored `.runtime/` or `.tmp/` paths.
- Redact credentials and customer content from logs, receipts, screenshots,
  documentation, and PR bodies.

Canonical production configuration names include
`NPCINK_CLOUD_ADMIN_SESSION_SECRET`, `NPCINK_CLOUD_ADMIN_KEY`,
`NPCINK_CLOUD_OPS_CADENCE_POLL_SECONDS`,
`NPCINK_CLOUD_RUNTIME_CALLBACK_WORKER_POLL_SECONDS`,
`NPCINK_CLOUD_WORKER_HEARTBEAT_INTERVAL_SECONDS`,
`NPCINK_CLOUD_PROVIDER_HEALTH_SCAN_INTERVAL_SECONDS`,
`NPCINK_CLOUD_OTEL_EXPORTER_OTLP_ENDPOINT`, and
`NPCINK_CLOUD_OTEL_TRACE_QUERY_URL`. Values belong in the governed protected
configuration path, never in this document or source control.

The OpenAI provider ceiling defaults to 60 seconds so bounded long-form calls
can complete; shorter tasks remain constrained by the smaller value selected
for their own runtime path.

Remote Portal bootstrap may reuse an existing site and key, but key issuance is
host-local only and requires `NPCINK_CLOUD_SECRET` from a protected process
environment. The remote `portal:bind:ssh` wrapper intentionally rejects key issuance.

Every full remote deploy example requires the signed-smoke HMAC secret in the
protected process environment. It is intentionally not accepted on argv and
is not read from `.env.deploy`. Read it without echo in an interactive shell:

```bash
IFS= read -r -s NPCINK_CLOUD_SECRET
printf '\n'
export NPCINK_CLOUD_SECRET
```

Unset the value after the governed deploy finishes.

## Contribution Boundary

Keep one module per change, preserve dirty/shared work, stage exact files, and
report the highest evidence state actually reached. Before merging, review
correctness, security, compatibility, performance, and maintainability.

When documentation conflicts, use this precedence:

1. current code, tests, runtime evidence, and protected repository policy;
2. active boundary documents and ADRs;
3. active engineering standards and operator runbooks;
4. current plans and handoffs;
5. dated acceptance, closeout, validation, trial, and retrospective evidence.

Historical evidence explains how the project reached its present state. It
does not override current source or authorize a release.
