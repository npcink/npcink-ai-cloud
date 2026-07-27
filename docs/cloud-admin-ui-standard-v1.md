# Cloud Admin UI Standard v1

Status: active implementation standard.

Purpose: keep `frontend/src/app/admin/**` a compact PC operator workspace when
human or AI contributors add and change routes. This standard turns the
accepted information architecture into reusable implementation rules and
executable gates.

This document composes with:

- [Cloud Admin Information Architecture v2](cloud-admin-information-architecture-v2.md);
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
8. low-frequency runtime metadata and uncommon model operations collapsed.

The reference route is a pattern, not a universal page template. Routes must
still use the page model that matches their operator job.

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

## 5. Tables And Toolbars

- Comparison-heavy queues default to a semantic `<table>`.
- Tables include a visible header row and an explicit empty or filtered-empty
  state.
- Identity, status, reason, and next action remain scannable in one pass.
- Search and filters stay in one stable toolbar above the table.
- Configure/apply is primary; test/refresh is secondary.
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
- One stable footer contains cancel and the one save/apply action.
- Destructive actions do not share the default save footer.
- Short, fixed service configuration uses `AdminConfigurationTable` instead of
  stacked field cards or a low-frequency disclosure.

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

- `BackofficeLayer`, `BackofficeSummaryStrip`, and
  `BackofficeDiagnosticNotice`;
- `AdminDataTableFrame`;
- `AdminConfigurationTable`;
- `AdminWorkbenchDialog`;
- `AdminCredentialField`;
- `AdminSettingsDisclosure`;
- `BackofficeStatusBadge`;
- the global Toast and latest-operation receipt surfaces.

Page files compose route data and behavior. They must not duplicate modal
focus management, credential reveal behavior, table framing, status palette,
or shared geometry.

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
credential allowlists. The visual gate verifies the accepted queue and
configuration tables and edit workbenches at the fixed PC viewport.

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
- it changes Cloud/WordPress ownership for visual convenience;
- it has no PC interaction evidence for a material shared-layout change.

## 12. Rollout

1. Keep `/admin/ai-resources` as the first queue reference.
2. Extract accepted patterns only after their interaction is stable.
3. Migrate one existing route or dialog at a time.
4. Keep legacy exceptions explicit and reduce them; never grow them silently.
5. Use GitHub required checks for merge authority and M4 promotion for accepted
   development-runtime evidence.
