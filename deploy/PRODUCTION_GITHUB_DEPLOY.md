# Production GitHub Deploy

This repository uses `production` as the production release source for
`https://cloud.npc.ink`. Protect the branch when the GitHub plan/repository
visibility supports branch protection rules.

The current early-validation process gate is
[`docs/cloud-production-release-policy-v1.md`](../docs/cloud-production-release-policy-v1.md).
Run it locally with:

```bash
pnpm run check:release-policy
```

## Branch Model

- `master`: development integration branch.
- `production`: production release branch.
- feature branches: merge into `master` first, then promote to `production`.

Do not edit production application code directly on the server. Production
server edits are limited to runtime secrets and emergency break-glass fixes that
are immediately backported to Git.

## GitHub Actions

`Cloud CI` runs on pull requests, `master`, `main`, and `production`.

Pull requests use a targeted backend gate by default: release-policy contract,
anti-drift checks, changed Python quality, contract tests, and changed pytest
files. High-risk backend surfaces escalate to the full backend gate. Pushes to
`master`, `main`, and `production` also use the full backend gate before release
promotion or deploy.

The public backend release check remains named `backend`, but it is an aggregate
gate. It depends on backend scope classification, the targeted PR gate when a
targeted gate is enough, or the full backend path split into `backend-static`
and three `backend-pytest` shards when the full gate is required. The pytest
shards are selected from `ci/pytest-backend-durations.json`, which is generated
from real JUnit timing artifacts rather than hand-picked test names.

Full backend runs upload `pytest-backend-timing-shard-*` artifacts containing
each shard's JUnit report and selected file list, then write slow-test tables to
the job summary.

On `production` push events, `Cloud CI` runs `backend` and `frontend` first,
then runs the `deploy-production` job only after both pass. `Deploy Production`
is a manual fallback workflow only, and must be run from the `production`
branch. The deploy jobs are bound to the GitHub Environment named `production`;
add environment approval rules when the GitHub plan supports them.
After a successful production deploy, `Cloud CI` runs `post-production-smoke`.
That job runs the small-customer preflight automatically. It runs the formal
release smoke too when the optional release-smoke secrets are configured; if
they are missing, the job summary records the skip without printing secret
values.

Exception: if a `production` push changes only `site/terms/*`, `Cloud CI` uses
the static terms fast path. That path skips backend/frontend/full Docker
deployment, uploads only the checked-in `site/terms` tree to the current release,
and verifies `/terms`, `/terms/en/terms.html`, `/terms/zh/terms.html`,
`/terms/styles.css`, and `/health/live`.

The production deploy job:

1. Builds the production Docker image bundle.
2. Uploads the exact bundle and, when supplied, the env file as separate
   protected incoming objects. The release payload never contains `.env.deploy`.
3. Installs the selected env source at
   `${REMOTE_DIR}/.release-state/<release-name>/env.deploy`; the two state
   directories are mode `0700` and the env file is mode `0600`.
4. Resolves both old and new Compose project names, verifies the actual old
   writer labels, and rejects drift before the first image or container mutation.
5. Prepares exact images, stops old public/write services, and starts or retains
   only PostgreSQL and Redis.
6. Runs migration and provider refresh through staged one-off API containers
   with `--pull never`.
7. Moves `current` atomically, starts API, then starts the three workers.
8. Proves each new worker container is stable and each heartbeat is newer than
   the cutover cutoff, then verifies generic `/health/operational-ready`.
9. Restores frontend/proxy traffic and verifies public static legal pages,
   including `/terms/en/terms.html`.

The exact bundle contains the application outputs, the optional frontend output,
deploy scripts, Compose files, static site files, and every locked external
runtime image when external images are enabled. Worker, callback-worker, and
ops-worker services reuse the app image and are tagged on the release host. The
only locked external runtime inputs are Redis and NGINX; Caddy, Jaeger, and the
OpenTelemetry Collector are not part of the release bundle or image lock.
Secret/config state is external to that payload and must not be added to its
archive manifest.

`--skip-frontend-image` preserves an existing frontend only. It fails before
mutation when there is no previous managed release or no single running
frontend to preserve; it is never a first-deploy shortcut.

For offline or first-host bootstrap bundles, set:

```bash
NPCINK_CLOUD_INCLUDE_EXTERNAL_IMAGES=1
```

The GitHub deploy path also enables BuildKit GitHub Actions cache for app and
frontend Docker builds.

After each release, capture job timing with:

```bash
pnpm run release:timing -- <github-actions-run-id>
pnpm run release:timing --from-file /tmp/github-run.json
pnpm run release:junit-timing -- artifacts/pytest-backend-shard-1.xml
```

Use the report to separate approval wait time from actual CI, bundle upload, and
remote readiness time. `gh pr checks` can show long-running jobs as `pending 0`;
prefer this timing report or `gh run view --json jobs` when comparing release
duration.

The static terms fast path runs:

```bash
pnpm run deploy:static-terms:ssh
```

Use it only for public static legal/policy page content under `site/terms/*`.
Any proxy, compose, application, API, provider, database, or runtime change must
use the full production deploy path.

## GitHub Secrets

Configure these repository or environment secrets:

```text
PROD_SSH_HOST=120.24.237.214
PROD_SSH_USER=deploy
PROD_SSH_PORT=22
PROD_SSH_KEY=<private key for deploy user>
PROD_REMOTE_DIR=/opt/npcink-ai-cloud
PROD_BASE_URL=https://cloud.npc.ink
```

Optional formal release-smoke secrets for automatic `post-production-smoke`:

```text
NPCINK_CLOUD_INTERNAL_AUTH_TOKEN=<internal readiness token>
NPCINK_CLOUD_ADMIN_BOOTSTRAP_TOKEN=<admin bootstrap token>
NPCINK_CLOUD_RELEASE_MEMBER_EMAIL=<invited release member email>
NPCINK_CLOUD_PORTAL_LOGIN_CODE=<one valid release login code>
NPCINK_CLOUD_RELEASE_SITE_ID=<runtime smoke site id>
NPCINK_CLOUD_RELEASE_KEY_ID=<runtime smoke key id>
NPCINK_CLOUD_RELEASE_KEY_SECRET=<runtime smoke key secret>
```

Keep production runtime secrets outside every release payload in the matching
per-release state file:

```text
/opt/npcink-ai-cloud/.release-state/<release-name>/env.deploy
```

`/opt/npcink-ai-cloud/current` selects code only. Its basename selects the
corresponding protected state directory. Both `.release-state` and its release
child are mode `0700`; `env.deploy` is mode `0600`. A separately uploaded env is
staged under the protected incoming directory and installed here before Compose
runs; it is never extracted into the release directory.

Do not put database passwords, SMTP passwords, provider API keys, portal JWT
secrets, or internal auth tokens in GitHub Actions unless you intentionally move
to a managed secret store.

## Production Runtime Shape

`docker-compose.runtime.yml` is the low-memory production runtime:

- `postgres`
- `redis`
- `api`
- `frontend`
- `worker`
- `callback-worker`
- `ops-worker`
- `proxy`

The trusted request chain is `external Edge -> bundled NGINX -> Gunicorn`.
The operator-owned Edge owns public `80/443`, certificates, TLS policy, DNS,
and any WAF/source restrictions. The Cloud bundle publishes no public `80/443`;
NGINX binds `8010` only on `127.0.0.1`. Runtime Compose requires all of the
following before it is a valid production entry point:

```text
NPCINK_CLOUD_EXTERNAL_EDGE_READY=true
NPCINK_CLOUD_BASE_URL=https://cloud.npc.ink
NPCINK_CLOUD_DOMAIN_NAME=cloud.npc.ink
```

The base URL must use HTTPS and its host must exactly match
`NPCINK_CLOUD_DOMAIN_NAME`.
The external Edge must replace inbound `X-Real-IP`, `X-Forwarded-For`,
`X-Forwarded-Proto`, `X-Forwarded-Host`, and `X-Forwarded-Port` values. NGINX
trusts real-client headers only from the pinned Compose gateway `172.28.0.1`;
Gunicorn trusts forwarded headers only from NGINX at `172.28.0.10`.

Public legal and policy pages under `/terms/*` are served as static files from
the checked-in `site/` directory by NGINX.
The frontend does not load `.env.deploy`; it receives only its explicit runtime
allowlist, including the server-side internal token required by the existing
admin proxy. Runtime-data encryption, bootstrap, admin-session,
service-settings, Portal JWT, database, and provider secrets stay in backend
containers only.

Production Compose does not run a trace collector or trace store. OTLP export
is optional for ordinary runtime operation. Formal release requires explicit,
operator-owned `NPCINK_CLOUD_OTEL_EXPORTER_OTLP_ENDPOINT` and
`NPCINK_CLOUD_OTEL_TRACE_QUERY_URL` values and evidence that a fresh Cloud trace
is queryable.

The exact-bundle smoke is the formal release workflow's plain-HTTP exception:
it may replay the artifact through loopback NGINX without an external Edge.
Never use that local smoke topology as a production public origin.

## First Migration to the External Edge

Before the first deploy of this topology:

1. Retain the previous exact bundle and matched database recovery point. Keep
   the retired Caddy container running while the host Edge is prepared.
2. Preinstall host NGINX and `curl`, then run
   `deploy/bind-domain-to-ssh-host.sh --prepare-only`. This installs the
   certificate, private key, and site configuration with restrictive
   permissions and runs `nginx -t`, but it does not start or restart host
   NGINX. The helper rejects a non-loopback upstream, an invalid or near-expiry
   certificate, a mismatched or locally over-permissive private key, and an
   unhealthy inner ingress.
3. On the deployment host, record and stop only the running Caddy container IDs
   from the exact release Compose project:

   ```bash
   COMPOSE_PROJECT_NAME_EFFECTIVE="${NPCINK_CLOUD_COMPOSE_PROJECT_NAME:-${COMPOSE_PROJECT_NAME:-npcink-ai-cloud}}"
   mapfile -t RETIRED_CADDY_IDS < <(docker ps -q \
     --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME_EFFECTIVE}" \
     --filter "label=com.docker.compose.service=caddy")
   ((${#RETIRED_CADDY_IDS[@]} > 0))
   printf 'retired Caddy: %s\n' "${RETIRED_CADDY_IDS[@]}"
   docker stop "${RETIRED_CADDY_IDS[@]}"
   ```

4. Rerun `deploy/bind-domain-to-ssh-host.sh` without `--prepare-only`. The
   activation refuses to proceed if that project's Caddy is still running,
   starts host NGINX, and proves HTTPS through the exact host with a loopback
   resolution. If activation fails, the helper restores the previous host
   NGINX files and service state. Only after this succeeds may
   `NPCINK_CLOUD_EXTERNAL_EDGE_READY=true` be set.
5. Run the normal release loader. Confirm it reports
   `[ok] Retired bundle services are absent: caddy jaeger otel-collector` before
   public health verification.
6. Verify forwarded-header replacement, HTTPS, operational readiness, signed
   runtime execution, media upload
   and pull behavior, and external trace export/query evidence.

The loader uses orphan removal and then rejects a release project that still
contains a `caddy`, `jaeger`, or `otel-collector` container. Do not manually
rename a retired container to bypass this check.

If activation fails before the loader runs, stop host NGINX and restart only
the recorded `RETIRED_CADDY_IDS`. If the loader fails before migration and its
rollback evidence is complete, it may restore the matched previous application.
Once migration starts, it deliberately leaves application/write services
stopped and restores only the prior pointer; an operator must decide whether to
restore the matched previous bundle, external env state, database recovery
point, and Caddy route. Restore only one public ingress chain; do not start
Caddy beside host NGINX or attach retired observability containers to the
current release project.

## Promotion Flow

```text
local feature work
  -> PR to master
  -> Cloud CI passes
  -> PR master -> production
  -> Cloud CI passes on production
  -> GitHub Environment approval, when available
  -> Cloud CI deploy-production job
  -> operational-ready passes
```

The remote cutover order is fixed:

```text
prepare images
  -> stop old application/write services
  -> data services
  -> migration and provider refresh
  -> current pointer
  -> API readiness
  -> workers plus cutoff/container/heartbeat stability
  -> generic operational-ready
  -> frontend/proxy traffic
```

Before `prepare images`, both release env files must resolve the same Compose
project name. Migration and provider refresh are one-off, `--no-deps`,
`--pull never` executions of the staged API image. Once migration begins, a
failure is fail-closed: old application services are not automatically started
against the changed or partially changed schema. Recovery must prove that all
public/write services are stopped, `current` is restored, and a restricted
failure marker exists. If any recovery proof is incomplete, `.deploy-lock` is
retained for an operator. A successful deploy retains
`.release-state/<release-name>/env.deploy`, removes the temporary rollback-image map,
and removes private rollback tags.

Runtime configuration-only changes can normally be applied to the current
release's external `.release-state/<release-name>/env.deploy` and followed by a
container restart. This does not apply to
`NPCINK_CLOUD_RUNTIME_DATA_ENCRYPTION_SECRET` or
`NPCINK_CLOUD_RUNTIME_DATA_ENCRYPTION_KEY_ID`: never rotate either through the
ordinary deploy path because existing ciphertext must be re-encrypted while all
four writers are stopped. Code, policy, billing, governance, and provider
routing logic changes must go through Git.

## One-Time Runtime-Data Encryption Maintenance

This maintenance path is deliberately separate from the normal deployment
sequence above; it does not change the generic deploy scripts or their order.

Before the cutover, extract and load the bundle into a staged release without
switching `current`. A pure bundle does not contain `.env.deploy`; before any
Compose command, create the staged release's external state directory, copy the
protected current release state into it, and verify every permission. Never put
the copied env inside the staged release directory:

```bash
REMOTE_DIR=/opt/npcink-ai-cloud
STAGED_RELEASE="${REMOTE_DIR}/release-STAGED_RELEASE"
STAGED_RELEASE_NAME="$(basename "${STAGED_RELEASE}")"
CURRENT_RELEASE="$(readlink -f "${REMOTE_DIR}/current")"
CURRENT_RELEASE_NAME="$(basename "${CURRENT_RELEASE}")"
RELEASE_STATE_ROOT="${REMOTE_DIR}/.release-state"
RELEASE_STATE_DIR="${RELEASE_STATE_ROOT}/${STAGED_RELEASE_NAME}"
RELEASE_ENV_FILE="${RELEASE_STATE_DIR}/env.deploy"
ENV_SOURCE="${RELEASE_STATE_ROOT}/${CURRENT_RELEASE_NAME}/env.deploy"
umask 077
install -d -m 0700 "${RELEASE_STATE_ROOT}" "${RELEASE_STATE_DIR}"
if [ ! -f "${ENV_SOURCE}" ]; then
  # one-time transition for the currently deployed legacy host only. This
  # creates external release state; it is not a continuing runtime fallback.
  LEGACY_ENV_SOURCE="${REMOTE_DIR}/.env.deploy"
  test -f "${LEGACY_ENV_SOURCE}"
  test "$(stat -c '%a' "${LEGACY_ENV_SOURCE}")" = "600"
  install -d -m 0700 "${RELEASE_STATE_ROOT}/${CURRENT_RELEASE_NAME}"
  install -m 600 "${LEGACY_ENV_SOURCE}" "${ENV_SOURCE}"
fi
test -f "${ENV_SOURCE}"
install -m 600 "${ENV_SOURCE}" "${RELEASE_ENV_FILE}"
test "$(stat -c '%a' "${RELEASE_STATE_ROOT}")" = "700"
test "$(stat -c '%a' "${RELEASE_STATE_DIR}")" = "700"
test "$(stat -c '%a' "${RELEASE_ENV_FILE}")" = "600"
export NPCINK_CLOUD_ENV_FILE="${RELEASE_ENV_FILE}"
export NPCINK_CLOUD_BACKEND_ENV_FILE="${RELEASE_ENV_FILE}"
cd "${STAGED_RELEASE}"
```

This legacy-root import is a one-time transition for the currently deployed
host, not a continuing compatibility path. Remove the root source after the
matched recovery/evidence window; every later release uses only its external
per-release state.

Do not call `deploy/deploy-to-ssh-host.sh`,
`deploy/remote-load-and-up.sh`, or another general deploy helper to prepare the
staged release; those paths switch `current` and/or start services before
re-encryption verification. Preserve a checksum-verified custom-format database backup,
verify restoration into a separate database, and retain the matching old code
revision and old key material. Keep the production `postgres` and `redis`
services running, stop and fence `api`, `worker`, `callback-worker`, and
`ops-worker`, and create a `0600` untracked maintenance env containing:

```text
NPCINK_CLOUD_RUNTIME_DATA_ENCRYPTION_SECRET=<target-secret>
NPCINK_CLOUD_RUNTIME_DATA_ENCRYPTION_KEY_ID=<target-key-id>
NPCINK_CLOUD_RUNTIME_DATA_OLD_ROOT_SECRET=<old-root-secret>
```

From the staged release directory, run every phase inside the newly loaded API
image. The host does not need application source or a Python environment:

```bash
docker compose --env-file "${RELEASE_ENV_FILE}" -f docker-compose.runtime.yml \
  run --rm --no-deps --env-from-file "${MAINTENANCE_ENV}" --pull never api \
  python -m app.dev.reencrypt_runtime_data inventory
docker compose --env-file "${RELEASE_ENV_FILE}" -f docker-compose.runtime.yml \
  run --rm --no-deps --env-from-file "${MAINTENANCE_ENV}" --pull never api \
  python -m app.dev.reencrypt_runtime_data dry-run \
    --old-root-env NPCINK_CLOUD_RUNTIME_DATA_OLD_ROOT_SECRET
docker compose --env-file "${RELEASE_ENV_FILE}" -f docker-compose.runtime.yml \
  run --rm --no-deps --env-from-file "${MAINTENANCE_ENV}" --pull never api \
  python -m app.dev.reencrypt_runtime_data apply \
    --confirm-maintenance-window \
    --old-root-env NPCINK_CLOUD_RUNTIME_DATA_OLD_ROOT_SECRET
docker compose --env-file "${RELEASE_ENV_FILE}" -f docker-compose.runtime.yml \
  run --rm --no-deps --env-from-file "${MAINTENANCE_ENV}" --pull never api \
  python -m app.dev.reencrypt_runtime_data verify
```

The first raw-ciphertext cutover omits `--old-key-id`. For future `rde.v1` to
`rde.v1` rotation, inventory declares the old key ID alone, while `dry-run` and
`apply` pair that same ID positionally with the old root:

```bash
export OLD_RUNTIME_DATA_KEY_ID=rde-previous-key-id
docker compose --env-file "${RELEASE_ENV_FILE}" -f docker-compose.runtime.yml \
  run --rm --no-deps --env-from-file "${MAINTENANCE_ENV}" --pull never api \
  python -m app.dev.reencrypt_runtime_data inventory --old-key-id "${OLD_RUNTIME_DATA_KEY_ID}"
docker compose --env-file "${RELEASE_ENV_FILE}" -f docker-compose.runtime.yml \
  run --rm --no-deps --env-from-file "${MAINTENANCE_ENV}" --pull never api \
  python -m app.dev.reencrypt_runtime_data dry-run \
    --old-root-env NPCINK_CLOUD_RUNTIME_DATA_OLD_ROOT_SECRET \
    --old-key-id "${OLD_RUNTIME_DATA_KEY_ID}"
docker compose --env-file "${RELEASE_ENV_FILE}" -f docker-compose.runtime.yml \
  run --rm --no-deps --env-from-file "${MAINTENANCE_ENV}" --pull never api \
  python -m app.dev.reencrypt_runtime_data apply \
    --confirm-maintenance-window \
    --old-root-env NPCINK_CLOUD_RUNTIME_DATA_OLD_ROOT_SECRET \
    --old-key-id "${OLD_RUNTIME_DATA_KEY_ID}"
```

Add multiple old-root/key-ID pairs only with preflight evidence.

Do not restart writers unless the new-key-only verification succeeds. Start
`api` and verify readiness first, then start the three workers and verify
their container identity, restart count, post-cutoff heartbeat, stability
window, and generic operational readiness before restoring frontend/proxy
traffic. Keep the verified target env in the staged release's external state
directory and preserve the prior release state unchanged for rollback. Remove
temporary old-key material and the `0600` maintenance env after the evidence window.
Normal runtime has no legacy or dual-read path; retain the migration-only tool
for future controlled rekeys.

Rollback requires the matching old database backup, old application revision,
and old key together. Once new-key writes exist, restoring only the environment
or only the code is not a valid rollback. The authoritative operator procedure
is `deploy/OPS_PLAYBOOK.md`.
