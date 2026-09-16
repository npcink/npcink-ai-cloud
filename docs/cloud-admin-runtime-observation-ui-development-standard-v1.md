# Cloud Admin Runtime Observation UI Development Standard v1

Status: active working standard
Date: 2026-09-14

## Purpose

This standard records the reusable decisions and development lessons from the
runtime observation workbench iteration on `/admin/usage-statistics` and
`/admin/troubleshooting`. It targets the platform administrator's frequent PC
workflow: detect a trend, scope its impact, identify an anomaly, and inspect
one run's bounded evidence.

## Information architecture

Usage Statistics answers **what is changing and where the impact is**. It owns
runtime trends, distribution by site or function, and plugin event summaries.
Troubleshooting answers **what needs attention and what evidence exists**. It
owns anomaly handling, evidence completeness, and single-run drill-down.

Do not duplicate a page's working surface in a second summary table. A mode
with event records should use one primary event table, with aggregate counts in
its header and optional row expansion for evidence. A second aggregate table is
appropriate only when it answers a different operator question and is clearly
secondary.

The normal path is:

```text
Usage Statistics → scope by site/function → Troubleshooting → single-run evidence
```

Every link into the next step preserves the selected time window and identity
(scope). A chart must remain a runtime chart; plugin event timelines must not be
presented as runtime execution trends.

## Layout rules

- Use the existing Admin primitives and `--admin-*` tokens.
- Start with the page title, compact status strip, then the working surface.
- Put view controls beside the time controls when the toolbar has unused PC
  space; keep the table as the default view for diagnostic pages.
- Keep one section to one job. Remove vacant heading rows, decorative lines,
  and repeated explanations.
- Prefer a single table with compact summary metrics in its header to stacked
  cards and lists.
- Use responsive overflow for wide tables and verify the declared PC viewport;
  narrow layouts may wrap controls but must not create unexplained horizontal
  overflow.
- Hide pagination when the result fits one page; show page size and total when
  it does not.

## Content and disclosure

Translate stable internal identifiers into operator language. Keep the raw event
kind or ID in a tooltip, code detail, or expanded inspector. Explanations should
be stated once near the table. In particular, say once that an unlinked Cloud
run means missing matching run evidence and does not by itself mean failure.

Treat technical validation records as a separate scope. The entry belongs in a
low-frequency `统计口径与测试记录` disclosure, says that switching scope does
not create or execute tests, and provides a clear return path. Do not expose
prompts, result payloads, credentials, or raw Provider requests.

## Event table pattern

For repeated plugin events:

1. filter by status and sort latest or failures first;
2. group by event type, plugin, and site;
3. show latest time, status/count, translated event name, source/site, and
   evidence state;
4. open a group to inspect its individual records in the same table;
5. paginate groups at 20 per page in the database over the selected retained
   period, then provide separately paginated individual records for each group.

Group counts and individual-record totals come from the server over the same
selected scope. Do not group only a latest-N sample and label its pages as
history. Pin the time window and maximum event ID while paging; refresh or a
filter change starts a new snapshot. State that retained reports exclude
unreported and purged data. Technical-validation events remain a separate scope.

Runtime comparison uses the same bounded run sample as the dimension table:
show the top five sites/functions by run volume and combine remaining groups
as Other. Rank once over the entire selected window, fill empty UTC days with
zero, and preserve the same series when switching runs/failures. Never plot the
same overall line under different dimension labels.

## Empty, partial, stale, and truncated states

- Empty: explain that no records match the selected scope; do not imply zero
  usage when the source has no reports.
- Partial failure: identify the failed source and keep successful sources
  visible; provide refresh in the existing toolbar.
- Stale data: show the generated time and timezone next to the relevant source.
- Truncated data: state the cap and that trends/groups represent the returned
  sample only.
- Missing values: render `—`, never silently convert them to zero.

## Validation loop

Before editing, write a compact change envelope with the focused module,
intended outcome, non-goals, affected files, state ownership, rollback, and
verification plan. For material Admin UI changes:

- run the route-specific type check and lint;
- run the focused Playwright test at 1440×1050, including a narrow viewport;
- inspect the resulting screenshots, not only assertions;
- run `check:admin-ui` and `check:admin-ui:visual`;
- when the Cloud source path is in scope, sync one coherent candidate to M4,
  await completion, and inspect `m4:preview:status`.

Keep local, M4 candidate, merged, accepted, and human visual acceptance as
separate evidence states. Never claim M4 acceptance from a candidate sync.

## Lessons from this iteration

Repeated visual review exposed that plausible components can still produce a
poor operator surface: duplicated summaries, unexplained internal event codes,
large empty regions, controls separated from their table, and a list that
technically fit but could not be scanned. The corrective method is to first
name the operator question, then remove any text or region that does not help
answer it, group repeated data, and verify the result in a real browser at the
actual PC width. A passing test is necessary; screenshot review is required for
layout claims.
