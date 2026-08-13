# Production Release Optimization and Formal Smoke Handoff v1

Status: active operator handoff.

Purpose: preserve the release-efficiency decisions and the deferred formal
smoke checklist so a later release can continue from explicit evidence rather
than from chat history. This document does not authorize a production release,
does not contain secrets, and does not treat deferred smoke as passing evidence.

Related decision: [ADR-045: Move Production Readiness Checks Before Transfer](decisions/045-production-readiness-and-release-feedback-loop.md).

## 1. Current decision

The next release-efficiency checkpoint is to merge and validate the readiness
preflight already implemented in PR #674. Do not add another scheduler, another
credential path, or a second smoke implementation before observing this path in
a real release.

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

## 2. Five optimization items

| Item | Current state | Next action | Value / stop condition |
| --- | --- | --- | --- |
| Certificate readiness before transfer | Implemented in PR #674; read-only and fail-closed | Merge PR, then use it in the next standard release | Highest value: prevents late failure and bundle re-transfer. Keep unless it causes a false positive; investigate the exact receipt contract rather than bypassing it. |
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

1. Merge PR #674 into `master`; verify the merged revision and required checks.
2. Run the exact production release preflight for the intended production SHA.
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

