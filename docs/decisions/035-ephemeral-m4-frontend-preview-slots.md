# ADR-035: Ephemeral M4 Frontend Preview Slots

## Status

Accepted.

## Date

2026-07-29.

## Context

The single M4 candidate runtime is intentionally serialized by one merge lane.
That is correct for API, migration, worker, database, dependency, and proxy
changes, but it creates unnecessary blocking when two or three AI tasks are
only changing frontend appearance. Replacing the primary candidate for every
CSS or component checkpoint makes unrelated visual tasks overwrite one another.

Separate complete stacks would remove that collision, but each copy would add
PostgreSQL, Redis, API, workers, migrations, volumes, secrets, and independent
runtime drift. That would contradict ADR-023's single-runtime decision and
consume too much of the 16 GB M4's bounded Docker memory.

## Decision

Add a maximum of three ephemeral frontend-only preview slots:

- slots 1 and 2 are the two normal slots;
- slot 3 requires an explicit `--allow-third` acknowledgement because it adds
  avoidable memory and build pressure;
- every slot has one Next development container, one read-only NGINX edge, one
  private source mirror, and one disposable `.next` cache;
- every slot reuses the primary frontend image and mounts the primary
  `node_modules` volume read-only;
- every slot connects to the one accepted primary runtime network and starts
  no PostgreSQL, Redis, API, or worker service;
- the ordinary path refuses to start unless the primary deployment reports
  `acceptance_state=accepted`, `source_branch=master`, `source_dirty=false`,
  the same base revision, matching dependency/config fingerprints, no active
  primary operation lock, and a healthy API;
- `--allow-candidate-primary` exists only to validate changes to the slot
  machinery itself. It requires the same Git revision, clean source on both
  sides, and matching dependency/configuration fingerprints; it is not an
  ordinary visual-development mode. The archive hash remains a transfer
  integrity check because equivalent archives can differ in metadata.

Each slot is an explicit lease:

- the caller supplies a task-specific owner;
- claim/sync/release operations take an atomic per-slot lock;
- another unexpired owner cannot sync, stop, or release the slot;
- TTL is 1-24 hours, with eight hours as the default;
- expiry is reported by status and reclaimed only by an explicit new claim;
  there is no watcher, daemon, cron job, or hosted callback;
- release removes only the exact slot project, source mirror, `.next` volume,
  and state record. It never removes the shared dependency volume.

The slot edge is read-only for product behavior. It permits GET/HEAD reads and
the minimum login, verification-code, and logout session lifecycle required to
inspect authenticated screens. It rejects Admin, Portal, runtime, setup, and
service-plane mutations. Work that needs mutations, backend changes,
migrations, worker behavior, or persistence must use the primary candidate
lane.

M4 ports `8021-8023` remain loopback-only. The authoring Mac uses foreground
SSH tunnels on `18021-18023`. Slots receive no Cloudflare hostname and do not
change DNS, Access, Tunnel, or the protected `cloud.mqzjmax.top` route.

Frontend source still originates from the authoring worktree and crosses the
existing private Tailscale relay under the same global transfer lock. M4 stores
no Git checkout and performs no source authoring.

## Boundary

These slots are disposable frontend processes, not separate Cloud runtimes or
accepted deployment states. The accepted primary runtime remains the only
backend, persistence, worker, migration, and Cloudflare preview authority.
GitHub `master` remains reviewed integration truth. WordPress continues to own
ability, workflow, approval, preflight, prompt, preset, router, and final-write
truth.

Candidate evidence from a slot proves only that the named frontend source
revision rendered against the recorded accepted primary revision. It does not
prove merge eligibility, accepted M4 state, production release, or human
acceptance.

## Alternatives Considered

### One complete stack per AI task

Rejected. It multiplies stateful services, secrets, migrations, volumes, image
coordination, and memory use while making runtime provenance harder to inspect.

### One backend with unlimited frontend containers

Rejected. Unlimited Next development servers can exhaust the M4 Docker memory
budget and make the stable backend unreliable. Two normal slots and one
explicit overflow slot keep the capacity bounded.

### Multiple Cloudflare subdomains

Rejected for the inner loop. It adds DNS, Access, Tunnel routing, cookie, and
public-host provenance to a problem that foreground SSH tunnels already solve.

### Allow all mutations through each frontend

Rejected. Multiple visual tasks would then race on the same accounts, sessions,
billing, provider settings, and other backend state even though their work does
not need to change it.

### Per-save synchronization

Rejected. It publishes incomplete edits, increases relay contention, and
creates a background deployment controller. Synchronization remains an
explicit coherent checkpoint.

## Consequences

- two or three frontend appearance tasks can render concurrently without
  replacing the primary candidate;
- backend work remains serialized through the existing merge lane;
- ordinary slots depend on a healthy accepted primary runtime and fail closed
  while that runtime is a candidate or being changed;
- slots stop after an M4/Docker restart because their restart policy is `no`;
- operators should release slots; an expired lease is reclaimed by the next
  explicit owner claim;
- browser validation uses distinct loopback ports, so screenshots and reports
  must record the slot, frontend revision, and primary revision;
- a later primary candidate invalidates existing slot evidence; `status`
  reports the backend lease as drifted until the primary is accepted again and
  the slot is explicitly synchronized;
- promotion after merge still updates the one primary M4 runtime; a slot is
  never promoted into an accepted backend.
