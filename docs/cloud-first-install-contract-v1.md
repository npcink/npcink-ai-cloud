# Cloud First Install Contract v1

Status: active.

## 1. Purpose

Define the only supported production first-run path for Npcink AI Cloud:

`deploy -> prove host control -> validate empty PostgreSQL 18 -> migrate -> generate secrets -> reveal admin key once -> activate runtime`

This is infrastructure bootstrap for the hosted runtime. It is not a WordPress,
CMS, provider, payment, or workflow configuration console.

## 2. Installation state

The canonical installation state is a protected host file, not database reachability:

- `pending`: setup is available; ordinary Cloud surfaces fail closed;
- `initializing`: one installer owns the exclusive lock; other writes conflict;
- `complete`: runtime configuration is authoritative and setup writes are gone.

An ordinary validation or migration failure returns to `pending` while retaining
only bounded, non-secret interrupted-attempt evidence. A completed installation
never returns to `pending` automatically. Database failure after completion is a
runtime outage and recovery event.

`GET /setup/v1/state` remains available after completion and returns only the
minimal `complete` projection required by the frontend gateway. The `/setup`
page and all other setup endpoints return `404 setup.already_complete` after
completion.

## 3. Bootstrap and runtime configuration

The shared host configuration directory is mounted at `/run/npcink-config`:

| File | Contents | Mode |
|---|---|---:|
| `runtime-config.json` | RDS components and required runtime roots | `0600` |
| `install-state.json` | state, setup revision, timestamps, config digest | `0640` |
| `rds-ca.pem` | RDS server CA chain | `0600` |
| `setup-auth.json` | setup-code digest and transient session root | `0600` |

Writes use a same-filesystem temporary file, file `fsync`, atomic rename, and
directory `fsync`. Secret values are never passed through a shell command,
command-line argument, URL, log field, response error detail, or browser storage.

In production, `runtime-config.json` is the sole authority for the database and
root signing/encryption/session values. Duplicate production values in the
environment fail validation instead of silently overriding the file. Development
and test modes may explicitly use the existing environment source.

## 4. Setup authentication

The deployment helper generates:

- `nca_setup_` plus 32 random bytes encoded as unpadded URL-safe Base64;
- a separate transient setup-session signing root.

Only the SHA-256 digest of the setup code is stored. The plaintext is printed
once to the operator terminal. `POST /setup/v1/session` is limited to five
failed attempts per source IP in 15 minutes. A successful exchange issues a
15-minute `HttpOnly`, `Secure`, `SameSite=Strict` cookie. The code and transient
session root are deleted after installation.

Losing an unused code requires the operator-only `setup-code-rotate` command.
There is no public setup reset or recovery endpoint.

## 5. API contract

All responses use the existing Cloud envelope and snake_case fields.

### `GET /setup/v1/state`

Returns only:

- `installation_state`: `pending | initializing | complete`;
- `setup_revision`;
- `retry_allowed`.

It never returns paths, configuration fields, failure exception text, hostnames,
database identity, secrets, or previous input.

### `POST /setup/v1/session`

Input: `setup_code`.

Output: `installation_state` and `expires_in_seconds`; the authenticated state
is carried only by the setup cookie.

### `POST /setup/v1/database/test`

Requires the setup cookie. Input contains separate database fields:

- `host`, `port`, `database`, `username`, `password`;
- `ssl_mode`, fixed to `verify-full` in production;
- `ca_pem`.

The boundary validates the hostname, DNS resolution, private-address posture,
PostgreSQL major version, TLS identity, transaction/DDL privileges, database
emptiness, current Alembic state, connection latency, and `max_connections`.
The response returns sanitized facts only.

### `POST /setup/v1/install`

Requires the setup cookie and a valid `Idempotency-Key`. Input contains:

- `cloud_name`;
- an HTTPS `public_base_url` with no path, query, or fragment;
- the same database object accepted by the test endpoint.

Under the exclusive install lock it repeats validation, migrates to the current
Alembic head, generates runtime roots, builds and validates full Settings, writes
configuration atomically, activates runtime services, commits `complete`, and
deletes setup authentication.

The success response returns exactly one unrecoverable plaintext value:

- `admin_key`: `nca_admin_` plus 32 random bytes;
- `next_url`: `/admin/login`.

The server stores only `SHA-256(admin_key)`. A completed replay never reveals or
regenerates the key. If the success response is lost, the operator uses
`admin-key-rotate`.

### `POST /admin/auth/login`

Replaces the development-era bootstrap endpoint. Input: `admin_key`. The server
compares its digest in constant time and then uses the existing `platform_admin`
identity, persisted grant checks, session-version checks, and HttpOnly session
cookie.

## 6. Error contract

Stable setup errors include:

- `setup.installation_required`
- `setup.session_required`
- `setup.code_invalid`
- `setup.rate_limited`
- `setup.installation_in_progress`
- `setup.database_unreachable`
- `setup.database_tls_required`
- `setup.database_version_unsupported`
- `setup.database_not_empty`
- `setup.database_permissions_insufficient`
- `setup.migration_failed`
- `setup.config_write_failed`
- `setup.already_complete`
- `auth.admin_key_invalid`

Internal exception messages, SQL, credentials, resolved IP lists, and filesystem
paths are never included in the public response.

## 7. Routing and health

Before completion:

- `GET /health/live` remains a minimal liveness response;
- `GET /health/ready` remains internal-only and reports not ready;
- setup state/session/test/install and required static frontend assets are the
  only public application paths;
- Admin, Portal, public runtime, Open, and ordinary frontend BFF routes return
  `503 setup.installation_required`;
- workers wait for `install-state=complete` and do not connect to PostgreSQL.

The frontend `/setup` route is outside the Admin layout. Its BFF has an explicit
method/path allowlist and forwards only the setup cookie; it never injects an
internal service token. Setup secrets remain in component memory and are never
written to URL parameters, localStorage, sessionStorage, analytics, or logs.

## 8. PostgreSQL 18 validation profile

The first external target is Alibaba Cloud RDS PostgreSQL 18 Basic Edition
`pg.n2e.1c.1m`. Validation defaults are:

- one API worker;
- one execution slot per background worker role;
- SQLAlchemy `pool_size=2`, `max_overflow=1`, `pool_timeout=10`,
  `pool_recycle=1800`, `connect_timeout=5`, and `pool_pre_ping=true`;
- private VPC endpoint and TLS `verify-full`;
- automatic backups with at least seven days retention.

The local/CI PostgreSQL 18 proof establishes schema and database semantics. It
does not prove RDS TLS, private networking, backup, restart, availability, or
capacity.

## 9. Deployment and recovery

The formal runtime and production Compose definitions do not include a
PostgreSQL service, image, volume, or hard dependency. A fresh deployment starts
Redis, setup-capable API, frontend, and proxy; workers begin only after install.
An installed release still follows the governed order: fence writers, migrate
with the release one-off image, start API, start workers, then restore traffic.

Before migration begins, the previous release may be restored. After migration
begins, old code must not automatically attach to the new database. Rollback
requires a matched application release, protected configuration, and database
restore point.

The validation RDS must be upgraded to a high-availability edition before the
first real user, paid workload, or irreplaceable business data.

## 10. Non-goals

- no CMS installation or WordPress site creation;
- no Provider, mail, payment, or billing onboarding;
- no ordinary admin editing of the active database target;
- no cloud-vendor provisioning API;
- no PostgreSQL 16 data migration, dual write, or compatibility shim;
- no multi-admin, password login, registration, reset email, or MFA;
- no new workflow engine, scheduler truth, or infrastructure control plane.

## 11. Required verification

- setup-code digest, rate limit, cookie, lock, interrupted retry, and permanent
  close tests;
- admin-key digest, rotation, and session invalidation tests;
- PostgreSQL 18 empty-history migration and idempotent Alembic rerun;
- partial-index, JSON, timestamp, `ON CONFLICT`, `SKIP LOCKED`, payment,
  idempotency, callback, and media-lifecycle semantic tests;
- frontend secret-storage, route-gate, one-time-key, accessibility, and i18n
  tests;
- exact bundle and host runtime contracts proving production does not bundle or
  start PostgreSQL;
- real RDS private/TLS smoke and local WordPress text/media round trip before
  the validation environment is accepted.
