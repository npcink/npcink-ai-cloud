# ADR-045: Move Production Readiness Checks Before Transfer

## Status

Accepted

## Date

2026-08-13

## Context

The 2026-08-12 production promotion reached the host successfully but was
stopped before image or database mutation because the certificate-renewal
readiness receipt was stale. The release was safe, but the failure was found
after the exact bundle had already been built and transferred.

The same release also confirmed that pytest timing weights, node-level
selection, failed-shard reruns, and per-phase deployment timing already exist.
Adding a second scheduler or an automatic credential path would increase
complexity without addressing the primary waste.

## Decision

1. `Deploy Production` performs a read-only remote certificate-readiness check
   after SSH authentication and before bundle transfer or host mutation. The
   check accepts an absent `current` symlink for the supported first-install
   path, while still rejecting a broken, non-symlink, or out-of-root current
   path. The deploy helper remains authoritative for first-install state,
   CVE, setup, and mutation gates.
2. `Production Maintenance` exposes a `certificate-readiness` action for an
   operator-initiated, read-only check. The check warns at five days and fails
   at seven days; it never generates or edits a receipt.
3. The check validates only metadata and file safety: contract, domain,
   passed status, timestamp, root ownership, and mode `0600`. The existing
   governed readiness generator remains the only path that performs Certbot
   dry-run and NGINX hook validation.
4. Pytest continues to use the existing variance-aware weighted scheduler and
   failed-shard-only rerun practice. Shard drift remains advisory evidence;
   no additional scheduler or shard is introduced by this change.
5. Application stop timing remains per-service and parallel. The 30-second
   graceful stop is not shortened until natural evidence demonstrates that a
   smaller bound preserves worker shutdown correctness.

## Alternatives Considered

### Generate certificate evidence automatically during deployment

Rejected. It would make a deployment mutate host certificate state and blur
the operator-owned Edge boundary. A stale receipt should be detected early,
not silently repaired by a release.

### Add a fourth pytest shard now

Rejected. Existing evidence shows runner variance and a moving long tail, not a
stable three-shard capacity failure. More shards add setup and coordination
cost before the current balance target is disproven.

### Shorten worker grace to 10 seconds

Deferred. The measured 30-second stop is a real cost, but changing it without
shutdown evidence risks dropping queued work. First collect natural stop
timings and worker-drain evidence.

## Consequences

- A stale certificate receipt fails before a large bundle transfer.
- Operators gain a safe, repeatable readiness inspection without receiving or
  sharing certificate material.
- Portal login credentials remain outside this code path and outside chat.
- The deployment workflow gains one small read-only SSH step; its failure is
  intentionally fail-closed.
- Future worker-stop optimization has a measurable baseline and a clear gate.
