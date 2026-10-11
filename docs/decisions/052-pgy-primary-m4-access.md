# ADR-052: Pgy Primary M4 Access and Direct Source Transfer

## Status

Accepted.

## Date

2026-09-04.

## Context

The authoring Mac and the office M4 are now members of the same 贝锐蒲公英
network. The observed dormitory path reaches M4 at `172.16.3.35` with working
SSH, Cloud health, and native Ollama access. The existing M4 preview script
still defaults to the Tailscale address and private source relay, which adds
avoidable path selection and transfer latency for the single operator.

The M4 application, database, Redis, and Ollama ports remain loopback-only.
Only the SSH transport is reachable through the overlay network.

## Decision

Use `muze@172.16.3.35` as the default M4 SSH target and use direct source
transfer by default. The automatic tunnel route order is:

1. office LAN `muze@192.168.10.200`;
2. Pgy `muze@172.16.3.35`;
3. Tailscale `muze@100.102.170.79`.

Add `NPCINK_CLOUD_M4_TAILSCALE_SSH_HOST` as the explicit Tailscale fallback
override. Keep `NPCINK_CLOUD_M4_SSH_HOST` as the primary configured target and
keep `NPCINK_CLOUD_M4_SOURCE_TRANSFER_MODE=relay` available as an explicit
operator-selected recovery mode.

Route selection applies only to the automatic SSH tunnel. Source transfer,
status, lifecycle, Ollama, deploy, and promotion commands use the configured
primary target and fail closed when it is unavailable. They do not silently
switch transport or transfer mode.

All published M4 ports remain bound to loopback. This decision does not change
Docker Compose, Nginx, Cloudflare Access, production deployment, WordPress
ownership, or the Tailscale relay host. ADR-026 and ADR-051 remain historical
records of the relay design; this ADR supersedes only their default-path
selection for ordinary M4 development operations.

## Explicit Recovery

```bash
NPCINK_CLOUD_M4_SSH_HOST=muze@100.102.170.79 \
NPCINK_CLOUD_M4_SOURCE_TRANSFER_MODE=relay \
pnpm run m4:preview:sync
```

If the Pgy virtual address changes, override `NPCINK_CLOUD_M4_SSH_HOST` for
the affected operation and update the checked-in default after the address is
confirmed stable.

## Consequences

- Ordinary M4 operations use the lower-latency Pgy path in offsite networks.
- The automatic tunnel preserves the office LAN optimization and Tailscale
  recovery path.
- A failed Pgy transfer remains visible and requires an explicit operator
  recovery choice.
- The default direct transfer no longer exercises the transient relay; relay
  integrity, cleanup, and security contracts remain covered when relay mode is
  explicitly selected.
