# Reversible Feature Pauses v1

Status: development candidate, 2026-10-19. Not production deployment evidence.

## Policy

Pause availability and remove product entrypoints while retaining implementation,
saved configuration, usage/billing evidence and historical results. Do not add
database deletion migrations, a feature-control console, or a second registry.
Restore each feature only through a reviewed source change and current consumer
verification; reconnecting, refreshing caches and old saved settings cannot
restore availability. Retention and artifact cleanup continue normally.

## Ordered batches

1. Operations Advisor: pause new diagnosis, summaries, previews and disclosure
   review. Authenticated summary history and value evidence remain read-only.
   Remove navigation, diagnostic directory and command-search entries. Old page
   URLs show a pause notice without fetching advisor data. The retained page,
   service implementation and translations remain available for future review.
2. Cloud nightly inspection and site-operations analysis: pause new execution
   and retries; preserve WordPress-local deterministic checks and old results.
3. Article audio: pause generation and regeneration; retain existing playback.
4. Advanced batch media: pause derivative planning, governance audit and
   optimization-plan entrypoints; retain ordinary image/ALT and safe delivery.
5. Reconcile current help, capability advertising and product promises. Keep
   Site Knowledge sync/search, existing external search, commercial integrity,
   essential observability and translation compatibility operational. Freeze
   their advanced expansion. SEO/AEO/GEO specialist tasks remain paused under
   their existing contract.

Each batch has a focused local commit and regression evidence. A candidate M4
sync does not establish merge, accepted-master or production state. This task
uses the development lane; publication and production are separate decisions.

## First-batch evidence

- Advisor API pause and historical-read tests: 9 passed.
- Retained implementation API tests: 7 passed before the test-data-only repair.
- Frontend type-check, targeted ESLint and `check:admin-ui`: passed.
- PC browser: paused bookmark, no advisor requests, no execution buttons and
  viewport fit passed at 1440x1050. Narrow navigation checks follow the batch.

Rollback: revert the corresponding batch commit and verify current consumers.
Do not treat old configuration or historic acceptance as restoration approval.
