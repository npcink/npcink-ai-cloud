# Npcink AI Cloud Frontend Development

This document describes the current repository truth for the Cloud frontend.
Treat it as an execution guide for local development, verification, and bounded
surface changes.

## Scope

The current frontend owns three bounded surface families:

1. Top-level public pages (`/`, `/help`, `/privacy`, `/setup`, `/status`,
   `/terms`)
2. `/portal/*`
3. `/admin/*`

These surfaces share tokens and shell primitives, but they do not share the
same product voice:

- public pages: product, onboarding, setup, legal, and status surface
- portal: authenticated member workspace
- admin: operator / platform-admin surface

The frontend must not grow a second backend truth, a second session truth, or a
GA-style customer billing front-office narrative.

## Current Route Inventory

Verified against `frontend/src/app/**/page.tsx` on 2026-09-21.

### Public (top level)

- `/`
- `/help`
- `/privacy`
- `/setup`
- `/status`
- `/terms`

### Portal

- `/portal`
- `/portal/login`
- `/portal/register`
- `/portal/account`
- `/portal/usage`
- `/portal/billing`
- `/portal/audit`
- `/portal/sites/[siteId]`
- `/portal/support`
- `/portal/support/[requestId]`

### Admin

- `/admin`
- `/admin/login`
- `/admin/accounts` and `/admin/accounts/[accountId]`
- `/admin/sites/[siteId]`
- `/admin/subscriptions` and `/admin/subscriptions/[subscriptionId]`
- `/admin/plans`
- `/admin/credit-packs`
- `/admin/support-requests` and `/admin/support-requests/[requestId]`
- `/admin/audit`
- `/admin/coverage`
- `/admin/usage-statistics`
- `/admin/ai-advisor`
- `/admin/ai-resources`
- `/admin/agent-feedback`
- `/admin/external-services`
- `/admin/media-observability`
- `/admin/plugin-observability`
- `/admin/vector-observability`
- `/admin/vector-settings`
- `/admin/runtime-profiles`
- `/admin/service-settings`
- `/admin/site-compliance`
- `/admin/troubleshooting`

### BFF / Auth / Health Handlers

- `src/app/api/portal/[...path]/route.ts` (portal catch-all BFF)
- `src/app/api/admin/[...path]/route.ts` (admin catch-all BFF)
- `src/app/api/admin/advisor/*` (advisor ops-summary value, preview, review,
  history handlers)
- `src/app/api/setup/[...path]/route.ts`
- `src/app/api/health/route.ts`
- `src/app/admin/auth/login/route.ts`
- `src/proxy.ts`

There are no per-resource route handlers under
`src/app/api/portal/sites/**`; portal API traffic goes through the catch-all
BFF route.

## Actual Tech Stack

Versions below reflect `frontend/package.json` on 2026-09-21:

- Next.js `^16.3.5`
- React `^19.2.4`
- TypeScript `^5.9.3`
- Tailwind CSS `3.4.17`
- ESLint `^9` + `eslint-config-next` `^16.2.9`
- Playwright for screenshot and smoke coverage
- Docker local development via the repository root `docker-compose.dev.yml`

Current dev compose runs the frontend with:

```bash
pnpm exec next dev --webpack -H 0.0.0.0
```

Do not describe this setup as Turbopack or Tailwind 4 unless the implementation
is actually migrated.

## Environment Layout

Local development uses:

- `.env`
- `.env.local`

`.env.local` is for local-only debug credentials and is gitignored.
Production-style remote deploys use:

- `.env.deploy`

Do not move local debug tokens into deploy env files.

## Local Development

Preferred entrypoint from the repository root:

```bash
pnpm run dev
```

This runs `scripts/dev-compose.sh up --build`, the full dev compose stack.
The repository root owns the only dependency lock. `frontend/pnpm-lock.yaml`
must not exist. Bootstrap pnpm through the root `packageManager` declaration and
install the frontend workspace from the repository root:

```bash
corepack enable
corepack install
pnpm install --frozen-lockfile --filter frontend...
```

Local Docker and CI use the same root lock and frozen workspace install. When
`frontend/package.json` changes, refresh only the root `pnpm-lock.yaml` from
the repository root.

Local development URL:

- `http://127.0.0.1:8010`

If you need a non-default mini-dev hostname or tunnel endpoint, set
`NPCINK_CLOUD_FRONTEND_DEV_HOST_ALLOWLIST=host1,host2` before starting the
frontend (consumed by `frontend/next.config.mjs`). The default allowlist only
includes `127.0.0.1`, `localhost`, and `0.0.0.0`.

Compose roles:

- `frontend`: Next.js dev server
- `proxy`: unified development entry on `8010`
- `api`: portal/admin backend seam
- `worker`, `callback-worker`, `ops-worker`: async runtime queue workers
- `postgres` / `redis`: local state services
- `cloud-*-dev`: named volumes for artifacts, postgres, redis, frontend node
  modules, and the Next cache

## Frontend Verification

Run from the repository root:

```bash
pnpm run frontend:type-check
pnpm run frontend:lint
pnpm run check:visual:frontend
```

For changes under `frontend/src/app/admin/**` or
`frontend/src/components/admin/**`, the required admin gate is:

```bash
pnpm run check:admin-ui
```

Material admin layout, table, dialog, or shared-primitive changes must also
run `pnpm run check:admin-ui:visual`. See
`docs/cloud-admin-ui-standard-v1.md` and `frontend/admin-ui-manifest.json`.

Additional Cloud seam checks when the task touches auth, env, proxy, or BFF:

```bash
pnpm run test:api
pnpm run check:perimeter
```

## i18n Rules

- The product is bilingual-only: the locale type is `'en' | 'zh-CN'` with
  `zh-CN` as the default.
- A stored or browser `zh-TW` locale is intentionally mapped to `zh-CN` by
  `resolveLocale` in `src/lib/i18n.ts`. There is deliberately no independent
  zh-TW dictionary; `frontend/tests/unit/locale-options-contract.mjs` asserts
  this mapping and the absence of a zh-TW catalog.
- New visible copy must be added to `src/lib/i18n.ts`.
- Do not rely on fallback English for shipped or local-debug visible UI copy.

Minimum manual locale checks (switch the locale with the in-app locale
switcher, not URL parameters — locale persists via local storage and the
`npcink_locale` cookie):

- `http://127.0.0.1:8010/`
- `http://127.0.0.1:8010/portal/login`
- `http://127.0.0.1:8010/admin/login`

## Change Boundaries

Pure UI tasks usually stay inside:

- `src/app/**`
- `src/components/**`
- `src/features/**`
- `src/contexts/**`
- `src/hooks/**`

Escalate carefully when touching:

- `src/app/api/**`
- `src/lib/**`
- `src/proxy.ts`
- env or deploy wiring

Those files are not forbidden, but they are no longer UI-only changes and must
be validated against Cloud seams, not just visual output.
