# M4 Parallel Preview Capacity Validation — 2026-08-01

Status: completed source and M4 candidate validation; not primary acceptance or
production evidence.

## 1. Problem and Root Cause

The operator saw three frontend slots reported as `state=available`, but none
could start while the primary M4 runtime was an unaccepted candidate. The
status described only an empty lease, while the start command also depended on
primary acceptance, API health, source base, dependency inputs, preview
configuration, and operation locks.

The slots were working as designed but exposed an incomplete capacity model:

```text
capacity = lease availability + backend eligibility + resource eligibility
```

They also shared the primary API and persistence by design. Adding more
frontend slot numbers could not make backend-changing tasks independent.

## 2. Implemented Model

The revised system has two bounded tiers.

| Tier | Capacity | Shares primary data/API | Supports backend or migration changes | Worker evidence | Acceptance authority |
| --- | ---: | --- | --- | --- | --- |
| Frontend-only | 2 normal + 1 explicit overflow | yes | no | no | none |
| Isolated full-stack | 1 | no | yes | no | none |
| Primary M4 lane | 1 serialized candidate | n/a | yes | yes | promotion after merge |

Frontend status now reports `lease_state`, `startable`, `block_reason`, and
`backend_compatibility` separately. A primary frontend-only candidate may be
reused when its backend fingerprint and the consuming worktree both match the
last accepted backend anchor. Missing or mismatched evidence fails closed.

The isolated slot uses its own project, source mirror, image tags, database,
Redis, volumes, and loopback ports. It starts only PostgreSQL, Redis, API,
frontend, and proxy. Runtime, callback, and ops workers remain in the primary
lane.

## 3. M4 Evidence

The pre-change measurement and post-change validation were performed on the
same M4 Docker runtime.

| Evidence | Observed result |
| --- | --- |
| Docker capacity | 4 CPUs; 8,322,359,296 bytes memory |
| Primary stack before isolated start | about 2.55 GiB; Next about 1.85 GiB at the first sample |
| Isolated project | `npcink-ai-cloud-m4-fullstack-1` |
| Isolated images | `npcink-ai-cloud-runtime:m4-fullstack-1`; `npcink-ai-cloud-frontend:m4-fullstack-1` |
| Migration | empty isolated database upgraded to `20260731_0077` |
| Services | PostgreSQL, Redis, API, frontend, proxy healthy |
| Workers | 0 |
| HTTP | `/` = 200; `/health/live` = 200 |
| Restart policy | `no` for all five services |
| Memory ceilings | proxy 64 MiB; frontend 1536 MiB; API 768 MiB; PostgreSQL 384 MiB; Redis 128 MiB |
| Observed isolated memory after final sync | about 1.18 GiB total |
| Main candidate after isolated validation | same branch/revision, still dirty with 32 paths; not replaced |
| Release proof | isolated containers = 0; isolated labeled volumes = 0; lease available |

The primary candidate remained
`codex/admin-service-subscription-split-latest-20260731` at revision
`1ce0e52e214a0e08d1c56d17ea63be565410f666`, with `source_dirty=true` and 32
paths. This is coexistence evidence, not primary acceptance.

## 4. Failures Caught During Validation

Six implementation defects were found before commit:

1. the isolated Compose resource overlay was present but not attached to the
   actual runtime Compose command;
2. owner validation and release were separate, leaving an expired-lease race;
3. an empty status-only owner argument was lost across SSH argument joining;
4. `pnpm run ... --` passed a separator that the release parser did not accept;
5. Docker `stats` did not support the attempted label filter, so resource rows
   were silently absent;
6. the engineering command inventory did not initially include the six new
   package commands.

Each defect received a focused regression contract or an exact runtime check.

## 5. Development Rules Derived

### Report capacity as independent facts

Never use one word such as `available` for both ownership and runtime
eligibility. A useful operator status answers:

1. Is the lease free?
2. Can this source start now?
3. If not, what exact dependency blocks it?

### Compare the shared seam, not broad labels

`candidate` is too coarse to decide whether a frontend can reuse an API. Use a
stable fingerprint for the shared backend seam and anchor it to the accepted
revision. Any missing evidence is `unknown`, not compatible.

### Measure before multiplying stacks

The old 16 GB assumption was incorrect for the Docker VM. Actual measurement
showed an 8 GB ceiling and made “one isolated stack” the safe bounded result.
Capacity decisions must use current runtime evidence, not host marketing specs
or old ADR assumptions.

### Isolate every mutable or build-owned surface

A concurrent full-stack candidate needs separate data volumes, image tags,
source paths, ports, state, and operation locks. Sharing any one of those can
silently replace or contaminate another task even when container names differ.

### Validate the real operator command

Direct script tests are insufficient when operators invoke package aliases.
Test the exact `pnpm run <command> -- ...` shape because argument separators,
empty SSH arguments, and wrapper behavior are part of the interface.

### Treat cleanup as an owned state transition

Release must validate the owner while holding the lease-operation lock, refuse
an active deployment operation, and delete only exact Compose-labeled
resources. Never use global Docker prune commands for slot lifecycle.

### Keep evidence levels separate

An isolated candidate proves runtime behavior for its source bundle. It does
not prove GitHub merge, primary M4 promotion, production deployment, or human
acceptance. Final reports must name the achieved evidence level explicitly.

## 6. Operator Selection

Use a frontend slot when the work changes only browser presentation and status
reports `startable=true`. Use the isolated full-stack slot when API,
migrations, mutations, proxy behavior, or persistence must differ from the
primary candidate. Use the primary lane for workers, accepted promotion, and
any evidence that must represent merged `master`.

The isolated slot is intentionally singular. If it becomes a sustained queue,
measure queue time and Docker pressure before adding capacity; do not add more
complete stacks by copying the project number.
