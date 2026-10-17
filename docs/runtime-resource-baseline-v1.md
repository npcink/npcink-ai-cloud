# Runtime Resource Baseline v1

Status: operator measurement runbook. A collection requires its own approved
runtime window; restoring this tool does not start a measurement or authorize
M4/production operations. The tool is local-only engineering code, outside
application images and runtime control paths.

## Purpose and boundary

Measure container working memory, CPU deltas and Linux host headroom before
removing features or buying more compute. Keep the WordPress Ability -> Addon
-> Cloud -> hosted provider -> reviewed editor-adoption loop as the focus.
Authentication, entitlement, accounting, callback recovery and artifact
retention remain required; page count alone cannot explain resource cost.

The standard-library-only collector uses Docker Engine **GET** requests through
the existing local Unix socket. Docker context inspection is read-only. It
never starts a workload, changes limits/configuration, calls a Provider,
restarts services, builds images or changes a Docker context. Reading Docker
metadata still requires a trusted operator account with socket access; this is
not a restricted Docker credential or an exposed HTTP service.

SSH sends the checked-in collector to Python stdin without installing files on
the target. A bounded process writes samples and summaries on the calling Mac;
it adds no watcher, scheduler, daemon or remote source mirror. The target needs
Python 3.9+ and the existing Docker CLI/context. The authoring Mac does not run
Cloud Docker. Standalone local collection is for an explicitly selected native
Linux measurement host, not an automatic Mac fallback.

## Before collection

1. Obtain the named runtime window and coordinate with its current owner.
   Read-only polling has overhead; do not collect while another task owns M4
   without coordination. This PR's verification uses only mocks, no M4 access.
2. Record the actual project, architecture, Docker context, source revision,
   candidate/accepted state, image identities and database topology. An optional
   state file is required when claiming a known M4 source identity; absent
   metadata is reported as not supplied, never inferred from the local branch.
3. Follow [ADR-060](decisions/060-lan-first-m4-operation-routing.md): prefer LAN,
   then Pgy, then Tailscale. Verify and pin the explicit SSH host before starting;
   collection does not probe alternatives or replay a failed transfer. SSH uses
   batch authentication and already-trusted host keys, with no secret on argv.
4. Start with 15 minutes at five-second intervals. Check sample timestamps,
   count, collection time and errors before extending to 30 or 60 minutes.
   A 900-second fake-clock regression expects 181 snapshots including both
   endpoints when reads are instantaneous. Real reads take time, so the actual
   count/spacing and endpoint overshoot must be inspected rather than assumed.

## Commands (examples, not current runtime evidence)

For an authorized M4 window, using the standard managed project/cache paths:

```bash
python3 scripts/runtime_resource_baseline.py collect \
  --ssh-host muze@192.168.10.200 \
  --docker-config /Users/muze/.cache/npcink-ai-cloud-m4-dev/docker-config \
  --state-file /Users/muze/.cache/npcink-ai-cloud-m4-dev/last-deploy.txt \
  --project npcink-ai-cloud-m4-dev \
  --scenario passive \
  --duration-seconds 900 \
  --interval-seconds 5 \
  --output-dir .runtime/resource-baseline/m4-passive-<unique-run-id>
```

Replace the host explicitly with the selected Pgy/Tailscale address when needed.
Do not change hosts midway through a run. Default duration is 900 seconds;
30/60-minute runs explicitly use 1800/3600. Allowed duration is 1..7200 seconds,
interval 1..60 seconds. Use a fresh output directory each time; existing ones
are rejected rather than overwritten. The directory is private and raw samples
are mode 0600. Raw Docker configuration, environment and health-log content
are not emitted; metadata includes only allowlisted deployment fields.

For a separately approved target Linux host, substitute its actual project and
SSH target, with `--remote-python /usr/bin/python3`; do not guess production
project names or copy credentials into the command. PostgreSQL may be external.
The seven required services are api/frontend/proxy/redis/worker/callback-worker/
ops-worker. All non-one-off project containers are measured, including local
PostgreSQL when present; a missing/stopped required service fails the capture.

Each output directory contains `samples.jsonl`, `summary.json`, `summary.md`.
To summarize an ongoing or interrupted capture without touching its runtime:

```bash
python3 scripts/runtime_resource_baseline.py summarize \
  .runtime/resource-baseline/<run-id>/samples.jsonl
```

A partial trailing JSON record is preserved as incomplete evidence; malformed
interior records are rejected. Summary command success means the summary was
written, **not** that capture completed: inspect `complete` and `errors`.
A complete capture requires metadata, samples covering the requested duration,
a matching terminal sample count, and no reported error. Transport errors or
nonzero child exits invalidate success even if an earlier footer said complete.

## Measurement and failure semantics

- Working memory follows Docker CLI convention: raw cgroup usage minus
  inactive file cache (`total_inactive_file`, then `inactive_file`, then old
  `cache`). Raw usage is retained. Missing CPU/network counters are unmeasured,
  not zero; CPU 100% represents one logical CPU and needs two valid snapshots.
- Report median, nearest-rank P95 and observed maximum per container. Passive
  median is not proof of idle memory; sample peaks can miss shorter spikes.
  Docker lifetime peaks, when available, are a different metric.
- Calculate stack peaks from each snapshot's sum, never the sum of independent
  service maxima. Reads are sequential, not atomic; collection time is saved.
  Keep local PostgreSQL in totals and show the subtotal excluding it separately.
- Native Linux `/proc` records host memory availability, swap and swap counters;
  absent swap fields remain unmeasured. macOS host RAM is not Docker VM free
  RAM. Docker `MemTotal` is the engine budget, not available memory.
- Deployment state, container ID, image, start time and restart count are
  checked before/after snapshots. Drift stops collection and preserves partial
  output; it never authorizes restoring a candidate, redeploying or retrying.
- Socket requests have a five-second timeout and bounded response size; context
  lookup has a ten-second timeout. Duration controls the sampling loop, not a
  hard wall-clock kill: initial discovery and in-flight reads may extend it.
  SSH/transport interruption reports safe error codes without raw exceptions.
- A successful capture means the collector finished. It does not assert healthy
  services: inspect recorded OOM, unhealthy samples and restart counts too.

## Experiments and evidence discipline

Use the [development operating model](development-validation-operating-model-v1.md)
and [M4 standard](m4-preview-ai-development-standard-v1.md) for runtime authority.
First verify passive data, then choose one observed bottleneck. Separate cold
start, normal browsing, business execution/callback, media and bounded 1/2/4-way
concurrency. This tool only measures; it never generates those workloads.
Keep a named write/Provider budget for a separately authorized business test.

An hour aligned to the clock creates an opportunity for `usage_rollup`, not
proof it ran. Correlate the same window with redacted cadence execution logs;
retain accounting semantics and cleanup obligations before changing frequency.
Do not lower task frequency or merge worker roles based on process memory alone.

M4 ARM/reload mode/local PostgreSQL and a 2-vCPU/4-GiB Linux host/external RDS
have different capacity evidence. Measure Linux host headroom and return to
baseline after workload; do not treat a per-container 4-GiB limit as a 4-GiB
whole-host simulation. A 15-minute public GET test cannot establish protected
business throughput, daily-task behavior or a 24-hour capacity guarantee.

Historical measurements and delivery lessons are retained in the
[2026-10-17 retrospective](history/engineering/2026/resource-sampling-and-session-closeout-retrospective-2026-10-17.md).
They do not describe current runtime state or fill missing acceptance receipts.

## Verification and rollback

```bash
.venv/bin/python -m pytest tests/dev/test_runtime_resource_baseline.py -q
.venv/bin/python -m ruff check scripts/runtime_resource_baseline.py tests/dev/test_runtime_resource_baseline.py
```

These tests use fake clocks/clients/processes, no Docker daemon, SSH, Provider,
M4 or production connection. Real platform sampling remains a separate approved
operation; merging this tool does not claim M4 acceptance or current capacity.
Rollback the tool/docs through a reviewed PR. Preserve the original stash until
merge is confirmed; stopping a collector requires no runtime rollback.
