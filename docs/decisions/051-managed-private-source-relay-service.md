# ADR-051: Managed Private Source Relay Service

## Status

Accepted.

## Date

2026-09-04.

## Context

ADR-026 established a Tailscale-only relay that stores one verified source
bundle for one M4 operation. Its first implementation also created a temporary
Python HTTP service for every transfer. A later off-office validation found
that the relay network was reachable, but detached Python and systemd-run
processes did not provide a reliable listener to M4. Upgrading Python would not
fix that process-lifecycle failure.

The relay host already runs Nginx. Reusing it avoids another runtime and makes
the listener independently observable, but a long-lived HTTP process must not
turn the relay into a source cache, deployment authority, or public file
service. The service lifetime and the source-data lifetime therefore need
separate rules.

## Decision

Support an explicit managed-Nginx relay mode alongside the existing transient
mode.

- The managed listener binds only the relay's Tailscale address and accepts
  only `GET` and `HEAD`.
- Directory listing is disabled, symbolic links are disabled, and the public
  security group does not expose the relay port.
- The Nginx service and an empty root-owned base directory may persist across
  operations.
- Every run still receives a unique directory, bundle name, and operation
  lock. The bundle name includes its expected SHA-256.
- A run directory remains `0700 root:root` during upload. It becomes
  Nginx-traversable only after byte-size and SHA-256 validation succeeds.
- M4 verifies SHA-256 again before extraction or source application.
- Success, failure, or interruption attempts exact cleanup of the bundle, run
  directory, operation lock, and M4 partial file. The empty base directory is
  not a cache.
- Managed mode uses `/var/lib/npcink-ai-cloud-m4-source-relay`; the host Nginx
  service uses systemd `PrivateTmp` and cannot reliably serve host files from
  `/var/tmp`.
- Relay downloads use a bounded 15-minute budget with partial-transfer resume.
  Low throughput is tolerated; incomplete or mismatched content is not.
- Relay SSH authentication may use an operator-supplied absolute identity-file
  path. The key is never packaged, sent to M4, committed, or written to
  deployment evidence.
- The existing transient mode remains available. No mode silently falls back
  to a public path or direct transfer.

The authoring worktree and GitHub `master` remain source truth. M4 remains the
integration runtime. The relay remains a transport buffer only.

## Alternatives Considered

### Upgrade Python and retain the temporary server

Rejected as the remedy. A foreground Python server proved the network path,
while detached processes failed to expose a usable listener. The evidence
localized the problem to service lifecycle rather than Python language level.

### Keep using direct SCP to M4

Rejected as the normal path. It had already stalled over the endpoint-to-
endpoint relay route. Direct transfer remains an explicit bounded recovery,
not an automatic fallback.

### Bind Nginx publicly or to all interfaces

Rejected. Public access would expand the attack surface and violate the
Tailscale-only source-transfer boundary.

### Persist bundles for reuse

Rejected. A source cache creates retention, eviction, stale-revision, and
authorization questions without improving Git or M4 acceptance authority.

### Add object storage or a deployment service

Rejected for the current scale. It would add credentials and could become a
second deployment control plane. The existing host and Nginx satisfy the
bounded transfer requirement.

## Consequences

- Off-office source transfer is reliable even when Tailscale uses a slower Peer
  Relay, but an approximately 9 MB bundle may take six to eight minutes.
- The listener is operationally long-lived, while private source bytes remain
  short-lived and fail-closed.
- Nginx and Tailscale are both enabled at boot. Because the system Nginx unit
  does not explicitly depend on `tailscaled`, the first host reboot requires
  the runbook's listener check.
- Existing Nginx sites share the service process, so recovery must run
  `nginx -t` before reload and must not replace unrelated configuration.
- Cloud, WordPress, Core, Adapter, production, and approval ownership do not
  change.

## Verification

The implementation and acceptance evidence is recorded in the
[2026-09-04 closeout and retrospective](../history/m4/2026/managed-source-relay-closeout-and-development-retrospective-2026-09-04.md).
Operational checks and recovery steps remain authoritative in the
[M4 Preview Development Workflow](../m4-preview-development-v1.md).

## Rollback

Revert the managed-mode source change and remove only the dedicated relay
Nginx configuration after `nginx -t` confirms the remaining configuration.
Do not remove the Tailscale node, unrelated Nginx sites, or the M4 runtime.
Transient mode and explicit direct recovery remain separate choices.
