# Workspace Target

This file explains how this workstation points Cloud deploy helpers at a remote
host **without putting real SSH targets in Git**.

Real host/user/domain values stay in a **local-only** secrets file under
`.deploy-secrets/` (gitignored). The tracked loader
`deploy/workspace-target.env.sh` prefers that file, then falls back to
placeholders.

## One-time local setup (keeps `source deploy/workspace-target.env.sh` working)

```bash
mkdir -p .deploy-secrets
chmod 700 .deploy-secrets
cp deploy/workspace-target.env.example .deploy-secrets/workspace-target.env.sh
chmod 600 .deploy-secrets/workspace-target.env.sh
# Edit the secrets file: set real NPCINK_CLOUD_DEPLOY_SSH_HOST / _USER /
# BASE_URL / DOMAIN_NAME. Do not commit it.
```

After that, existing commands are unchanged:

```bash
source deploy/workspace-target.env.sh
pnpm run deploy:ssh -- --skip-bundle-build --skip-seed
```

### Override without editing the secrets file

Export the same variables in your shell first; the secrets file and placeholders
use `${VAR:-…}` so pre-exported values win:

```bash
export NPCINK_CLOUD_DEPLOY_SSH_HOST='…'
export NPCINK_CLOUD_DEPLOY_SSH_USER='…'
source deploy/workspace-target.env.sh
```

### What must never land in Git

- Production / staging SSH host IPs or hostnames used as deploy targets
- SSH passwords, private keys, or identity file paths that contain secrets
- Production `.env.deploy` / provider tokens / DB credentials

SSH credentials remain operator-held (agent, password prompt, or
`NPCINK_CLOUD_DEPLOY_IDENTITY_FILE` outside Git).

## Saved launcher files

| Path | Role |
| --- | --- |
| `deploy/workspace-target.env.sh` | Tracked loader (source this) |
| `deploy/workspace-target.env.example` | Template to copy into `.deploy-secrets/` |
| `.deploy-secrets/workspace-target.env.sh` | Local real target (gitignored) |
| `.env.deploy` | Deploy env template / protected env (not for secrets in Git) |
| `deploy/bind-domain-to-ssh-host.sh` | Host nginx bind helper |

## Current deploy loop

Local inner loop:

```bash
pnpm run test
pnpm run check:perimeter
pnpm run smoke:local-alpha
```

Bundle replay before remote deploy:

```bash
pnpm run check:e2e:deploy-bundle:smoke
```

Fast remote iteration after local checks pass:

```bash
source deploy/workspace-target.env.sh
pnpm run deploy:ssh -- --skip-bundle-build --skip-seed
```

If env values changed, apply them through the same governed release:

```bash
source deploy/workspace-target.env.sh
pnpm run deploy:ssh -- --env-file /absolute/path/to/protected.env.deploy
```

## Current release verification

- `pnpm run check:e2e:deploy-bundle:smoke`
- `pnpm run deploy:ssh`
- `GET ${NPCINK_CLOUD_BASE_URL}/health/live`
- `GET ${NPCINK_CLOUD_BASE_URL}/`
- `GET ${NPCINK_CLOUD_BASE_URL}/portal/login`

Formal release gating follows `deploy/RELEASE_CHECKLIST.md`.

Portal verification:

```bash
source deploy/workspace-target.env.sh
pnpm run portal:bind:ssh -- --site-id <site-id> --member-email <email>
pnpm run portal:smoke:ssh -- --site-id <site-id> --member-email <email>
```

Dev-only development-code verification uses `deploy/dev/`:

```bash
source deploy/workspace-target.env.sh
bash deploy/dev/remote-portal-login-code-smoke.sh --site-id <site-id> --member-email <email>
```

Short runbooks:

- `docs/archive/plans/cloud-mvp-ops-runbook.md`
- `docs/archive/plans/cloud-mvp-acceptance-receipt-2026-03-23.md`

Portal verification should always use explicit real-site bootstrap and the
portal smoke helper.

## Historical note

Older evidence docs may still mention retired hosts or domains. Do not copy
those into `.deploy-secrets/` or new smoke commands; treat dated history as
non-authoritative for the live target.
