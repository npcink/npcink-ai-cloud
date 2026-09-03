# Managed Source Relay Closeout and Development Retrospective

Date: 2026-09-04 (Asia/Shanghai).

Status: dated implementation and M4 acceptance evidence. This record is not
current runtime, release, production, or operator authority.

## Scope and Outcome

Cloud PR [#891](https://github.com/npcink/npcink-ai-cloud/pull/891) had merged,
but its clean-master M4 promotion was blocked by source transfer. The existing
private relay download exceeded the fixed 120-second limit, and an explicitly
authorized direct fallback had previously stalled during SCP. M4 correctly
remained on the accepted PR #890 revision after those failed transfers.

PR [#892](https://github.com/npcink/npcink-ai-cloud/pull/892) introduced a
managed Tailscale-only Nginx relay mode and was merged as
`ea97b930e0af1ab8b85571b7c78437467e53a378`. A clean `origin/master`
promotion then completed with:

```text
acceptance_state=accepted
promotion_pr=892
source_revision=ea97b930e0af1ab8b85571b7c78437467e53a378
source_branch=master
source_dirty=false
```

That accepted revision includes PR #891. No production deployment occurred.

## Investigation and Root Causes

The work proceeded by separating reachability, process lifecycle, filesystem
visibility, argument transport, throughput, and integrity instead of treating
all failures as one network problem.

1. A Python HTTP server attached to a foreground SSH session returned `200`
   from M4. This proved the Tailscale path and firewall were usable.
2. Detached Python and systemd-run variants appeared active but were not
   reliably reachable from M4. Python version was therefore not the principal
   cause, and an upgrade was not used as a speculative fix.
3. The existing Nginx service initially returned `404` for a readable relay
   file. Its systemd unit had `PrivateTmp=true`, so `/var/tmp` was not a valid
   managed-service document root. Moving managed relay data to `/var/lib`
   resolved the mismatch.
4. The first scripted candidate failed because an empty systemd-unit argument
   was lost while SSH flattened remote arguments. A non-empty sentinel now
   preserves positional arguments.
5. The next candidate transferred only about 2.1 MB of an approximately 8.9 MB
   bundle before the 120-second total timeout. The Peer Relay was slow rather
   than disconnected. A bounded 15-minute budget plus partial resume allowed
   the same integrity-checked flow to finish.
6. Review found a short interval between SCP completion and permission
   tightening. Run directories now remain `0700 root:root` until byte-size and
   SHA-256 checks succeed, then expose only the verified file to Nginx.

## Final Transfer Contract

```text
authoring worktree
  -> package and SHA-256
  -> SSH upload into a private per-run directory
  -> relay byte-size and SHA-256 verification
  -> open verified bundle to Tailscale-only Nginx
  -> bounded resumable M4 download
  -> M4 SHA-256 verification
  -> source apply under the M4 operation lock
  -> exact bundle, partial file, run directory, and lock cleanup
```

The Nginx process and empty base directory persist. Source bytes, run paths,
and locks do not. This separates service availability from data retention.

## Verification Evidence

- Relay listener: exact Tailscale bind on port `18080`.
- M4 `GET` and `HEAD`: `200`; downloaded SHA-256 matched the source file.
- `POST`: `403`.
- Directory access with autoindex disabled: `403`.
- Public relay HTTP probe: unreachable.
- Successful candidate relay downloads: `415s` and `450s` for approximately
  8.9 MB bundles.
- Clean-master promotion relay download: `366s`.
- Local M4 contract file: `63 passed`.
- GitHub required checks for PR #892: passed, including PR body contract,
  secret scan, dependency audit, static/impacted/contract shards, and CodeQL.
- Post-promotion M4 status: API, frontend, proxy, PostgreSQL, and Redis healthy;
  all three workers running; Alembic at head; managed Ollama unchanged.
- Post-operation relay state: base directory present and empty; Nginx active.

## Reusable Development Lessons

### Diagnose one layer at a time

Prove network reachability before changing runtimes. Then distinguish service
lifecycle, filesystem namespace, permissions, protocol framing, throughput,
and content integrity. A successful foreground listener prevented an
unnecessary Python upgrade from becoming the main line of work.

### Preserve fail-closed integrity while relaxing time

Higher latency can justify a larger bounded timeout and resume support. It
does not justify accepting partial files, skipping SHA-256, or silently
switching to a less governed transport.

### Separate persistent capability from transient data

A long-lived listener is not a source cache when every bundle is uniquely
named, verified before exposure, consumed under a lock, and deleted after the
operation. Service lifetime and data-retention lifetime must be designed and
reviewed independently.

### Treat cleanup as part of correctness

Every failed attempt was checked for relay locks, run directories, bundles,
and M4 partial files before the next attempt. Retry limits are meaningful only
when a retry cannot inherit ambiguous state from the prior run.

### Use runtime evidence to correct implementation assumptions

Static tests did not reveal systemd `PrivateTmp`, SSH empty-argument collapse,
or real Peer Relay throughput. Focused runtime observations converted each
unknown into one small code or configuration correction.

### Keep evidence states distinct

PR #891 being merged did not mean M4 was running it. Candidate success did not
mean the change was accepted. The closeout required PR #892 CI, merge, and a
clean current-master promotion before reporting `accepted`.

## Boundaries Preserved

- The relay did not become source, Git, revision, deployment, or acceptance
  truth.
- No Cloud application queue, database, scheduler, or control panel was added.
- No WordPress, Core, Adapter, media-write, or approval ownership changed.
- No public HTTP relay or GitHub-hosted M4 credential was introduced.
- No local Docker fallback or production deployment was used.

## Remaining Operational Check

Both Nginx and Tailscale are enabled at boot, but their first real host reboot
has not yet provided startup-order evidence. The active
[M4 Preview Development Workflow](../../../m4-preview-development-v1.md)
contains the exact post-reboot listener check and recovery order. This is an
operational observation item, not an incomplete PR #891 acceptance state.
