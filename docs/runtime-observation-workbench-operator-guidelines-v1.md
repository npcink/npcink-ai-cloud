# Runtime Observation Workbench Operator and Development Guidelines v1

Status: active implementation guidance.

Date: 2026-09-16.

## Purpose

This guide records the decisions and lessons from the Usage Statistics,
Troubleshooting, media observability, vector observability, and editorial
quality workbench iteration. It is intended to keep future Admin changes
focused on high-frequency operator work and the Cloud read-only evidence
boundary.

## Information architecture

The operator needs two distinct jobs:

- **Runtime observation** discovers trends, distribution, and impact. Usage
  Statistics, Media Observability, Vector Observability, and Editorial Quality
  Evidence are read-only views in one TAB workbench.
- **Runtime diagnostics** handles abnormal runs, evidence inspection, and
  single-run drill-down. It remains a separate route and navigation entry.

Observation tabs must preserve URL state so a filtered view is shareable and
refresh-safe. The tab must be the single entry point for the corresponding
view. Do not retain a second “related observation” link row below the table.

The Usage Statistics page is not a billing, revenue, retention, or commercial
analytics surface. Troubleshooting is not a WordPress configuration or write
control plane.

## Layout rules

Use one shared toolbar with two distinct groups: observation TABs and the time
range. They may share a row on wide PC screens and wrap on narrow screens.
Keep refresh with the active data view, and site/function/plugin dimensions
below the common toolbar. Do not repeat time controls inside each view.

The supported ranges are `1`, `3`, `7`, `14`, and `30` days (`24`, `72`, `168`,
`336`, and `720` hours). Admin summary and runtime evidence queries accept up
to 30 days; larger requests fail validation. Runtime samples remain bounded
at 5,000 runs, 10,000 provider calls and 10,000 meter events. Plugin activity
still shows only the latest 50 reports; group pagination is not server history
pagination. A longer window does not increase retention or imply completeness.
Public customer endpoints retain their existing query limits.

The default observation window is seven days. Diagnostics retains its one-day
standalone default; incoming observation links always supply the selected
window explicitly. Test both 10-day-old and 20-day-old records so 14/30-day
options cannot silently query a seven-day projection.

## Navigation and context ownership

The active navigation item and top context label must be derived from the exact
pathname plus its view parameter. Exactly one of the four observation TABs
is current, including `?view=quality`. Media and vector observability must not be classified as Runtime
Diagnostics. When several routes share a workbench, give them an explicit
shared parent entry or a stable active group, while preserving the page title
and TAB state for the selected route.

The URL owns the selected window and site. Transfer those two shared filters
between observation views, while dropping route-specific format, focus and
pagination state. The quality view must pass the site to its API and must not
fetch hidden runtime/plugin data. A time-only change uses the App Router's
native History API integration, preserving browser back/forward without a
server-route reload. Shareable filters must be tested after direct entry,
TAB switches, reload and browser history navigation.

Every new route must be checked at the PC reference viewport. The first
viewport should show the workbench and its primary data surface. Empty,
partial-error, stale, and truncated states must be textual and explain the
scope of the evidence.

## Evidence and disclosure boundary

Cloud surfaces expose bounded operational evidence only. They must not expose
prompts, result payloads, credentials, or raw Provider requests. Low-frequency
quality evidence belongs behind its own TAB and must remain read-only. Long
identifiers and raw technical details belong in an inspector or disclosure,
not in the primary scanning table.

## Development workflow

Before editing an Admin route:

1. Declare the change envelope, non-goals, expected files, and verification.
2. Read the active Admin UI and validation standards and inspect the route
   manifest.
3. Classify route composition changes as L1; classify shared shell, API,
   domain, or runtime changes as L2.
4. Reuse Admin primitives and `--admin-*` tokens.
5. Add a focused browser assertion for the operator-visible contract, not only
   a source-text contract.
6. Run `check:admin-ui`; run `check:admin-ui:visual` for material layout or
   table changes.
7. Sync a coherent Cloud source checkpoint to M4 when runtime evidence is in
   scope. Report candidate, merged, and accepted states separately.

When the local macOS toolchain reports an Xcode license error, use the
installed CommandLineTools explicitly for the bounded command, for example:
`DEVELOPER_DIR=/Library/Developer/CommandLineTools`. This is an environment
recovery measure; it does not change source or acceptance authority.

## Review checklist

A reviewer should confirm:

- one clear operator job per route;
- no duplicate navigation or bottom “related” entry row;
- tab and filter state survive refresh and are URL-addressable;
- navigation highlight, page title, and breadcrumb agree with pathname;
- time options match backend-supported windows;
- empty, partial, stale, and truncated states are understandable;
- no Cloud boundary violations or write controls were introduced;
- focused browser evidence and required Admin gates are recorded.

## Historical lessons

Repeated visual defects came from treating each local block as an isolated
component: duplicate links were added below tables, low-frequency controls
competed with the primary scan path, and shared navigation state was inferred
from a broad diagnostic prefix. The corrective pattern is to establish the
operator job and information hierarchy first, then implement one shared
state owner and one URL-backed entry path. Screenshots are useful review
signals, but the final decision must be checked against the rendered route,
source revision, and M4 evidence state.

## Verification ownership and closeout

A green general frontend CI job is not a current route behavior receipt.
Whenever a link, TAB, filter or disclosure changes, update the focused behavior
test in the same change. Replace obsolete assertions with the new operator
path; do not merely delete navigation coverage. API tests must prove the query
range and scope as well as HTTP success. Mocked browser tests prove rendered
behavior; focused M4 backend tests prove container integration, and neither
claims real customer usage or human acceptance.

Retained data may remain visible after a refresh fails in the same scope, with
an explicit stale notice. A new site/time scope clears old data while loading;
a failure must not label the old scope as the newly selected scope. Missing
runtime evidence means unknown, not healthy. A failed quality request must not
show zero rates, an insufficient sample, or a no-candidate conclusion. Render
unavailable metrics as a dash and show one localized failure notice; keep raw
transport/contract errors out of the normal working surface. Time or status filters must not
leave a grouped plugin table on an out-of-range page.

Before merge, bind each result to the source under test. After merge, promote
clean current master and verify the merged PR and accepted revision. Never
reuse a topic-branch candidate or historical screenshot as accepted proof.

The browser-to-API proxy is part of the evidence path. Mocked page responses
can conceal a missing allowlist route. Test the real proxy handler for the
exact `GET runtime-telemetry/runs` path, diagnostic capability enforcement,
query forwarding, and rejection of writes and raw subpaths. Keep these tests
alongside browser navigation and backend range tests.

For screenshots after viewport changes, wait for the chart canvas to match its
container and the sidebar padding transition to finish. Then capture the
stable layout with CSS animations disabled. A non-overflow assertion alone
cannot prove useful width allocation or a correctly resized chart.
