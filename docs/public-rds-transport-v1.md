# Public RDS transport for an existing installation

Status: operator-approved scope, 2026-11-09. Source support is separate from
production deployment and target acceptance.

## Configuration contract

An existing installation can explicitly select a public Alibaba RDS transport
in protected `shared/config/runtime-config.json`:

```json
{
  "database": {
    "host": "pgm-example.pg.rds.aliyuncs.com",
    "public_host": "pgm-example-public.pg.rds.aliyuncs.com",
    "port": 5432,
    "ssl_mode": "verify-full"
  }
}
```

This is a fragment; retain the existing database name, account, password, CA
digest, cloud and security sections. Values above are placeholders.

- `host` remains the independently verified database certificate identity.
  It may be the existing private hostname when the RDS certificate does not
  cover its public endpoint.
- `public_host` is an optional network endpoint. Its presence explicitly opts
  into public transport. Both names must be canonical Alibaba RDS hostnames.
- Each process resolves `public_host`, rejects the entire result if any answer
  is not globally routable or is multicast/reserved, and pins the selected
  address in libpq's `hostaddr`. The URL `host` remains the certificate name;
  libpq verifies that name against the configured CA with `verify-full`.
- Missing `public_host` preserves private-only resolution. Empty, null,
  malformed, mixed public/private, or failed public DNS never falls back to
  private transport or weaker TLS. IP literals and arbitrary domains are not
  accepted as public endpoints.
- There is no environment override, public-address fallback, TLS downgrade,
  Setup UI/API expansion, new database, or automatic data restore.

The database certificate must match `host`, not necessarily `public_host`.
This separates network routing from authenticated server identity; a public
endpoint presenting another instance's certificate must fail verification.

## Prepare a target change

This is a separately authorized operator operation, not an ordinary env edit.
For a replacement host, prepare a protected offhost copy of the existing
configuration before restoring it through the governed recovery/release path.

1. Confirm the endpoint belongs to the existing authoritative RDS. Preserve
   current RDS data; a dated database dump must not replace newer writes.
2. Retain the original protected config and restore evidence unchanged. In a
   new protected copy, add only `database.public_host` and, if the public port
   differs, change `database.port`. Preserve the certificate `host`, CA and
   all runtime roots, credentials and internal-token projections.
3. Bind `install-state.json.config_digest` to the exact new runtime-config
   bytes. Retain complete-state and the PG18 contract; do not reopen Setup,
   loosen permissions, invent acceptance, or retain a key-rotation transition
   to bypass the digest. Keep the original complete-state/sentinel as recovery
   evidence; its historical acceptance is not acceptance of the new target.
4. Check the RDS public allowlist against the actual ECS public egress address.
   Verify DNS, TCP and full CA/hostname TLS from the target; then use read-only
   SQL to confirm PostgreSQL 18, one known upgradeable Alembic revision, and
   actual TLS. Never print a database URL, password or runtime roots.
5. Require the exact candidate image's native protected-config/TLS/Alembic
   preflight before migration or writer startup. A workstation SSH-forward
   proof is supplemental; it is not native candidate-namespace acceptance.

Public transport adds inter-region latency and network dependence. Record
measured connection/query latency separately; one TCP timing is not a workload
benchmark. Keep existing pool bounds and timeouts until workload evidence
justifies a separate tuning change.

## Failure and rollback

DNS, CA, certificate-name, authentication or revision failure stops deployment.
Do not substitute `sslmode=require`, disable verification, or map the identity
hostname in `/etc/hosts` to force acceptance.

Before activation, discard only the prepared copy to withdraw the change.
After activation, restore the matched protected config and install-state with
the exact previous release under the governed rollback procedure. An old
private configuration works only on a host with that private route. Source
rollback alone does not restore networking, database state or configuration.
