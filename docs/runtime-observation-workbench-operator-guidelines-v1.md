# Runtime Observation Workbench Operator and Development Guidelines v1

Status: active implementation guidance.

Date: 2026-09-15.

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

Use one compact observation TAB row, followed by one shared time-range control
row. Keep refresh beside the time range, and keep dimension controls such as
site, function, and plugin records in the data view below it. Do not mix the
TAB selector, refresh action, and table dimensions in one visual group.

The shared time range is currently `1`, `3`, and `7` days (`24`, `72`, and
`168` hours). Fourteen and thirty days may be exposed only after every affected
API and domain projection supports the larger window without silent truncation
or unacceptable query cost. A UI option must never advertise a range that the
backend clips to a shorter period.

## Navigation and context ownership

The active navigation item and top context label must be derived from the exact
pathname. Media and vector observability must not be classified as Runtime
Diagnostics. When several routes share a workbench, give them an explicit
shared parent entry or a stable active group, while preserving the page title
and TAB state for the selected route.

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
