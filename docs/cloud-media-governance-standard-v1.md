# Cloud Media Governance Standard v1

Status: active planning and boundary standard.

This document consolidates the media-governance lessons from the Dongbd
production exercise and turns them into the implementation contract for Npcink
AI Cloud. It is a planning authority, not evidence that every phase below has
been implemented.

Historical source material:

- `ai-doc/云端部署/懂杯帝官网/媒体库治理阶段总结-20260825.md`
- `ai-doc/云端部署/懂杯帝官网/媒体库治理规范.md`
- `ai-doc/云端部署/懂杯帝官网/实施复盘与检查清单.md`

## 1. Decision Summary

Media governance is a closed loop, not a WebP button:

```text
audit -> reference evidence -> candidate selection -> offline conversion
      -> integrity/benefit validation -> local adoption -> observation
      -> separately authorized cleanup -> rollback or stop
```

The product should make this loop simple for the operator. The operator may
click one button to start a governed task, but the system must keep conversion,
WordPress adoption, and deletion as separate internal states and permissions.

The first useful product slice is a conservative JPG/PNG pilot. It must prove
that a small batch is safe and worthwhile before it adds GIF, video, automatic
deletion, multi-site operations, or a customer-facing media console.

## 2. Boundary Contract

### WordPress/local owner

WordPress and the local Addon remain the owners of:

- attachment, metadata, content, postmeta, options, termmeta, usermeta,
  comments, theme/plugin custom-table and dynamic-reference truth;
- local permissions, proposal/review/approval and preflight;
- final file switch, attachment update, reference migration, cache invalidation,
  publication, deletion and restore;
- the canonical local audit and rollback record.

Cloud must never receive database credentials, SSH/root credentials, or direct
authority to mutate WordPress objects.

### Cloud/runtime owner

Cloud may own:

- bounded read-only audit evidence and candidate scoring;
- offline image conversion and format/dimension/frame/hash validation;
- queueing, pause/resume, batch progress and worker resource limits;
- temporary derivative artifacts, signed pull and delivery evidence;
- estimated savings, quality gates and stop decisions;
- read-only status and diagnostics projections.

Cloud remains a runtime/detail layer. It must not become a media library, DAM,
second WordPress control plane, second ability/workflow registry, or final
WordPress write owner.

The existing [Media Runtime Boundary](media-runtime-boundary-v1.md) remains the
transport and artifact authority: `MediaArtifact` is temporary, bytes are
streamed, signed pull is site-bound, and `LOCAL_MEDIA_WRITE` stays local.

## 3. Product Experience

The operator-facing flow should be one simple action:

```text
Start media optimization
  -> backup gate
  -> read-only scan
  -> safe candidate count and estimated savings
  -> canary conversion
  -> small-batch adoption
  -> observation
  -> cleanup recommendation
```

The interface should expose only the decisions an operator needs:

- start or pause the task;
- see current phase, progress, skipped items and estimated savings;
- review the canary result;
- approve local adoption;
- separately approve original-file cleanup.

Default posture is `optimize and retain originals`. “Cleanup” is a separate
action and is disabled unless the recovery requirements below are satisfied.

## 4. Reusable Engineering Lessons

### Capacity is evidence, not one number

Keep these measurements separate:

- logical `uploads` size;
- backup and recovery-area size;
- logs and other host directories;
- filesystem usage and available space;
- format, year, directory and media-kind breakdowns.

An apparent lack of space may be logs, backup staging or a duplicate package,
not media. A governance decision must name the measured scope and timestamp.

### “Unmatched” is an investigation label

Reference scanning must include, at minimum:

- `_wp_attached_file`, `_wp_attachment_metadata`, attachment GUID;
- post content and excerpt;
- featured-image and other postmeta;
- options, termmeta, usermeta and comments;
- theme/plugin custom tables;
- REST payloads and dynamic path builders;
- access-log evidence where it is actually enabled.

Missing from a scan means `coverage_incomplete`, not “garbage”. Successful
requests without access logs are unobservable, not unused.

### Conversion and publication are different transactions

Conversion may run at low priority and with bounded parallelism. WordPress
database/file publication is serialized, idempotent and independently
rollbackable. A failed item must not roll back unrelated items.

Every candidate is invalidated when its source hash, attachment state or
reference snapshot changes. Old candidate manifests must never be reused after
an intervening scan.

### Format is a decoded fact

Never use an extension as the format authority. Validate magic bytes, decoder
result, dimensions, frame count for animated media, output MIME and SHA-256.
Preserve dimensions unless an explicit resize strategy was selected.

### Stop is a successful outcome

The system must stop when remaining candidates are low-value or insufficiently
proven. The 2026-08-25 exercise stopped after the qualified GIF population
collapsed to zero and later static savings became marginal. Lowering the gate
to manufacture more successes is a defect, not progress.

### Develop through evidence states, not feature breadth

Implementation must preserve these states as different facts:

```text
audited -> conversion-qualified -> converted -> delivered
        -> locally approved -> locally adopted -> observed
        -> cleanup-eligible -> separately cleaned
```

Success in an earlier state must never imply a later state. In particular,
Cloud conversion success, artifact delivery and delivery ACK do not prove that
WordPress adopted a replacement. Observation does not authorize cleanup.

Before adding a new service, inventory the existing Media Runtime, batch-plan,
artifact, Addon proposal and local-write seams. Extend their structured
contracts when they fit; do not introduce a second task engine, media library
or Cloud-owned WordPress mutation path to make the workflow appear simpler.

The first implementation increment must be one reversible vertical slice:

```text
one site -> read-only audit -> 5-10 static canaries
         -> temporary Cloud artifacts -> local review handoff
         -> measured benefit/stop decision
```

Broader dashboards, automatic publication, Recovery Vault, cleanup, GIF,
video and multi-site operations require evidence from that slice. A one-click
operator experience may hide orchestration detail, but it must not collapse
permissions, ownership or rollback boundaries.

### Treat recovery as a staged capability

Same-host retention is useful for quick rollback but does not provide disaster
recovery and does not release space when it remains on the pressured
filesystem. Therefore the MVP may retain originals and a bounded local
recovery record, while off-host Recovery Vault work waits for positive product
evidence. Source deletion remains disabled until off-host restore is proven.

The development sequence is deliberately asymmetric: audit and preview may
ship before cleanup because they are reversible and produce evidence; cleanup
must not ship merely to make the capacity result look complete.

## 5. Candidate Risk Classes

| Class | Evidence | Default action |
| --- | --- | --- |
| Low | attachment, source, references and replacement are fully identified | eligible for canary and small-batch adoption |
| Medium | generated sizes, featured images, content repairs or dynamic fields are involved | preview and stricter local verification |
| High | unmatched files, theme `thumb`, external URLs or incomplete coverage | report only; no automatic adoption or deletion |

The first release handles only low-risk static JPG/PNG candidates. GIF,
animated WebP, video, custom-table paths and unmatched files remain explicit
follow-up work.

## 6. Default Policy

- Process JPG/PNG larger than `500KB` only.
- Keep source dimensions by default.
- Require at least `15%` savings.
- Skip output that is larger than the source.
- Do not recompress WebP by default.
- Do not mix video or animated media with static-image batches.
- Use canaries first, then `50-100` item publication sub-batches.
- Allow encoding concurrency of `1-4`, subject to host pressure.
- Keep database and WordPress publication concurrency at `1`.
- Never delete a high-risk or unmatched file automatically.
- If no recoverable backup exists, allow audit/preview only; block adoption and deletion.
- If estimated qualified savings are below `1GB`, report rather than initiate
  destructive cleanup.

These are conservative starting values. A later phase may change them only
with measured pilot evidence and a revised contract.

## 7. Backup And Recovery Contract

### MVP recovery posture

The first pilot may use a local recovery area for short-term rollback:

- ordinary batch retention: `30 days`;
- medium/high-risk batch retention: `90 days`;
- automatic expiry applies to the recovery copy, never to the production source;
- without an off-host backup, automatic production-source deletion is forbidden.

The UI must state that same-host recovery is not disaster recovery.

### Required per-file manifest

The local rollback record must include:

```json
{
  "site_id": "site_example",
  "batch_id": "batch_20260825_001",
  "attachment_id": 123,
  "old_path": "2022/08/example.jpg",
  "old_mime": "image/jpeg",
  "old_size": 1827364,
  "old_sha256": "sha256:...",
  "new_path": "2022/08/example.webp",
  "new_sha256": "sha256:...",
  "reference_snapshot": "scan_...",
  "recovery_location": "local://...",
  "status": "published",
  "rollback_status": "available"
}
```

The implementation may store a compact database record plus a JSONL manifest,
but the fields and hashes must remain recoverable and auditable.

### Later Recovery Vault

An OSS/S3-compatible Recovery Vault is the next safety upgrade, not a
prerequisite for the read-only pilot. It should be a separate encrypted,
versioned, site-isolated object namespace with checksums, object-lock or an
equivalent retention policy, access audit and single-file restore. It must not
reuse the short-TTL `MediaArtifact` store.

The desired production rule is:

```text
off-host backup verified -> source retained through observation
-> cleanup proposal -> operator confirmation -> source cleanup
```

## 8. Phased Delivery Plan

### Phase 0: Contract and local pilot harness

Outcome: a reviewed contract and reproducible fixture, with no production
mutation.

Deliverables:

- freeze the candidate, manifest, backup and stop-decision schemas;
- create a representative JPG/PNG corpus with referenced, dynamic and unmatched
  examples;
- document the Addon/Core handoff and recovery semantics;
- define focused contract tests and a local dry-run command.

Exit criteria: the fixture demonstrates that high-risk/unmatched files are
reported but not adopted, and every candidate has a source hash and evidence
revision.

### Phase 1: Read-only audit and one-click preview

Outcome: an operator can click one action and receive an audit, without writes.

Reuse the local WordPress enumeration seam and Cloud bounded runtime/detail
surface. Produce capacity facts, reference evidence, risk classes, estimated
savings and explicit exclusions. No original-file deletion is possible.

Exit criteria: audit is repeatable, B2 termmeta-style references are detected,
coverage gaps are visible, and a second scan invalidates stale candidates.

### Phase 2: Static-image canary conversion

Outcome: Cloud converts low-risk JPG/PNG candidates to temporary artifacts.

Reuse `POST /v1/runtime/media/uploads`, `POST /v1/runtime/media/jobs`,
`image.transform.v1`, signed pull and delivery ACK. Extend the existing batch
plan only where structured governance fields are missing; do not make natural
language parsing the policy source of truth.

Run 10 canaries, validate hash/MIME/dimensions/size/savings, and retain the
originals. No GIF, video or automatic cleanup.

Exit criteria: canary success, zero related 404/5xx regressions, reproducible
rollback, and measured host load within the declared budget.

### Phase 3: Small-batch local adoption

Outcome: approved canaries expand to `50-100` item batches.

WordPress performs serialized atomic publication, metadata/reference updates,
cache invalidation and per-item state recording. Cloud supplies progress and
evidence only. Pause/resume and idempotent replay are required.

Exit criteria: at least one complete batch and one injected failure recover
cleanly; page, REST, HTTPS MIME and related-404 checks pass; the original remains
restorable.

### Phase 4: Observation and product validation

Outcome: determine whether the feature is worth expanding.

Observe for `24-72 hours` and compare savings, 404/5xx, load, rollback use,
operator time and repeat usage. Stop if qualified yield falls, verification
failures rise or expected savings become immaterial.

Exit criteria: a decision record says continue, revise or stop. A pilot that
stops is valid product evidence.

### Phase 5: Recovery Vault and cleanup proposal

Outcome: support safe source cleanup only after value is proven.

Add OSS/S3-compatible storage behind a recovery interface, backup verification,
retention policies, single-file restore and cleanup proposals. Deletion remains
separately authorized; automatic deletion is not the default.

Exit criteria: off-host restore rehearsal, exact cleanup manifest, stable
observation, and explicit operator approval. Only then consider GIF or other
media as separate contracts.

## 9. Verification Gates

Documentation-only edits use link/format checks and the `check:changed` plan;
they do not require M4. Runtime phases are L2 work: use focused contract/domain
tests first, then the required M4 candidate and WordPress consumer evidence.

Minimum phase gates:

- Phase 0: schema/fixture contract tests and document link checks;
- Phase 1: read-only audit contract tests;
- Phase 2: media artifact, processor, checksum and signed-pull tests;
- Phase 3: Addon/Core round-trip, idempotency, rollback and page/REST smoke;
- Phase 4: observation receipt with measured stop decision;
- Phase 5: backup integrity, restore rehearsal, retention and cleanup fencing.

Do not report a candidate M4 run as accepted. Runtime acceptance still requires
the repository's normal local verification, PR merge and clean-master promotion
chain.

## 10. Explicit Non-goals

- Cloud media library, gallery, DAM, CDN or permanent object-storage product;
- direct Cloud WordPress writes or database/SSH access;
- a second ability/workflow/skill/MCP registry;
- automatic deletion in the MVP;
- GIF/video/document processing in the static-image phase;
- replacing the existing worker/Redis/Postgres runtime with a new orchestrator;
- treating same-disk copies as disaster recovery;
- treating “no reference found” as proof of safe deletion.

## 11. Current Recommendation

Start with Phases 0-2. The first implementation should be a read-only audit,
one-click static JPG/PNG canary and local 30-day rollback record. Keep original
files in production, do not require OSS yet, and use the pilot to measure real
operator value. If the evidence is positive, proceed to small-batch adoption;
only then invest in an off-host Recovery Vault and cleanup workflow.
