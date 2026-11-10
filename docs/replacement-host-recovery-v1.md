# Same-database replacement-host recovery

Status: bounded release tooling; source support is not production authorization.

This lane moves an existing completed installation onto an empty replacement
host while retaining its authoritative external PostgreSQL 18 database and
runtime roots. It does not initialize a database, restore an old dump, reopen
Setup, create a pretend previous release, or manufacture historical acceptance.
The ordinary installed-host and empty-database first-install gates remain the
defaults. Product contracts and WordPress ownership do not change.

## Before activation

1. Obtain explicit operator confirmation that the previous host is stopped or
   released. An expired lease alone is not a writer fence.
2. Keep the original protected backup unchanged and offhost. Verify its complete
   PG18 installation state and runtime digest. Prepare a separate copy changing
   only `database.public_host` and, when necessary, `database.port`, following
   [public RDS transport](public-rds-transport-v1.md). Preserve every other
   setting, credential, runtime root, CA and frontend internal-token projection.
   Update the copied complete-state digest to the exact new config bytes.
3. Take and checksum a new read-only logical dump of the authoritative RDS;
   save an independently verified offhost copy. The dump is a recovery point,
   not an instruction to replace current RDS data.
4. Prepare the exact CI-green `production` AMD64 v2 bundle, fresh passed image
   scan, operational environment, trusted external Edge/TLS and certificate
   renewal evidence. Keep the old target out of maintenance dispatches. This
   lane creates no certificate exception and does not waive promotion gates.
5. Restore only the prepared protected files to canonical `shared/config`,
   using the existing UID/GID 999 and file/directory modes. Keep the complete
   state from the original installation; do not create Setup authentication,
   `current`, `.installation-complete`, or a first-install pending marker.

An explicitly authorized trusted-workstation recovery uses the verified exact
production bundle through `deploy/deploy-to-ssh-host.sh`, with seed and signed
smoke skipped and operational readiness enabled. Separate the paid/signed
business acceptance from this infrastructure operation. Set the protected
process variable `NPCINK_CLOUD_REPLACEMENT_HOST_RECOVERY_APPROVAL` to the exact
sentence `Approved for replacement-host recovery by operator.` only after the
human authorizes that exact recovery/source. Do not dispatch the ordinary
GitHub deploy workflow and expect it to infer a recovery exception.

## Protected receipt

Before activation, root writes a regular mode-0600 file at
`<managed-root>/.replacement-host-recovery.json` containing:

| Field | Required binding |
| --- | --- |
| `contract`, `state` | `npcink.replacement_host_recovery.v1`, `prepared` |
| `operator`, `old_host_fenced` | Named operator and explicit boolean `true` |
| `created_at`, `expires_at` | Aware ISO timestamps, at most 24 hours apart |
| `candidate_sha`, `manifest_sha256` | Exact bundle source SHA and embedded manifest digest |
| `config_digest` | SHA-256 of exact restored runtime config bytes |
| `protected_backup`, `protected_backup_sha256` | Original protected archive and independent digest |
| `database_backup`, `database_backup_sha256`, `database_backup_created_at` | Fresh logical dump, digest and timestamp no older than 24 hours |
| `alembic_head` | Exact current candidate/RDS head; this lane rejects ancestors |

Both backup files must be root-owned mode-0600 regular files beneath
`/var/backups/npcink-ai-cloud`, with safe non-symlink parent directories.
The validator reads the original protected archive without extracting it and
compares original completed state, all unrelated config, CA and internal token.
It checks the receipt before first-install preparation and again before image
mutation. Existing lifecycle markers, `current`, project containers, repair
flags, selective release plans, expired/mismatched inputs or changed roots stop
the operation. Missing state cannot fall through to Setup preparation.

The exact candidate image must prove `verify-full` TLS, PG18 and the exact sole
schema head before writers start. The normal governed migration entry point
still runs, but the accepted schema already equals the candidate head: this
lane cannot be used to introduce a schema upgrade during host recovery.

## Target acceptance and failure

A successful activation retains the recovery receipt and deliberately leaves
the permanent acceptance sentinel absent. Normal redeployment and mutating
safe-prune therefore remain blocked. After the human accepts this new target,
run the active release's `deploy/replacement-host-recovery.py` with
`--managed-root`, `--release`, `--finalize` and `--expected-sha <exact-source>`
under the same explicit recovery approval. It takes the deployment and install
locks, rechecks the exact matched recovery and internal readiness, and publishes
a new root-owned mode-0600 `installation_complete.v1` sentinel with the actual
new acceptance time. Repeating finalization validates that same active target.

Any failed activation follows the existing fail-closed cutover behavior. Retain
the receipt, source/bundle identities, matched prepared configuration, fresh
dump and failure marker. Do not create a dummy `current`, erase a failure
marker, refresh a receipt to bypass investigation, or restart the old host.
After application writes begin, a dump restore is a separate authorized
whole-recovery operation; source rollback alone is not database recovery.

Operational readiness requests include the worker/cadence/provider projections
and can take longer than a cheap dependency check over public cross-region RDS.
Their per-request timeout defaults to 30 seconds and may be set with
`NPCINK_CLOUD_OPERATIONAL_READY_REQUEST_TIMEOUT_SECONDS` (integer 1–60).
Dependency readiness retains its 5-second request timeout. This changes the
request budget only: fresh post-cutover heartbeats, stable exact containers,
strict operational checks and the provider-degradation policy still apply.
Thirty attempts remain bounded to about 16 minutes at the default request
budget, including retry sleeps; a stalled projection still fails closed.

On a failed activation with no previous release, recovery stops and removes
the candidate project containers, including Redis, before restoring image-tag
absence. Container volumes are retained. This avoids Docker refusing to remove
the last tag of an image still used by a candidate. An ambiguous stop/removal
or tag proof retains the deploy lock and failure evidence; this order does not
authorize unlocking an already-failed deployment or restoring a database.

## Workstation execution and evidence lessons

The [2026-11-10 recovery record](history/production/2026/replacement-host-release-2026-11-10.md)
records an actual replacement activation. Reuse these execution rules without
treating its old identities, timestamps or operator approval as new authority:

- Source the workspace target loader from **Bash**; it uses `BASH_SOURCE`.
  Verify the resolved target privately before SSH. Keep a task-scoped pinned
  host-key file and explicit identity; do not disable strict host checking.
- On macOS, use a short task-local temporary path for SSH ControlPath when
  the default temporary directory exceeds the Unix socket path limit. Keep
  proxy and anonymous registry-client overrides process-scoped; do not change
  workstation-wide network or Docker credentials to fix one release.
- A readable compressed dump is not full restore proof. Verify an offhost
  checksum and restore into a uniquely owned isolated PG18 target with no
  production network/configuration. Budget for the **expanded data, WAL and
  indexes**, not the compressed archive size. A memory-backed database also
  consumes the container memory limit. Retain diagnostic stderr and container
  OOM state before cleaning that exact temporary resource.
- Separate infrastructure liveness, cheap database readiness, complex worker
  projections and human business acceptance. A longer bounded timeout does
  not fix excessive SQL round trips. Label workstation/tunnel timings by
  their measurement path; never present them as native-host performance.
- Post-deploy probes must use the canonical Compose project-name resolver,
  not the product display name. Public revision headers contain 12 characters;
  compare the full source through the installed manifest. A Worker without a
  Docker healthcheck needs heartbeat/stability proof, not a fabricated health
  result. Missing host metrics are unavailable, not zero.
- Preserve a failed transaction's original marker, locks and receipt. A
  separately authorized matched recovery proves its exact container/tag/config
  state before releasing a lock; never delete markers merely to retry.
- Close the source, deployment, documentation and resource tracks separately.
  Preserve protected workstation configuration before any later worktree
  archival; Git snapshots do not include ignored secrets. A conversation may
  close with a named acceptance owner and retained protected worktree.
