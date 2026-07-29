# Cloud Admin Account Site Runtime Evidence Remediation Retrospective

Status: accepted follow-on remediation; one responsibility completed and
frozen pending new evidence.

Date: 2026-07-29.

Accepted implementation: PR #360, merge revision
`8e71827f9b95d102d3f752fa1480706a62696c45`.

## 1. Purpose And Scope

This record closes the first evidence-led follow-on change after the bounded
Cloud Admin frontend remediation sequence. The focused route was
`/admin/accounts/[accountId]`, but the change did not treat route length as a
reason to split the page.

The one responsibility in scope was per-site runtime evidence in the Audit
tab:

- request identity and cancellation;
- successful-result normalization;
- partial and complete failure semantics;
- bounded retry;
- exact query invalidation after related mutations;
- protection of account-level conclusions when site evidence is incomplete.

The route remains a `detail` page. Its existing five-tab operator workflow,
visual hierarchy, package and credit operations, destructive confirmations,
backend APIs, and Cloud/WordPress ownership were not changed.

## 2. Why The Frozen Stage Was Reopened

The previous closeout required fresh correctness or maintenance evidence before
another Admin implementation. Read-only inspection found that the route owned
a second manual site-runtime request lifecycle alongside the accepted Query
provider.

The correctness burden was not merely duplicated code:

1. each site request could fail independently;
2. a failed site could disappear from the result map;
3. missing runtime values were normalized through zero defaults;
4. account-level health, quota, or API-key-gap conclusions could therefore be
   derived from incomplete evidence;
5. route-local request guards and effects owned cancellation and repeat-load
   behavior separately from the shared Query boundary.

This met the evidence threshold for one bounded Stage 4 remediation. The file's
size was supporting navigation evidence only; the failed-evidence semantics
were the authorization to change it.

## 3. State Ownership

### Before

| State | Owner | Burden |
| --- | --- | --- |
| Site request identity | Route-local refs and request key | A second request lifecycle beside the Query provider |
| Loading and failure | Route-local state/effects | Failure behavior was coupled to route rendering |
| Cancellation | Route-local guards | Obsolete account scope was not expressed through the shared query signal |
| Partial results | Route-local aggregation | Failed sites could be absent without an explicit incomplete-evidence contract |
| Derived account conclusions | Route calculations | Missing evidence could look like a real zero-value result |

### After

| State | Owner | Contract |
| --- | --- | --- |
| Query identity | `accountSiteRuntimeKeys` | Account ID plus normalized, sorted, unique site IDs |
| Request lifecycle | `useAccountSiteRuntime` | Existing `AdminQueryProvider`, bounded activation, cancellation signal, and retry surface |
| Evidence normalization | Account feature module | Existing value precedence is preserved |
| Partial failure | Feature result | Successful sites remain; failed site IDs stay explicit |
| Complete failure | Query error | The page shows unavailable evidence and bounded retry; it renders no fabricated runtime card |
| Derived conclusions | Route composition | Health and quota conclusions consume site runtime data only when evidence is complete |
| Final truth | Cloud API/domain | Browser query data remains convenience state, not authorization, entitlement, billing, audit, or WordPress truth |

The target was not to move all account-detail state into Query. Other account,
package, quota, credit-ledger, form, confirmation, and receipt responsibilities
retain their existing owners until separate evidence justifies a change.

## 4. Minimal Change Envelope

Changed:

- extracted one account site-runtime feature module;
- connected the Audit tab to the existing Query provider;
- preserved successful site evidence during partial failure;
- rejected a completely unavailable scope;
- prevented incomplete evidence from driving account health and quota
  conclusions;
- added focused architecture, behavior, and browser evidence.

Explicit non-goals:

- no Ant Design or complete component library;
- no form, table, or global state library;
- no backend aggregation endpoint or API contract change;
- no visual redesign, geometry change, or new shared primitive;
- no conversion of other account-detail requests;
- no Cloud/WordPress boundary change;
- no production deployment or GA claim.

Rollback is a focused revert of PR #360. It requires no backend rollback,
migration, dependency change, or data repair.

## 5. Implementation Decisions

### 5.1 Query identity includes the evidence scope

The key includes the account ID and normalized site IDs. Sorting and
deduplication prevent order-only cache fragmentation, while the account ID
prevents evidence from leaking across account scopes.

### 5.2 Partial failure and total failure are different states

The feature uses settled fan-out results because one site failure must not
discard valid evidence from other sites. It returns successful items together
with explicit failed site IDs.

When every requested site fails, the function rejects. A fully unavailable
scope is not an empty or healthy result.

### 5.3 Cancellation wins over partial completion

The Query `AbortSignal` is forwarded to every site request. After the fan-out
settles, an aborted scope rejects instead of committing an obsolete partial
result for a previous account or site set.

### 5.4 Derived facts require completeness

The route distinguishes available data from trusted complete evidence. Site
runtime cards can retain successful partial evidence, but account-level health,
quota, and API-key-gap conclusions do not consume it until the requested scope
is complete.

This is the most important correctness rule from the change:

> Absence caused by failed evidence collection must not be interpreted as a
> measured zero or healthy state.

### 5.5 Invalidation stays bounded

Related mutations invalidate the account-owned site-runtime query hierarchy.
They do not trigger an unbounded global refetch.

## 6. Verification And Acceptance Evidence

Local source and behavior evidence:

```text
node frontend/tests/unit/admin-account-detail-v2-contract.mjs
pnpm --dir frontend exec vitest run tests/vitest/admin-account-site-runtime.test.ts
pnpm --dir frontend exec vitest run
pnpm --dir frontend run type-check
pnpm run check:admin-ui
NPCINK_CLOUD_FRONTEND_PORT=3302 pnpm --dir frontend exec playwright test tests/e2e/admin-account-site-runtime.spec.ts
git diff --check
```

Results:

- the focused Vitest file passed 5 tests;
- the full frontend Vitest run passed 14 files and 80 tests;
- type-check, focused lint, the account-detail structural contract, and
  `check:admin-ui` passed;
- focused Playwright at `1440x1050` proved `403 -> unavailable evidence -> no
  runtime card -> Retry -> healthy site card`;
- no broad Admin visual gate was required because layout, tables, dialogs,
  shared primitives, and geometry did not change;
- protected PR checks completed with 12 successful and 5 scope-appropriate
  skipped checks, with no failures;
- clean merged `master` was accepted on M4 as PR #360 and revision
  `8e71827f9b95d102d3f752fa1480706a62696c45`, with `source_dirty=false`,
  frontend and API healthy, and `/=200`.

The M4 result proves accepted development-preview source for this revision. It
does not prove production deployment, GA, or external human acceptance.

## 7. Work Review Report

### Original objective

Audit the account-detail route from a clean current baseline, identify one
high-burden responsibility with real correctness or maintenance evidence, and
change only that responsibility after presenting ownership, boundaries,
verification, rollback, and stop conditions.

### Completion

- [x] Started from a clean isolated `origin/master` worktree and preserved the
  user's dirty checkout.
- [x] Selected one evidence-backed responsibility instead of splitting by file
  length.
- [x] Reused the accepted Query provider and existing visual primitives.
- [x] Added behavior evidence for partial failure, complete failure,
  cancellation, retry, and query identity.
- [x] Published, merged, and promoted the exact accepted revision.
- [x] Preserved backend APIs, dependencies, product boundaries, and visual
  hierarchy.
- [ ] Production deployment and external human acceptance were not performed;
  they were outside scope.

### Problems found

| Severity | Specific problem | Root cause | Durable correction |
| --- | --- | --- | --- |
| Must correct | Failed site reads could feed account conclusions as missing or zero-like data | Evidence availability and business value were not represented separately | Carry completeness explicitly and exclude incomplete evidence from derived conclusions |
| Should correct | The route owned a second request lifecycle beside Query | Request ownership had been added incrementally inside a large route | Extract only the proven lifecycle seam and give query identity, cancellation, failure, and invalidation one owner |
| Should correct | The first focused browser assertion matched unrelated localized health copy | The selector asserted broad page text instead of the changed work surface | Assert the diagnostic container, runtime-card count, and card-local status |
| Should correct | An initial test expectation assumed a different token-value precedence | The test invented desired behavior instead of preserving the inspected normalization contract | Verify existing precedence first; correct the test when implementation behavior is intentional |
| Suggested improvement | A temporary convenience script changed the M4 build fingerprint | Verification convenience was allowed to expand the change envelope | Use existing repository commands; remove unrelated package changes before candidate validation |
| Suggested improvement | Shared M4 candidates and relay locks delayed sync and promotion | M4 is a governed shared runtime | Inspect, wait, and retry governed commands; never overwrite a candidate or remove another operation's lock |
| Suggested improvement | Promotion was first attempted from a detached clean worktree | Clean revision and required branch identity were treated as equivalent | Run promotion from a clean current `master` operations worktree and let the script verify branch and revision |

### What worked well

- The audit separated file size from responsibility and correctness evidence.
- The minimal extraction deleted route-local lifecycle code while keeping the
  route's accepted operator model.
- Partial and complete failure were modeled deliberately instead of sharing an
  empty-state fallback.
- Tests were layered: structural contracts guarded architecture, Vitest proved
  request semantics, and Playwright proved the operator retry path.
- Shared M4 state was respected even when another candidate or transfer was
  active.
- Exact source, CI, candidate, merge, accepted M4, and non-production states
  were reported separately.

### Focus for the next task

1. Keep this responsibility frozen until new operator or correctness evidence
   appears.
2. Do not use PR #360 as authorization to migrate every account-detail request
   into Query.
3. For any future account-detail seam, write the current and target ownership
   map before editing.
4. Treat failed or stale evidence as a distinct state before calculating
   health, quota, eligibility, or compliance conclusions.
5. Keep the route-level contract aware of declared feature sources, while
   proving behavior through Vitest and Playwright.
6. Use a stable clean `master` operations worktree for post-merge promotion.

## 8. Durable Standard

For future Cloud Admin evidence surfaces:

1. Start with an observed failure, maintenance coupling, latency, or change
   burden; file length alone is insufficient.
2. Extract one ownership seam at a time.
3. Give remote evidence a stable scope key, bounded cancellation, explicit
   freshness, and exact invalidation.
4. Model `ready`, `partial`, `unavailable`, and `cancelled` separately when
   they lead to different operator conclusions.
5. Never normalize failed collection into a business zero.
6. Require complete evidence before deriving cross-item health, quota,
   compliance, eligibility, or credential-gap conclusions.
7. Keep valid partial evidence visible when useful, but disable or withhold any
   action whose authority depends on the missing scope.
8. Preserve backend and product truth; the browser cache is convenience state.
9. Aggregate route and declared feature sources in structural contracts after
   a safe extraction; do not use source regex as behavior proof.
10. Stop after one accepted responsibility and return to observation.

## 9. Related Documents

- [Cloud Admin Frontend Engineering Standard](cloud-admin-frontend-engineering-standard-v1.md)
- [Cloud Admin Frontend Remediation Retrospective](cloud-admin-frontend-remediation-retrospective-2026-07-29.md)
- [Cloud Admin Frontend Remediation Final Closeout](cloud-admin-frontend-remediation-final-closeout-2026-07-29.md)
- [Cloud Admin UI Standard](cloud-admin-ui-standard-v1.md)
- [Development and Validation Operating Model](development-validation-operating-model-v1.md)

This document records one accepted follow-on responsibility. It does not reopen
the broad remediation sequence or authorize another Admin refactor.
