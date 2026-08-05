# Production WordPress Image Round-Trip Evidence — 2026-08-05

Status: dated controlled-production evidence; first-install finalization remains
blocked.

Purpose: preserve the first real one-operator WordPress image lifecycle result,
the cleanup receipt, the time-cost lessons, and the exact remaining
first-install blockers. Current production state and active policy take
precedence over this record.

## Scope and exclusions

The authorized scope was one lifecycle fixture through:

```text
WordPress Ability -> Npcink Cloud Addon -> production Cloud runtime
-> SiliconFlow Kwai-Kolors/Kolors -> editor preview -> operator review
-> explicit media-library save -> exact cleanup
```

The exercise did not create multiple users, natural reuse, commercial
acceptance, bulk generation, media search, or GA evidence.

## Production and identity facts

| Item | Evidence |
| --- | --- |
| Cloud revision | `6b3267885bcbf6ba8a02cd6541f3d45876f3268f` |
| Alembic revision | sole `20260728_0076` |
| Cloud endpoint | `https://cloud.npc.ink` |
| WordPress site | `https://magick-ai.local` |
| site/account | `site_magick-ai-local` / `acct_magick_ai_local` |
| Addon revision | merged `master` at `fcfa37ed2cabc66bae01467d1913f0f8e85f7688` |
| Provider/model | SiliconFlow / `Kwai-Kolors/Kolors` |
| first-install lifecycle | installation state complete, pending marker retained, permanent completion sentinel absent |

The final mechanical readiness receipt reported all required containers
running with zero restarts, public liveness `200`, active site/account,
WordPress platform identity, active subscription and entitlement snapshot, and
the expected 300-credit limit.

## Provider and timing receipt

- Declared Provider budget: at most one call.
- Actual Provider calls: one.
- Cloud run: `run_5da6ed6452a342b497a7370a11041190`.
- Provider call ID: `12`.
- Provider latency: `4046ms`.
- Cloud run duration: approximately `7.85s`.
- local request log duration: `10133ms`.
- first operator-visible preview: approximately `12.8s`.
- retry count: zero.
- fallback: false.
- Cloud telemetry cost: `0.0`; this is not external Provider invoice proof.

An unrelated due Site Knowledge Cron ran during the first full WP-CLI plugin
bootstrap and consumed one credit without a Provider call or WordPress content
write. The Provider-call baseline was reset after recording that side effect.
Later CLI evidence avoided loading unrelated plugins and themes.

## Quota and ledger receipt

The real image call changed the post-Cron baseline as follows:

| Evidence | Before | After | Difference |
| --- | ---: | ---: | ---: |
| used | 47 | 51 | +4 |
| remaining | 253 | 249 | -4 |
| limit | 300 | 300 | 0 |
| ledger rows | 27 | 29 | +2 |
| site runs | 22 | 23 | +1 |
| Provider calls | 11 | 12 | +1 |
| positive grant/adjustment rows | 0 | 0 | 0 |

The two new ledger entries were `-1 runs` and `-3 image_recommendation`, which
matches the four-credit contract.

## WordPress write and failure receipt

Before explicit save:

- post count `605`;
- revision count `120`;
- attachment count `70`;
- maximum post ID `287365`;
- no WordPress write caused by generation or review.

The operator explicitly saved once. WordPress created exactly one attachment,
ID `287374`, with the same `1,451,002` bytes, `1024x1024` dimensions, and
SHA-256 as the Cloud artifact. Post and revision counts did not change.

During save, `ai/alt-text-generation` returned HTTP `500`, then
`ai/image-import` returned HTTP `200`. Import succeeded with no additional
Cloud run, Provider call, ledger entry, or WordPress attachment.

Read-only diagnosis found a shape/order mismatch:

- WordPress AI requests pre-import alt text with an inline `image_url` data URI;
- the Addon vision handoff intentionally accepts only an authorized local
  `attachment_id`;
- the request therefore fails before Cloud upload/execute;
- the surrounding WordPress AI save flow catches the optional failure and
  continues to image import.

The Addon targeted behavior test passed and proves URL/data-URI rejection
occurs before Cloud execution. Expanding the Addon into an arbitrary inline
image proxy is not an acceptable incidental fix. A future narrow owner-side
change should run alt text after import or skip pre-import alt text for this
connector shape.

## Cleanup receipt

WordPress attachment `287374`, its original file, all derived sizes, and the
temporary operator user were removed. Final WordPress state returned to:

- post `605`;
- revision `120`;
- attachment `70`;
- maximum ID `287365`;
- temporary user ID `48` absent.

Cloud artifact `art_3fc36fae84bd4d089ee33982e423e9ad` was purged at
`2026-08-05T12:52:57.927037+08:00`. Its bytes are absent while the artifact
row, one ACKed delivery, run, one Provider call, and two ledger entries remain.
The new exact cleanup command subsequently returned `already_purged` and
proved identical audit counts before and after the idempotent check.

Final totals remained:

```text
used=51; remaining=249; limit=300; ledger=29; runs=23;
provider_calls=12; positive_grant_adjustment=0
```

## Efficiency result

The standardized read-only command returned the combined lifecycle, health,
revision, migration, identity, entitlement, quota, ledger, run, artifact, and
rollback receipt in approximately three seconds. This replaces repeated manual
container discovery and database queries. The production Provider itself was
not the long part of the original session; unstandardized cross-system evidence
collection and safe cleanup were.

The durable workflow is now:

```text
zero-cost local/M4 fixture checks
-> one read-only production receipt
-> at most one declared Provider call
-> one before/after receipt
-> exact WordPress cleanup
-> exact Cloud cleanup
-> final read-only receipt
```

## Remaining first-install blockers

The finalization-mode readiness check required a 24-hour observation window
and returned `blocked`: only `1.78h` had elapsed since the latest API container
start at the observation checkpoint. The previous release, seven rollback
image entries, rollback image map, and target image evidence were present.

The exact release CVE acceptance receipt also failed the current repository
gate. The private receipt is bound to the correct release and bundle but records
`exception_expires_on=2026-08-05`; the active gate requires the amended exact
value `2026-08-11`. An older deploy-time pass is not current finalization
evidence. The receipt must not be edited or re-signed by an AI session. The
operator must either:

1. explicitly issue a fresh bundle-bound acceptance after current scan and
   threat-intelligence evidence; or
2. preferably promote a supported Python image that removes the three governed
   findings, then rebuild, scan, replay, and follow the pending-install repair
   policy if a release change is required.

No first-install finalize action was run.

## Claims

This evidence proves one operator can complete the real production WordPress
image lifecycle, explicit adoption creates one local write, optional alt-text
failure does not duplicate billing or writes, and both WordPress and Cloud
fixtures can be cleaned while audit truth remains.

It does not prove real-user acceptance, repeat use, content quality, external
Provider billing amount, commercial viability, completed observation, CVE
closure, first-install finalization, external-user readiness, or GA.

Operational procedure:
[Production WordPress Round-Trip Validation Runbook](production-wordpress-roundtrip-validation-runbook-v1.md).
