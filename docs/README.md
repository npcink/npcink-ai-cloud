# Npcink AI Cloud Documentation Index

Status: active repository index.

Purpose: provide one maintained entry point for current Cloud authority while
preserving dated implementation and validation evidence without presenting it
as current truth.

## How to Read This Repository

Use documentation in this order:

1. current code, tests, runtime evidence, and protected repository policy;
2. active product boundaries and accepted ADRs;
3. active engineering standards and operator runbooks;
4. current plans and handoffs;
5. dated acceptance, closeout, validation, trial, and retrospective evidence;
6. superseded, retired, and legacy snapshots.

A document being checked into Git does not make it current authority. A dated
record proves only the evidence state, revision, environment, and scope that it
explicitly names.

## Lifecycle Classes

| Class | Meaning | Expected handling |
| --- | --- | --- |
| Active boundary or standard | Current normative product or engineering rule | Keep discoverable; update deliberately with affected contracts |
| Active runbook | Current operator procedure | Verify commands and environment before use |
| Current plan | Proposed or approved future work | Recheck baseline before implementation; do not treat as completion proof |
| Time-bounded evidence | Acceptance, closeout, validation, trial, audit, or retrospective receipt | Preserve for traceability; never use as automatic present truth |
| Superseded | Replaced by a named current document | Keep the replacement link and historical context |
| Retired negative guard | Removed capability or forbidden direction | Keep when it prevents reintroduction of old behavior |
| Legacy snapshot | Imported reference from an older repository or architecture | Reference only; never use as current implementation authority |

New or materially revised documents should place a clear `Status:` line near
the top. When replacing a normative document, name its successor instead of
deleting the old decision history.

## Product Boundaries

- [Site Knowledge Recommendation Development Record](site-knowledge-recommendation-development-record-v1.md) — cross-repository lessons for vector evidence, coverage comparison, consumer debugging, and validation; implementation authority remains with the active runtime and connector contracts.
- [Site Knowledge Recommendation Quality Improvement Standard](site-knowledge-recommendation-quality-improvement-standard-v1.md) — consolidated quality loop for bounded hybrid ranking, natural-anchor safety, metadata-only behavior feedback, multi-AI offline review, open-source references, and single-operator evidence gates.
- [Site Knowledge Recommendation History Synthesis — 2026-08-26](site-knowledge-recommendation-history-synthesis-2026-08-26.md) — dated plain-language summary of the internal-link/related-content distinction, UI simplification lessons, bounded vector-quality improvements, phased evidence gates, and deferred model expansion; not runtime or release authority.
- [WordPress AI Recommendation Development Standard](wordpress-ai-recommendation-development-standard-v1.md) — consolidated WordPress-first product boundary, phased delivery, editor UX, validation, observation, and single-operator rules.
- [WordPress Editor Readiness Runbook](wordpress-editor-readiness-runbook-v1.md) — read-only prerequisites for local editor acceptance; Cloud-unavailable results are blocked, not recommendation evidence.
- [WordPress Editor Acceptance Observation — 2026-08-24](wordpress-editor-acceptance-observation-2026-08-24.md) — five-sample latency and evidence baseline; observation only, not a performance SLA.

- [Cloud Content Generation Boundary](cloud-content-generation-boundary-v1.md)
- [Cloud Task Pack Boundary](cloud-task-pack-boundary-v1.md) — retired negative
  guard; retained to prevent Task Pack surfaces from returning
- [Cloud AI Data Handling Standard](cloud-ai-data-handling-standard-v1.md)
- [Cloud Media Delivery Boundary](cloud-media-delivery-boundary-v1.md)
- [Media Runtime Boundary](media-runtime-boundary-v1.md)
- [Cloud Media Governance Standard](cloud-media-governance-standard-v1.md)
- [Site Media Recommendation Development Standard v2](site-media-recommendation-development-standard-v2.md) — active implementation, validation, and staged-quality rules for external image-source recommendations
- [Cloud Media Governance Product and Development Retrospective — 2026-09-02](history/media/2026/cloud-media-governance-product-development-retrospective-2026-09-02.md) — dated synthesis of the production exercise, product-boundary decisions, reversible MVP, recovery posture, evidence states and implementation stop lines; not implementation or runtime acceptance evidence
- [Cloud Open Callback Boundary](cloud-open-callback-boundary-v1.md)
- [Multi-platform Connector Boundary](multi-platform-connector-boundary-v1.md)
- [Cloud Agent Positioning](cloud-agent-positioning-v1.md)
- [Cloud Agent Workflow Metadata Projection](cloud-agent-workflow-metadata-projection-v1.md)
- [Cloud Agent Feedback Contract](cloud-agent-feedback-contract-v1.md)
- [Cloud Agent Feedback Quality Gate](cloud-agent-feedback-quality-gate-v1.md)

## Engineering and Delivery Standards

- [Early Product Validation and Minimal Telemetry Standard](early-product-validation-and-minimal-telemetry-standard-v1.md)
  — active stop rules, minimum non-author trial loop, privacy-safe journey
  evidence, defect priority, and commercial-proof reopening triggers
- [Single-Operator AI Development Standard](single-operator-ai-development-standard-v1.md)
- [Single-Operator Pre-User Development Closeout and Next-Stage Guide — 2026-08-18](single-operator-pre-user-development-closeout-and-next-stage-2026-08-18.md) — dated synthesis of the solo-AI pre-user phase, user-experience remediation, privacy-safe observation, delivery-time lessons, workflow lanes, and the next ordinary-development stop point; not production or human-value authority
- [Development and Validation Operating Model](development-validation-operating-model-v1.md)
- [Single-Operator AI Development, M4 Validation, and Production Release Playbook](single-operator-ai-development-and-release-playbook-v1.md)
- [Local-First Validation and Risk-Tiered CI](decisions/049-local-first-validation-and-risk-tiered-ci.md)
- [Historical Issue Closure and Release Evidence Standard](historical-issue-closure-and-release-evidence-standard-v1.md)
- [Historical Problems Closeout and Next-Stage Plan — 2026-08-22](historical-problems-closeout-and-next-stage-plan-2026-08-22.md) — dated synthesis of the referenced Portal, diagnostics, administrator-observation, release-efficiency, and editor-monitoring discussions; records remaining work, reasons, phased next steps, and reusable development rules; not runtime, M4, production, or human-value authority
- [Development and Delivery Efficiency Standard](development-delivery-efficiency-standard-v1.md)
- [Single-Operator AI Release Workflow Standard](single-operator-ai-release-workflow-standard-v1.md) — operator-facing bug-fix to production flow, Environment wait handling, timing, evidence, and rollback
- [Pre-production Release Pause and User-experience Consolidation Closeout — 2026-08-21](pre-production-release-pause-and-user-experience-consolidation-closeout-2026-08-21.md)
  — dated history from issue synthesis and privacy-safe observation through the
  OpenSSL exception review chain, Docker-capable gate split, retired production
  promotions, and the current Portal-first consolidation handoff; not
  production or human-value authority
- [Multi-Session Development Observation Synthesis and Next-Stage Plan — 2026-08-15](multi-session-development-observation-synthesis-and-next-stage-plan-2026-08-15.md) — dated four-track evidence matrix, cross-session problem triage, phased execution plan, and observation stop lines; not runtime, production, or human-value authority
- [Development Efficiency Phase 3 Observation Plan](development-efficiency-phase3-observation-plan-v1.md) — current plan for collecting comparable delivery samples before further CI/shard/cache optimization
- [Development Efficiency Phases 1–3 Closeout and Retrospective](development-efficiency-phases1-3-closeout-and-retrospective-2026-08-14.md) — dated evidence for PRs `#711`–`#713`, review corrections, validation receipts, and the current observation stop point
- [Development and Delivery Efficiency Closeout and Retrospective](development-delivery-efficiency-closeout-and-retrospective-2026-08-11.md) — dated evidence for PRs `#620`–`#635`, measured baselines, corrections, and still-pending natural after-samples; not current release authorization
- [Development and Delivery Efficiency Standard](development-delivery-efficiency-standard-v1.md) — bounded timing, evidence reuse, retry budgets, and local acceptance measurement rules
- [Production Release Feedback Loop Closeout and Standard — 2026-08-13](production-release-feedback-loop-closeout-and-standard-2026-08-13.md) — dated release-identity/readiness/CI closeout plus the reusable early-failure, promotion, exact-SHA preflight, and timing discipline; current release authority remains the production policy
- [Production Release Efficiency Phase 1-2 Closeout and Development Retrospective — 2026-08-23](history/production/2026/production-release-efficiency-phase1-closeout-and-development-retrospective-2026-08-23.md) — PR #851 merge, clean-master M4 acceptance, root causes of delay, reusable evidence rules, and deferred next steps; not production authorization
- [Single-Session Workflow Standard](single-session-ai-workflow-standard-v1.md)
- [AI Development Validation Tiers](ai-development-validation-tiers-v1.md)
- [Managed Private Source Relay](decisions/051-managed-private-source-relay-service.md) — accepted refinement that keeps the Tailscale-only Nginx service available while source bundles and locks remain per-operation and transient
- [Pgy Primary M4 Access](decisions/052-pgy-primary-m4-access.md) — accepted default-path decision for Pgy SSH/direct transfer with LAN and Tailscale fallback
- [M4 Remote Development and Overlay Network Standard](m4-remote-development-and-overlay-network-standard-v1.md) — active operating standard for M5 authoring, M4 Docker/Ollama runtime, overlay routing, mobile SSH, evidence, and recovery
- [Managed Source Relay Closeout and Development Retrospective — 2026-09-04](history/m4/2026/managed-source-relay-closeout-and-development-retrospective-2026-09-04.md) — dated evidence for PRs `#891` and `#892`, relay failure diagnosis, bounded retry corrections, M4 promotion, and reusable development lessons; not current runtime or release authority
- [Internal New-User Readiness Gate](internal-new-user-readiness-gate-v1.md)
- [Internal Readiness Final Handoff — 2026-08-18](internal-readiness-final-handoff-2026-08-18.md) — dated final handoff summarizing the five-stage delivery chain, development lessons, evidence states, and the bounded next action
- [Single-Session Worktree Lifecycle](single-session-worktree-lifecycle-v1.md)
- [Repository Stage-Transition Cleanup Standard](repository-stage-transition-cleanup-standard-v1.md)
- [Repository Stage-Transition Worktree and Branch Cleanup Retrospective](history/repository-hygiene/2026/repository-stage-transition-worktree-and-branch-cleanup-retrospective-2026-08-08.md) — dated evidence for the 2026-08-08 consolidation; re-inventory current state before any future cleanup
- [Repository Hygiene Final Closeout and Development Lessons — 2026-08-18](history/repository-hygiene/2026/repository-hygiene-final-closeout-and-development-lessons-2026-08-18.md) — dated final topology, preservation layers, branch/worktree policy, and reusable cleanup lessons; not future deletion authority
- [Repository Documentation Consolidation Closeout and Lessons — 2026-08-22](history/repository-hygiene/2026/repository-documentation-consolidation-closeout-and-lessons-2026-08-22.md) — dated evidence for PRs `#836`–`#842`, branch recovery, documentation classification and archival, corrections, stopping decision, and reusable cleanup method; not future deletion authority
- [Single-Session AI Development Closeout and Retrospective](single-session-ai-development-closeout-and-retrospective-2026-08-04.md)
- [Seven-Session Development Synthesis and Open-Issue Triage](seven-session-development-synthesis-and-open-issues-2026-08-04.md) — dated synthesis of recent Cloud sessions; recheck current source before acting
- [Parallel AI Collaboration Standard](parallel-ai-collaboration-standard-v1.md)
- [M4 Preview AI Development Standard](m4-preview-ai-development-standard-v1.md)
- [M4 Preview Development Workflow](m4-preview-development-v1.md)
- [Engineering Command Inventory Standard](engineering-command-inventory-standard-v1.md)
- [Engineering Command Inventory M4 Source Bundle Closeout and Retrospective](engineering-command-inventory-m4-source-bundle-closeout-and-retrospective-2026-08-04.md)
- [Structural Remediation Delivery Standard](structural-remediation-delivery-standard-v1.md)
- [Repository Hygiene and Documentation Lifecycle Standard](repository-hygiene-and-documentation-lifecycle-standard-v1.md)
- [Systematic Remediation Delivery Standard](systematic-remediation-delivery-standard-v1.md)
- [Systematic Remediation Closeout and Retrospective — 2026-08-14](systematic-remediation-closeout-and-retrospective-2026-08-14.md) — dated evidence for the staged remediation sequence, validation chain, runtime observations, and development lessons
- [Repository Hygiene Cleanup Closeout and Retrospective](history/repository-hygiene/2026/repository-hygiene-cleanup-closeout-and-development-retrospective-2026-08-03.md)
- [AI Development Stage Closeout and Production Readiness Retrospective](ai-development-stage-closeout-and-production-readiness-retrospective-2026-08-02.md)
- [PR and Dependency Update Policy](pr-and-dependency-update-policy.md)
- [CI Pytest Sharding](ci-pytest-sharding-v1.md)
- [AI Development Changed-Code Coverage Closeout and Retrospective](ai-development-changed-code-coverage-retrospective-2026-08-08.md) — dated implementation, CI cost-correction, and observation-cycle evidence; the active policy remains in CI Pytest Sharding
- [Python Type Checking Standard](python-type-checking-standard.md)
- [Cloud Production Release Policy](cloud-production-release-policy-v1.md)
- [Production-host Localhost Candidate Canary Standard](production-host-localhost-candidate-canary-standard-v1.md)

## Architecture and Refactor

- [Refactor Master Plan](refactor-master-plan-v1.md)
- [Refactor Deletion Inventory](refactor-deletion-inventory-v1.md)
- [Hosted Runtime Profiles](cloud-hosted-runtime-profiles-v1.md)
- [First-install Contract](cloud-first-install-contract-v1.md)
- [AI Task Runtime Contract](ai-task-runtime-contract-v1.md)
- [Text Hosted Routing Profile](text-ai-hosted-routing-profile-v1.md)
- [Source Extraction Preview](source-extraction-preview-v1.md)
- [Site Knowledge Runtime Contract](site-knowledge-runtime-contract-v1.md)
- [Site Knowledge Search Architecture Standard](site-knowledge-search-architecture-standard-v1.md) — lexical, vector, and hybrid retrieval selection, Meilisearch admission gate, evaluation, and Cloud ownership rules
- [Site Operations Cloud Analysis Runtime](site-ops-cloud-analysis-runtime-v1.md)
- [Commercial Repository Decomposition Plan](commercial-repository-decomposition-plan-v1.md)
- [Commercial Repository Decomposition Closeout and Retrospective](commercial-repository-decomposition-closeout-and-development-retrospective-2026-08-03.md)

Commercial repository decomposition is paused after Phase 7I. The plan remains
the implementation history and restart contract; the closeout records the
current measured state and why further structural work is not the default next
priority. Neither document is reclassified or moved by this cleanup batch.

## Admin, Portal, Identity, and Commercial

- [Cloud Portal Customer Workspace UI Standard](cloud-portal-customer-workspace-ui-standard-v1.md)
- [Cloud Portal Site Detail Status Display Standard](cloud-portal-site-detail-status-display-standard-v1.md) — 站点详情页状态归属、告警分类、自动更新文案、操作收敛和回归测试规则
- [Portal Customer Workspace UI Closeout and Retrospective — 2026-08-14 to 2026-08-15](history/portal/2026/portal-customer-workspace-ui-closeout-and-retrospective-2026-08-14.md)
  — dated PC-first Portal information architecture, account/site ownership,
  all-sites filtering, browser validation, and M4 candidate evidence; not
  merge, production, or customer acceptance authority
- [Cloud WordPress Connector State and Diagnostics Standard](cloud-wordpress-connector-state-and-diagnostics-standard-v1.md)
- [Cloud Connector Recovery Contract](cloud-connector-recovery-contract-v1.md)
- [Site-Inactive Recovery Closeout — 2026-08-13](site-inactive-recovery-closeout-2026-08-13.md) — dated cross-repository implementation, validation, and development-learning record
- [WordPress–Cloud Integration Diagnostics Retrospective — 2026-08-13](wordpress-cloud-integration-diagnostics-retrospective-2026-08-13.md) — dated synthesis of featured-image scene compatibility, Site Knowledge retrieval acceptance, QQ OAuth projection, site lifecycle, Portal proxy, and timeout diagnostics; not current deployment or production evidence
- [Admin Information Architecture](cloud-admin-information-architecture-v2.md)
- [Admin UI Standard](cloud-admin-ui-standard-v1.md)
- [Admin Frontend Engineering Standard](cloud-admin-frontend-engineering-standard-v1.md)
- [Admin UI Review and Delivery Playbook](cloud-admin-ui-review-and-delivery-playbook-v1.md)
- [Admin Customer Operations Workspace Standard](cloud-admin-customer-operations-workspace-standard-v1.md)
- [Customer Account and Identity Stage Standard](customer-account-identity-stage-standard-v1.md)
- [Billing Entitlement Contract](cloud-billing-entitlement-v1.md)
- [Payment Entitlement Contract](cloud-payment-entitlement-v1.md)
- [Payment Gateway Contract](payment-gateway-contract-v1.md)
- [AI Credit Charge Contract](ai-credit-charge-contract-v1.md)
- [Public Plan Catalog and Homepage Display](public-plan-catalog-and-homepage-display-v1.md)

## Providers, Media, and Quality

- [Site Media Recommendation Engineering Standard](site-media-recommendation-engineering-standard-v1.md) — active WordPress-first product and engineering rules for one-click media preparation, bounded recognition proxies, cross-modal retrieval evaluation, structured visual evidence, deduplication, abstention, incremental lifecycle, administrator-controlled background execution windows, and recommendation quality
- [Media Fingerprints, Visual Evidence, and Article ALT Development Standard](media-alt-and-visual-evidence-development-standard-v1.md) — active reference for article ALT, exact-fingerprint evidence reuse, explicit recognition consent, and Toolbox/Addon/Cloud ownership
- [Site Media Recognition Closeout and Development Retrospective — 2026-08-31](history/media/2026/site-media-recognition-closeout-and-development-retrospective-2026-08-31.md) — dated Cloud/Add-on/local acceptance record for one-click sequential batching, package capacity, daily pacing, idempotent recovery, progress semantics, and the final `70 / 70` eligible-image result; not current deployment or production authority
- [Cloud Model Capability Discovery and Verification Standard](cloud-model-capability-discovery-and-verification-standard-v1.md) — external metadata discovery, capability-specific configuration probes, evidence states, route-fingerprint caching, and rollout rules for text, vision, embeddings, image, audio, and video generation
- [Model Capability Verification Development Retrospective — 2026-08-26](model-capability-verification-development-retrospective-2026-08-26.md) — dated synthesis of the model/Provider/route distinction, capability reliability versus output quality, low-cost single-operator observation, 30-day evidence freshness, runtime fail-closed behavior, and deferred video integration; not merge, M4 acceptance, production, or quality authority
- [WeMM-Embedding 与 BGE-M3 评估开发经验 — 2026-09-02](history/models/2026/wemm-embedding-and-bge-m3-evaluation-retrospective-2026-09-02.md) — dated M4 local deployment, dataset evolution, text comparison evidence, and the decision to keep BGE-M3 as the text baseline while evaluating WeMM only for multimodal workloads
- [SiliconFlow VLM 与 M4 图片识别选型开发复盘 — 2026-09-02](history/models/2026/siliconflow-vlm-and-m4-image-recognition-development-retrospective-2026-09-02.md) — dated synthesis of M4 hardware/runtime facts, SiliconFlow VLM observations, cost and capacity reasoning, hosted-first routing, and local privacy/evaluation boundaries
- [Provider Connection Production Runbook](provider-connection-production-runbook-2026-06-30.md)
- [Cloud Web Search Provider Integration Standard](cloud-web-search-provider-integration-standard-v1.md) — active investigation, adapter, secret-handling, verification, M4, merge, and rollout rules for managed search providers
- [AnySearch Web Search Provider Integration Closeout — 2026-08-18](anysearch-web-search-provider-integration-closeout-2026-08-18.md) — dated evidence for PR `#793`, the stale-branch migration correction, M4 acceptance, bounded real-upstream validation, and extracted development lessons; not production or human acceptance authority
- [Operator-initiated Provider Image Delivery Probe](decisions/042-operator-initiated-provider-image-delivery-probe.md)
- [Model Reference Metadata](model-reference-metadata-v1.md)
- [Cloud Web Search Runtime Contract](cloud-web-search-runtime-contract-v1.md)
- [Cloud Image Context Evidence Runtime Contract](cloud-image-context-evidence-runtime-contract-v1.md)
- [Image Source AI Generation Handoff](image-source-ai-generation-handoff-v1.md)
- [Media Derivative Operations Runbook](media-derivative-operations-runbook-v1.md)
- [Editor Assist Quality Flywheel](editor-assist-quality-flywheel-v1.md)
- [Customer Journey Metadata](customer-journey-metadata-v1.md) — active
  metadata-only WordPress and Portal event, consent, retention, summary, and
  release-evidence contract
- [Real Editor Cohort Operations](real-editor-cohort-operations-v1.md)
- [Pre-user Customer Journey Observability Closeout and Development Retrospective — 2026-08-17](pre-user-customer-journey-observability-closeout-and-development-retrospective-2026-08-17.md)
  — dated Cloud/Add-on/Portal/M4/local evidence, privacy decision, lean
  single-operator method, and formal-release/human-cohort handoff; not
  production or recruitment authorization
- [Real Editor Technical Monitoring Closeout and Development Retrospective — 2026-08-15](real-editor-technical-monitoring-closeout-and-development-retrospective-2026-08-15.md)
  — dated two-site Provider, AI-credit, metadata-only quality, Addon PR `#97`,
  correction, and remaining-observation evidence; not production or human-value
  acceptance authority
- [Editor Assist Quality JSON Export Production Closeout — 2026-08-07](editor-assist-quality-json-export-production-closeout-2026-08-07.md)
  — dated evidence for the restrained metadata-only export, focused validation,
  production release, time costs, and explicit non-commercial conclusions
- [Feedback Data Operations](feedback-data-operations-v1.md)
- [Hosted WordPress Text Generation Validation Standard](hosted-wordpress-text-generation-closed-loop-validation-standard-v1.md)

## Operations and Release

- [Operations Playbook](../deploy/OPS_PLAYBOOK.md)
- [Release Checklist](../deploy/RELEASE_CHECKLIST.md)
- [Production Release Optimization and Formal Smoke Handoff](production-release-optimization-and-formal-smoke-handoff-v1.md)
- [Production Release Historical Issues Closeout and Retrospective — 2026-08-14](history/production/2026/production-release-historical-issues-closeout-and-retrospective-2026-08-14.md)
  — dated evidence for the 2026-08-08 handoff ledger, bounded production
  promotion, Addon release, consumer paths, and review corrections; not future
  production authorization
- [First-install PostgreSQL 18 Runbook](cloud-first-install-rds-pg18-runbook.md)
- [Production WordPress Connector Smoke](production-wordpress-ai-connector-smoke-runbook-v1.md)
- [Issue #406 Production Validation Preparation Retrospective](issue-406-controlled-production-validation-preparation-retrospective-2026-08-04.md)
  — dated evidence; canary/browser completion is not production validation
- [Production WordPress Round-Trip Validation Runbook](production-wordpress-roundtrip-validation-runbook-v1.md)
- [Production Internal-Validation Active-Soak Evidence — 2026-08-05](production-internal-validation-active-soak-evidence-2026-08-05.md)
- [Python 3.14.6 Controlled-Validation Operator Worksheet — 2026-08-05](python-3-14-6-controlled-validation-operator-worksheet-2026-08-05.md)
  — one-operator, one-budget production evidence, exact quota/ledger assertions,
  WordPress-write boundaries, and fixture cleanup
- [Production WordPress Image Round-Trip Evidence — 2026-08-05](production-wordpress-image-roundtrip-evidence-2026-08-05.md)
  — dated one-operator SiliconFlow lifecycle evidence, cleanup receipt,
  alt-text diagnosis, timing lesson, and remaining first-install blockers
- [Production Release and WordPress Text Round-Trip Closeout — 2026-08-07](history/production/2026/production-release-and-wordpress-text-roundtrip-closeout-2026-08-07.md)
  — dated deployment/recovery retrospective plus one-operator text adoption,
  autosave recovery, quota/ledger, and cleanup evidence
- [Frontend Public/Portal Release Checklist](frontend-public-portal-release-checklist-v1.md)
- [P5 Local Backup/Restore Drill](p5-b5-local-backup-restore-drill-v1.md)
- [Runtime Stability and Performance Evidence Plan](runtime-stability-performance-evidence-v1.md)
- [Small-customer Trial Readiness](small-customer-trial-commercial-readiness-v1.md)

Production approval, deployment, production validation, and GA remain separate
states. A historical production or M4 receipt never authorizes a new release.

## Architecture Decisions

Accepted and superseded architectural decisions live under
[`docs/decisions/`](decisions/). ADRs are append-only decision history:

- do not delete an ADR because implementation changed;
- add or update the successor relationship when a decision is replaced;
- verify duplicate numbering and ambiguous status before adding a new ADR;
- use the current implementation and newest accepted successor when an older
  ADR conflicts with present source.

## Evidence and Historical Material

The following naming patterns normally identify evidence rather than active
authority:

- `*-acceptance-*`
- `*-closeout-*`
- `*-retrospective-*`
- `*-validation-*`
- `*-trial-*`
- `*-audit-*`
- `*-history-*`
- date-stamped implementation summaries and handoffs

These files remain valuable for revisions, commands, failures, measured
results, rollback evidence, and prior decisions. Keep them searchable, but do
not place their complete list in the root README.

Special retained evidence areas:

- [`docs/history/`](history/) contains material already moved into an explicit
  history namespace;
- [`docs/legacy-contracts/`](legacy-contracts/) contains reference-only
  snapshots imported from the former repository layout;
- [`docs/superpowers/`](superpowers/) contains historical planning artifacts
  and is excluded from routine documentation governance.

Historical migrations under `migrations/` are schema evidence and are not
documentation cleanup targets.

## Initial Cleanup Review Queue

The 2026-08-03 baseline contained 309 tracked Markdown documents: 250 had an
early status marker and 59 did not. These counts are an inventory snapshot, not
a deletion quota.

Apply the
[Repository Hygiene and Documentation Lifecycle Standard](repository-hygiene-and-documentation-lifecycle-standard-v1.md)
to every batch in this queue. The
[first cleanup retrospective](history/repository-hygiene/2026/repository-hygiene-cleanup-closeout-and-development-retrospective-2026-08-03.md)
records the evidence and corrections that produced that standard.

Review in bounded batches:

1. Admin Phase C-H and pilot acceptance records from 2026-07-12: retain as
   evidence, verify links to the current Admin standards, then consider moving
   them under a history namespace in a separate PR.
2. June external/internal trial records: verify whether their operator
   procedures remain active before changing status or location.
3. Dated refactor, P5, provider, frontend, and release closeouts: retain the
   evidence chain and remove only duplicate navigation from current entry
   points.
4. Superseded and retired contracts: require a named replacement or explicit
   negative-guard purpose; do not delete solely because runtime code no longer
   implements the old surface.
5. Files without an early status marker: classify from current consumers,
   owning standards, Git history, and executable contracts before moving or
   deleting them.

## Change Rules

When changing documentation structure:

1. preserve active boundaries, ADR history, migrations, release evidence, and
   negative guards;
2. update inbound links in the same change when moving a file;
3. run a repository Markdown-link check or an equivalent tracked-file link
   scan;
4. verify `git diff --check`;
5. run the narrowest policy/contract gate covering the changed entry points;
6. keep documentation-only work out of M4 unless a runtime-specific risk
   explicitly requires it;
7. report local, PR, merged, M4, production, and human evidence separately.

An unreferenced basename, old date, large file, or `retired` label is a review
signal, not deletion authority.
