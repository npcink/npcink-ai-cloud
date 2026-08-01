# ADR-038: Tiered M4 Parallel Preview Capacity

## Status

Accepted.

## Date

2026-08-01.

## Context

ADR-035 introduced three frontend-only leases, but its status output used
`state=available` for an empty lease even when the shared primary backend made
the slot impossible to start. Operators therefore saw capacity that did not
exist. The start guard also treated every primary `candidate` as incompatible,
including frontend-only candidates whose backend was identical to the last
accepted backend.

Frontend-only slots still cannot serve work that changes API code, migrations,
dependencies, workers, or persisted data. Serializing all such work through the
primary candidate means one full-stack task can block unrelated browser work.

The 2026-08-01 M4 measurement showed a four-CPU Docker VM with 8,322,359,296
bytes of memory, not the 16 GB assumed by ADR-035. The running primary stack
used about 2.55 GiB, including about 1.85 GiB for its Next development process.
This rules out one complete stack per AI task, but leaves room for one bounded
isolated stack.

## Decision

Use two capacity tiers.

### Tier 1: three frontend-only slots

The existing slots remain bounded at two normal leases and one explicitly
acknowledged overflow lease. Their status contract is additive:

- `state` remains for compatibility;
- `lease_state` says whether the lease is `available`, `active`, or `expired`;
- `startable` says whether a new owner can start the slot now;
- `block_reason` gives one stable machine-readable reason;
- `backend_compatibility` is `accepted`, `candidate_compatible`,
  `incompatible`, or `unknown`.

The primary deployment records a backend source fingerprint over `app/**`,
`migrations/**`, and `alembic.ini`, plus the last accepted backend fingerprint
and accepted source revision. A frontend slot may reuse a primary candidate
without an override only when:

1. the candidate's backend fingerprint equals the accepted backend anchor;
2. the frontend worktree's backend fingerprint equals the same anchor;
3. the worktree base revision equals the accepted source revision;
4. dependency and preview-configuration fingerprints match;
5. the primary API is healthy and no primary operation lock is active.

Any missing anchor or changed backend, migration, dependency, or configuration
input fails closed. Deployment state created by older tooling has no backend
anchor and remains non-startable until the primary runtime is deployed or
promoted once with the new tooling.

### Tier 2: one isolated full-stack slot

Add exactly one full-stack lease with:

- project `npcink-ai-cloud-m4-fullstack-1`;
- M4 loopback ports `8031`, `15434`, and `16381`, with browser tunnel `18031`;
- a separate source mirror, image tags, PostgreSQL volume, Redis volume,
  artifact volume, frontend dependency volume, and `.next` cache;
- API, PostgreSQL, Redis, frontend, and proxy only;
- no runtime, callback, or ops worker by default;
- restart policy `no` and a combined container memory ceiling of 2,880 MiB;
- an explicit owner and 1-24 hour lease;
- an operation lock that prevents simultaneous primary and isolated image
  build/start operations.

The isolated slot may exercise mutations and migrations only against its own
database and Redis. It reuses the protected M4 environment files by local
host symlink, but receives no Cloudflare hostname and does not alter the
primary candidate, accepted state, database, images, or volumes. Release
removes only resources carrying the exact isolated Compose project label.

## Boundary

The tiered preview system is development infrastructure, not a new hosted
runtime product, deployment control plane, or acceptance authority. GitHub
`master` remains integration truth, the primary M4 promotion remains accepted
runtime truth, and WordPress retains ability, workflow, approval, preflight,
prompt, router, preset, and final-write truth.

Evidence from either slot proves only the named candidate behavior. It does
not prove merge, primary promotion, production deployment, or human acceptance.

## Alternatives Considered

### Treat every empty lease as usable

Rejected. Lease availability and runtime eligibility are independent facts.

### Allow any frontend to attach to any primary candidate

Rejected. UI/API contract drift can produce plausible but false browser
evidence. The accepted backend anchor makes compatibility explicit.

### Create several complete stacks

Rejected. The measured 8 GB Docker ceiling and the observed Next memory use do
not support safe unbounded duplication.

### Give the isolated slot workers and a public hostname

Rejected. Most concurrent debugging needs request/response behavior and
isolated persistence. Workers and Cloudflare routing would add memory, side
effects, and a second operational surface.

## Consequences

- operators can distinguish an empty lease from an actually startable slot;
- frontend-only candidates no longer block unrelated compatible UI previews;
- backend-changing work has one isolated escape lane instead of taking over the
  primary candidate;
- only one isolated full-stack task can run at a time;
- worker behavior and accepted-runtime evidence remain in the serialized
  primary lane;
- old primary state must be refreshed once before candidate-compatible frontend
  reuse becomes available;
- resource measurements must be repeated if Docker memory, Next behavior, or
  service composition changes materially.
