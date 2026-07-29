# Cloud Admin Frontend Remediation Retrospective

Status: durable handoff after the bounded 2026-07-29 remediation sequence.

## Objective And Result

The objective was not to install Ant Design or declare a fashionable frontend
stack. It was to reduce correctness risk and maintenance cost while preserving
the accepted Cloud Admin operator workflow and Cloud/WordPress ownership.

The sequence addressed four different causes:

1. Stage 1 made behavior tests and bundle evidence visible.
2. Portal users moved filtering, counts, stable pagination, and page selection
   into SQL instead of hydrating and paging a full directory in application
   memory.
3. Support requests reused the accepted Query provider and adapter for stable
   request ownership, cancellation, retry, previous-result continuity, and
   focused invalidation.
4. Account creation extracted a small form boundary, fixed whitespace
   validation and accessibility, and rejected a disproportionate form-library
   dependency after measurement.

The main conclusion is that the repository's problem was ownership and
evidence, not a missing visual component library.

## What Worked

- Starting with a clean isolated worktree preserved unrelated user changes.
- A baseline before each dependency decision turned preference into evidence.
- Backend pagination fixed the actual scaling boundary; a table component could
  not have fixed full-directory hydration.
- Query reuse removed duplicated request lifecycle without changing the
  accepted Admin layout or creating another API client.
- Retained and placeholder Support result scopes were made read-only, preventing
  a mutation from being presented against data that was no longer authoritative.
- The form stop condition worked as designed: useful extraction and tests were
  kept while the costly dependency was removed.
- Focused behavior tests caught issues that source-shape contracts could not.

## Problems Found During Delivery

| Finding | Cause | Durable correction |
| --- | --- | --- |
| A structural contract failed after a safe feature extraction | It read only the route file | Contracts for an extracted surface must aggregate the declared route and feature sources, while behavior remains proven by Vitest or Playwright |
| Support URL state reverted after a manual history update | Next search-parameter state and direct history state temporarily disagreed | Give URL state one synchronization path and test clear/filter/back behavior in the real browser |
| Form selectors failed after errors appeared | Error text was nested inside the label and changed the accessible name | Use stable `htmlFor`/ID labels and `aria-describedby` for errors |
| RHF plus resolver added 75,384 gzip bytes | A general form stack was loaded for five simple fields | Measure the built route, remove the dependency, retain the small form boundary |
| Narrow checks did not initially expose every source-contract assumption | The inner loop was intentionally focused | Run focused checks during editing, then the complete frontend contract suite once before publication |
| Shared M4 could contain another candidate | M4 is a governed shared runtime | Never seize a lock or overwrite another candidate; wait, then deploy/promote the exact revision through the governed commands |

## Rules For Future AI Sessions

1. Diagnose the ownership problem before proposing a library.
2. Keep route files as composition boundaries; move request, directory, form,
   and payload behavior into feature modules only when the seam is real.
3. Use server-side filtering and pagination for server-owned large datasets.
4. Reuse the project Query provider for remote state; never mirror query data
   into local state simply for rendering.
5. Treat stale or placeholder data as read-only when its authoritative scope is
   uncertain.
6. Use native semantic controls and a dependency-free feature form for small
   forms. A form library needs measured multi-field lifecycle burden, not a
   desire for consistency.
7. Keep structural contracts for architecture and forbidden patterns. Use
   behavior tests for requests, validation, retry, focus, and operator flow.
8. Measure route bundles from production builds before and after dependency
   changes. A library pilot may correctly end in dependency rejection.
9. Validate accessible names after errors and helper text appear.
10. Keep source, CI, candidate runtime, merged master, M4 acceptance,
    production, and human acceptance as separate claims.

## Recommended Next Work

Do not start a broad frontend migration. Freeze these four stages and gather
operator evidence. The next change should be one bounded hotspot selected by
observed failure or maintenance burden, not file length alone.

If no stronger evidence emerges, inspect the account-detail route first and
extract only one responsibility at a time. Do not combine that extraction with
a new table library, form library, visual redesign, or backend contract change.
Use the current Portal users, Support requests, and account-create modules as
three different patterns for three different problems; none is a universal
template.
