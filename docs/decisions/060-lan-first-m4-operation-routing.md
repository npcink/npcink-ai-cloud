# ADR-060: Prefer Office LAN for M4 Operations

## Status

Accepted by operator on 2026-10-16.

Supersedes the operator access priority in
[ADR-052](052-pgy-primary-m4-access.md). Its direct-transfer, explicit relay,
loopback exposure, and evidence boundaries remain unchanged.

## Context

The M4 has a fixed office LAN address as well as Pgy and Tailscale addresses.
The operator requested LAN first, Pgy second, and Tailscale third. Pgy means
the 贝锐蒲公英 overlay network; direct source transfer means sending the source
bundle from the authoring Mac to M4 over SSH/SCP without the source relay.
Direct transfer can use any of the three SSH addresses.

## Decision

For each new M4 operation, choose the first reachable SSH route:

1. office LAN: `muze@192.168.10.200`;
2. Pgy: `muze@172.16.3.35`;
3. Tailscale: `muze@100.102.170.79`.

The existing automatic browser tunnel already uses this order. Other commands
still default to the configured Pgy host in code: operators and AI agents must
check the routes in this order, then explicitly set
`NPCINK_CLOUD_M4_SSH_HOST` to the chosen host for that operation. This decision
changes the operating procedure, not the deployment script's automatic
fallback behavior.

Use bounded, read-only SSH checks, rather than ICMP or application health, to
select a route for source/lifecycle operations. A stopped application must
remain recoverable through SSH. The runbook provides the selection command.
An explicit operator-pinned host takes precedence over this default order.

Log the selected address and keep it fixed throughout the operation, including
transfer, remote execution, and cleanup. If the operation fails after starting,
preserve its evidence and inspect the remote state before a new attempt. Do
not silently switch transport or replay a mutation halfway through a run.

Keep `NPCINK_CLOUD_M4_SOURCE_TRANSFER_MODE=direct` independent of route choice.
Selecting Tailscale does not select the relay. Relay mode remains a separate,
explicit recovery choice.

## Consequences

- Office operations can use the fixed LAN address without an overlay hop.
- Offsite operations can fall back to Pgy, then Tailscale, before starting.
- No Docker, application, database, proxy, production, or acceptance behavior
  changes, and no existing tunnel is replaced just to change route preference.
- This documentation alone does not prove a future operation's route. Its
  command environment and receipt must record the address actually selected.
- Rollback is an explicit host override for the affected operation; changing
  the default policy again requires recording the operator's decision.
