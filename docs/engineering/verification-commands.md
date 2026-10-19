# Verification Commands (Cloud)

Status: active command pointer. Only lists entry points that exist in this
repository’s `package.json`, `Makefile`, or named scripts. Prefer the narrowest
gate for the changed seam.

If a command’s environment is unclear, open its `owner_doc` via
[engineering-command-inventory-standard-v1.md](../engineering-command-inventory-standard-v1.md)
and `config/engineering-command-inventory-v1.json`. Do not invent aliases.

## Router (choose a gate)

```bash
pnpm run check:changed -- --plan
pnpm run check:changed -- --doctor
pnpm run check:changed
```

Implementation: `scripts/check_changed.py` (also uses
`config/ai-development-validation-rules-v1.json`).

## Common local gates (real scripts)

| Intent | Command | Notes |
| --- | --- | --- |
| Fast contract + domain | `pnpm run check:fast` | Docker compose `test:contract` + `test:domain` |
| API / perimeter | `pnpm run check:seam` | `test:api` then `check:perimeter` |
| Perimeter only | `pnpm run check:perimeter` | `make perimeter` |
| Anti-drift | `pnpm run check:anti-drift` | Node scripts under `scripts/` |
| Local verify bundle | `pnpm run verify:local` | `scripts/verify-local.sh` |
| Doc links | `pnpm run check:doc-reachability` | `scripts/check_doc_reachability.py` |
| PR body contract tests | `pnpm run test:pr-body-contract` | `scripts/test-pr-body-contract.py` |
| Release policy check | `pnpm run check:release-policy` | `scripts/check-release-policy.sh` |
| Frontend typecheck | `pnpm run frontend:type-check` | frontend `tsc` |
| Frontend unit (vitest) | `pnpm --dir frontend run test:unit` | requires frontend deps |
| Worktree inventory | `pnpm run worktree:audit` | read-only |

Python lint/type via Docker: `pnpm run lint` (ruff + mypy through compose).

## Admin UI (only when Admin surfaces change)

```bash
pnpm run check:admin-ui
pnpm run check:admin-ui:visual
```

## Publish / production (authorization required)

```bash
pnpm run pr:publish -- --title "<title>" --body-file <path>
pnpm run production:release:preflight -- --sha <production-sha>
```

Production Deploy remains a separate human-approved workflow. See
[cloud-production-release-policy-v1.md](../cloud-production-release-policy-v1.md)
and [deploy/RELEASE_CHECKLIST.md](../../deploy/RELEASE_CHECKLIST.md).

## WordPress editor readiness (when that seam changes)

```bash
pnpm run wordpress:editor:readiness -- --json
```

Follow [wordpress-editor-readiness-runbook-v1.md](../wordpress-editor-readiness-runbook-v1.md).
Do not treat readiness alone as adoption-quality proof.

## TODO / look elsewhere

- Full M4 preview and slot procedures: root
  [agents-session-protocol-detail.md](agents-session-protocol-detail.md) and
  [m4-preview-ai-development-standard-v1.md](../m4-preview-ai-development-standard-v1.md)
- Cross-repo matrix: owned by Workflow Toolbox (`composer quality:matrix`); not
  duplicated here
- Live-site / production smoke scripts under `scripts/live-site-*.py` and
  `deploy/*smoke*`: use only with explicit targets and secrets; not default
  Phase 1 agent work
