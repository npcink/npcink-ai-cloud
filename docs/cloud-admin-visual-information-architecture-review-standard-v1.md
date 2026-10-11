# Cloud Admin Visual and Information Architecture Review Standard v1

Status: active engineering standard for Admin layout changes.

Date: 2026-09-14.

## Purpose

This standard prevents small but visible Admin layout regressions: duplicated
headings, unexplained whitespace, competing primary actions, low-value helper
copy, and visual changes that pass behavior tests while remaining hard to use
in a PC browser.

It applies especially to the runtime observation workbench:

- `/admin/usage-statistics`
- `/admin/troubleshooting`

It complements [Cloud Admin UI Standard v1](cloud-admin-ui-standard-v1.md),
[Cloud Admin Frontend Engineering Standard v1](cloud-admin-frontend-engineering-standard-v1.md),
and [Admin Disclosure and State Ownership Standard v1](admin-disclosure-state-ownership-standard-v1.md).

## Core rules

### One job per visual region

Every visible region must answer one operator question. A title, subtitle,
section heading, chart title, and helper sentence must not repeat the same
meaning. If a chart already names the measure, do not add a second heading for
that measure.

### Use the full available workbench

A PC workbench must not preserve a narrow legacy max-width when the adjacent
space has no content. Before shipping, inspect the rendered bounding boxes and
remove unused grid columns, empty asides, and route-local width constraints.

### Separate primary, secondary, and reference content

Core evidence and the next operator action remain visible. Reference
explanations, definitions, and specialized evidence may be disclosed on
request. Disclosure is a product decision, not a substitute for removing
redundant copy.

### Tabs combine views, not responsibilities

Use tabs when two views answer the same question and share filters and state.
For runtime analysis, chart and table are two views of the same evidence:

- Usage Statistics defaults to `Table` for frequent operator comparison;
  `Chart` is an explicit comparison view of the same selected scope;
- `Table` exposes the same scope for comparison and drill-down;
- filters, time range, sort state, and deep links remain consistent;
- the top-level observation TABs are Usage, Media, Vector, and Editorial
  Quality; Runtime Diagnostics remains a separate operator job and route.

### Fold only low-frequency content

Trend evidence needed for first-pass diagnosis is expanded by default.
Definitions, long evidence-boundary explanations, and detailed plugin records
may be folded. A disclosure label must name its content precisely; avoid
catch-all labels such as “More reference”.

### Action hierarchy must be visible

Solid emphasis is reserved for the selected time range and current dimension.
Cross-page navigation such as “Open runtime diagnostics” uses a secondary
style. Sorting and utility actions use the same or lower emphasis. Two solid
blue actions in one toolbar require explicit justification.

## Accepted runtime observation composition

The Usage Statistics page follows this order:

1. the shared four observation TABs and 1/3/7/14/30-day control;
2. page title, compact runtime metrics, and source freshness;
3. refresh and `Chart` / `Table` controls;
4. site/function/plugin dimension controls next to the working surface;
5. one dimension table, comparison chart, or paginated plugin history;
6. definitions and technical-validation scope, collapsed by default.

Do not restore a bottom related-observation link row or an unconditional
Runtime Diagnostics shortcut. Contextual table links carry time and site or
function into diagnostics. Selecting plugin records opens their table; a
runtime chart must not imply that it depicts plugin events.

The Troubleshooting page owns anomaly handling, evidence completeness, and
single-run inspection. Usage Statistics should link into it with the current
window and selected site/function context rather than duplicating its inspector.

## PC visual review checklist

Before M4 synchronization, inspect a fresh 1280px or wider browser capture and
answer all of these:

- Is there any empty right column or unused reserved aside?
- Do title, subtitle, section title, and chart title repeat one another?
- Does the main evidence use the available width?
- Are chart and table tabs aligned with the workbench title?
- Does the default view show the page's primary evidence without a click?
- Are selected controls the only solid primary controls in the region?
- Are helper texts short enough to scan, with full definitions disclosed later?
- Does the table retain its drill-down action when selected?
- Are empty, partial, stale, and truncated states still explicit?
- Does the same route remain usable at 900px, 1280px, and 1600px widths?

A behavior test passing does not close this checklist. Playwright must verify
state and navigation; a browser screenshot or visual receipt must verify
composition and whitespace.

## Required verification gates

For material Admin layout changes, run:

```bash
pnpm run check:admin-ui
pnpm run check:admin-ui:visual
pnpm --dir frontend run type-check
pnpm --dir frontend exec eslint <changed-files> --max-warnings=0
pnpm --dir frontend run test:e2e -- tests/e2e/admin-usage-statistics.spec.ts
```

Focused Playwright coverage includes the default table, chart selection,
distinct site/function series, filter persistence, server pagination and group
drill-down, contextual diagnostic links, and partial-failure behavior.
`git diff --check` is required before synchronization.

Only after the local gates and the PC visual review pass may an authorized
candidate be sent to M4. M4 candidate evidence remains separate from merged
`master` acceptance.

## Failure patterns to record in review

If a revision introduces any of the following, stop and correct it before
synchronization:

- moving whitespace from one region to another without removing its owner;
- leaving an old heading or helper sentence after introducing a new tab/workspace;
- hiding the current view behind another disclosure or changing its scope silently;
- using a catch-all disclosure for unrelated content;
- adding a visually primary button for a secondary filter;
- claiming “visual improvement” from passing behavior tests alone.

Each review should state the changed visual region, the removed redundancy, the
space reclaimed, and the browser evidence used to verify it.
