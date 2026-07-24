# M4 Private Source Relay Transfer Validation

Date: 2026-07-24 (Asia/Shanghai).

Status: proof of concept and checked-in M4 candidate validation passed.

## Purpose

Determine whether splitting M5-to-M4 source transfer into two independently
terminated connections can restore the M4 Preview source-transfer target
without moving source truth, Git authority, or Docker runtime ownership.

The test used a random, incompressible file so its behavior approximated the
already compressed `source.tgz` bundle.

## Baseline

The active M5-to-M4 Tailscale path did not establish a direct connection. It
used the configured Peer Relay with approximately 138-144 ms round-trip
latency. M4 reported destination-varying NAT mapping and no port mapping.

A 524,288-byte upload comparison produced:

| Transport | Elapsed |
| --- | ---: |
| Default SFTP | 18.54 seconds |
| Legacy SCP | 15.74 seconds |
| Raw SSH stream | 19.33 seconds |

The comparable results localized the bottleneck to the endpoint-to-endpoint
relay path rather than one file-transfer protocol.

## Private File Relay Proof

The proof used:

- source size: `4,823,040` bytes;
- M5-to-relay transport: SCP over the relay's direct Tailscale address;
- relay-to-M4 transport: temporary HTTP bound only to the relay Tailscale
  address;
- integrity: byte-size and SHA-256 verification at all three points;
- cleanup: exact temporary files, HTTP service, unit, directory, and port.

First successful segmented observation:

| Stage | Elapsed |
| --- | ---: |
| M5 to relay | 9.78 seconds |
| Relay to M4 | 1.65 seconds |
| Pure transfer total | 11.43 seconds |

A second clean run measured the whole interval from upload start through M4
SHA-256 verification:

```text
pipeline_seconds=18
bytes=4823040
relay_proof=4823040 <matching-sha256>
m4_proof=4823040 <matching-sha256>
```

That end-to-end transfer and integrity interval was 18 seconds.

The complete diagnostic command, including preflight, temporary-file creation,
verification, and cleanup, finished in 28.35 seconds.

## Additional Finding

The relay's public SSH maintenance address closed the first attempted staging
connection. The host is intentionally rate limited there and receives routine
internet scans. Repeating the same operation through
`root@100.90.87.36` completed normally.

The productized transfer must therefore use the private Tailscale SSH address
by default. The public address remains a maintenance path, not an automated
file-ingress endpoint.

## Acceptance Result

The proof satisfies the initial decision gate:

- less than 60 seconds from upload start through M4 integrity verification;
- byte size and SHA-256 matched at M5, relay, and M4;
- relay HTTP was not bound to a public or LAN address;
- no repository, container, Cloudflare, database, or production configuration
  changed;
- no temporary files, listener, or transient service remained after cleanup.

The result supports implementing the private relay in the current
`scripts/m4-preview.sh` flow.

## Checked-in Candidate Validation

The implementation was dispatched to the M4 candidate environment through the
same default relay path. The observed source bundles were approximately
4.8 MB:

| Operation | M5 to relay | Relay to M4 |
| --- | ---: | ---: |
| Candidate deploy | 9 seconds | 2 seconds |
| Final source-only sync | 4 seconds | 5 seconds |

The source bundle SHA-256 recorded in M4 deployment state matched the bundle
produced on M5. M4 recorded `source_transfer_mode=relay`.

The first candidate attempt also exercised the failure path: the bundle reached
the relay, then the first M4 SSH connection timed out before the M4 operation
lock was acquired. The relay service, run directory, bundle, and lock were all
removed, and no M4 container changed. The shared SSH options now use three
connection attempts to tolerate that observed transient handshake failure
without changing transport modes.

After the fix, candidate deployment completed and all eight Compose services
were running; API, frontend, proxy, PostgreSQL, and Redis health checks passed.
The M4 preview proxy returned `200` at `/`, while private diagnostic paths
remained unavailable through the proxy as designed.

Verification gates:

```text
local focused contract: 17 passed
M4 contract suite: 753 passed, 2 skipped
M4 domain suite: 625 passed, 3 skipped
```

One M4 skip is intentional: the packaged source omits `.git`, so the
Git-worktree-only source-transfer dry-run test runs locally and in GitHub CI,
not inside the M4 container. Static fail-closed assertions and invalid-mode
execution still run on M4.

Post-run cleanup checks confirmed:

- the relay base directory was absent;
- no transient relay systemd service remained;
- no source bundle or `.partial` download remained in M4 `/tmp`;
- the M4 candidate operation lock was released.

Local `pnpm run check:fast` was not executed in the source-only worktree because
that command starts local Docker and requires an untracked `.env`. The documented
M4 `--full` gate is its runtime equivalent and passed above. This avoids
creating a second runtime or copying M4 secrets back to M5.

This candidate evidence does not by itself constitute GitHub review, merge, or
accepted M4 promotion; those are separate lifecycle gates.
