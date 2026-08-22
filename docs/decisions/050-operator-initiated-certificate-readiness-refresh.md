# ADR-050: Operator-Initiated Certificate Readiness Refresh

## Status

Accepted

## Date

2026-08-22

## Context

ADR-045 moved certificate-readiness inspection before bundle transfer and
correctly rejected automatic evidence generation during deployment. A later
release failed safely because the seven-day receipt was stale, while the
current production SSH credential was available only through the protected
GitHub Environment. The repository had a read-only maintenance action but no
governed operator path to run the existing generator with that credential.

Direct server edits, copying a stale receipt, or weakening the seven-day gate
would bypass the Edge safety boundary. Automatically refreshing from the
deploy workflow would also erase the deliberate distinction between a
read-only release preflight and an operator-approved NGINX/Certbot maintenance
operation.

## Decision

Add a separate `certificate-readiness-refresh` action to `Production
Maintenance`. It requires the exact confirmation phrase `Refresh production
certificate readiness evidence.` and remains serialized by the existing
`production-host-mutation` concurrency group.

The action must:

- run only from `production` with protected Environment SSH credentials;
- require a direct managed current release and its non-symlink executable
  readiness generator;
- acquire and verify the shared root-owned mode-`0700` deploy lock;
- re-resolve `current` after locking and fail if it changed;
- run the current release's generator with the fixed `cloud.npc.ink` Certbot,
  timer, hook, certificate, and evidence paths;
- run the read-only receipt validation after generation;
- release the shared lock even when generation fails.

`Deploy Production` remains read-only at this gate and never triggers the
refresh action automatically.

## Alternatives Considered

### Refresh automatically during deployment

Rejected. Generation performs a real Certbot dry run and NGINX hook/reload,
so hiding it inside deployment would violate ADR-045's operator-owned Edge
boundary.

### Restore or distribute a local production SSH key

Rejected. The protected GitHub Environment already owns the current release
credential. Creating another credential path would expand secret exposure only
to recover an expired evidence receipt.

### Extend or ignore receipt freshness

Rejected. The seven-day limit detects drift in the renewal service, hook,
certificate lineage, private key binding, and served leaf. Staleness is a
maintenance signal, not an availability exception.

## Consequences

- A stale receipt has a documented, auditable recovery path without weakening
  deployment preflight.
- Refresh remains an explicit production mutation and requires human
  confirmation.
- A failed generator invalidates the old receipt and leaves deployment blocked.
- The action does not deploy application code, change runtime configuration,
  or become a background renewal scheduler.
