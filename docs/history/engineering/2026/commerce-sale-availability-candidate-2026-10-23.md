# Commerce sale availability candidate — 2026-10-23

Status: local development candidate; integration acceptance pending.
Active scope: [commercial next stage](../../../engineering/commercial-development-next-stage-v1.md).

## Behavior

Admin can explicitly put the existing standard Plus/Pro offer on sale or
withdraw it. Catalog reads and default initialization preserve existing sales
status. Publishing a price/rights version preserves withdrawal. Catalog,
checkout and new self-serve trial requests agree on eligibility. Existing
orders and active trials retain their original behavior; order replay and
settlement retain purchase-time price and target version.

Credit packs reuse the existing Admin overrides. No production data is seeded,
no live offer is changed, and no real payment/refund or paid Provider call was performed.
The old development-freeze navigation banner is removed. Existing live plan
parameter editing remains in place; immutable entitlement versioning is deferred.

## Local evidence

Initial source base: `a6fa69bf243eb8158ef0c95fab7d797593166e79`. The initial
verification ran against the focused dirty candidate. The branch was then
rebased onto master `244cab8fb49a165fd0d46b9b31da249a87717da4`; intervening
#1204 changed history documents only. This is not clean-master runtime evidence.

- `pnpm run verify:local`: passed, including targeted Python quality/tests,
  TypeScript, ESLint, proxy Vitest, Admin contracts and release-policy checks.
- Targeted commerce suite: 59 passed across plan availability, subscriptions,
  payments, Admin sales routes and existing plan-management routes.
- Payment gateway / signed notification baseline for batch 2: 19 passed.
  This is baseline evidence, not delivery of batch 2.
- Admin plan directory Playwright: 3 passed.
- Manual Playwright Chrome, local Next dev server and mocked APIs: on sale,
  withdrawal, reactivation, pending write, failed save/retry, disabled sales
  action during unsaved parameter edits, successful write followed by failed
  detail refresh, and Escape close passed. PC viewport 1440 x 1050; additional
  captures at 1440 x 1200. Screenshots and structured receipt are retained in
  ignored `.tmp/output/playwright/`. Human visual/focus acceptance is pending.
- Full `pnpm run check:admin-ui:visual`: **86 passed, 9 failed**. Two supplier
  directory failures concern pagination/configure and raw error localization;
  one diagnostic tooltip exceeds its geometry assertion by 0.78125px; six
  coverage-queue tests cannot find expected working surfaces/pagination.
  Follow-up comparison on clean master `244cab8f` reproduced the service queue
  hang and provider-error failure; the short-viewport diagnostic case passed.
  Independent [PR #1207](https://github.com/npcink/npcink-ai-cloud/pull/1207)
  fixes canceled-request deduplication and the already-handled provider
  rejection, and corrects the pagination test's list entry route. Its focused
  9 cases and full **95-test** Admin visual gate passed. No geometry thresholds
  or goldens changed. These results belong to the independent repair branch,
  not this commerce branch; integration and combined verification remain pending.
- Full frontend contract gate passed. Two stale CI expectations were updated:
  the navigation contract now expects the withdrawn freeze note to remain
  hidden, and the repository-retirement contract accounts for the bounded
  sales transaction. The latter contract file passed all 10 tests.
- Browser console includes expected injected 503 responses and a Next dev/HMR
  React warning during initial login. Production-build console remains unverified.

## Integration and ownership

M4 status was inspected read-only: Portal candidate source
`920a52c225f242faef8476625f2fa734f8d47106`, branch
`codex/portal-breadcrumb-top-off-20261022`, `source_dirty=true`, 46 paths,
`acceptance_state=candidate`, `promotion_pr=none`. This candidate belongs to
another active change. No sync, promotion or M4 mutation was performed.

Commerce PR: [#1205](https://github.com/npcink/npcink-ai-cloud/pull/1205), draft.
At revision `f2295ab69cd27809d05360823a2e5a22adb8ed7d`, Cloud CI run
`39914838418` has passed backend static, contract shards and impacted tests;
frontend remains in progress. CodeQL, secret scan, PR body and documentation
checks passed. These are observations of that revision, not final CI acceptance.
The independent Admin repair PR has its own CI in progress.
An operator question about switching the shared M4 lane is pending; no
dependent sync may proceed without an answer.

Merged: no. M4 candidate for this change: no.
M4 accepted: no. Production: unchanged. Human acceptance: pending.
Retain the locked task worktree while this candidate/PR remains open.

## Next work and rollback

Integrate the independent Admin repair, verify this commerce branch against
that reviewed baseline, and obtain the shared M4 lane before promoting this
change to integration acceptance. Follow the operating
model's second-independent-blocker rule; keep later batches in sequence.
Batch 2 should verify the current payment recovery paths against actual UI
consumers: signed notification deduplication, delayed notification versus
provider payment time, grants exactly once, closing, stable refund identifiers,
unknown refund outcomes and entitlement/credit restoration. Existing domain
and API behavior already covers these cases; do not build a second state machine.

Rollback is a focused source revert. No database migration is introduced.
Review live sales status before deploying a rollback, because the prior default
bootstrap can reactivate a withdrawn offer. Production rollback requires its
own operator authorization.
