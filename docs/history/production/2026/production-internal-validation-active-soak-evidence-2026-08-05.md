# Production Internal-Validation Active-Soak Evidence — 2026-08-05

Status: passed for one-operator, no-external-user internal validation only.

This record does not authorize first-install finalization, external-user access,
GA, or any commercial claim.

## Scope and budget

- Cloud endpoint: `https://cloud.npc.ink`
- production source revision:
  `6b3267885bcbf6ba8a02cd6541f3d45876f3268f`
- source tree: `a6f5991a6a073ed0ff88f9493c5d822c0e4e6fff`
- migration: `20260728_0076`
- site/account: `site_magick-ai-local` / `acct_magick_ai_local`
- operator declaration: no external users, no natural traffic, internal
  first-install validation only
- declared and actual Provider calls: `0` / `0`
- externally provable Provider cost: `0`
- tool-initiated WordPress writes: `0`
- first-install finalize actions: `0`

The soak did not connect to WordPress, so it proves that the governed tool
initiated no WordPress write. It is not an independent WordPress database-write
counter. The earlier real round-trip evidence remains the owner-truth record for
the explicit adoption and cleanup lifecycle.

## Active-soak result

The governed command ran from `2026-08-05T06:46:24Z` through
`2026-08-05T07:16:26Z`:

```text
contract=npcink.production_internal_validation_active_soak.v1
outcome=pass
elapsed_seconds=1802.805
sample_count=30
configured_sample_interval_seconds=60
blockers=0
```

Every sample returned public live health `200`. Across the complete window:

- the current release and source revision did not change;
- all seven container IDs, start timestamps, health states, and restart counts
  remained stable; every restart count stayed `0`;
- every actual image ID continued to match the protected target image map;
- the sole Alembic revision stayed `20260728_0076`;
- site, account, subscription, and entitlement stayed active;
- `used=51`, `remaining=249`, `limit=300`, `ledger=29`, `runs=23`,
  `provider_calls=12`, and `positive_grant_adjustment=0` remained unchanged.

The independent post-soak readiness receipt also passed with the same values
and reported approximately `3.86h` since the API container start. A subsequent
governed internal operational-readiness check passed all required worker
heartbeats, worker-container stability, and `/health/operational-ready`.

The first 30-minute receipt predates the review correction that embeds this
internal helper in every future sample. Therefore this dated evidence is the
combination of a continuous release/container/quota window and an independent
post-window operational-ready pass; it does not claim that every historical
sample queried worker heartbeat truth. Repeating another empty 30-minute window
was deliberately avoided because it would add little evidence after the exact
gap had been checked and the future tool corrected.

The internal active-soak policy, rather than elapsed time alone, satisfies only
the no-user internal-validation observation item.

Non-health `502` count was not measured by this tool. It must not be reported as
zero. No failure was manufactured in production.

## Local text and recovery evidence

The current `origin/master`-based worktree ran focused deterministic coverage
for the high-frequency hosted text tasks and retry/provider-execution seam:

```text
38 passed, 153 deselected, 1 deprecation warning
```

The selected coverage includes `title_generation`, `content_summary`,
`content_rewrite`, retryable execute-route recovery, and provider-execution
records. It makes no paid Provider call and no WordPress write. Historical M4
accepted evidence remains the real editor proof for zero pre-save writes and
one explicit local save; this run does not manufacture a second user journey.

## First-install readiness consequence

The observation item is now satisfied for the declared internal no-user mode.
Current production revision, migration, health, rollback evidence, identity,
entitlement, and usage totals are clear.

First-install finalization is still not ready for authorization because the
controlled Python 3.14.6 CVE gate requires a fresh operator-issued, exact-
bundle acceptance. The AI session did not edit, sign, or replace the private
acceptance and did not run `first-install-finalize.sh`.

## What this proves and does not prove

This proves one internal operator environment stayed stable for the bounded
window without Provider usage or Cloud evidence drift, and the current text and
retry contracts did not regress in deterministic tests.

It does not prove real-user acceptance, natural reuse, content quality,
commercial viability, a non-health `502` count, CVE closure, GA readiness, or
first-install finalization authority.
