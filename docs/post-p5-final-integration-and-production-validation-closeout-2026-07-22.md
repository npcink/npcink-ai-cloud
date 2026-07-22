# Post-P5 Final Integration And Production Validation Closeout — 2026-07-22

## Status

The WordPress-first P0-P5 refactor is engineering-complete. The two previously
operator-only phase-exit items, P1-E05 and P1-E06, are complete for the exact
controlled-production release recorded below. The refactor architecture is
therefore closed and should not continue growing as a general cleanup program.

This is not a GA authorization. It does not claim real-user value, unrestricted
customer rollout, zero vulnerabilities, penetration-test completion, or that
the latest development `master` is deployed to production.

This document is the current status authority for the refactor. Earlier plans,
audits, failure receipts, and then-pending findings remain historical evidence;
they are not rewritten after the fact.

The authority chain is the accepted
[Refactor Master Plan](refactor-master-plan-v1.md), the historical
[P5 Hardening And Release Audit](p5-hardening-release-audit-2026-07-17.md), the
[P5-B8 Final Engineering Closeout](p5-b8-final-engineering-closeout-2026-07-19.md),
this final resolution, and the still-active
[Production Release Checklist](../deploy/RELEASE_CHECKLIST.md). The operational
title procedure remains in the
[Production WordPress AI Connector Smoke Runbook](production-wordpress-ai-connector-smoke-runbook-v1.md).

## Decision

| Decision | Current conclusion |
| --- | --- |
| P0-P5 engineering refactor | complete |
| P1-E05 production title runtime proof | complete for the recorded production release |
| P1-E06 production inventory/backup/restore/cutover proof | complete for the recorded production release |
| Controlled production validation | complete for the recorded release and evidence scope |
| Latest `master` production deployment | not performed by this closeout |
| GA or general customer rollout | not authorized |
| Typecho, Z-BlogPHP, Ghost, or more media types | deferred; not part of the current next stage |

The next stage is bounded GA readiness and observation, not another structural
refactor. Its first hard deadline is the Python 3.14.6 CVE exception expiry on
`2026-08-05`.

## Boundary That Remains Frozen

- Cloud owns hosted model execution, routing, usage, entitlement, queue/runtime
  evidence, health, diagnostics, temporary artifacts, signed media delivery,
  and transfer-acknowledgement evidence.
- WordPress owns local identities and permissions, editor entry, ability and
  workflow truth, prompt/context assembly, review, approval, apply, final CMS
  writes, and local audit truth.
- Cloud text results remain `suggestion_only`. A Cloud run is not approval to
  save or publish WordPress content.
- Media delivery and acknowledgement prove transfer only. WordPress verifies,
  previews, adopts, repairs references, rolls back, and records the final local
  write.
- `platform_kind`, `site_url`, connector metadata, generic object references,
  and the media artifact seam are the future-platform foundation. They do not
  authorize a Cloud capability registry or a platform-by-channel adapter
  matrix.

These boundaries remain governed by the
[Cloud Content Generation Boundary](cloud-content-generation-boundary-v1.md),
[Multi-platform Connector Boundary](multi-platform-connector-boundary-v1.md),
[Media Runtime Boundary](media-runtime-boundary-v1.md), and
[Cloud Production Release Policy](cloud-production-release-policy-v1.md).

## Exact Baselines

### Controlled production release

| Item | Exact value |
| --- | --- |
| Source revision | `972fee82dd4e599bb5705fe2e37f0596c016d6f9` |
| Source tree | `98662e3886a2d3b4d74fd51cdf40fb9c91cf8fd3` |
| Bundle SHA-256 | `55d1606c766de95699ecaa8fcb8407d46ff34bbdbccaddb1e66a6b3a9c45591e` |
| Image platform | `linux/amd64` |
| Database lineage | Alembic `20260717_0068` |
| Public liveness at closeout | HTTPS `200`, JSON response, TLS verification passed |
| Anonymous readiness posture | HTTPS `403`, as required for the protected readiness endpoint |

This exact release is the current controlled-production truth. The deployment
was not silently replaced with the later development bundle.

### Latest implementation baseline before this documentation batch

| Item | Exact value |
| --- | --- |
| Cloud revision | `989634dec0d3d5f2594b0080229319882659494e` |
| Cloud tree | `80027ec4396a886b6bb4d478b1c8b87236054875` |
| Local exact-replay bundle SHA-256 | `f945575348586b0c1c470f811669ee8402976cc7ad496bd6fd95e638d8c4c06e` |
| Local bundle platform | `linux/arm64` |
| Deployment status | engineering replay only; not deployed to production |

The documentation merge adds no application, frontend, migration, Compose,
deployment, image-lock, or provider behavior. A final six-repository matrix is
run after the documentation merge so the latest `master` state is verified
without making this document recursively self-referential.

### WordPress integration revisions in the passing pre-document matrix

| Repository | Revision |
| --- | --- |
| `npcink-abilities-toolkit` | `74ccc86574dcc4140c5b8a89028f308cd0a5411a` |
| `npcink-governance-core` | `1b719a058db0e9a5faa49a407c2dc69223e78e14` |
| `npcink-ai-client-adapter` | `3ac7a4bca8b47958c68c40d9b35934e33c40fadb` |
| `npcink-workflow-toolbox` | `2c75273cb717eb3fc2214c42841ce84f269fa4b3` |
| `npcink-cloud-addon` | `9343f6498c59eda0a5d5d4f26629c8e5e93c2588` |

## Phase Resolution

| Phase | Final refactor conclusion | Decisive evidence |
| --- | --- | --- |
| P0 — target contracts and baseline | complete | Master plan, ADR-004, connector/media boundaries, deletion inventory, baseline and executable target-contract checks remain current. |
| P1 — identity, site and runtime foundation | complete | Canonical `site_url`, WordPress-only `platform_kind`, neutral connector envelope, one active contract, runtime responsibility extraction, production P1-E05, and production P1-E06 all passed. |
| P2 — WordPress text runtime loop | complete for the defined WordPress-first milestone | Title, summary, and selected-text rewrite traverse the normal local product path; Cloud remains suggestion-only and local save remains explicit. |
| P3 — media runtime | complete for the bounded image milestone | Streamed artifact-only runtime, signed pull, ACK, TTL/purge, site isolation, browser preview, local adoption, reference repair, rollback, audit, and cleanup passed. |
| P4 — Portal/Admin contraction | complete | Bounded read/service-plane surfaces, fail-closed authorization, strict clients, removal of duplicate control truth, and browser evidence passed. |
| P5 — hardening, matrix and release closure | complete as an engineering refactor | Load/soak, security hardening, topology contraction, exact bundle, backup/restore, production operator evidence, Cloud/plugin gates, independent review, and matrix evidence are closed. GA remains a separate decision. |

## Decisive WordPress Evidence

### P1-E05 production title and idempotency

The exact controlled-production release passed the signed WordPress connector
title execution through `cloud_connector_runtime.v1` and
`wordpress_operation.v1`:

- production health, image-profile resolve, and title execute passed;
- the title run succeeded through the managed `wp-ai.short-text` profile with
  durable provider/model/instance and provider-call evidence;
- the result used `cloud_connector_result.v1`, carried
  `suggestion_only=true`, and contained a non-empty reviewable output;
- Cloud performed no WordPress write;
- replaying the same request returned the same run, marked the response as an
  idempotent replay, preserved the provider binding and result, and did not
  increase provider-call count.

The temporary production site/key/account identity was then revoked or
suspended, and the WordPress Addon was disconnected. No credential is retained
in this document.

### P1-E06 production data and encryption cutover

The governed one-time production procedure passed its fail-closed gate:

- the external Edge and certificate-renewal prerequisites were verified before
  image or database mutation;
- the protected release environment and previous release/recovery anchors were
  frozen;
- count- and identity-locked inventories covered the required Runtime Data and
  Service Settings rows;
- a checksum-bound production backup was copied to independent storage and its
  receipt was verified;
- an independent PostgreSQL restore rehearsed the old-to-`0068` migration and
  both encryption domains before production apply;
- writers were fenced, the exact release images were used, the production
  database advanced to `20260717_0068`, both domains passed new-key-only
  verification, and the activation/result receipts were published;
- API, workers, heartbeat/operational readiness, frontend, proxy, and public
  health passed before the operation completed.

This closes the production-like inventory/carry-forward/restore requirement.
It does not create a permanent dual-key compatibility path and does not waive
future backup/RPO/RTO operations.

### Local WordPress editor loop

The current local WordPress acceptance site ran WordPress `7.1-beta2-62808`,
WordPress AI `1.2.0`, and Cloud Addon `0.1.3`. Browser and API-path evidence
showed:

- title suggestion, summary, and selected-text rephrase requests each returned
  HTTP `200` and were reviewable in the editor;
- WordPress writes before explicit save: `0`;
- explicit save writes: `1`;
- revision delta: `+1`;
- non-target sentinels remained unchanged;
- the temporary post and authentication fixture were removed.

This is transport, review, ownership, and persistence evidence. It is not a
claim that one-site editorial quality predicts real-user value.

### Local media round trip

The current media acceptance used the exact controlled-production Cloud code
build in an isolated local stack. It proved:

- PNG source upload to a queued `media_job_request.v1` image transform;
- WebP artifact result, signed pull, checksum/byte-size verification and ACK;
- ACK did not change the artifact retention contract;
- browser preview remained same-origin, nonce-protected, `no-store`, and
  credential-free;
- WordPress locally adopted the WebP, repaired metadata and references, then
  rolled back to the original PNG;
- proposal governance, local audit chain, reference restoration, temporary
  attachment/page deletion, and object-URL cleanup passed;
- retired Adapter media routes were not observed.

This is not a production media invocation. It proves the cross-repository media
contract and the Cloud/local write boundary against the exact accepted build.
The earlier bounded implementation evidence remains in
[Media Runtime B5 Closeout](media-runtime-b5-closeout-2026-07-16.md).

## Final Engineering Gates

The pre-document clean-family matrix ran from
`npcink-workflow-toolbox` with `--fail-on-dirty` and passed all six repositories
with zero failures. Its private redacted report SHA-256 is
`5e1e85723d4489181985c462aba170626635026d01e977989942bec4cbb642c2`.
An earlier environment-preparation failure caused by an absent locked Composer
`vendor/autoload` in the clean Abilities clone is preserved separately; locked
dependencies were installed and the unchanged matrix then passed.

Against Cloud implementation revision `989634de`, the following gates passed:

- `pnpm run check:fast`;
- `pnpm run check:seam` (`902` API tests and `9` perimeter tests passed; only
  recorded framework/test warnings remained);
- `pnpm run check:anti-drift`;
- `pnpm run lint` (Ruff and Mypy over `234` application source files);
- `pnpm run check:python-dependency-audit` for default and Zilliz locks;
- `pnpm run check:release-policy`;
- `pnpm run check:e2e:deploy-bundle:smoke`.

The exact-bundle smoke built and scanned five images, verified application-role
image equivalence, verified the bundle before and after load, reused the same
bundle receipt, migrated a fresh database, started data/API/workers/traffic in
the governed order, seeded the runtime, passed public health and runtime smoke,
and exited successfully.

## Security Decision And GA Blocker

The image scan passed with `0` unallowlisted blocking findings. It did not find
zero vulnerabilities. The API image contains exactly three allowlisted Python
3.14.6 High findings:

- `CVE-2026-11940`;
- `CVE-2026-11972`;
- `CVE-2026-15308`.

The operator acceptance is restricted to engineering rehearsal and controlled
production validation, expires on `2026-08-05`, and explicitly sets
`ga_authorized=false`; see the exact
[Python 3.14.6 Controlled Production Validation Risk Decision](python-3-14-6-controlled-production-validation-risk-decision-2026-07-21.md).
Before expiry, either:

1. upgrade to a supported Python build containing the relevant fixes, repin the
   exact image, rebuild, rescan and remove the exception; or
2. stop expansion and make a new explicit, evidence-backed risk decision with
   owner, scope and expiry.

Dependency lock audit passing does not supersede the image-level findings.

## Remaining Work Is Not Refactor Work

The architecture and compatibility cleanup are closed. The next bounded stage
should contain only:

1. CVE exception resolution before `2026-08-05`;
2. only after the current CVE exception is resolved and a separate bounded
   trial is approved, a small real-user/real-editor observation loop measuring
   task success, acceptance/edit rate, failure rate, latency and support burden;
3. a deliberate GA decision after those observations and any newly triggered
   operational/security gates;
4. normal production backup, monitoring, certificate and release operations.

Do not reopen P0-P5 merely to add more abstraction. Typecho may become the first
post-P5 seam validation only after the WordPress runtime is stable enough that
the experiment will test portability rather than mask unfinished WordPress
work. Z-BlogPHP, Ghost, audio, video, permanent media storage, a workflow
engine, and new infrastructure remain deferred until measured demand exists.

## Evidence Handling And Rollback

- Detailed operator receipts, hashes, screenshots and sanitized integration
  manifests remain in the private evidence store with restrictive permissions;
  secrets, customer content and temporary credentials are excluded from this
  document.
- SHA-256 values are integrity evidence, not authenticity evidence.
- The latest development bundle is retained as engineering replay evidence and
  is not relabeled as the deployed production artifact.
- If a later promotion contradicts this record, stop the promotion and restore
  the exact previously verified release under the production policy. Do not
  recreate an obsolete compatibility path.
