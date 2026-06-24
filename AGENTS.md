# AGENTS.md - Npcink AI Cloud

## Session Startup Protocol

Every AI development session should start with:

1. Run `git status --short --branch`.
2. Read `README.md`.
3. Read the relevant boundary docs before editing:
   - `docs/cloud-content-generation-boundary-v1.md`
   - `docs/cloud-task-pack-boundary-v1.md`
   - `docs/cloud-agent-workflow-metadata-registry-v1.md`
   - `docs/cloud-agent-feedback-quality-gate-v1.md`
4. Briefly report the focused module, relevant Cloud boundary, and intended
   verification gate before editing.

## Product Boundary

Npcink AI Cloud is the hosted runtime enhancement layer. It may own runtime
execution, provider adapters, usage and entitlement evidence, health
diagnostics, Site Knowledge runtime/detail, artifacts, and read-only runtime
metadata projections.

Cloud must not become a second WordPress control plane, second local ability
registry, second workflow registry, final approval/preflight/audit truth,
prompt/router/preset local truth, or WordPress write owner.

## AI Development Rules

- Write a compact change envelope before editing: target repositories, focused
  module, intended change, explicit non-goals, public contracts touched,
  expected files, files or areas that must not change, required gates,
  cross-repo matrix requirement, and rollback plan.
- Keep changes scoped to one module per session.
- Before staging, inspect `git status --short --branch` and `git diff --stat`.
  Stage only files changed for the current task. Do not use `git add -A` in a
  mixed worktree.
- Do not run `git reset --hard`, `git checkout -- .`, or equivalent destructive
  cleanup unless the user explicitly asks for that exact operation.
- Before committing, verify `git diff --cached --stat` and
  `git diff --cached --name-only`; after committing, verify
  `git show --name-status --stat HEAD`.
- For multi-repo milestones, run the central matrix from
  `/Users/muze/gitee/npcink-toolbox` instead of copying the script into Cloud:
  `composer quality:matrix` for status and `composer quality:matrix:run` before
  cross-repo closeout.

## Verification Gates

Default fast gate:

```bash
pnpm run check:fast
```

Additional gates by scope:

```bash
pnpm run check:seam
pnpm run check:perimeter
pnpm run check:anti-drift
pnpm run lint
```

Before finishing a code session, run the narrowest useful gate and report
exactly what passed or failed.
