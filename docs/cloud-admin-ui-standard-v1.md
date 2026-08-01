# Cloud Admin UI Standard v1

Status: active implementation standard.

Purpose: keep `frontend/src/app/admin/**` a compact PC operator workspace when
human or AI contributors add and change routes. This standard turns the
accepted information architecture into reusable implementation rules and
executable gates.

This document composes with:

- [Cloud Admin Information Architecture v2](cloud-admin-information-architecture-v2.md);
- [Cloud Admin Frontend Engineering Standard v1](cloud-admin-frontend-engineering-standard-v1.md);
- [Cloud Admin Customer Operations Workspace Standard v1](cloud-admin-customer-operations-workspace-standard-v1.md);
- [Cloud Admin Feedback And Layout Contract v1](cloud-admin-feedback-and-layout-contract-v1.md);
- [Cloud Content Generation Boundary v1](cloud-content-generation-boundary-v1.md).

If a visual preference conflicts with product ownership, security, audit, or
accessibility, preserve the stronger boundary first.

## 1. Reference Implementation

`/admin/ai-resources` is the accepted PC reference for a `queue` page:

1. compact title and scope;
2. one summary strip;
3. search, status filter, latest operation, and one create action;
4. one semantic comparison table;
5. frequent row actions before one overflow entry;
6. a wide edit workbench with one dense connection table above model
   visibility;
7. explicit credential replacement instead of a prefilled secret field;
8. one stable model toolbar for search, filters, history visibility, and
   synchronization;
9. one in-flow model-maintenance table for reference source, manual additions,
   and confirmed bulk clearing; it must not float over the model data table.

The reference route is a pattern, not a universal page template. Routes must
still use the page model that matches their operator job.

The customer operations workspace provides two bounded references:

- `/admin/accounts` is the customer-directory `queue`: shared create dialog,
  dominant search, bounded filters, one semantic customer table, and one
  Detail row action;
- `/admin/accounts/[accountId]` is the customer `detail`: six task tabs,
  compact current-state summaries, semantic tables for repeated comparison,
  one outer action row per active task, shared drawers for long read-only
  evidence, and shared dialogs for bounded comparison or mutation work.

`/admin/coverage` remains the separate needs-action service queue. It is not a
second customer directory and must not be merged into the Accounts route.

`/admin/external-services` is the accepted PC reference for a
`configuration` page:

1. one readiness summary and one active service category;
2. one semantic table for scanning service role, state, credential readiness,
   and runtime enablement;
3. configure as the primary row action and connection test as the secondary
   row action;
4. one shared workbench for the active service;
5. one dense semantic configuration table for setting, value, and action/note;
6. explicit credential replacement and an object-specific confirmation before
   clearing a credential and disabling the service;
7. row-associated save and test feedback.

`/admin/runtime-profiles` is the accepted PC reference for a
candidate-chain configuration page:

1. one semantic profile table showing primary model, fallback model, policy,
   state, update time, and one configure action;
2. one shared wide workbench instead of a route-local dialog;
3. one dense policy table above the candidate list;
4. one stable supplier/search toolbar;
5. one semantic candidate table with radio columns for primary and fallback;
6. page-level draft state and one explicit final save;
7. contract identity, revision, and other low-frequency evidence outside the
   default working table.

`/admin/service-settings` is the accepted PC reference for a compact
multi-group settings page:

1. one compact status summary without decorative metric pills;
2. one shared settings workbench with a stable group directory and one active
   configuration panel;
3. selected groups use a quiet background and status dot instead of a heavy
   dark card;
4. simple settings use the semantic three-column configuration table;
5. stored credentials remain concealed until the operator explicitly chooses
   replacement;
6. email preview uses the shared workbench dialog instead of route-local modal
   focus and geometry code.

It is also the first compact-density reference. Its profile directory and edit
workbench keep policy and candidate selection in continuous tables, show normal
metadata inline, and reserve secondary identifiers for tooltips or
low-frequency evidence. Other routes remain on standard density until their
own operator workflow is reviewed and accepted.

`/admin/troubleshooting` is the accepted PC reference for a `diagnostic`
page:

1. one compact scope, time-window control, and independently fresh remote
   sources;
2. one explicit runtime conclusion before the evidence surfaces;
3. one bounded semantic anomaly queue with severity, issue, scope, count, and
   one inspect action;
4. one contextual inspector for evidence code, affected runs, scope, and the
   next diagnostic step;
5. one compact quality summary that keeps sample sufficiency separate from
   the presence or absence of a review candidate;
6. low-frequency quality detail, evidence lanes, and runtime guidance behind
   default-collapsed disclosures;
7. no mutation, routing, provider, prompt, approval, or WordPress write
   authority.

The executable projection of the route matrix and accepted dimensions lives in
`frontend/admin-ui-manifest.json`.

## 2. PC Geometry And Density

- Primary target: desktop operator use at 1280 CSS pixels and wider.
- Expanded sidebar: `208px`; collapsed rail: `64px`.
- Wide edit workbench: no more than `1152px`.
- Compact configuration workbench: no more than `960px`.
- Comparison-heavy queues use semantic tables.
- The first working surface should begin within the first two desktop
  viewports.
- Use compact rows, one-line utility copy, dividers, and whitespace before
  adding another card.
- Shared workbench primitives expose an opt-in `density="compact"` mode for
  high-frequency PC configuration work. It uses `32px` controls, approximately
  `40px` rows, `4px` corners, flat section headers, and one-line secondary
  information. The default density remains unchanged so a pilot does not
  silently restyle unrelated routes.
- Compact density is an information-architecture choice, not a route-local
  collection of reduced padding classes. Apply it consistently to the dialog,
  configuration table, and primary data-table frame for the selected task.
- Compact controls must reduce height, vertical padding, line height, corner
  radius, and focus treatment together. Do not place the standard `44px`
  control padding inside a forced `32px` height; clipped labels are a failed
  density implementation.
- Compact tables use one structural boundary at a time. Comparison-heavy data
  tables use a quiet header and low-contrast row dividers. Short, fixed
  configuration tables use a quiet header boundary plus whitespace between
  rows. Neither restores an outer rounded frame, and interactive controls keep
  their own visible boundary.
- Mobile remains accessible, but mobile-specific redesign is not required by
  a PC-only change unless the changed primitive breaks the core task.

Geometry values must come from the shared `--admin-*` tokens in
`frontend/src/app/globals.css`. Do not repeat equivalent width literals in
route files.

## 3. Page Models

Every admin route declares exactly one model in
`frontend/admin-ui-manifest.json`:

| Model | Main working surface |
| --- | --- |
| `overview` | conclusion, compact metrics, immediate work |
| `queue` | toolbar, table or task list, contextual follow-up |
| `detail` | object identity, state, bounded follow-up, tabs |
| `configuration` | readiness, one active group, test and save |
| `diagnostic` | scope, health conclusion, anomalies, evidence |
| `authentication` | identity scope, credential, error, submit |

Do not change an API or data owner merely to make two routes look alike.

### 3.1 Diagnostic Operator Density

A diagnostic page is an evidence workbench, not a raw telemetry dump. Its
default PC view must answer, in order:

1. What is the current conclusion?
2. Which anomaly should be inspected first?
3. What is its affected scope and frequency?
4. Which narrow evidence view or next step matches it?

Use these rules:

- Keep the conclusion in a dedicated, non-truncated line. A badge names the
  state; it does not replace the conclusion.
- Use a semantic table when anomalies repeat the same comparison fields.
  Keep raw evidence codes, long identifiers, affected-run counts, and
  explanatory detail in the selected inspector unless they are needed to rank
  every row.
- A queue beside an inspector must align to the start of the grid. A short
  queue must not stretch to the inspector height.
- Bound long queues with a shared `--admin-*` maximum-height token and a
  sticky header. The manifest PC viewport must not acquire page-level
  horizontal overflow.
- Keep selected-row and disclosure state local unless a shareable URL is an
  explicit operator requirement. Do not copy remote diagnostic data into
  local state merely to render it.
- When a page reads more than one remote source, preserve each source's
  loading, error, and freshness state. The page may project a composite
  refresh state, but one failed source must not erase successful evidence from
  another source or pretend that all data is current.
- Disable the composite refresh action until all required source requests are
  idle. Show partial failure separately from total failure.
- Sample sufficiency, collection stage, review-candidate count, and final
  quality conclusion are different facts. In particular, an insufficient
  sample with zero candidates is not a successful "no issue" conclusion.
- Put raw lanes, schema guidance, debug identifiers, and historical detail
  behind explicit disclosures. The closed summary must still show the state,
  key count, sample stage, and freshness needed for the next decision.
- Inspect the selected anomaly and open matching evidence is the primary
  operator path. Refresh and time-window changes are secondary actions. A
  diagnostic page has no destructive default action and must not gain mutation
  authority for visual convenience.

Focused behavior evidence must cover ready, partial-failure, total-failure,
refresh, row-to-inspector selection, default-collapsed disclosures, expansion,
and insufficient-sample semantics. PC evidence must also verify start
alignment, bounded scrolling, sticky headers, long localized text, and the
absence of page-level horizontal overflow.

## 4. Visual Hierarchy

- Use utility headings that name the object or action.
- Do not add a hero, slogan, decorative gradient, or dashboard-card mosaic to
  a routine admin route.
- Normal ready/configured state stays visually quiet.
- Warning, error, pending, inactive, and destructive states carry the stronger
  emphasis.
- Status must include text; color alone is insufficient.
- One section has one job and one primary action by default.
- A page must not repeat the same title or scope sentence in nested panels.

### 4.1 Surface, Border, And Divider Semantics

Every visible boundary must explain structure, interaction, or an incomplete
state. Do not add a border only to make ordinary content resemble a card.

| Surface | Required treatment | Dashed boundary |
| --- | --- | --- |
| Dialog or drawer shell | shadow plus one quiet solid perimeter; solid header and footer dividers | forbidden |
| Input, select, textarea, or other editable control | visible solid control boundary and focus treatment | forbidden |
| Data or comparison table | quiet header and low-contrast solid row dividers; no repeated outer frame when the parent already owns the surface | forbidden |
| Short, fixed configuration table (normally six rows or fewer) | quiet header divider and whitespace between body rows; no body row dividers or repeated outer frame | forbidden |
| Section inside an existing panel | whitespace first, then at most one solid divider when spacing is insufficient | forbidden |
| Selected or interactive row | quiet background plus text, status, or solid focus/selection treatment | forbidden |
| Success, warning, error, pending, or destructive state | state text plus tint, icon, or solid side/perimeter treatment | forbidden |
| Empty, filtered-empty, or not-yet-created target | explicit empty-state primitive with low-contrast dashed boundary | allowed |
| Upload or drag-and-drop target | explicit drop-target primitive with low-contrast dashed boundary | allowed |
| Loading state | skeleton, progress, or quiet solid in-flow status | forbidden |
| Advanced or low-frequency disclosure | whitespace, quiet background, or one solid divider | forbidden |

The default decision order is:

1. use alignment and whitespace;
2. add one solid divider when the relationship is still unclear;
3. add an outer solid frame only when the surface has independent ownership;
4. use a dashed frame only for an explicitly incomplete or insertable target.

`border-style: dashed` must not appear directly in Admin route files. Use the
shared semantic empty-state or drop-target primitive so the exception remains
reviewable. Removing a frame must not remove keyboard focus, control
boundaries, status text, or accessible table structure.

## 5. Tables And Toolbars

- Comparison-heavy queues default to a semantic `<table>`.
- Tables include a visible header row and an explicit empty or filtered-empty
  state.
- Identity, status, reason, and next action remain scannable in one pass.
- Search and filters stay in one stable toolbar above the table.
- Configure/apply is primary; test/refresh is secondary.
- A table's filter, synchronization, maintenance, and status controls must not
  open a floating panel that obscures the rows being operated on.
- Recovery-only actions appear with the failed state instead of competing with
  routine actions in the default toolbar.
- Delete, debug, raw evidence, documentation, and low-frequency reference
  links stay behind an overflow or disclosure unless they block the task.
- Transient feedback must not move the table or reset unrelated filters.

Use the accepted admin table frame and status primitives instead of creating a
new route-local table shell.

## 6. Dialogs And Configuration

- Create and edit use a dialog or drawer while the list remains the primary
  task.
- Use the shared workbench dialog; do not create another route-local modal
  overlay.
- The dialog must trap focus, close with `Escape` when safe, and return focus
  to the meaningful trigger.
- Essential connection values use one dense configuration table during routine
  editing; only advanced runtime metadata starts collapsed.
- Put the main work object, such as model visibility, in the default view.
- Model maintenance uses concise in-flow configuration rows. Historical-model
  visibility remains a filter, manual IDs remain a row-level add operation,
  and clearing all enabled models requires an impact-specific confirmation.
- One stable footer contains cancel and the one save/apply action.
- Destructive actions do not share the default save footer.
- Short, fixed service configuration uses `AdminConfigurationTable` instead of
  stacked field cards or a low-frequency disclosure. Its boundary is
  `header-only`: retain the header divider, remove body row dividers, and rely
  on alignment and vertical whitespace between normally six or fewer rows.

## 7. Credentials And Capability-Specific Settings

- Stored secrets are never returned to or prefilled in the browser.
- Editing shows a neutral `credential unchanged` state.
- A credential input appears only after an explicit `replace credential`
  action.
- Cancelling replacement clears the unsaved value.
- Capability-specific fields appear only when the capability is active.
- When image generation is active, its response format and exact download hosts
  appear as concise configuration rows; explanatory detail must not become a
  dominant card.
- Text/catalog connectivity must not be presented as proof that image delivery
  works.

## 8. Shared Primitives

Prefer these shared surfaces:

- `BackofficePageHeader` for the one top-level page identity, action, and
  compact summary surface;
- `BackofficeLayer`, `BackofficeSummaryStrip`, and
  `BackofficeDiagnosticNotice`;
- `AdminDataTableFrame`;
- `AdminConfigurationTable`;
- `AdminWorkbenchDialog`;
- `AdminCredentialField`;
- `AdminSettingsWorkbench`;
- `AdminSettingsDisclosure`;
- `AdminEmptyState`;
- `BackofficeStatusBadge`;
- the global Toast and latest-operation receipt surfaces.

Page files compose route data and behavior. They must not duplicate modal
focus management, credential reveal behavior, table framing, status palette,
shared geometry, or dashed empty-state framing.

For new and materially changed non-authentication routes, use
`BackofficePageHeader` for the top-level page header. Keep its order stable:
eyebrow, one page title with an information hint, no more than one primary
action plus bounded secondary action, then a compact factual summary. Use
`BackofficeLayer` only for a section inside the page; it must not create a
second page title. Loading and failure shells may use `BackofficePrimaryPanel`
when they need to retain a bounded retry surface without fabricating summary
facts.

For customer and commercial detail surfaces, use a shared inspector drawer for
long read-only records that must preserve the current page context. Use a shared
workbench dialog for bounded comparison, selection, or mutation. Use a
dedicated detail page when an object needs a durable URL and several independent
tasks. Do not nest drawers, dialogs, or multiple disclosure levels as the
routine path to evidence or action.

Existing route-local dialogs are recorded as migration debt by the executable
gate. New route-local dialogs are rejected; migrate one existing dialog at a
time instead of widening the exception list.

Existing route-local credential fields are recorded separately in the same
manifest. New credential work must use `AdminCredentialField`; migrate one
legacy credential surface at a time instead of adding another exception.

## 9. AI And Pull Request Contract

Before editing `frontend/src/app/admin/**`, an AI or human contributor must
record:

- page model;
- operator job;
- primary, secondary, and destructive actions;
- shared primitives reused;
- low-frequency detail moved behind an entry surface;
- affected UI states;
- reference route or reason the reference does not apply;
- required local and browser gates.

The pull request must contain the same information and attach focused PC
evidence for meaningful layout changes.

## 10. Required Gates

### 10.1 Risk-tiered visual enforcement

Admin visual evidence uses the risk tier declared by the changed seam:

- `low`: copy, data labels, color, iconography, or route-local spacing with no
  geometry, action-hierarchy, state, or interaction change; run the structural
  check that owns the seam plus a focused target-route PC browser check;
- `material`: route composition, table, form, responsive geometry, state,
  action hierarchy, dialog, or inspector change; local PC browser evidence and
  a structured visual receipt are mandatory;
- `shared`: Admin shell, shared primitive, geometry token, or cross-route
  interaction change; run the representative route matrix locally and gather
  M4 browser evidence before acceptance.

### 10.2 Preview-first and closeout gates

Visual direction must be reviewable before unrelated integration work obscures
the feedback loop. For an eligible `low` appearance-only change, use:

```text
focused source/static check
  -> focused target-route PC browser check
  -> visible preview
```

Do not wait for the complete Admin visual matrix, unrelated backend CI, merge,
or M4 promotion before showing that preview. The preview proves only the
rendered candidate. Required PR checks still decide merge eligibility, and M4
promotion still decides accepted runtime state when acceptance is in scope.

For `material` work, run the route-focused visual spec and write its receipt
before preview. Run `check:admin-ui` before publish, and run the complete
`check:admin-ui:visual` matrix once at closeout when the changed seam or PR
policy requires it; do not repeat the matrix after every styling edit.

For `shared` work, or any change involving behavior, state ownership, API/data
contracts, credentials, destructive actions, dependencies, or runtime inputs,
use the complete delivery chain in the frontend engineering standard.

Reclassify upward immediately when a supposedly `low` change causes overflow,
alters a control or state, touches a shared primitive/token, or produces an
unexplained console or network failure. A user request for merged, M4 accepted,
deployed, or production evidence also expands the requested outcome even when
the visual diff itself remains small.

The initial route pilots cover `/admin/ai-resources`, `/admin/service-settings`,
and `/admin/troubleshooting`. The first cross-route workflow pilot covers the
`/admin/support-requests` queue and `/admin/support-requests/[requestId]`
detail as one operator closure. The manifest owns every pilot's page model,
risk tier, working-surface selector, and required state matrix. Expand the
pilot only through a bounded operator workflow with stable evidence and no
excessive false positives.

Every rule result is one of `pass`, `fail`, `review_required`,
`not_applicable`, and `unmeasured`. Do not calculate a composite visual score.
A deterministic failure blocks the gate. `review_required` preserves a human
decision instead of inventing a machine judgment. No receipt means
`unmeasured`; missing evidence must not be reported as a pass.

The first rule set is:

1. route and manifest page model agree;
2. the PC evidence viewport is exactly `1440 x 1050`;
3. the document has no unintended horizontal overflow;
4. the main surface has exactly one page title;
5. the primary working surface begins in the first PC viewport;
6. each working region has no more than one primary action by default;
7. status is expressed with text instead of color alone;
8. frequent actions remain next to their object or in the same workbench;
9. selected, keyboard-focus, and disabled states remain distinguishable;
10. applicable dialogs contain focus, close safely with `Escape`, and restore
    focus to their trigger;
11. loading, feedback, failure, and retry preserve the operator's meaningful
    context instead of resetting or displacing the working surface;
12. the browser reports no unexplained console error or failed request.

The receipt schema lives at `frontend/admin-visual-receipt.schema.json`. A
receipt records route, model, exact source state, environment, viewport,
tested states, all rule results, screenshots, interactions, browser errors,
review items, and human acceptance. Local evidence, M4 candidate evidence,
M4 accepted evidence, production, and human visual acceptance remain separate.

Commit the schema, state matrix, tests, and accepted golden baselines. Keep
ordinary successful screenshots, traces, videos, and repeated receipts in the
ignored Playwright test-result directory. Commit a changed golden baseline
only after the required human visual acceptance.

Inner loop:

```bash
pnpm run check:admin-ui
```

Focused PC browser evidence:

```bash
pnpm run check:admin-ui:visual
```

The structural gate verifies the route manifest, shared tokens, required
primitives, documentation/AI entry points, and the bounded legacy-dialog and
credential allowlists. The visual gate verifies the accepted queue, detail,
configuration, diagnostic, and cross-route workflow pilots at the fixed PC
viewport and writes structured receipts into Playwright test results.

Also run type, lint, i18n, contract, M4, and repository gates required by the
actual changed seam. A screenshot is supporting evidence, not proof of API,
security, mutation, or merge acceptance.

## 11. Change Review

Reject a change when:

- it adds a new unclassified admin route;
- it bypasses a shared primitive without a recorded reason;
- it introduces another route-local dialog;
- it adds multiple competing primary actions to one section;
- it moves destructive action into the default row;
- it exposes or pre-populates a stored credential;
- it turns normal state into a prominent banner;
- it uses architecture explanation as the main working content;
- it adds a dashed boundary outside an approved empty or drop-target primitive;
- it nests an outer table frame inside a parent surface that already owns the
  boundary;
- it changes Cloud/WordPress ownership for visual convenience;
- it has no PC interaction evidence for a material shared-layout change.

## 12. Rollout

1. Keep `/admin/ai-resources` as the first queue reference.
2. Extract accepted patterns only after their interaction is stable.
3. Migrate one existing route or dialog at a time.
4. Keep legacy exceptions explicit and reduce them; never grow them silently.
5. Use GitHub required checks for merge authority and M4 promotion for accepted
   development-runtime evidence.
