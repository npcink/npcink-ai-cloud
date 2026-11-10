# Production retention maintenance v1

Status: active maintenance contract. Production mutations require operator authorization.

## Release and host logs

`deploy/prune-release-history.py` defaults to a read-only JSON plan. Save and
review it, then pass the same file with `--apply-plan`. A changed plan fails
before deletion. Apply validates installation acceptance and holds the existing
deployment and installation locks. It preserves at least three newest releases,
current, installation-acceptance, backup-referenced and container-referenced
releases/images. Unknown legacy directories, unrelated images, volumes,
protected configuration and backup files stay untouched. Only obsolete project
rollback tags or mapped dangling images are eligible. This helper does not
schedule unattended deletion; prefer it to indiscriminate Docker pruning.

`deploy/journald-npcink-retention.conf` sets persistent/runtime journal limits
of 512/64 MiB and maximum age 30 days. Installing it under
`/etc/systemd/journald.conf.d/60-npcink-retention.conf`, restarting journald and
vacuuming archives are authorized host operations. Preserve existing policy
before replacement and verify the effective merged configuration. This does not
shorten database business/security audit retention.

Runtime Compose caps each container's JSON log at three 20 MiB files. This
applies when containers are recreated during an authorized release. Do not
restart business containers solely to activate this pending source change.

## Operational database evidence

The existing hourly retention task also prunes:

- health snapshots strictly older than 30 days, preserving **all** rows at the
  latest measured timestamp for each `(provider_id, instance_id)`, including
  null IDs and inactive instances;
- successful system-worker `worker.heartbeat` events strictly older than
  `max(worker_heartbeat_retention_days, audit_retention_days_default)` (minimum
  90 days), preserving all latest-timestamp ties for each worker scope.

Heartbeat cleanup requires worker scope and no account, site, key, subscription
or plan context. Failed events, order-expiration summaries, payment,
authentication, security and other business audits are outside this cleanup.
Heartbeat frequency, readiness thresholds and freshness remain unchanged.

Settings: `health_snapshot_retention_days` (default/minimum 30),
`worker_heartbeat_retention_days` (default/minimum 90), and
`operational_evidence_cleanup_batch_size` (default/maximum 5000 per table).
Each table uses its own committed transaction with PostgreSQL statement/lock
timeouts. Full batches indicate possible remaining history, not an exact
backlog count. Retry after partial failure is safe.

For initial backlog maintenance, first run the same selectors read-only and
capture aggregate counts. Durably export the exact selected rows to protected
storage **before** each deletion batch; revalidate eligibility before deletion.
Bound each batch and total work, hold deployment/installation locks, and verify
latest state, non-target audits and service readiness afterwards. A row export
is scoped recovery evidence, not a full database backup. Do not run
`VACUUM FULL`, rebuild indexes or change audit contracts in this operation.
Deleting rows allows space reuse; it does not guarantee immediate RDS storage
or billing reduction.

## Verification

Use the focused release-retention, operational-evidence-retention,
ops-cadence-worker and worker-heartbeat-projection tests. Validate actual
deletion/commit behavior on an isolated PostgreSQL 18 target before production
backlog cleanup. Report one-time production maintenance separately from the
later release enabling scheduled cleanup and container log rotation.

For post-deployment observation, bind the installed source/manifest and actual
container log-driver settings to the new Worker start time. Read the latest
`runtime.retention_cleanup.cadence` event and its outcome, interval and
`operational_evidence` payload. An old event without that payload does not
prove the new rules ran; a failed activation may also have written a valid
historical event before the current release. Record those executions separately.
A successful first post-start event proves one scheduled execution, not a
complete multi-hour cadence observation. Prefer the next natural event rather
than manually triggering deletion to manufacture evidence. Keep full-batch
and storage-reuse limitations visible in the report.
