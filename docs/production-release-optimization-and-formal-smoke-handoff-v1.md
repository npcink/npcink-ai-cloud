# Production Release Optimization and Formal Smoke Handoff v1

Status: active deferred-work handoff; phase 1-2 closeout is recorded in
[Production Release Efficiency Phase 1-2 Closeout and Development
Retrospective — 2026-08-23](history/production/2026/production-release-efficiency-phase1-closeout-and-development-retrospective-2026-08-23.md).

Purpose: preserve the release-efficiency decisions and the deferred formal
smoke checklist so a later release can continue from explicit evidence rather
than from chat history. This document does not authorize a production release,
does not contain secrets, and does not treat deferred smoke as passing evidence.

Related decision: [ADR-045: Move Production Readiness Checks Before Transfer](decisions/045-production-readiness-and-release-feedback-loop.md).

## 1. Current decision

The phase 1-2 readiness preflight and release-plan corrections were merged in
PR #851 and accepted on M4. The next release-efficiency checkpoint is to
observe this path in one ordinary, explicitly authorized release. Do not add
another scheduler, credential path, or smoke implementation before that
observation is complete.

The intended release sequence is:

```text
exact release plan
-> SSH authentication
-> read-only certificate readiness preflight
-> exact bundle download/transfer
-> governed deploy
-> automatic post-install checks
-> optional formal release smoke
-> evidence receipt and timing review
```

## 1.1 Phase 3A: one-release observation checklist

This phase is preparation only. It does not grant production authorization and
must not be run against production until the operator explicitly approves the
release envelope.

Before dispatch, record:

```text
OBSERVATION_PREP
candidate_master_sha=<full SHA>
production_pr=<number or not created>
rollback_revision=<known accepted production revision>
scope=<no_deploy|static|runtime>
formal_smoke=<deferred|separately authorized>
operator_authorization=<pending|recorded>
```

When the release is explicitly authorized, execute in this order:

1. Confirm clean `master`, green exact-SHA CI, intentional scope, and a known
   rollback revision.
2. Run the read-only exact-SHA production preflight; stop on any failed or
   unknown readiness evidence.
3. Dispatch only the frozen production promotion. Do not add unrelated fixes,
   documentation, or workflow changes after dispatch begins.
4. Record readiness, transfer, deploy, migration, post-install, and health
   timings from the authoritative logs. Reuse matching evidence instead of
   rebuilding or rescanning after an unrelated assertion fails.
5. Confirm the deployed full SHA and health state. Formal Smoke remains
   `deferred` unless its separate protected-secret and operator authorization
   contract was activated before the release.

Close the observation with:

```text
OBSERVATION_CLOSEOUT
revision=<deployed full SHA>
readiness_seconds=<value|not measured>
transfer_seconds=<value|not measured>
deploy_seconds=<value|not measured>
migration_seconds=<value|not measured>
health_seconds=<value|not measured>
formal_smoke=<passed|failed|deferred|not run>
failure_phase=<none|readiness|transfer|deploy|migration|health|smoke|unknown>
rollback=<revision or not used>
production_state=<validated|blocked|failed>
```

The first run is an observation sample, not proof of a general speedup. Do
not start certificate scheduling or Formal Smoke automation until this receipt
has been reviewed and the dominant remaining delay is identified.

## 2. Five optimization items

| Item | Current state | Next action | Value / stop condition |
| --- | --- | --- | --- |
| Certificate readiness before transfer | Implemented and merged in PR #851; read-only and fail-closed | Observe it in the next standard release | Highest value: prevents late failure and bundle re-transfer. Keep unless it causes a false positive; investigate the exact receipt contract rather than bypassing it. |
| Five-day certificate warning | Implemented in `Production Maintenance` as `certificate-readiness` | Run the operator-initiated check during the next maintenance window | Medium/high value at low complexity. Keep warning at 5 days and failure at 7 days; never auto-renew from deploy. |
| Pytest dynamic/node sharding | Already present in the active CI standard | Observe natural full runs; do not add a fourth shard now | Value already realized. Revisit only if three-shard median remains above the agreed target after natural samples. |
| Failed-shard-only rerun | Already present and proven useful | Continue using only the failed lane after a distinct failure | Avoids replaying green lanes. Stop automatic retries after the repository's external-transfer retry limit. |
| Parallel worker stop | Already parallel; 30-second graceful bound remains | Collect natural stop/drain timings | Do not shorten to 10 seconds until shutdown correctness evidence supports it. If shortened later, use a bounded canary and rollback. |

The ADR and timing reports are the supporting feedback loop. They have small
direct runtime benefit but prevent the old failure pattern from returning.

## 3. Formal smoke: deferred checklist

Formal smoke is a production-runtime proof for the exact deployed revision. It
is not a replacement for CI and it is not a full regression suite. Until the
operator explicitly schedules it, all items below remain `deferred`.

### 3.1 Automatic checks

The standard GitHub workflow or `deploy/release-smoke.sh` must cover:

- public live, ready, and operational-ready health behavior;
- required workers, fresh cadence, provider freshness, and callback pressure;
- OTLP exporter and trace-query configuration for HTTPS production;
- perimeter failures for unauthenticated internal routes;
- signed model catalog access;
- signed runtime execute, run lookup, result lookup, profile stats, and usage;
- runtime idempotency and nonce/signature behavior;
- public home, Portal login, help, status, privacy, terms, sitemap, icon, and
  frontend revision checks;
- disabled production docs/Redoc perimeter;
- Portal session authentication;
- Admin login and proof that the internal token cannot authenticate Admin;
- Alipay callback safety, when the release explicitly requires it.

The automatic smoke must bind to the full deployed SHA and must fail closed if
any required protected secret is absent. A successful preflight without running
formal smoke is not formal-smoke evidence.

### 3.2 Minimal operator checks

The operator may perform only this short human confirmation before or alongside
the automatic smoke:

1. Open the production home page and Portal login page.
2. Use the one-time Portal login code and confirm login survives one refresh.
3. Open one key read-only Portal page and confirm there is no visible error.

Do not use this checklist to perform deletion, unbinding, payment, refund,
provider reconfiguration, credential rotation, or WordPress writes.

Record each item as `passed`, `failed`, or `not run`, with the exact SHA and
Beijing time. A human page check cannot replace the signed/internal automatic
checks.

### 3.3 Required protected secret names

Values must be configured in the GitHub `production` environment or the
approved secret manager. Never place values in Git, chat, issue text, command
arguments, logs, or this document.

```text
NPCINK_CLOUD_INTERNAL_AUTH_TOKEN
NPCINK_CLOUD_ADMIN_KEY
NPCINK_CLOUD_RELEASE_MEMBER_EMAIL
NPCINK_CLOUD_PORTAL_LOGIN_CODE
NPCINK_CLOUD_RELEASE_SITE_ID
NPCINK_CLOUD_RELEASE_KEY_ID
NPCINK_CLOUD_RELEASE_KEY_SECRET
```

The Portal login code is one-time and short-lived. Generate it immediately
before the smoke that consumes it. The operator only needs to report
`production secrets ready`; the secret values must not be sent to an AI agent.

## 4. Execution order for the next release

1. Start from the current clean `master`; verify the merged revision and required checks.
2. Run the exact production promotion preflight for the intended production SHA.
3. Dispatch the standard production deployment with readiness preflight enabled.
4. Stop immediately if the readiness, bundle, deploy, migration, or health gate
   fails; do not jump to a later smoke step.
5. After a complete deployment, perform the three minimal operator checks.
6. Run the fail-closed formal release smoke with protected secrets.
7. Capture phase timings and classify any failure by phase.
8. Update the release evidence/retrospective only after the run is complete.

The next timing review should compare readiness, bundle transfer, deploy,
post-install, and formal-smoke durations with the previous release. Do not
claim a speedup from a single noisy run; use the observed phase receipts.

## 5. Handoff receipt template

```text
FORMAL_SMOKE_HANDOFF
revision=<full production SHA>
deployment=<passed|failed|deferred>
operator_pages=<passed|failed|not-run>
portal_login=<passed|failed|not-run>
portal_readonly=<passed|failed|not-run>
automatic_formal_smoke=<passed|failed|deferred>
readiness_seconds=<value|not measured>
bundle_seconds=<value|not measured>
deploy_seconds=<value|not measured>
smoke_seconds=<value|not measured>
failure_phase=<none|readiness|transfer|deploy|health|smoke|unknown>
notes=<redacted summary; no secret values>
```
