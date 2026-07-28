# ADR-026: Private Source Relay Transfer

## Status

Accepted.

## Date

2026-07-24.

## Context

The authoring Mac and M4 frequently cannot establish a direct Tailscale path
outside the office. The observed endpoint-to-endpoint path used the configured
Peer Relay at roughly 138-144 ms round-trip latency. A 4.6 MB source bundle
then required about three to seven minutes to reach M4.

Protocol comparison showed that default SFTP, legacy SCP, and a raw SSH stream
all had similarly low throughput. Connection reuse or another compression pass
would not address the dominant bottleneck: the source bundle is already gzip
compressed, and the endpoint-to-endpoint TCP session still spans both relay
legs.

A bounded proof of concept split the transfer into two independent
connections:

1. the authoring Mac uploaded the bundle directly to the relay's Tailscale
   address;
2. the relay served the verified bundle from a temporary HTTP listener bound
   only to its Tailscale address;
3. M4 downloaded and verified the bundle.

The repeated 4,823,040-byte validation completed from upload start through M4
SHA-256 verification in 18 seconds.

## Decision

Use the existing relay host as a transient, Tailscale-only source transfer
buffer for M4 Preview.

- The authoring worktree remains source and Git truth.
- `scripts/m4-preview.sh` defaults to
  `NPCINK_CLOUD_M4_SOURCE_TRANSFER_MODE=relay`.
- The authoring Mac uploads through the relay's Tailscale SSH address,
  `root@100.90.87.36`; the public SSH maintenance address is not part of the
  default transfer path.
- The relay stores one per-run bundle under a mode-`0700` directory. Its name
  includes the expected source SHA-256.
- A relay operation lock serializes the fixed Tailscale-only HTTP listener.
- The relay verifies byte size and SHA-256 before starting the listener.
- The listener binds only `100.90.87.36:18080` and exists only for the active
  transfer.
- M4 downloads the bundle inside its existing deployment operation lock with
  bounded connect, total-time, low-speed, and retry limits.
- M4 verifies SHA-256 before extracting or applying source.
- Success, failure, interruption, and local process exit all attempt exact
  cleanup of the temporary service, bundle, directory, lock, and M4 partial
  file.
- `NPCINK_CLOUD_M4_SOURCE_TRANSFER_MODE=direct` is the explicit direct fallback.
  The script does not silently fall back because doing so would hide a degraded
  transfer path.

The relay is a transport buffer. It does not become source or Git truth, a
deployment authority, a runtime, a cache of accepted revisions, or another
Cloud control plane.

The existing source-packaging exclusion contract remains unchanged. `.env`,
`.env.local`, `.env.deploy`, Git metadata, dependency trees, caches, and build
outputs do not enter the source bundle.

## Alternatives Considered

### Keep direct SFTP and enable SSH compression

Rejected. The source is already a `.tgz`, and SFTP, legacy SCP, and raw SSH
showed comparable low throughput over the same endpoint-to-endpoint relay path.

### Add SSH connection multiplexing only

Rejected as the primary remedy. Handshake time was measured in seconds while
transfer time was measured in minutes. Multiplexing may be a later latency
optimization but cannot satisfy the transfer target by itself.

### Use the relay's public SSH address

Rejected for the default path. The public port is a rate-limited maintenance
entry and receives continuous internet scanning. The proof of concept observed
a connection close there, while the Tailscale SSH address completed normally.

### Persist source bundles as a relay cache

Rejected. The current bundle is small and the transient flow already satisfies
the target. A persistent cache adds retention, eviction, and stale-source
questions without a demonstrated need.

### Deploy from GitHub-hosted CI or object storage

Rejected for this iteration. Hosted automation would add credentials or a
second deployment authority. External object storage remains an option only if
the existing private relay no longer meets the measured target.

## Consequences

- Ordinary source transfer is expected to remain below the 60-second
  investigation threshold when both endpoints retain direct paths to the relay.
- Deploy and sync now depend on the relay's Tailscale SSH, systemd, Python,
  curl, and temporary disk availability.
- A relay outage fails visibly before source is applied; it does not authorize
  local Docker fallback or direct transfer without the explicit override.
- The fixed HTTP port permits one source transfer at a time. The relay lock
  makes this constraint explicit and auditable.
- Runtime acceptance, GitHub merge authority, M4 candidate/accepted states,
  production boundaries, and Cloudflare boundaries do not change.

## Rollback

For a one-off operational fallback:

```bash
NPCINK_CLOUD_M4_SOURCE_TRANSFER_MODE=direct pnpm run m4:preview:sync
```

For a code rollback, revert this decision's script and documentation change,
then run the ordinary reviewed M4 promotion flow. Do not remove or repurpose
the existing Tailscale Peer Relay merely to roll back source staging.
