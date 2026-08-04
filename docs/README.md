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

- [Cloud Content Generation Boundary](cloud-content-generation-boundary-v1.md)
- [Cloud Task Pack Boundary](cloud-task-pack-boundary-v1.md) — retired negative
  guard; retained to prevent Task Pack surfaces from returning
- [Cloud AI Data Handling Standard](cloud-ai-data-handling-standard-v1.md)
- [Cloud Media Delivery Boundary](cloud-media-delivery-boundary-v1.md)
- [Media Runtime Boundary](media-runtime-boundary-v1.md)
- [Cloud Open Callback Boundary](cloud-open-callback-boundary-v1.md)
- [Multi-platform Connector Boundary](multi-platform-connector-boundary-v1.md)
- [Cloud Agent Positioning](cloud-agent-positioning-v1.md)
- [Cloud Agent Workflow Metadata Projection](cloud-agent-workflow-metadata-projection-v1.md)
- [Cloud Agent Feedback Contract](cloud-agent-feedback-contract-v1.md)
- [Cloud Agent Feedback Quality Gate](cloud-agent-feedback-quality-gate-v1.md)

## Engineering and Delivery Standards

- [Development and Validation Operating Model](development-validation-operating-model-v1.md)
- [AI Development Validation Tiers](ai-development-validation-tiers-v1.md)
- [Single-Session Worktree Lifecycle](single-session-worktree-lifecycle-v1.md)
- [Single-Session AI Development Closeout and Retrospective](single-session-ai-development-closeout-and-retrospective-2026-08-04.md)
- [Seven-Session Development Synthesis and Open-Issue Triage](seven-session-development-synthesis-and-open-issues-2026-08-04.md) — dated synthesis of recent Cloud sessions; recheck current source before acting
- [Parallel AI Collaboration Standard](parallel-ai-collaboration-standard-v1.md)
- [M4 Preview AI Development Standard](m4-preview-ai-development-standard-v1.md)
- [M4 Preview Development Workflow](m4-preview-development-v1.md)
- [Engineering Command Inventory Standard](engineering-command-inventory-standard-v1.md)
- [Engineering Command Inventory M4 Source Bundle Closeout and Retrospective](engineering-command-inventory-m4-source-bundle-closeout-and-retrospective-2026-08-04.md)
- [Structural Remediation Delivery Standard](structural-remediation-delivery-standard-v1.md)
- [Repository Hygiene and Documentation Lifecycle Standard](repository-hygiene-and-documentation-lifecycle-standard-v1.md)
- [Repository Hygiene Cleanup Closeout and Retrospective](repository-hygiene-cleanup-closeout-and-development-retrospective-2026-08-03.md)
- [AI Development Stage Closeout and Production Readiness Retrospective](ai-development-stage-closeout-and-production-readiness-retrospective-2026-08-02.md)
- [PR and Dependency Update Policy](pr-and-dependency-update-policy.md)
- [CI Pytest Sharding](ci-pytest-sharding-v1.md)
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
- [Site Operations Cloud Analysis Runtime](site-ops-cloud-analysis-runtime-v1.md)
- [Commercial Repository Decomposition Plan](commercial-repository-decomposition-plan-v1.md)
- [Commercial Repository Decomposition Closeout and Retrospective](commercial-repository-decomposition-closeout-and-development-retrospective-2026-08-03.md)

Commercial repository decomposition is paused after Phase 7I. The plan remains
the implementation history and restart contract; the closeout records the
current measured state and why further structural work is not the default next
priority. Neither document is reclassified or moved by this cleanup batch.

## Admin, Portal, Identity, and Commercial

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

- [Provider Connection Production Runbook](provider-connection-production-runbook-2026-06-30.md)
- [Model Reference Metadata](model-reference-metadata-v1.md)
- [Cloud Web Search Runtime Contract](cloud-web-search-runtime-contract-v1.md)
- [Cloud Image Context Evidence Runtime Contract](cloud-image-context-evidence-runtime-contract-v1.md)
- [Image Source AI Generation Handoff](image-source-ai-generation-handoff-v1.md)
- [Media Derivative Operations Runbook](media-derivative-operations-runbook-v1.md)
- [Editor Assist Quality Flywheel](editor-assist-quality-flywheel-v1.md)
- [Feedback Data Operations](feedback-data-operations-v1.md)
- [Hosted WordPress Text Generation Validation Standard](hosted-wordpress-text-generation-closed-loop-validation-standard-v1.md)

## Operations and Release

- [Operations Playbook](../deploy/OPS_PLAYBOOK.md)
- [Release Checklist](../deploy/RELEASE_CHECKLIST.md)
- [First-install PostgreSQL 18 Runbook](cloud-first-install-rds-pg18-runbook.md)
- [Production WordPress Connector Smoke](production-wordpress-ai-connector-smoke-runbook-v1.md)
- [Issue #406 Production Validation Preparation Retrospective](issue-406-controlled-production-validation-preparation-retrospective-2026-08-04.md)
  — dated evidence; canary/browser completion is not production validation
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
[first cleanup retrospective](repository-hygiene-cleanup-closeout-and-development-retrospective-2026-08-03.md)
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
