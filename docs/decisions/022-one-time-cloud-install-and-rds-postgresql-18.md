# ADR-022: One-Time Cloud Install and Fresh RDS PostgreSQL 18

## Status

Accepted.

## Date

2026-07-22.

## Context

Npcink AI Cloud is still in development and has no real users. Its production
Compose topology currently owns a PostgreSQL 16 container, and production
configuration requires database and security secrets before the API can start.
That makes a fresh deployment depend on an operator-built `.env.deploy` and
prevents a WordPress-like first-run experience.

The next validation database will be an Alibaba Cloud RDS PostgreSQL 18 Basic
Edition instance (`pg.n2e.1c.1m`, one vCPU and 2 GiB memory). It is intentionally
a low-cost validation target. Existing PostgreSQL 16 data is disposable; adding
data migration, dual write, or compatibility code would create work without a
current user benefit.

The first-run surface is security-sensitive. Before an administrator exists,
an unguarded public setup page would let the first Internet visitor choose the
database and take the platform-admin credential.

## Decision

Adopt a one-time Cloud installer and a fresh external RDS PostgreSQL 18 database:

- a host-generated, high-entropy setup code proves control of the host;
- automated deployment stores only an initial digest and never emits usable
  plaintext into CI logs; the operator must issue the usable replacement from
  an interactive SSH TTY, where it is displayed exactly once;
- the server stores only the setup-code digest and deletes it after install;
- the installer accepts a private RDS endpoint, PostgreSQL database credentials,
  and the RDS CA certificate, and requires TLS `verify-full`;
- the installer requires PostgreSQL major version 18 and an empty database (or
  the recoverable state of the same interrupted install);
- the installer applies the complete Alembic history, generates the required
  runtime secrets, and atomically commits a protected runtime configuration;
- interrupted retries bind both the idempotency key and canonical request to
  the same attempt without storing the request or a password-guessable digest;
- the installer generates one high-entropy platform-admin key, returns it once,
  and stores only its digest;
- a completed installation never reopens setup because the database is down;
- the application always fails closed when installation state is absent;
  only the locked root host helper may create the first explicit pending state;
- the formal production Compose topology uses external PostgreSQL and no longer
  owns or bundles a PostgreSQL image;
- a separate PostgreSQL 18 proof topology remains available for local and CI
  schema/semantic verification only.

The first RDS target is validation-only. Before the first real user, paid use,
or irreplaceable business data, the operator must upgrade to a high-availability
RDS edition. This gate applies even if the Basic Edition metrics appear healthy.

The current Python image CVE exception is resolved in a separate release before
the RDS cutover. Base-image remediation and database-topology changes must not
share one production change window.

## Runtime configuration authority

Production database and root security configuration moves out of shell-parsed
`.env.deploy` into a protected structured configuration under the shared release
root. `.env.deploy` remains only for non-secret deployment and network inputs.

The application has two configuration phases:

- bootstrap configuration: enough to expose minimal health and authenticated
  setup without a database;
- runtime configuration: the complete validated Settings object loaded only
  after installation is complete.

Development and test environments may continue to use environment variables.
The production frontend receives only a dedicated read-only projection of the
internal service token required by existing Admin BFF routes. It cannot mount or
read the database configuration or runtime root-secret file.

## Boundary

This decision changes Cloud infrastructure bootstrap only. It does not move any
WordPress ability, workflow, prompt, preset, permission, approval, or final
write truth into Cloud. It does not add a generic infrastructure console, cloud
provider purchasing API, database migration product, or second orchestrator.

## Alternatives considered

### Keep `.env.deploy` as the only production configuration

Rejected. It preserves shell-quoting hazards for generated passwords and makes
fresh installation an SSH-only secret-editing exercise.

### Expose setup without a setup code

Rejected. A public pre-authentication installer could be claimed by an
unauthorized visitor before the operator completes installation.

### Migrate PostgreSQL 16 data

Rejected. There are no real users or business records to preserve. A fresh
database is faster, safer, and produces a clearer PostgreSQL 18 proof.

### Build a reusable cloud-database control plane

Rejected. Provisioning, resizing, failover, and cross-instance migration remain
operator responsibilities. The one-time installer only connects an existing
empty database to this Cloud runtime.

## Consequences

- first deployment can present a secure browser-based setup flow;
- production no longer carries a local PostgreSQL image or volume;
- a 1 vCPU/2 GiB database requires deliberately small connection pools and
  single-concurrency workers during validation;
- losing the one-time admin key requires an operator rotation command; it cannot
  be recovered from stored data;
- setup/admin key rotation requires an interactive terminal so plaintext cannot
  be captured by automated deployment logs;
- future RDS address changes are an operator-controlled cutover, not an ordinary
  admin setting;
- Basic Edition availability is explicitly insufficient for real-user launch.
- fresh PG18 installs carry a digest-bound completion marker for future release
  gates; a completed state without that marker is unsupported by the new deploy
  path and fails closed instead of reopening a P1-E06 compatibility path.

## Rollback

Before RDS initialization, stop the new release and restore the previous release.
After initialization starts, old code must not automatically connect to the new
database. A later rollback requires a matched application revision, configuration,
and database restore point.

The old PostgreSQL 16 volume is kept offline and compressed for seven days after
successful validation. It is evidence and a bounded recovery aid, not an active
compatibility path.

## References

- [Cloud First Install Contract](../cloud-first-install-contract-v1.md)
- [Cloud Production Release Policy](../cloud-production-release-policy-v1.md)
- [Cloud Content Generation Boundary](../cloud-content-generation-boundary-v1.md)
- [External TLS Edge](020-external-tls-single-bundled-nginx.md)
- [Release-Scoped Runtime Network Authority](021-release-scoped-runtime-network-authority.md)
