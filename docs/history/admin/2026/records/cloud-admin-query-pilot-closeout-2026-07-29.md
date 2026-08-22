# Cloud Admin Query Pilot Closeout

Status: time-bounded Admin historical evidence; not current Admin UI authority.

Current authority: [Admin UI Standard](../../../../cloud-admin-ui-standard-v1.md),
[Admin Frontend Engineering Standard](../../../../cloud-admin-frontend-engineering-standard-v1.md),
and [Admin Information Architecture](../../../../cloud-admin-information-architecture-v2.md).

Original status: accepted queue baseline; the bounded second queue and form decision are
also complete.

Date: 2026-07-29.

## 1. Decision

The `/admin/portal-users` Query-first pilot is accepted as the first bounded
Cloud Admin frontend engineering pilot.

The pilot justifies keeping `@tanstack/react-query` behind the project-owned
`AdminQueryProvider` and feature-owned query modules. It does not justify
adopting Ant Design, a headless table library, React Hook Form, another client
store, or another visual, API, schema, error, or i18n system.

The next frontend expansion is limited to `/admin/support-requests`, after the
Portal users API stops doing full-directory in-memory filtering, counting, and
pagination. A second queue must show that the shared provider cost is
amortized and that the adapter continues to remove lifecycle code without
absorbing product logic.

## 2. Scope And Evidence Chain

The behavior gate and pilot were delivered separately:

| Evidence | Revision |
| --- | --- |
| Stage 1 frontend Vitest CI gate | PR #348, `c9f2a6265f245de4ec995bc12beb10a660cdc1cf` |
| Stage 2 Portal users Query-first pilot | PR #349, accepted `master` revision `87702f6634a41e2ea65c2afc7f139fa9b3136a5d` |

The pilot preserved the accepted Admin shell, responsive list, toolbar,
inspector, status badges, mutation receipts, audit dialog, i18n, error
taxonomy, and Cloud ownership. It extracted API access, query keys, request
lifecycle, cancellation, bounded retries, invalidation, and directory
derivation into the feature module and shared provider.

This closeout also corrected one issue found during operator validation:
filtered-empty results now say that no users match the current filters instead
of incorrectly claiming that the self-registration directory itself is empty.

Explicit non-goals:

- no product redesign;
- no table-library or form-library adoption;
- no API contract or Cloud/WordPress ownership change;
- no credential, entitlement, billing, audit, or destructive-action
  optimistic update;
- no production deployment or GA claim.

## 3. Client Bundle Measurement

Method:

1. build the exact Stage 1 revision and the accepted Stage 2 revision with
   Next.js production mode;
2. read each route's Turbopack page client-reference manifest;
3. deduplicate referenced JavaScript chunks;
4. record both raw and gzip byte totals with
   `pnpm run frontend:measure:route-bundle`.

| Route | Stage 1 raw | Stage 2 raw | Delta raw | Stage 1 gzip | Stage 2 gzip | Delta gzip |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `/admin/portal-users` | 909,453 B | 950,161 B | +40,708 B | 236,831 B | 249,964 B | +13,133 B |
| `/admin/support-requests` control | 887,767 B | 915,363 B | +27,596 B | 231,690 B | 239,994 B | +8,304 B |

The control route exposes the provider-level Admin cost. The Portal
users-specific net above that shared cost is approximately `+13,112` raw bytes
and `+4,829` gzip bytes.

Decision: this cost is acceptable for one internal operator queue because it
replaces duplicated request ownership with bounded retry, cancellation,
cache/invalidation, retained-page behavior, and common diagnostics. It is not
small enough to ignore. The Support requests pilot must demonstrate reuse
before any wider rollout.

## 4. Focused Coverage Baseline

Command:

```bash
pnpm --dir frontend run test:unit:coverage:portal-users
```

Coverage is diagnostic evidence, not a percentage gate.

| Area | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| Focused total | 21.76% | 16.19% | 19.41% | 20.96% |
| `AdminQueryProvider.tsx` | 66.66% | 100% | 33.33% | 66.66% |
| `directory-model.ts` | 98.18% | 82.60% | 100% | 100% |
| `queries.ts` | 42.10% | 75% | 40% | 42.10% |
| `api.ts` | 16.66% | 100% | 0% | 16.66% |
| `PortalUsersWorkspace.tsx` | 0% | 0% | 0% | 0% |

The report shows a strong pure directory-model seam and weak direct unit
coverage of query functions, API mapping, provider diagnostics, and the
workspace. The focused Playwright operator path remains the primary workspace
behavior evidence. Future tests should cover meaningful error, cancellation,
invalidation, and interaction paths rather than chase an arbitrary global
percentage.

## 5. Operator And Runtime Evidence

The accepted PR #349 revision was promoted through the governed M4 lane with:

```text
acceptance_state=accepted
promotion_pr=349
source_branch=master
source_dirty=false
source_revision=87702f6634a41e2ea65c2afc7f139fa9b3136a5d
```

Authenticated PC operator validation on the M4 Portal users page confirmed:

- default directory loading and selected-user inspector;
- URL-backed search and status filters;
- filtered result count and clear-filter recovery;
- audit-detail loading;
- dialog close and focus return to the Audit action;
- non-destructive empty state;
- Chinese operator copy and dense PC task layout.

No destructive disable action was executed during this read-only validation.
The filtered-empty copy defect found in that pass has a focused Playwright
assertion in the closeout change and requires candidate/runtime revalidation
before that follow-up revision is accepted.

## 6. Resolved Backend Prerequisite And Required Next Order

The Portal users backend no longer materializes the complete principal,
membership, QQ binding, account, site, and subscription directory before
pagination. The repository now:

- selects the preferred membership, site, primary subscription, and active QQ
  binding projection in SQL;
- applies source, status, package, QQ, and escaped substring filters in SQL;
- computes filtered totals and summary counts in SQL;
- orders principals by `created_at DESC, principal_id ASC`;
- returns only the requested principal IDs for current-page detail hydration.

The API response shape and existing filter semantics remain unchanged. A
focused regression creates three Portal users and proves that a one-row page
hydrates one principal while still returning the three-row filtered total. It
also covers stable offset pagination, site search, package filtering, QQ
filtering, and literal SQL wildcard characters.

The required sequence is complete:

1. PR #350 closed the Query pilot evidence at accepted `master` revision
   `b2a0eb6396ffd5c7ea0967fd878c44b3391b3e96`;
2. PR #352 moved Portal users filtering, counts, stable pagination, and
   current-page selection into the repository and was accepted at
   `69a195fc6a568f67e330963f38e00055358182bc`;
3. PR #353 reused Query for Support requests without a visual redesign and was
   accepted at `4532c53341a8685501822add55ccea4ff1d84286`;
4. PR #356 completed the bounded account-create form decision and was accepted
   at `0b3119c3725550ccf737a78b966b707ce2d68db7`.

No wider queue, table, or form migration is authorized by this evidence.

Rollback remains revision-based. Neither the Query pilot nor this closeout
requires a database migration, data rewrite, backend contract break, or
WordPress-side change.

At the recorded pilot baseline, the production dependency audit remained red
for the inherited
`frontend > next > postcss` path (`GHSA-r28c-9q8g-f849`). The same finding is
present at the Stage 1 baseline, so it was not introduced by the coverage
provider or this closeout. It remains a separate dependency-remediation item
and is not represented as a green security gate here. Revalidate current
dependency state before relying on this historical finding.

## 7. Reproduction Commands

```bash
pnpm install --frozen-lockfile
pnpm --dir frontend run test:unit
pnpm --dir frontend run test:unit:coverage:portal-users
pnpm --dir frontend run test:e2e -- tests/e2e/admin-portal-users-directory-v2.spec.ts
pnpm run check:admin-ui
pnpm --dir frontend run build
pnpm run frontend:measure:route-bundle -- --build-dir frontend/.next --route /admin/portal-users
pnpm run check:release-policy
git diff --check
```
