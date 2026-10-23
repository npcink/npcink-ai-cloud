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

Source base: `a6fa69bf243eb8158ef0c95fab7d797593166e79`. The verification ran
against the focused dirty candidate; this is not clean-master runtime evidence.

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
  These flows were not repaired in this batch. A clean-master comparison has
  not established whether they predate this candidate. This gate is not green.
- Browser console includes expected injected 503 responses and a Next dev/HMR
  React warning during initial login. Production-build console remains unverified.

## Integration and ownership

M4 status was inspected read-only: Portal candidate source
`920a52c225f242faef8476625f2fa734f8d47106`, branch
`codex/portal-breadcrumb-top-off-20261022`, `source_dirty=true`, 46 paths,
`acceptance_state=candidate`, `promotion_pr=none`. This candidate belongs to
another active change. No sync, promotion or M4 mutation was performed.

CI: pending publication. Merged: no. M4 candidate for this change: no.
M4 accepted: no. Production: unchanged. Human acceptance: pending.
Retain the locked task worktree while this candidate/PR remains open.

## Next work and rollback

Resolve the independent Admin visual failures and obtain the shared M4 lane
before promoting this change to integration acceptance. Follow the operating
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
