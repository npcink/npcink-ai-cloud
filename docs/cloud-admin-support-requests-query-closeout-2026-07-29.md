# Cloud Admin Support Requests Query Closeout

Status: candidate evidence complete; merge and clean-master M4 promotion remain
separate acceptance gates.

Date: 2026-07-29.

## 1. Decision

`/admin/support-requests` is the bounded second Query-first Admin queue. It
reuses the accepted `AdminQueryProvider`, API client, and feature-owned query
pattern without adding a component library, another state provider, or a
frontend dependency.

The change is intentionally not a visual redesign. The responsive task list,
current-page risk order, URL-backed filters, persistent inspector, ticket
detail link, and Cloud-only update boundary remain unchanged.

## 2. Burden Removed

The route no longer owns:

- request deduplication refs;
- sequence numbers for stale-response rejection;
- separate first-load and refresh flags;
- a second retained-page cache;
- imperative reload after a successful mutation.

The feature now owns stable hierarchical query keys, request cancellation,
previous-page placeholders, latest-successful cache recovery, explicit retry,
and directory invalidation after a successful PATCH.

The route is a Suspense composition entry. API mapping, query policy, pure
directory behavior, transport types, and workspace rendering have separate
feature seams.

## 3. Safety Semantics

Previous results may remain visible while a new filter loads or after that
filter fails. Visibility is not authority. When the displayed request key does
not match the current URL-derived request key:

- the retained scope is labeled;
- status and internal-note fields are disabled;
- the update action is disabled;
- retry remains explicit;
- clearing or changing filters remains available.

This prevents a PATCH against a ticket selected from a stale filter scope.
True empty and filtered empty states also use different recovery copy.

## 4. Behavior Evidence

Focused model and cache tests cover:

- bounded query construction and URL normalization;
- current-page risk order;
- stable hierarchical query keys;
- latest-successful cache selection;
- placeholder and failed-filter read-only scope classification.

The focused Playwright path covers:

- one initial request;
- URL-backed status, search, and focus restoration;
- failed-filter retained results;
- disabled mutation controls for retained results;
- narrow viewport overflow;
- successful status/note update and detail navigation.

Candidate commands:

```bash
pnpm --dir frontend exec vitest run tests/vitest/admin-support-requests-query.test.ts
node frontend/tests/unit/admin-support-requests-queue-v2-contract.mjs
(cd frontend && node tests/unit/portal-support-requests-contract.mjs)
pnpm run check:admin-ui
pnpm --dir frontend run test:e2e -- tests/e2e/admin-support-requests-queue-v2.spec.ts
pnpm --dir frontend run build
git diff --check
```

Candidate result: six focused unit tests and two focused Playwright tests pass;
the Admin UI contract/type/lint gate and production frontend build pass.

## 5. Bundle Reuse Evidence

Both measurements use the repository route-bundle script and production Next
builds.

| Route state | Raw bytes | Gzip bytes |
| --- | ---: | ---: |
| Accepted shared-provider control | 915,363 | 239,994 |
| Support requests Query-first candidate | 929,095 | 244,214 |
| Route-local delta | +13,732 | +4,220 |

The shared provider cost was already present before this change. The second
queue therefore adds about 4.2 KB gzip for route-local query seams and tests
the intended reuse case. This is acceptable for the removed request lifecycle
and safer mutation scope, but it remains evidence for two queues only—not
permission for a repository-wide migration.

## 6. Boundaries And Next Step

The backend API contract, WordPress ownership, support conversation detail,
public replies, attachments, database schema, and production environment do
not change.

After merge, the candidate must be promoted from a clean current `master` and
show the merged PR, `acceptance_state=accepted`, `source_branch=master`, and
`source_dirty=false`. Only then should the next independent pilot select one
small form whose validation and dirty-state burden can justify React Hook Form
plus the existing Zod contract.
