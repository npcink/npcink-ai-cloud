# M4 Preview Development Workflow v1

This runbook owns host, command, recovery, and implementation mechanics.
AI agents must also follow the normative
[M4 Preview AI Development Standard v1](m4-preview-ai-development-standard-v1.md)
for task classification, evidence states, Git completion, and final reporting.
The rationale for candidate and accepted states is recorded in
[ADR-023](decisions/023-m4-preview-candidate-acceptance-promotion.md).
The source-only authoring and agent checkpoint-dispatch decision is recorded in
[ADR-025](decisions/025-source-only-authoring-and-ai-m4-checkpoint-dispatch.md).
The private source-transfer decision is recorded in
[ADR-026](decisions/026-private-source-relay-transfer.md).

## Decision

The authoring Mac remains the source and Git truth and runs operator commands.
The M4 is the routine Docker development runtime for build, execution,
migration, tests, and preview. The approved office workflow does not use the
authoring Mac as a silent Cloud Docker fallback, and no Git checkout or source
edit is performed on M4. No day-to-day Docker installation is required on the
authoring Mac.

The operator approved replacing the disposable legacy Cloud Preview rather than
keeping two Cloud stacks in parallel. The current defaults are:

| Boundary | Value |
| --- | --- |
| SSH transport | `muze@100.102.170.79` |
| Private source relay | `root@100.90.87.36` |
| M4 source mirror | `/Users/muze/docker-workspaces/npcink-ai-cloud-m4-dev` |
| Compose project | `npcink-ai-cloud-m4-dev` |
| Preview proxy | `127.0.0.1:8010` |
| PostgreSQL | `127.0.0.1:15433` |
| Redis | `127.0.0.1:16380` |
| Protected preview | `https://cloud.mqzjmax.top` |

This decision supersedes the earlier proposed parallel `8011` V2 rollout. It
does not authorize a production deploy or any
Cloudflare DNS, Access, or Tunnel change. The existing tunnel continues to use
`127.0.0.1:8010`.

## Private Source Relay Contract

Ordinary source bundles default to a transient private relay because the
authoring Mac and M4 can each connect directly to the relay even when they
cannot establish a direct path to each other.

The fixed flow is:

1. package the eligible authoring worktree into `source.tgz` and calculate its
   SHA-256;
2. acquire the relay operation lock;
3. upload to `root@100.90.87.36` under a mode-`0700` per-run directory;
4. verify byte size and SHA-256 on the relay;
5. start a temporary HTTP server bound only to
   `100.90.87.36:18080`;
6. acquire the existing M4 deployment lock, then let M4 download with bounded
   retries, timeout, and low-speed detection;
7. verify SHA-256 on M4 before extraction;
8. stop the temporary service and remove the relay and M4 transfer files on
   success, failure, or interruption.

The relay contains only transient bytes for the active operation.
It does not become source or Git truth. It is not a persistent revision cache,
a Docker runtime, an acceptance record, or another deployment controller. The
public relay SSH maintenance address is deliberately outside this default
flow.

The normal environment defaults are:

```text
NPCINK_CLOUD_M4_SOURCE_TRANSFER_MODE=relay
NPCINK_CLOUD_M4_RELAY_SSH_HOST=root@100.90.87.36
NPCINK_CLOUD_M4_RELAY_TAILSCALE_IP=100.90.87.36
NPCINK_CLOUD_M4_RELAY_HTTP_PORT=18080
```

The script fails visibly when the relay is unavailable. For a bounded
operator-selected recovery, use the explicit direct fallback:

```bash
NPCINK_CLOUD_M4_SOURCE_TRANSFER_MODE=direct pnpm run m4:preview:sync
```

Do not turn that override into a silent fallback. A degraded endpoint-to-
endpoint transfer must remain observable. If the relay lock is stale, inspect
`/var/tmp/npcink-ai-cloud-m4-source-relay/operation.lock/owner.txt` on the
relay and verify that no transfer service is active before removing only that
exact lock.

SSH and SCP allow up to three bounded connection attempts because the observed
Peer Relay path can lose an initial handshake. This retries connection
establishment only; it does not hide a failed transfer, switch transport mode,
or extend an operation without limit.

## Safety Boundary

The checked-in defaults create, update, restart, or stop only the Compose
project `npcink-ai-cloud-m4-dev`. Explicit environment overrides remain
restricted to the `npcink-ai-cloud-m4-*` project and remote-directory family.
The legacy name `npcink-ai-cloud-m4-preview` is always rejected by the script,
so an ordinary command cannot accidentally mutate it.

Never use broad host cleanup commands such as `docker system prune`, broad
volume deletion, or deletion by a partial name. Other M4 Docker workloads are
outside this workflow.

All published ports bind to `127.0.0.1`. They are intentionally unreachable
through the M4 LAN or Tailscale address. For the single operator's browser and
WordPress-to-Cloud integration, use the automatic SSH tunnel:

```bash
pnpm run m4:preview:auto
open http://127.0.0.1:18010
```

The automatic command first verifies the M4 loopback health endpoint over the
office LAN SSH target `muze@192.168.10.200`. When that path is unavailable, it
verifies and uses the existing Tailscale target `muze@100.102.170.79`. The
browser address remains `http://127.0.0.1:18010` in both locations. Override
the LAN target with `NPCINK_CLOUD_M4_LAN_SSH_HOST` only when the office address
changes; `NPCINK_CLOUD_M4_SSH_HOST` remains the Tailscale/deployment target.

The tunnel binds only the authoring Mac's `127.0.0.1:18010`, stays in the
foreground, and closes with `Ctrl+C`. It does not update source, use the source
relay, acquire the remote deployment lock, or change containers. Use
`-- --local-port <port>` or `NPCINK_CLOUD_M4_TUNNEL_LOCAL_PORT` only when
`18010` is already occupied. The deterministic
`pnpm run m4:preview:tunnel` command remains available when an explicitly
configured SSH target is required.

Before starting SSH, the command fails when the requested local port already
has a listener, so an old healthy tunnel cannot be mistaken for the new
process. Select a different `--local-port` instead of reusing that listener.
The command reports `tunnel_ready=true` only after the local listener can
successfully read `/health/live`; selecting an SSH route or starting an SSH
process is not readiness. The default wait is 120 seconds and can be bounded
with `NPCINK_CLOUD_M4_TUNNEL_READY_TIMEOUT_SECONDS`. A timeout fails closed,
stops the child SSH process, and never emits the ready marker.

For an offsite browser lane, add the optional read-only transport preflight:

```bash
pnpm run m4:preview:auto -- --browser-preflight
```

It reads the final Tailscale ping route and a bounded 256 KiB byte range from a
local Next.js static asset. It does not run Playwright, change M4, select
replacement evidence, or print raw Tailscale output. A peer-relay path, an
incomplete sample, or throughput below 64 KiB/s emits
`browser_transport=degraded` and `browser_evidence=not_counted`. This is a
transport classification, not a product failure. Use the same revision with
local production Playwright, or collect manual evidence through an
existing-authenticated Cloudflare browser. Record which lane supplied the
evidence; do not silently treat either as an automatic substitute. A
`browser_transport=ready` result only says the transport is usable enough to
attempt real browser assertions.

The implementation reasoning, rejected alternatives, timeout correction,
measured LAN/Tailscale evidence, and troubleshooting lessons are recorded in
[the 2026-07-25 single-operator preview retrospective](m4-personal-preview-auto-route-retrospective-2026-07-25.md).

`https://cloud.mqzjmax.top` remains the protected browser-preview entry. Do not
configure an automated local WordPress connector against that hostname:
Cloudflare Access returns a browser login redirect, while the connector requires
a non-redirecting JSON API response. For a disposable local WordPress
integration fixture, keep the tunnel open and use
`http://127.0.0.1:18010` as the self-hosted Cloud Base URL. Do not overwrite an
existing verified Cloud connection merely to exercise M4 Preview.

### Portal Test Account

For a local SSH tunnel, open:

```text
http://127.0.0.1:18010/portal/dev-entry?origin=http%3A%2F%2F127.0.0.1%3A18010&redirect=%2Fportal
```

The explicit local `origin` keeps the redirect on
`http://127.0.0.1:18010/portal`. Without it, the configured public base URL may
redirect the browser to `cloud.mqzjmax.top`.

For the Cloudflare Access protected path, open:

```text
https://cloud.mqzjmax.top/portal/dev-entry
```

The development-only entry creates a Portal session for
`portal-demo@example.com` and redirects to `/portal`. It does not require SMTP
or a Portal password. This is a shared development identity: every operator
allowed through the Cloudflare Access policy receives the same disposable
Portal account, so it must not contain personal, production, or otherwise
sensitive test data.

The entry remains gated twice: Cloudflare Access protects the public hostname,
and the frontend accepts the route only while `NEXT_PUBLIC_ENV=development` and
the request host is present in `NEXT_PUBLIC_MINI_DEV_HOST_ALLOWLIST`. It is not
a general user login path and must not be copied into a production Compose
environment.

To close domain auto-login without changing Cloudflare, remove
`cloud.mqzjmax.top` from `NPCINK_CLOUD_M4_MINI_DEV_HOST_ALLOWLIST` on M4 and
redeploy the preview. Removing the checked-in M4 override and redeploying is the
Git rollback.

## One-Time Environment Bootstrap

The source bundle never contains `.env`, `.env.local`, or `.env.deploy`.
Before the first deploy, initialize the remote directory and copy the existing
development environment files on M4 without printing their contents:

```bash
ssh muze@100.102.170.79 '
  set -eu
  install -d -m 700 /Users/muze/docker-workspaces/npcink-ai-cloud-m4-dev
  install -m 600 /Users/muze/gitee/npcink-ai-cloud/.env \
    /Users/muze/docker-workspaces/npcink-ai-cloud-m4-dev/.env
  install -m 600 /Users/muze/gitee/npcink-ai-cloud/.env.local \
    /Users/muze/docker-workspaces/npcink-ai-cloud-m4-dev/.env.local
'
```

Review those files on M4 when configuration changes are required. Do not copy
them back to the authoring Mac, add them to Git, or pass secret values on a
command line.

The M4 overlay supplies the non-secret, stable development key id
`m4-preview-service-v1` for provider and service-setting encryption unless
`NPCINK_CLOUD_SERVICE_SETTINGS_ENCRYPTION_KEY_ID` is explicitly configured.
The corresponding `NPCINK_CLOUD_SERVICE_SETTINGS_SECRET` remains protected in
the M4 environment files and has no checked-in default. Missing or invalid
secret storage must return a redacted JSON error and must never persist the
submitted provider credential.

The M4 base-image prefetcher also requires `crane`:

```bash
ssh muze@100.102.170.79 \
  'HOMEBREW_NO_AUTO_UPDATE=1 brew install crane'
```

## Simplified Operating Model

M4 Preview is an integration runtime, not a mandatory inner loop.

1. **Ordinary local work:** edit and manage Git on the authoring Mac. Keep the
   local WordPress fixture local. Documentation, PHP-only, and other
   WordPress-only changes do not require an M4 sync.
2. **Cloud integration work:** sync only when the change needs the Cloud API,
   frontend, workers, PostgreSQL, or Redis. Open one foreground tunnel and use
   `http://127.0.0.1:18010` for both the browser and a disposable local
   WordPress fixture.
3. **Remote preview:** use `https://cloud.mqzjmax.top` only when the
   Cloudflare Access protected, off-machine browser path is the behavior being
   checked.

For an already authorized Cloud code task, an AI agent runs `sync` or `deploy`
at a coherent task checkpoint without waiting for another deployment request.
This is an explicit task action, not a per-save watcher. Do not add a second
preview hostname, Cloudflare service-token storage in the WordPress addon, a
tunnel daemon, Git hook, hosted-CI callback, or another control plane to make
this single-operator development path more automatic.

When multiple AI tasks are changing appearance only, use the bounded
frontend-only leases from
[ADR-035](decisions/035-ephemeral-m4-frontend-preview-slots.md). They share the
accepted primary backend and do not add another database, API, worker,
Cloudflare hostname, or accepted-state authority. Backend, migration,
dependency, proxy, and mutation work still waits for the one primary merge
lane.

Keep this model for five working days and record only:

- typical edit-to-preview time;
- minutes lost to network, tunnel, or synchronization failures each day;
- defects caught by the full M4 runtime that local WordPress work did not
  reveal.

Keep M4 as the default Cloud integration runtime when edit-to-preview normally
stays under two minutes and environment friction stays under ten minutes per
day. If those limits are repeatedly exceeded, diagnose transfer, network,
runtime, or test-scope friction and revise the workflow through an explicit
operator decision. Do not silently move the routine Cloud runtime back to the
authoring Mac.

### AI checkpoint rule

The default AI handoff for Cloud code is:

1. finish a coherent source edit batch on the authoring Mac;
2. run the narrowest useful source/static check there;
3. dispatch `m4:preview:sync`, or `m4:preview:deploy` when fingerprints require
   a rebuild;
4. verify the relevant M4 behavior and `m4:preview:status`;
5. repeat the checkpoint after later source changes.

Documentation-only and other local-only work does not trigger M4. An M4
failure leaves runtime evidence incomplete; it does not authorize an unreported
local Docker substitute.

## Daily Commands

Run commands from the local repository worktree:

```bash
# Open the single-operator preview; office LAN first, Tailscale fallback
pnpm run m4:preview:auto

# Offsite read-only transport classification before browser assertions
pnpm run m4:preview:auto -- --browser-preflight

# First deployment or dependency/Dockerfile/lock-file change
pnpm run m4:preview:deploy

# Ordinary Python, frontend, migration, test, or documentation change
pnpm run m4:preview:sync

# After the reviewed PR is merged into master
pnpm run m4:preview:promote -- --pr <merged-pr-number>

# Read-only runtime evidence
pnpm run m4:preview:status
pnpm run m4:preview:logs -- api
pnpm run m4:preview:logs -- --follow --tail 100 frontend

# Normal inner-loop test: exact paths or pytest node ids only
pnpm run m4:preview:test -- --focused tests/domain/test_example.py::test_case

# Partial and full integration suites
pnpm run m4:preview:test -- --contract
pnpm run m4:preview:test -- --domain
pnpm run m4:preview:test -- --full

# Selection check without SSH or Docker mutation
pnpm run m4:preview:test -- --dry-run --focused tests/domain/test_example.py

# Start the existing project after a Docker Desktop or M4 restart
pnpm run m4:preview:recover

# One-time native Ollama service handoff and preview provider setup
pnpm run m4:preview:ollama:install
pnpm run m4:preview:ollama:configure

# Read or restart only the managed M4 Ollama service
pnpm run m4:preview:ollama:status
pnpm run m4:preview:ollama:restart

# Targeted lifecycle operations
pnpm run m4:preview:restart -- api
pnpm run m4:preview:stop

# Frontend-only collaboration slots (two normal, third explicit)
pnpm run m4:frontend:up -- --slot 1 --owner <task-id>
pnpm run m4:frontend:sync -- --slot 1 --owner <task-id>
pnpm run m4:frontend:tunnel -- --slot 1 --auto
pnpm run m4:frontend:status
pnpm run m4:frontend:logs -- --slot 1
pnpm run m4:frontend:release -- --slot 1 --owner <task-id>
```

`deploy` builds the runtime and frontend images on M4. It never calls local
Docker and never relays a locally built image. `sync` refuses to continue when
a dependency input, Dockerfile, lock file, Compose file, or proxy configuration
requires `deploy`. `prepare` builds from an isolated incoming directory and
does not change the active source mirror, running containers, or deployed
fingerprint markers. If `prepare` produced newer images, `sync` refuses to
apply source until `deploy` has successfully validated those images.

The M4 Docker Desktop proxy currently truncates redirected registry blob
downloads. The M4-only builder therefore uses host-side `crane` to fetch the
arm64 base images directly into temporary archives and imports them into the
same M4 Docker engine. Python and Node are fetched through the DaoCloud Docker
Hub cache, while uv uses the Nanjing University GHCR cache. Both pinned inputs
must match the canonical digest, and the imported platform config digest is
verified before a local-only alias is created. The mutable Node tag's resolved
digest is cached alongside its imported config digest.

The backend build then validates and skips only the canonical external
Dockerfile-frontend declaration and uses Docker 29's bundled frontend, which
has been probed for the required secret-mount syntax. It substitutes only the
verified local base aliases in the streamed build recipes. Neither canonical
Dockerfile is edited, no image crosses from the authoring Mac, and production
build behavior is unchanged.

Build-container TLS is affected by the same Docker Desktop network path.
During an image rebuild, the deployment script starts a fixed-port
loopback-only package proxy on M4. It exposes only fixed PyPI, Python file, and
npm registry destinations through `host.docker.internal`, never forwards
client credentials, and is stopped before `prepare` or `deploy` returns. PyPI
configuration is passed as a BuildKit secret; the npm URL is a non-secret build
argument. The canonical Dockerfiles remain unchanged.

Registry metadata remains buffered because its embedded artifact URLs must be
rewritten. Wheel and npm tarball responses send upstream headers immediately,
then stream 256 KiB chunks to the build client and an atomic M4-host cache at
`~/.cache/npcink-ai-cloud-m4-dev/package-proxy`. This prevents a large
artifact from consuming the package manager's whole idle timeout before the
first response byte. A client disconnect does not leave a corrupt hit: the
proxy finishes and validates the bounded upstream object when possible, then
atomically publishes it. Length mismatches, interrupted fills, symlinks, and
invalid metadata are discarded.

The cache retains at most 2 GiB and removes entries unused for 14 days. The M4
operation lock permits only one managed proxy process, while per-artifact
locks collapse duplicate requests inside that process. The cache is a
disposable build optimization for public artifacts, not source truth,
dependency truth, an accepted-revision cache, or a private-package store.
Package lock files and package-manager integrity checks remain authoritative.
Do not copy this cache to the authoring Mac, relay, production, or Git.

M4-only generated build recipes give pip a 300-second timeout and give pnpm a
300-second fetch timeout, four retries, and network concurrency eight. The
frontend build also mounts a persistent BuildKit pnpm store cache. These
settings absorb intermittent upstream stalls without editing the canonical
Dockerfiles or weakening frozen-lockfile verification.

For a bounded recovery, stop the active M4 operation and remove only
`~/.cache/npcink-ai-cloud-m4-dev/package-proxy`; the next dependency build
recreates it cold. Never use `docker system prune`, `docker volume prune`, or a
broad cache-directory removal for package-proxy recovery. Proxy shutdown emits
request, hit, miss, upstream-byte, served-cache-byte, and downstream-disconnect
counters for diagnosis. See
[ADR-027](decisions/027-m4-package-proxy-streaming-cache.md) for the decision
boundary and
[the 2026-07-25 validation record](m4-package-proxy-streaming-cache-validation-2026-07-25.md)
for measured evidence.

The frontend image already contains its pinned `node_modules`. M4 Preview starts
Next.js directly instead of performing an online install on every container
start. When the frontend image changes, deploy verifies the exact Compose
volume labels, removes only
`npcink-ai-cloud-m4-dev_cloud-frontend-node-modules-dev`, and lets Docker copy
the new image dependencies into that disposable volume. PostgreSQL, Redis,
artifacts, and unrelated M4 volumes are never part of this refresh.

Before a deploy that may refresh this shared dependency volume, the script
first lists matching volume names and compares the returned name exactly. A
failed Docker query is not treated as an absent volume. If the exact volume is
present, its Compose project and volume-key labels must verify before live
source synchronization or image build. The script then resolves the current
Compose frontend container and enumerates every container that consumes the
volume. The absence of a current frontend is allowed for recovery; one current
frontend must match the exact consumer container ID and expected Compose
labels; an ambiguous duplicate primary or any other consumer fails closed.
Before that first consumer check, a refresh also acquires the repository's
operation lock for each managed frontend slot. If a slot update or release is
already in flight, deploy refuses before live source synchronization. The
primary deploy holds all three slot locks through the post-build consumer
re-check, frontend stop/removal, label proof, and dependency-volume removal;
its existing primary operation lock prevents a slot from entering after those
slot locks are released. These coordination locks never release a lease or
remove a slot container.
This includes a stale label-matching container and a frontend-only preview
slot. Refusal happens before the candidate is synchronized into the live
source mirror, before image build, and before frontend stop/removal, volume
removal, or migration. The diagnostic records the consumer's Compose
project/service and, for a managed slot, its owner/slot/lease/backend-lease
state. Inspect it with
`m4:frontend:status`; after coordinating with the recorded owner, use only the
repository-controlled `m4:frontend:release` command. Active, expired, and
drifted slot leases are never released or deleted automatically. The later
consumer re-check closes the image-build claim window; exact Compose
volume-label verification still runs before the primary stop and again before
volume removal. Before the first live source change, the script validates
Compose from the fully extracted incoming tree and runs `nginx -t` against the
incoming M4 proxy configuration in a disposable, network-disabled Nginx
container. A validation failure leaves the live source mirror and the running
services unchanged. The live rsync uses delayed updates and delayed deletion.
The single-file Nginx bind-mount source is excluded from rsync, copied to a
same-directory incoming file, checksum-verified, and committed with an atomic
rename only after rsync succeeds. When that file changed, deploy recreates the
proxy only after the candidate preflight and atomic commit. Thus Nginx can see
the previous complete file or the next complete file, never an rsync partial.

After the first guard passes, the script marks the stack touched immediately
before that atomic live-source commit. A later build or runtime failure still
deliberately stops the application services rather than leaving committed
candidate source running under accepted-state evidence. Transfer, extraction,
Compose, or Nginx-candidate validation failures happen earlier and retain the
previous running services.

The overlay explicitly marks the frontend as development and uses the
repository's development-only completed-installation override. This keeps the
first-install gate from asking the development API for production setup state;
it does not alter the production setup contract or production Compose.

The API uses Uvicorn reload for `app/**` and migrations. Next.js development
mode handles ordinary frontend changes. Runtime, callback, and ops workers are
restarted after every successful sync because they do not have file watchers.

The M4 currently has no host Node or pnpm runtime. `m4:preview:test` therefore
runs pytest inside the M4 API image. Use `--focused` with exact `tests/` paths
or pytest node ids during the edit loop; path validation rejects targets
outside `tests/`. `--contract` and `--domain` run one partial suite. `--full`,
and the retained no-argument form, run `tests/contract` followed by
`tests/domain`; only that full scope is equivalent to `pnpm run check:fast`.

The source bundle intentionally omits `.git`. CI-only contracts that inspect a
Git diff may therefore skip on M4 while still running in normal Git worktrees
and GitHub CI. Product, domain, API, migration, and runtime tests do not receive
that exception.

For ordinary fixes, the required evidence is focused test, source sync,
relevant runtime/browser or WordPress behavior, and status. GitHub required
checks are the merge authority. Do not run full contract/domain suites again
after a green CI result for the same revision unless the task needs distinct
M4-only architecture, database, worker, networking, persistence, or recovery
evidence.

## Candidate and Accepted States

M4 Preview separates fast behavioral feedback from repository completion:

- `m4:preview:sync` and `m4:preview:deploy` always record
  `acceptance_state=candidate`;
- a candidate may come from a feature branch or a dirty worktree and proves
  only that the packaged source behaved correctly on M4;
- a change is not accepted until its PR is merged into `master` and
  `m4:preview:promote` succeeds from a clean worktree whose `HEAD` equals the
  freshly fetched `origin/master`.

Use the stable operations worktree for acceptance:

```bash
cd /Users/muze/gitee/npcink-ai-cloud-m4-ops
git status --short --branch
git pull --ff-only origin master
pnpm run m4:preview:promote -- --pr <merged-pr-number>
pnpm run m4:preview:status
```

Promotion verifies the PR is merged into `master` through GitHub, then uses
`sync` by default. If dependency, Dockerfile, lock-file, Compose, proxy, or M4
deployment-script inputs changed, it fails closed with the explicit fallback:

```bash
pnpm run m4:preview:promote -- --pr <merged-pr-number> --deploy
```

The accepted completion evidence is:

```text
acceptance_state=accepted
promotion_pr=<merged-pr-number>
source_branch=master
source_dirty=false
source_revision=<current-origin-master-revision>
```

GitHub rebase merge may replace the feature commit SHA. The evidence chain is
the merged PR, current `origin/master`, and the deployed source revision; the
pre-merge feature SHA does not need to remain an ancestor.

This command does not merge a PR or deploy production. GitHub-hosted CI
receives no M4 SSH credential. Agent-driven task-checkpoint dispatch does not
add an automatic callback, second preview stack, or second deployment control
plane. A later candidate sync intentionally replaces the accepted status and
must be promoted again before completion is reported.

Frontend-only slots do not replace the primary accepted status. They record
their own owner, TTL, frontend revision, source bundle hash, and the accepted
primary revision they consumed. Ordinary slot start/sync refuses an active
primary operation, a candidate primary, fingerprint drift, or an unhealthy
API. The `--allow-candidate-primary` flag is reserved for validating the slot
machinery itself and requires exact candidate revision and full source-bundle
equality.

Slots 1 and 2 map M4 loopback ports `8021` and `8022` to authoring-Mac
foreground tunnel ports `18021` and `18022`. Slot 3 maps `8023` to `18023` and
requires `--allow-third`. No slot port is published to LAN or Tailscale.
Product mutations are blocked at the slot NGINX edge; only session login,
verification, and logout are allowed so authenticated pages can be inspected.
Release removes only the exact slot; an expired lease is reclaimed by the next
explicit owner claim.

A later primary candidate may keep an existing slot container running, but it
invalidates that slot's backend evidence. `m4:frontend:status` then reports
`backend_lease_status=drifted`. Do not use that slot for acceptance until the
primary is accepted again and the owner performs an explicit slot sync.

## Native M4 Ollama

Ollama stays native on M4 rather than becoming another Docker service. The
checked-in LaunchAgent runs `/usr/local/bin/ollama serve` with `RunAtLoad` and
`KeepAlive`, and fixes `OLLAMA_HOST` to `127.0.0.1:11434`. It does not publish
Ollama to LAN, Tailscale, Cloudflare, or a container port.

Install the managed service once:

```bash
pnpm run m4:preview:ollama:install
```

The installer validates the checked-in plist, refuses to replace an unexpected
listener on port `11434`, gracefully hands off an existing Ollama.app server,
and verifies the final loopback binding. It owns only
`~/Library/LaunchAgents/top.mqzj.npcink-ollama-preview.plist` and the
corresponding launchd job.

Treat that LaunchAgent as the sole Ollama owner on the M4 preview host. Do not
enable Ollama.app as a login item or leave it running alongside the managed
job. Opening Ollama.app for deliberate desktop use requires a later
operator-approved handoff before the next preview deployment.

`m4:preview:deploy` and
`m4:preview:promote -- --pr <number> --deploy` run a read-only ownership
preflight before source transfer, image build, migration, or container changes
when the managed plist is installed:

```text
listener_owner=managed
  -> continue

listener missing
  -> continue; the managed restart recovers it after deployment

listener_owner=unmanaged
  -> fail before source transfer
  -> inspect with m4:preview:ollama:status
  -> after operator approval, use m4:preview:ollama:install only for standard
     Ollama.app / ollama serve ownership

unknown listener process
  -> fail closed; investigate without terminating or taking over the process
```

The preflight never installs Ollama, kills an unknown process, or changes the
listener. Keep the final post-deploy PID and loopback-binding verification as
a race-safe check even after the early preflight passes. Do not substitute
`m4:preview:recover` for an ownership handoff: recovery only restarts the
managed job and must remain blocked while another process owns `11434`.

After the Cloud source containing the provider request contract is deployed,
configure the disposable M4 database:

```bash
pnpm run m4:preview:ollama:configure
```

This development-only command creates or updates the secretless `ollama-m4`
provider at `http://host.docker.internal:11434/v1`, allows
`qwen3.5:9b`, sets provider-default `reasoning_effort=none`, refreshes its
catalog, and points the three WordPress text profiles at the resulting 9B
instance. It also creates the development-only, secretless
`ollama_m4_embedding` connection for `qwen3-embedding:0.6b` with 1024
dimensions and the existing PostgreSQL JSON development vector backend. The
embedding connection is accepted only in development or test environments.
The setting is explicit per provider connection; it does not change production
providers or the generic WordPress operation contract.

Development and production embedding spaces are deliberately separate.
Switching to the production SiliconFlow `BAAI/bge-m3` profile requires a full
Site Knowledge index rebuild even though both profiles use 1024 dimensions.
Media-library semantic search fails closed while only the deterministic
placeholder embedding is active; it must not return random nearest-neighbor
candidates.

Ollama's OpenAI-compatible endpoint maps `reasoning_effort=none` to disabled
thinking. This is required for `qwen3.5:9b` in the preview because an unbounded
reasoning response may exhaust the output budget before returning visible
content.

`m4:preview:status` includes the managed job, listener, API version, and bounded
model inventory. `m4:preview:recover` restarts Ollama when the managed
LaunchAgent is installed, then recovers the existing Docker containers. If the
LaunchAgent has not been installed, Docker-only preview recovery remains
available and reports that Ollama recovery was skipped.

## Source Synchronization Contract

Each operation packages:

- Git-tracked files that still exist in the worktree;
- non-ignored untracked files that are eligible for preview.

It excludes Git metadata, all `.env*` files except `.env.example`,
`node_modules`, `frontend/.next`, `.venv`, test and language caches,
`.runtime`, build outputs, deployment-secret directories, and browser-test
outputs. The remote `.env` and `.env.local` are protected from both overwrite
and `rsync --delete`.

After a successful deployment, status records:

- source commit and branch;
- clean or dirty state and dirty path count;
- source bundle SHA-256;
- source transfer mode;
- dependency and runtime-config fingerprints;
- frontend source fingerprint and the revision actually served by the frontend;
- runtime and frontend image IDs and creation times;
- Alembic revision and deployment UTC time.

This metadata is evidence, not a second source-control system.

Deploy and sync compare the incoming frontend source fingerprint with the last
successfully deployed frontend. They force-recreate the frontend only when its
source changed, its image or dependency volume changed, relevant preview
configuration changed, or the managed frontend container is absent. Backend,
CI, documentation, or release-script-only changes preserve the healthy
frontend container and its previously served frontend revision.

## First Replacement Procedure

Use `prepare` once to build images and validate the new Compose model while the
legacy `8010` stack is still running:

```bash
pnpm run m4:preview:prepare
```

`prepare` unpacks the source into an isolated staging directory and builds on
M4, but does not change the active source mirror, containers, or deployed
fingerprint markers.
Immediately before releasing the old port, re-check the legacy project's
Compose labels, published ports, and named volumes. Then remove only
`npcink-ai-cloud-m4-preview`. The old database and Redis volumes are
disposable by operator decision; no data migration or volume reuse is allowed.

Start the replacement with:

```bash
pnpm run m4:preview:deploy
pnpm run m4:preview:test -- --full
pnpm run m4:preview:status
```

Do not remove the old project until `prepare` succeeds. Do not change the
Cloudflare tunnel during this replacement: both stacks use the same loopback
origin at different times.

## Health and Exposure Verification

Expected checks on M4:

```bash
curl -fsS http://127.0.0.1:8010/health/live
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8010/
docker ps --format '{{.Names}} {{.Ports}}'
docker inspect npcink-ai-cloud-m4-dev-api-1 \
  --format '{{.HostConfig.RestartPolicy.Name}}'
```

Expected results are HTTP `200`, exact loopback-only port bindings, and
`unless-stopped` for every long-running service. From a separate machine,
requests to `192.168.10.200:8010`, `100.102.170.79:8010`, and the corresponding
database and Redis ports must fail.

The proxy deliberately hides `/docs`, readiness/operational diagnostics, and
`/internal/**` from the preview origin. Its access log records URI paths but not
query strings. The log command redacts values loaded from the protected env
files, authorization/cookie fields, credentialed URLs, PEM blocks, and common
secret-shaped fields before bytes leave M4.

## Restart Recovery

Every service uses `restart: unless-stopped`. The 2026-07-23 M4 acceptance
reboot on Docker Desktop 4.83.0 preserved all containers, images, and volumes,
but left the containers in an exited state. This matches
[Docker's documented `unless-stopped` behavior](https://docs.docker.com/engine/containers/start-containers-automatically/)
when a container is already stopped during a graceful host shutdown.

After Docker Desktop or M4 restarts, inspect the actual running and exited
containers with:

```bash
pnpm run m4:preview:status
```

If all eight existing containers are exited, recover them without rebuilding
images or synchronizing source:

```bash
pnpm run m4:preview:recover
```

`recover` refuses to continue if any expected container is missing. Use
`m4:preview:deploy` in that case so source, migrations, images, ports, and
health are validated together.

Also confirm the native provider when WordPress text generation is in scope:

```bash
pnpm run m4:preview:ollama:status
```

For a non-disruptive policy check, inspect all eight services through status.
For a deliberate recovery drill, restart Docker Desktop or the M4 only during a
maintenance window, wait for Docker to become ready, then run status, recover,
and repeat both HTTP checks.

An intentional `m4:preview:stop` suppresses automatic restart until the next
`m4:preview:recover` or `m4:preview:deploy`.

## Failure and Rollback

Deployment and lifecycle operations use an atomic remote directory lock. A
failed deploy stops only the new project's application, frontend, proxy, and
workers; it does not issue broad Docker cleanup.

To contain a broken replacement:

```bash
pnpm run m4:preview:stop
```

To roll source back, use a clean local worktree at the
last known-good Git revision. Run `pnpm run m4:preview:deploy` from that
worktree.

To roll back only the managed Ollama service, first stop the exact
`top.mqzj.npcink-ollama-preview` launchd job and remove only its checked-in
LaunchAgent copy. The Ollama models under the user's Ollama data directory are
not deleted by install, restart, recovery, or rollback.
To destroy the disposable replacement, first resolve its exact Compose labels
and directory, then run `docker compose down --volumes --remove-orphans` with
the exact `npcink-ai-cloud-m4-dev` project name. This destructive step is an
operator action, not part of the daily script.

If an operation reports a stale lock, inspect
`~/.cache/npcink-ai-cloud-m4-dev/operation.lock/owner.txt` and confirm that no
deploy, sync, test, restart, or stop process is active before removing only that
lock directory.
