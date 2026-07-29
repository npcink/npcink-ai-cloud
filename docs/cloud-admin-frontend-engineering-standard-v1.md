# Cloud Admin Frontend Engineering Standard v1

Status: active engineering standard; Stages 1 through 3 and one bounded Stage
4 responsibility are accepted and frozen pending new operator evidence.

Date: 2026-07-29.

Purpose: reduce the change risk and maintenance cost of
`frontend/src/app/admin/**` without replacing the accepted Cloud Admin
information architecture, visual language, product boundary, or operator
workflow.

This document is the engineering companion to:

- [Cloud Admin Information Architecture v2](cloud-admin-information-architecture-v2.md);
- [Cloud Admin UI Standard v1](cloud-admin-ui-standard-v1.md);
- [Cloud Admin UI Development Retrospective](cloud-admin-ui-development-retrospective-2026-07-27.md);
- [Development Validation Operating Model v1](development-validation-operating-model-v1.md).

The information-architecture and UI standards remain authoritative for page
models, operator jobs, density, status, actions, credentials, and PC evidence.
This document owns frontend code structure, state ownership, dependency
adoption, behavior tests, and the bounded remediation sequence.

The completed sequence and final work review are recorded in
[Cloud Admin Frontend Remediation Final Closeout](cloud-admin-frontend-remediation-final-closeout-2026-07-29.md).

Current implementation evidence:

- Stage 1 added the existing Vitest suite to frontend CI.
- Stage 2 remediated `/admin/portal-users` as the first Query-first queue.
- The Portal users directory repository owns filtered counts, stable
  principal pagination, and current-page candidate selection; the domain
  hydrates related details only for that page.
- The measured acceptance record is
  [Cloud Admin Query Pilot Closeout](cloud-admin-query-pilot-closeout-2026-07-29.md).
- `/admin/support-requests` is the bounded second Query-first queue. It reuses
  the existing provider and adapter, keeps its accepted operator layout, and
  makes retained or placeholder result scopes read-only. Its measured record
  is [Cloud Admin Support Requests Query Closeout](cloud-admin-support-requests-query-closeout-2026-07-29.md).
- A headless table library and React Hook Form remain unadopted. They require
  their own burden-removal evidence; the Query pilot does not pre-approve them.
- Stage 3 tested React Hook Form plus the Zod resolver on the bounded account
  creation form. The route grew by `301,210` raw and `75,384` gzip bytes, so
  the dependency failed the proportionality stop condition and was removed.
  The accepted dependency-free form boundary grew by only `1,272` raw and
  `455` gzip bytes while retaining the behavior fixes. The evidence is
  [Cloud Admin Account Create Form Pilot Closeout](cloud-admin-account-create-form-pilot-closeout-2026-07-29.md).
- Fresh correctness evidence later authorized one Stage 4 responsibility in
  `/admin/accounts/[accountId]`: per-site runtime request ownership and
  incomplete-evidence semantics. PR #360 reused the existing Query provider,
  preserved partial evidence, rejected a completely unavailable scope, and
  prevented missing evidence from driving account health or quota conclusions.
  The route was not broadly split or migrated. The record is
  [Cloud Admin Account Site Runtime Evidence Remediation Retrospective](cloud-admin-account-site-runtime-evidence-remediation-retrospective-2026-07-29.md).

## 1. Problem Statement

The repository has already solved much of the visible Admin inconsistency
through shared primitives, a route manifest, PC-first layouts, compact
workbenches, credential rules, and executable structural gates. The next
problem is not a missing visual component library. It is concentrated page
logic and incomplete behavior verification.

Fresh inspection of `origin/master=31350f0b` on 2026-07-29 found:

| Area | Files | Non-empty physical lines |
| --- | ---: | ---: |
| Backend application | 248 | 115,893 |
| Frontend application | 194 | 64,630 |
| Migrations | 74 | 7,383 |
| Backend tests | 206 | 105,503 |
| Frontend tests | 133 | 16,501 |

The line counts are a navigation aid, not a coverage or quality score. The
important structural evidence is:

- `frontend/src/app/admin/accounts/[accountId]/page.tsx` is about `2,969`
  physical lines;
- `frontend/src/app/admin/ai-resources/page.tsx` is about `2,546` lines;
- `frontend/src/app/admin/ai-advisor/page.tsx` is about `2,482` lines;
- `frontend/src/app/admin/service-settings/page.tsx` is about `2,307` lines;
- at the inspected baseline, default frontend CI ran lint, type-check, and
  source contracts, but did not run the existing Vitest suite or Playwright
  suite; Stage 1 adds the existing Vitest suite while keeping Playwright
  focused;
- most `.mjs` frontend contracts inspect source text. They are useful for
  architecture and forbidden-pattern rules, but do not prove runtime behavior;
- the repository already owns `AdminDataTableFrame`,
  `AdminConfigurationTable`, `AdminWorkbenchDialog`,
  `AdminCredentialField`, `AdminSettingsWorkbench`,
  `AdminSettingsDisclosure`, Backoffice primitives, global Toast, and
  `--admin-*` geometry tokens.

Therefore the active risks are:

1. route files own API access, server data, draft state, mutations, validation,
   and rendering at the same time;
2. state can be duplicated between fetched data, local `useState`, and form
   fields;
3. table behavior and request lifecycles are repeatedly implemented;
4. source-shape tests can pass while behavior is wrong, or fail during a safe
   internal refactor;
5. a broad component-library migration would add another design system without
   removing these causes.

## 2. Decision

Do not adopt Ant Design, Material UI, shadcn/ui, or another complete visual
component system for Cloud Admin remediation.

Keep:

- Next.js, React, TypeScript, Tailwind, and the existing CSS variables;
- the current Admin shell, route manifest, Backoffice primitives, and Admin
  shared components;
- the repository API client, error taxonomy, i18n ownership, Zod contracts,
  mutation receipts, audit evidence, and Toast behavior.

Use a bounded headless-tool pilot for missing engineering capabilities:

| Capability | Preferred tool | Ownership |
| --- | --- | --- |
| Remote/server state | `@tanstack/react-query` | loading, error, cache, refetch, mutation lifecycle, invalidation |
| Table state | `@tanstack/react-table` | columns, sorting, filtering, pagination, selection, visibility |
| Form draft state | dependency-free feature form by default; headless form tool only after a measured pilot | field values, dirty state, touched state, submit lifecycle |
| Form validation | feature validation or an existing transport schema; no new client dependency without measured benefit | input semantics and typed submit payload |

These dependencies are approved only through the pilot and stop conditions in
this document. They are implementation tools, not new product or data owners.
Do not install all of them merely to declare a new stack. Add each dependency
only in the pull request that removes the matching route-local burden.

Do not add Redux, Zustand, or another global client store for ordinary route
data. Reassess only when evidence shows state that is both cross-route and not
server-owned.

## 3. Non-Goals

This standard does not authorize:

- a broad Admin redesign or component rewrite;
- replacement of the accepted shared primitives;
- changes to Cloud/WordPress ownership;
- a second API client, error taxonomy, schema truth, or i18n system;
- moving server truth into a browser cache;
- optimistic mutation of credentials, billing, entitlements, destructive
  actions, or audit-sensitive facts without a separately reviewed contract;
- conversion of every setting into a table;
- simultaneous remediation of multiple giant pages;
- production deployment or GA claims.

## 4. State Ownership

Every materially changed Admin surface must identify one owner for each state.

| State | Owner | Examples |
| --- | --- | --- |
| URL/navigation state | Next.js route/search params | object ID, selected route, shareable filters |
| Remote server state | query layer | account, sites, subscription, readiness, diagnostics |
| Form draft | one feature-owned form boundary | unsaved field values, dirty fields, client validation |
| Table interaction state | table adapter or URL when shareable | sorting, page, row selection, column visibility |
| Ephemeral UI state | local React state | open drawer, active disclosure, current focus target |
| Semantic validation | Zod and server contract | field shape, typed payload, cross-field rules |
| Final authorization and mutation truth | Cloud API/domain | permission, current revision, audit, accepted write |

Hard rules:

1. Do not copy query data into local state merely to render it.
2. A form may initialize or reset from query data, but the query cache and form
   draft must not continuously mirror each other.
3. Mutation success invalidates or updates the exact owned query keys; it does
   not trigger an unbounded global refetch.
4. Audit-sensitive mutation results continue to use the existing operation
   receipt and Toast contracts.
5. The browser cache is convenience state, not entitlement, billing,
   credential, audit, or WordPress final-write truth.
6. In App Router, do not render one mutable fact from both a Server Component
   and a revalidating client query unless their ownership and revalidation
   contract is explicit.
7. Evidence collection state and measured business values are different
   facts. A failed or cancelled read must not be normalized into a zero value.
8. Cross-item health, quota, compliance, eligibility, and credential-gap
   conclusions require explicit evidence completeness. Partial evidence may
   remain visible, but it must not silently authorize a complete-scope
   conclusion or mutation.

## 5. Page And Feature Structure

Route files are composition boundaries. A route file may:

- read route parameters;
- select the declared page model;
- compose the main work surface and inspector;
- own small ephemeral layout state;
- connect feature-level queries, mutations, forms, and components.

A route file should not newly accumulate:

- API DTO definitions;
- raw request construction;
- several independent server-state `useEffect` blocks;
- duplicated loading/error envelopes;
- large table column definitions;
- schema and payload transformation;
- modal focus management;
- credential reveal behavior;
- hundreds of lines of unrelated panel markup.

Use feature modules for a remediated surface. Example:

```text
frontend/src/features/admin/portal-users/
  api.ts
  schemas.ts
  queries.ts
  portal-user-directory-model.ts
  use-portal-user-filters.ts
  PortalUsersDirectory.tsx
  PortalUserInspector.tsx
  PortalUserEditForm.tsx
```

The existing shared primitives stay in `frontend/src/components/admin`,
`frontend/src/components/backoffice`, and `frontend/src/components/ui`.
Feature modules must not fork those primitives to obtain slightly different
spacing or color.

File length is a review signal, not a hard gate. A large translation map,
schema, fixture, or declarative column definition is different from a large
stateful controller. Review responsibility count, state ownership, and change
blast radius before splitting.

## 6. Shared Adapters

Headless libraries must enter through project-owned adapters:

- `AdminQueryProvider` for query defaults and diagnostics;
- `AdminDataTable` or an explicit extension of `AdminDataTableFrame`;
- `AdminFormField` patterns using existing inputs, labels, errors, and
  credential rules.

Route files must not independently choose cache timing, retry policy, table
empty states, pagination copy, destructive selection behavior, or field error
geometry.

Default query posture for an internal operator surface:

- use stable hierarchical query keys;
- retry only bounded transient failures;
- do not retry authorization, validation, or configuration failures as if they
  were transient;
- cancel or ignore obsolete requests;
- keep previous table data only when it improves operator continuity without
  hiding a scope change;
- surface freshness and manual refresh when the task depends on current state;
- never persist secrets or sensitive responses in a browser cache.

Default table posture:

- preserve semantic `<table>` output and the accepted Admin density;
- prefer server-side filtering and pagination when the API owns large result
  sets;
- keep filters in the stable toolbar;
- keep normal row selection ephemeral unless the task requires a shareable
  state;
- place destructive bulk actions outside the default primary action;
- reuse existing status, empty, filtered-empty, loading, and error surfaces.

Default form posture:

- one form has one draft owner;
- prefer native form controls, `FormData`, and a feature-owned validation and
  payload model for small independent forms;
- use the existing Zod schema when it already defines the transport contract;
- do not pull a server-side or otherwise unused schema library into a client
  route merely to claim schema validation;
- keep stored credentials concealed and use `AdminCredentialField`;
- reset explicitly after a successful authoritative response;
- preserve unsaved-leave protection;
- keep server validation errors associated with the relevant field or action;
- do not add optimistic updates to financial, entitlement, credential, or
  destructive operations by default.

## 7. Testing Standard

The test strategy must distinguish four layers.

### 7.1 Structural contracts

Keep source contracts for:

- forbidden route-local dialogs or credential implementations;
- route-manifest completeness;
- Cloud/WordPress boundary rules;
- required shared primitives and geometry tokens;
- release and security invariants.

Do not use regex against an entire route file as the primary proof of user
behavior, request lifecycle, form validation, focus return, or mutation
feedback.

After a safe feature extraction, a structural contract may aggregate the
declared route and feature sources so it continues to guard architecture. It
must not require behavior to remain physically inside the route file.

### 7.2 Vitest behavior

The default frontend CI must run the existing `test:unit` command before the
pilot is considered complete.

Add focused behavior tests for extracted:

- schema and payload transformations;
- query key factories and error mapping;
- filters and table state;
- form dirty/reset/validation behavior;
- components whose behavior does not require a full browser.

### 7.3 Playwright interaction

Material Admin work keeps the existing focused PC visual gate. The pilot must
also exercise the actual operator path:

- loading;
- ready;
- empty and filtered-empty;
- error and retry;
- mutation success and failure;
- focus and keyboard behavior;
- dirty navigation protection where applicable;
- longest Chinese label and identifier fixtures.

Do not make the entire Playwright suite the default inner loop. Use the
smallest route-focused spec that covers the changed seam.

### 7.4 Coverage visibility

Coverage is diagnostic evidence, not the first acceptance gate.

After Vitest is in CI, generate a baseline for the pilot feature and shared
adapters. Do not impose a repository-wide percentage until the report has
identified generated/declarative code, current gaps, and meaningful critical
paths. Do not delete tests or lower behavioral evidence to improve a number.

## 8. Bounded Rollout

### Stage 0: refresh and freeze evidence

1. Start from a clean current `origin/master`.
2. Recount the relevant route and test surfaces.
3. Confirm current CI commands and dependency versions.
4. Capture the current operator workflow and focused PC evidence.
5. Record the route model, actions, states, API owner, and rollback.

### Stage 1: behavior gate, no visual redesign

1. Add the existing Vitest suite to frontend CI.
2. Run and repair only real failures; do not rewrite tests to force green.
3. Confirm frontend contracts still pass.
4. Keep Playwright focused rather than globally mandatory.

### Stage 2: one queue pilot

The accepted first candidate is `/admin/portal-users`.

1. Introduce the query capability for that feature.
2. Introduce the headless table capability only if it deletes real route-local
   sorting, filtering, pagination, or selection logic. Current inspection does
   not justify it for this pilot.
3. Keep the accepted responsive task list, status badges, toolbar, copy,
   inspector, and geometry.
4. Move DTOs, query keys, directory models, and filters into one feature
   module.
5. Preserve behavior and appearance; this is an engineering pilot, not a
   redesign.

Do not begin with `/admin/accounts/[accountId]`,
`/admin/ai-resources`, `/admin/ai-advisor`, or
`/admin/service-settings`. Their size and responsibility count make them poor
first dependency pilots.

### Stage 3: one form pilot

After the queue pilot is accepted:

1. select one independent, bounded configuration group;
2. measure the accepted route before introducing a form dependency;
3. remove the matching duplicated field state and submit-state code;
4. preserve credential, audit, save, error, and confirmation semantics;
5. prove validation, payload transformation, server error, submit lifecycle,
   and keyboard behavior that apply to the selected form;
6. build and measure the same route with the candidate dependency. Remove it
   when its bundle or adapter cost is disproportionate to deleted burden.

Do not convert the entire service-settings route in one pull request.

The completed account-creation pilot hit the dependency stop condition.
React Hook Form and its Zod resolver were removed; the useful feature boundary,
validation, payload mapping, accessibility, and behavior tests were retained.
This is a successful engineering decision, not a failed delivery.

### Stage 4: incremental hotspot remediation

Only after the adapters and gates are stable, remediate one hotspot at a time:

1. account detail;
2. AI resources;
3. service settings;
4. AI advisor.

Order may change after fresh operator evidence. Do not run several route
refactors in parallel, and do not combine a structural extraction with a new
feature or API redesign.

The first accepted account-detail follow-on changed only per-site runtime
evidence ownership. It is not authorization to convert the rest of the route
to Query or to split the route by length. Future account-detail work still
requires new evidence and a separate one-responsibility envelope.

## 9. Pilot Acceptance And Stop Conditions

Expand the approach only when:

- the route file becomes a composition boundary;
- duplicated fetch/loading/error/mutation state is removed;
- no query/form/local-state mirror is introduced;
- the existing visual and Cloud ownership contracts remain intact;
- Vitest, frontend contracts, focused Playwright, type-check, lint, and
  `check:admin-ui` pass;
- dependency and client-bundle changes are measured and accepted;
- keyboard, focus, Chinese text, empty, error, dirty, and disabled states pass;
- the amount of deleted route-local lifecycle code justifies the added
  adapter and dependency code;
- rollback can restore the previous route without a backend or data migration.

Stop and do not expand when:

- adapters contain more product logic than the feature module;
- the pilot adds a second API, error, schema, i18n, or visual system;
- query invalidation becomes global or hard to reason about;
- Form and local state both own the same fields;
- the table library makes simple semantic tables harder to understand;
- bundle or runtime cost is material without matching operator benefit;
- tests become snapshots of library implementation rather than product
  behavior;
- the change requires a broad redesign to appear useful.

If the pilot fails a stop condition, keep the useful structural extraction and
remove the library. The goal is simpler ownership, not dependency adoption.

## 10. Required AI Change Envelope

Before editing an Admin route, an AI session must report:

- current branch/worktree state and whether the source is current;
- focused route and manifest page model;
- operator job;
- current state owners and the target state-owner map;
- primary, secondary, destructive, and recovery actions;
- shared primitives preserved;
- dependency added and exact route-local burden it removes;
- explicit non-goals;
- expected files and protected files/areas;
- focused unit, contract, PC browser, M4, and repository gates;
- rollback plan.

Reject prompts or plans that begin with:

- “replace the frontend with Ant Design”;
- “migrate every page to the new stack”;
- “add global state management for consistency”;
- “split all large files”;
- “set an arbitrary coverage target”;
- “make every settings surface a table”.

## 11. Verification And Delivery

Use the narrowest useful source gates during the edit loop. Before publishing a
material Admin source change, the minimum expected chain is:

```text
focused Vitest
  -> frontend type-check and lint
  -> frontend contracts
  -> check:admin-ui
  -> focused Playwright/PC evidence
  -> M4 candidate
  -> PR required checks
  -> merge to master
  -> clean master M4 promotion when required
  -> human operator acceptance
```

CI, a screenshot, `200`, M4 candidate reachability, merge, M4 acceptance,
production deployment, and human acceptance remain separate evidence states.

Documentation-only changes require link validation, `git diff --check`,
release-policy validation, and the docs-only gate. They do not require M4.

## 12. New Session Handoff

A new implementation session should:

1. start in a current clean worktree;
2. read `AGENTS.md`, `README.md`, this document, the Admin UI standard, the
   route manifest, and the development-validation model;
3. revalidate the evidence instead of trusting the 2026-07-29 snapshot;
4. treat Stages 1 and 2 as accepted baselines, not work to repeat;
5. treat Portal users repository pagination as the accepted backend baseline
   and revalidate its response contract rather than restoring full-directory
   hydration;
6. preserve Support requests as the bounded second Query-first queue and use
   its measured reuse evidence before considering another queue;
7. treat the account-create form as the Stage 3 baseline: retain its
   dependency-free feature boundary and do not reinstall React Hook Form,
   another form library, or a table library without new measured burden that
   justifies the cost;
8. preserve the account site-runtime evidence boundary: stable account/site
   query identity, cancellation, explicit partial failure, total-failure
   retry, exact invalidation, and completeness-gated derived conclusions;
9. do not treat that one accepted Stage 4 responsibility as permission for a
   route-wide Query migration;
10. preserve all unrelated dirty work and all Cloud/WordPress ownership
   boundaries.

This document records the approved direction, accepted Query pilots, the Stage
3 dependency decision, and one evidence-led Stage 4 responsibility. It does
not authorize a broad dependency migration, route-wide refactor, production
deployment, or GA claim.
