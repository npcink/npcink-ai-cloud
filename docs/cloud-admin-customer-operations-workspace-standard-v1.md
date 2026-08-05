# Cloud Admin Customer Operations Workspace Standard v1

Status: active implementation standard.

Date: 2026-07-31.

Purpose: define one stable operator model for the Cloud Admin customer
directory, service and subscription operations queues, commercial catalogs,
and customer detail workspace. The standard preserves fast PC operations
without merging routes that answer different questions or turning detail
surfaces into long forms or nested disclosure trees.

This standard composes with:

- [ADR-037: Separate the customer directory from the service problem queue](decisions/037-separate-customer-directory-from-service-problem-queue.md);
- [Customer Account and Identity Stage Standard v1](customer-account-identity-stage-standard-v1.md);
- [Cloud Admin Information Architecture v2](cloud-admin-information-architecture-v2.md);
- [Cloud Admin UI Standard v1](cloud-admin-ui-standard-v1.md);
- [Cloud Admin Frontend Engineering Standard v1](cloud-admin-frontend-engineering-standard-v1.md).

ADR-037 owns the route boundary. The identity stage standard owns Principal,
Account, and Membership semantics. This document owns the customer-operations
page composition and interaction posture.

## 1. Operator model

The customer operations workspace has seven distinct jobs:

| Surface | Operator question | Default posture | Completion condition |
| --- | --- | --- | --- |
| `/admin/accounts` | Who is the customer and where is the complete record? | all customers ordered by customer name | the intended customer is found, created, or opened |
| `/admin/coverage` | Which customers may have a service problem, why, and what should happen next? | customers needing action ordered by service priority | the issue is understood and the operator reaches its owning action |
| `/admin/subscriptions` | Which subscriptions need commercial or billing follow-up? | server-filtered needs-action subscriptions ordered by risk | the subscription is opened or safely deferred with its queue context intact |
| `/admin/plans` | Which package definition owns price, limits, and release state? | all package definitions in catalog order | the intended package is inspected or maintained |
| `/admin/credit-packs` | Which purchasable AI credit pack needs configuration? | one compact pack directory and one active editor | one pack is inspected or updated without changing package ownership |
| `/admin/accounts/{accountId}` | What is true for this customer and what bounded action belongs here? | overview of one customer | the operator completes or safely defers one customer-specific task |
| `/admin/subscriptions/{subscriptionId}` | What commercial, billing, usage, and site evidence explains this subscription? | compact conclusion and current facts | reconciliation is completed or the operator returns to the originating filtered queue |

The routes share customer identity and deep links, but they do not share the
same default rows, sort order, columns, or primary actions.

Top-level navigation follows the operator job rather than the adjacency of
domain entities. Service operations and Subscription operations therefore
remain separate entries. Package catalog and AI credit packs also remain
separate entries. Cross-links are contextual conveniences, not parent-child
navigation and not duplicated default header actions.

The normal work chain is:

```text
discover a customer or problem
  -> open the owning customer record
  -> select the task tab
  -> inspect state and impact
  -> perform one bounded action
  -> receive trustworthy feedback
  -> return to the originating directory or queue
```

## 2. Customer directory

`/admin/accounts` is a `queue` page whose primary job is finding and opening
customers. It is not a risk queue.

Required structure:

1. compact title and scope sentence;
2. one create-customer action and one refresh action;
3. compact counts only when they improve directory scanning;
4. one stable search and filter toolbar;
5. one semantic customer table;
6. one primary row action: open customer detail.

The directory table should expose in one scan:

- customer display name and opaque Account identifier;
- primary login email and relationship readiness;
- Account state;
- current package;
- compact site and subscription footprint;
- detail action.

It must not add:

- needs-action or risk-ordering tabs;
- service-problem reasons;
- a selected-row inspector;
- identity audit;
- access disable;
- package mutation;
- duplicated entry buttons to Service status.

Service problems remain discoverable from `/admin/coverage`. A customer row
must stay stable even when problem-detection rules change.

### 2.1 Toolbar geometry

The search field should be the widest control because it accepts names, email,
Account IDs, packages, and notes. Status and customer filters use bounded
widths based on their option content. Controls must not stretch merely to fill
the viewport.

At PC width, keep search, filters, and clear-filter action in one stable row
when space allows. At narrow widths, stack in operator order: search, status,
customer filter, clear action. A filtered-empty result must preserve the active
filters and offer one clear action.

### 2.2 Customer creation

Creation uses the shared `AdminWorkbenchDialog` so the directory remains the
primary context.

The operator enters customer and owner information. The form must not ask for
an Account ID. The Cloud commercial domain generates the opaque
`acct_<uuid>` identifier.

The dialog must:

- state that Account ID is generated automatically;
- use one draft owner and field-associated validation;
- keep one create action in the footer;
- close safely with `Escape` and return focus to the trigger;
- open the generated customer detail after success;
- preserve authoritative mutation and audit semantics.

Do not add a dedicated create page, route-local overlay, client-generated
Account ID, or form library without measured burden-removal evidence.

## 3. Service and subscription operations

`/admin/coverage` is the canonical cross-customer service problem queue.

It defaults to customers needing action and owns:

- severity and priority;
- problem reason and affected service area;
- customer identity and relevant service footprint;
- impact and recommended next action;
- contextual navigation to the record that owns the action.

Aligned and inactive customers may remain available through explicit filters.
They do not become the default workload.

The queue must not duplicate the customer directory or embed a second customer
detail. It may project enough customer, identity, commercial, site, and key
evidence to explain a problem, but mutations stay in their owning detail
surface.

Examples:

- identity or access problem -> customer Access tab;
- Account status problem -> customer Overview;
- package or credit problem -> Commercial or Credits and usage;
- subscription reconciliation -> subscription detail;
- site or key coverage problem -> customer Sites or the owning site detail.

### 3.1 Subscription operations

`/admin/subscriptions` is the canonical commercial lifecycle and billing-risk
queue. It is not a second service-status view.

Required posture:

- default to the server-owned `needs_action` risk filter;
- keep risk, customer, package, expiry, sorting, pagination, and the selected
  read-only evidence row in URL state when they must survive refresh or return;
- apply risk filtering before pagination and report the filtered total;
- keep the global risk summary independent from the selected filter;
- use a full-width queue with no default selected row;
- open read-only context on demand in the shared inspector drawer;
- send mutations and reconciliation to the subscription detail page;
- preserve a validated `return_to` path back to the originating filtered
  subscription queue.

Normal or stable subscriptions may be available through an explicit filter,
but they must not dominate the default work queue. The backend must keep the
global sort bounded and fail closed when the supported queue population is
exceeded instead of performing unbounded enrichment.

### 3.2 Commercial catalogs

`/admin/plans` owns package definitions, package limits, release state, and
package-scoped subscription follow-up. `/admin/credit-packs` owns purchasable
AI credit-pack price, credits, validity, visibility, and package fit.

They remain separate navigation entries and page models. Neither page should
repeat a routine header button that merely opens the other. Provide a
contextual link only where the active object or decision genuinely requires
the related catalog.

## 4. Customer detail tabs

`/admin/accounts/{accountId}` is a `detail` page. Its header contains customer
identity, compact state, and a stable return path. It must not repeat package
management or account actions as duplicate header shortcuts.

The accepted task tabs are:

| Tab | Owns | Does not own |
| --- | --- | --- |
| Overview | customer information, Account state, direct Suspend or Restore action, concise conclusion | package mutation, credit adjustment, identity audit |
| Commercial | current coverage, package comparison, package change and bounded commercial context | AI credit ledger or resource-limit detail |
| Credits and usage | top-up packs, AI credit balance/adjustment, quota and resource-limit evidence | package change |
| Sites | connected-site footprint and site-detail entry | global identity or commercial mutation |
| Access | owner identity, Membership evidence, bounded identity audit, explicitly disclosed disable-access action | Account deletion or WordPress-user mutation |
| Audit | durable Account and commercial receipts plus low-frequency evidence | routine actions already owned by another tab |

TAB selection must be a real task boundary. Selecting one tab must not render
or fetch every other tab's low-frequency evidence by default.

## 5. Choosing tables, summaries, forms, and disclosures

Use a semantic table when the operator compares repeated fields across three
or more choices or resources. A table is appropriate for:

- package comparison;
- top-up pack comparison;
- resource limits with used, limit, remaining, and state;
- customer or service queue rows.

Do not use a table merely to increase density. A table is normally wrong for:

- one current-coverage conclusion;
- one short customer-information summary;
- one mutation form;
- long explanatory copy;
- one low-frequency technical receipt.

The accepted composition for Commercial is:

1. compact current-coverage definition list;
2. one package comparison table in `AdminDataTableFrame`;
3. row-associated package action whose accessible name includes the target
   package;
4. low-frequency commercial evidence after the working surface.

The accepted composition for Credits and usage is:

1. one compact current-balance and period conclusion;
2. one outer operation row containing top-up, AI-credit adjustment, current
   ledger, and quota-detail entry points;
3. top-up comparison in a shared wide workbench dialog;
4. the long current-period ledger in the shared inspector drawer;
5. one shared wide quota-detail dialog with direct tabs for resource limits,
   AI-credit components, and advanced quota information;
6. no drawer-inside-drawer, dialog-inside-drawer, or disclosure-inside-
   disclosure interaction path.

Tables use one shared density and table-frame class, semantic headers, quiet
row dividers, explicit empty state, and labelled overflow when necessary. They
must not restore a grid of nested cards.

### 5.1 Choosing the detail container

Choose the container from the operator's task, not from the amount of empty
space on the current page.

| Container | Use when | Do not use when |
| --- | --- | --- |
| Inline | the fact or action is required for the current decision | the content is long, technical, or rarely used |
| Inspector drawer | the operator scans read-only context, evidence, or a long sequential record while preserving the queue or detail page | the task needs several peer categories, a comparison matrix, or a multi-step mutation |
| Shared dialog | the task is bounded, interruptible, and benefits from focused comparison, selection, or mutation | the content needs a durable URL, long navigation history, or another nested overlay |
| Dedicated detail page | the object has durable identity, several independent tasks, return context, or enough evidence to require navigation | the content is one short read-only explanation or one bounded form |

An overlay may contain direct tabs when the tabs are peer views of one bounded
task. It must not contain another overlay or a deep accordion tree. If a user
must open more than one disclosure to reach a routine fact or action, promote
that fact or action one level.

### 5.2 One-screen decision target

At the manifest PC viewport, a task tab should expose the current conclusion,
the important measured state, and all routine next-action entry points without
requiring page scroll. This is a decision target, not a requirement to render
all raw evidence in the first viewport.

Use these reductions in order:

1. remove duplicate titles, descriptions, identifiers, and normal-state prose;
2. replace card mosaics with aligned rows, definition lists, or one semantic
   table;
3. keep normal state quiet and make warnings and errors carry the emphasis;
4. move long records to an inspector drawer;
5. move bounded comparison or mutation work to a shared dialog;
6. use a dedicated subpage only when the object needs durable navigation.

Do not solve page height by shrinking controls below the shared compact-density
tokens or by hiding required state behind ambiguous icons.

## 6. Action hierarchy

One section has one primary action by default.

- If there is exactly one routine action, show it directly. Do not wrap it in
  a `More` menu.
- Package management appears only in Commercial.
- Suspend or Restore Account appears directly in Overview with the appropriate
  governed or destructive confirmation.
- Disable access remains in Access behind explicit disclosure and
  object-specific confirmation.
- Refresh and read-only inspection are secondary.
- Recovery actions appear with the failed state.
- An opaque technical identifier is supporting evidence, not customer-facing
  identity. Keep it out of the default header and expose it through an
  identifier treatment, tooltip, copy action, or low-frequency evidence view
  when operators genuinely need it.

An overflow menu is justified only when at least two low-frequency actions
remain after routine and destructive actions have been correctly placed.

## 7. State, evidence, and accessibility

Every surface distinguishes:

- loading;
- empty;
- filtered-empty;
- partial evidence;
- total failure;
- disabled action;
- pending mutation;
- success with durable receipt where applicable.

Unknown, unavailable, and zero are different facts. Missing site, quota,
identity, or subscription evidence must not be normalized into a healthy zero.

Required accessibility:

- semantic table headers;
- accessible names that include the mutation target;
- dialog focus containment and focus return;
- status text in addition to color;
- keyboard-operable tabs and disclosures;
- no page-level horizontal overflow at the accepted PC viewport;
- core narrow-screen task does not depend on horizontal scrolling.
- selected state, keyboard focus, and mouse click state remain visually
  distinct; mouse focus must not leave a second persistent outline after the
  action completes.

## 8. Development and verification

Before changing one of these routes, record:

- route and page model;
- operator job and owning question;
- current and target action hierarchy;
- state owners;
- shared primitives retained;
- content moved between directory, service queue, and detail tabs;
- low-frequency disclosure plan;
- explicit non-goals and rollback.

Use the smallest coherent change. Do not combine route-boundary changes,
identity-domain changes, API redesign, and visual density work unless one
accepted contract requires them together.

Material source changes require:

1. focused model or domain tests;
2. focused frontend behavior and structural contracts;
3. type-check, lint, i18n, and `check:admin-ui`;
4. focused PC browser evidence, including overflow and action placement;
5. M4 candidate validation for Cloud behavior;
6. required GitHub checks;
7. merge into `master`;
8. clean-`master` M4 promotion and relevant smoke.

Documentation-only changes require link validation, `git diff --check`,
release-policy validation, and the docs-only gate. They do not require M4.

The local URL `http://127.0.0.1:18010` exists only while
`pnpm run m4:preview:tunnel` remains in the foreground. Closing the tunnel
makes the port unavailable; closeout reports must distinguish local tunnel
availability from M4 service health.

## 9. Non-goals

This standard does not authorize:

- merging Customers and Service status into one route;
- restoring a standalone Portal-users customer directory;
- turning Cloud Admin into a CRM;
- merging Service operations and Subscription operations merely because both
  rows can lead to a customer;
- merging Package catalog and AI credit packs merely because both participate
  in commercial entitlement;
- organization roles, invitations, or account switching;
- package editing from Service status;
- WordPress writes or local governance ownership;
- a new design system or broad account-detail rewrite;
- nested overlays or multi-level disclosure as the normal path to routine
  evidence;
- permanent background tunnels or public exposure of M4 loopback ports.

## 10. Rollback and change authority

Layout and interaction changes may be reverted as focused frontend and
documentation changes when their contracts fail. Do not merge domain objects,
add compatibility redirects, or preserve obsolete UI switches as rollback
mechanisms.

Changes to route ownership require ADR-037 or a superseding ADR. Changes to
Principal, Account, or Membership semantics require the identity authority
named by the stage standard. Changes to this document alone must not silently
reassign those owners.
