# M4 Remote Development and Overlay Network Standard v1

Status: active.

## 1. Purpose

This standard describes the single-operator development setup in which an M5
MacBook Air is the authoring and Git machine, while an M4 Mac mini owns the
Cloud Docker runtime and native Ollama service. It consolidates the lessons
from the LAN, Tailscale, private relay, and 贝锐蒲公英 trials into one
repeatable operating model.

The access-path decision is recorded in
[ADR-052](decisions/052-pgy-primary-m4-access.md). The source relay history is
preserved in [ADR-026](decisions/026-private-source-relay-transfer.md) and
[ADR-051](decisions/051-managed-private-source-relay-service.md).

## 2. Ownership and Topology

```text
M5 MacBook Air
  source edits, Git, local gates, operator commands
        |
        | office LAN -> Pgy -> Tailscale
        v
M4 Mac mini
  Docker Cloud, PostgreSQL, Redis, workers, native Ollama
        |
        v
local SSH tunnel on M5: 127.0.0.1:18010
```

The M5 remains source and Git truth. M4 is runtime and integration evidence;
it never becomes a Git checkout or source-authoring machine. GitHub `master`
is reviewed integration truth, and only clean merged `master` promoted through
the governed command becomes accepted M4 evidence.

The current single-operator addresses are:

| Purpose | Address |
| --- | --- |
| Office LAN SSH | `muze@192.168.10.200` |
| Pgy primary M4 SSH | `muze@172.16.3.35` |
| Tailscale M4 fallback | `muze@100.102.170.79` |
| Pgy source relay | `root@100.90.87.36` |
| M4 preview loopback | `127.0.0.1:8010` |
| M5 tunnel endpoint | `127.0.0.1:18010` |

Virtual overlay addresses are operator-managed configuration, not discovery
truth. If a Pgy address changes, override it for the operation, verify the new
address on both endpoints, then update the checked-in default in a reviewed
change.

## 3. Network and Exposure Rules

Automatic tunnel selection is deterministic:

1. probe M4 loopback health through office LAN;
2. probe M4 loopback health through Pgy;
3. probe M4 loopback health through Tailscale;
4. fail closed if all three probes fail.

The tunnel binds only M5 `127.0.0.1:18010` and forwards to M4
`127.0.0.1:8010`. M4 application, PostgreSQL, Redis, and Ollama ports remain
loopback-only. Do not expose `8010`, `15433`, `16380`, or `11434` to LAN, Pgy,
Tailscale, Cloudflare, or the public internet.

Use:

```bash
pnpm run m4:preview:auto
open http://127.0.0.1:18010
```

The command reports `selected_route=lan`, `selected_route=pgy`, or
`selected_route=tailscale`. A route label is evidence of the selected SSH
transport only; it is not proof that the source is committed, merged, or
accepted.

## 4. Source Transfer and Runtime Operations

Ordinary M4 source transfer defaults to direct SSH over Pgy:

```text
NPCINK_CLOUD_M4_SSH_HOST=muze@172.16.3.35
NPCINK_CLOUD_M4_SOURCE_TRANSFER_MODE=direct
```

Direct transfer is intentionally fail-closed. A failed Pgy transfer must not
silently switch to Tailscale or the relay, because that would hide a degraded
network path and make timing evidence incomparable.

Use the explicit recovery path when Pgy is unavailable:

```bash
NPCINK_CLOUD_M4_SSH_HOST=muze@100.102.170.79 \
NPCINK_CLOUD_M4_SOURCE_TRANSFER_MODE=relay \
pnpm run m4:preview:sync
```

Use `m4:preview:sync` for ordinary source changes. Use
`m4:preview:deploy` when Docker, Compose, proxy, deployment-script, dependency,
or orchestration fingerprints change. A sync that exits with the orchestration
guard is behaving correctly; rerun the deploy lane instead of bypassing it.

Always inspect M4 status before a mutating operation:

```bash
pnpm run m4:preview:status
```

The status must be checked for the named Compose project, source revision,
source cleanliness, API/frontend health, Alembic head, loopback-only ports, and
managed Ollama ownership. Never use broad Docker cleanup or a second runtime as
a recovery shortcut.

## 5. Mobile Remote Control

The phone is a control surface, not a replacement authoring machine:

```text
phone -> Pgy or Tailscale -> SSH to M5 -> tmux -> optional SSH to M4
```

The recommended workflow is:

1. enable Remote Login on M5 and use SSH keys only;
2. connect from a mobile SSH client to M5's overlay address;
3. attach to a persistent `tmux` session;
4. run Git, focused checks, M4 status, logs, or a controlled tunnel command;
5. use the phone browser for the protected preview when visual inspection is
   needed.

Keep M5 powered, reachable, and awake for remote work. Restrict Pgy/Tailscale
device membership and SSH access to the operator's devices. Do not expose
Docker or Ollama directly just to make the phone workflow easier.

## 6. Evidence and Development Loop

The useful loop is:

```text
focused local gate
  -> M4 candidate sync/deploy
  -> M4 status and consumer check
  -> PR required checks
  -> merge to master
  -> clean-master M4 promotion
```

These states are distinct:

| State | Proves | Does not prove |
| --- | --- | --- |
| Local verified | changed seam passes focused checks | M4 runtime or merge eligibility |
| Candidate M4 | current worktree runs in M4 | reviewed or merged source |
| PR verified | GitHub required checks pass | M4 is running the revision |
| Merged master | reviewed integration source | M4 acceptance |
| Accepted M4 | clean merged master is promoted and smokes pass | production release |

Do not call a dirty candidate, a direct SSH success, or an HTTP 200 response
“accepted”. Record the exact route, source revision, source cleanliness,
transfer mode, and relevant health result.

## 7. Measured Network Lessons

The following are dated observations, not service-level guarantees:

| Observation | Result | Lesson |
| --- | --- | --- |
| 4.6 MB source bundle through private relay, 2026-07-24 | about 18 seconds | relay split improved the observed Peer Relay path |
| Endpoint-to-endpoint Peer Relay path, historical | about 3–7 minutes | do not assume overlay connectivity means good throughput |
| Dormitory Pgy SSH, 2026-09-04 | about 0.9 seconds per connection | usable for primary interactive access |
| Dormitory Pgy 4 MiB SSH payload, 2026-09-04 | usually about 1.0–1.6 seconds; one 9-second outlier | direct transfer is fast but still needs observation |
| Dormitory Tailscale SSH, 2026-09-04 | about 3–6 seconds per connection | retain Tailscale as a real fallback |
| Dormitory ICMP ping | 100% loss on both overlays | ping is not a valid acceptance check for this setup |

Use SSH建链、bounded payload transfer, tunnel readiness, and M4 health as the
transport evidence. Do not manufacture Provider calls or full M4 suites to
create prettier timing samples.

## 8. Troubleshooting and Reassessment

| Symptom | First check | Correct response |
| --- | --- | --- |
| `selected_route=lan` fails | office LAN SSH and M4 loopback health | allow automatic Pgy fallback |
| Pgy SSH fails | Pgy client, virtual IP, M4 power, Remote Login | inspect status, then explicit Tailscale fallback |
| direct sync fails | exact transfer error and route | preserve evidence; use explicit relay recovery |
| tunnel starts but no local readiness | `127.0.0.1:18010` owner and `/health/live` | choose another local port or stop the exact stale tunnel |
| M4 containers stopped after reboot | `m4:preview:status` | use `m4:preview:recover` for the exact project |
| Ollama ownership mismatch | `m4:preview:ollama:status` | fail closed; do not terminate an unknown listener |

Reassess the primary path when ordinary sync repeatedly exceeds two minutes,
network/tunnel friction exceeds ten minutes per working day, M4 downtime costs
more than 30–60 minutes per week, or the Pgy virtual address is not stable.
Reassess the topology before adding a cloud development server or a second
runtime; first isolate whether the bottleneck is transfer, tunnel, image build,
M4 memory, or test duration.

Rollback is configuration-only:

```bash
NPCINK_CLOUD_M4_SSH_HOST=muze@100.102.170.79 \
NPCINK_CLOUD_M4_SOURCE_TRANSFER_MODE=relay \
pnpm run m4:preview:sync
```

Do not edit production code on M4. Any emergency host change must be recorded
back in Git before the next deployment.
