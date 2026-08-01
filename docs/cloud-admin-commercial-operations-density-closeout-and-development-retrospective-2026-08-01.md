# Cloud Admin Commercial Operations Density Closeout and Development Retrospective — 2026-08-01

Status: local verification and M4 candidate validation recorded; repository
merge, accepted M4 promotion, production deployment, and human acceptance are
separate later states.

Scope: close out the cumulative Admin changes for navigation, Service
operations, Subscription operations, Package catalog, AI credit packs,
subscription detail, customer Commercial and AI-credit tasks, and human-readable
audit evidence.

This record travels in the same feature commit as the implementation. It is
historical evidence and a reusable development retrospective. Normative
authority lives in:

- [Cloud Admin Customer Operations Workspace Standard v1](cloud-admin-customer-operations-workspace-standard-v1.md);
- [Cloud Admin Information Architecture v2](cloud-admin-information-architecture-v2.md);
- [Cloud Admin UI Standard v1](cloud-admin-ui-standard-v1.md);
- [Cloud Admin Frontend Engineering Standard v1](cloud-admin-frontend-engineering-standard-v1.md);
- [Development Validation Operating Model v1](development-validation-operating-model-v1.md).

This document does not authorize production deployment, a second customer
directory, a CRM, Cloud-side WordPress control truth, or a broad frontend
framework migration.

## 1. Executive conclusion

The work started as a sequence of layout questions:

- Should Service status and Subscription risk be one menu?
- Should Package catalog and AI credit packs be one menu?
- Should large queue pages use two-column master/detail layouts?
- Should long customer and subscription detail pages show everything inline?
- Should raw audit APIs open directly in the browser?

The durable answer is not “split everything” or “put everything in a modal.”
The correct boundary comes from the operator question and completion condition.

The resulting model is:

```text
Customers                 -> find the customer record
Service operations        -> find service continuity or access problems
Subscription operations   -> find commercial lifecycle and billing risks
Package catalog            -> maintain package definitions and limits
AI credit packs            -> maintain purchasable credit-pack configuration

queue or detail surface
  -> show current conclusion and routine next actions
  -> open long read-only evidence in a drawer
  -> open bounded comparison or mutation work in a shared dialog
  -> use a dedicated detail page when durable navigation is required
```

The reusable principle is:

> Put the decision and the next action in the first viewport. Keep the full
> evidence reachable, but do not make every piece of evidence compete with the
> decision.

## 2. Delivered information architecture

### 2.1 Retired duplicate customer navigation

The standalone Portal-users menu was removed. Customers remains the single
validation-stage customer directory. Principal, Account, and Membership remain
separate domain concepts, but the operator does not need two customer lists.

Historical Query-pilot evidence for Portal users remains engineering evidence;
it is not authority to restore the product route.

### 2.2 Service operations and Subscription operations

The two routes are independent top-level Customer Operations entries:

| Route | Operator question | Default population | Owning action |
| --- | --- | --- | --- |
| `/admin/coverage` | Which customer service problem needs attention, why, and where is it fixed? | service problems needing action | customer, subscription, or site detail selected by the reason |
| `/admin/subscriptions` | Which subscription needs commercial or billing follow-up? | server-filtered `needs_action` subscriptions | subscription detail and reconciliation |

The labels were changed from vague risk language to task language:

- `服务运营` / `Service operations`;
- `订阅运营` / `Subscription operations`.

The queue separation prevents service health, login identity, subscription
lifecycle, and billing evidence from becoming one unstable mega-queue.

### 2.3 Package catalog and AI credit packs

The two commercial routes are also independent navigation entries:

- Package catalog owns Free, Plus, Pro, and Agency definitions, limits, price,
  and release state.
- AI credit packs owns purchasable top-up price, credits, validity, visibility,
  and package fit.

The pages no longer repeat header buttons whose only purpose was to jump to the
other menu. Their relationship is contextual, not hierarchical.

## 3. Queue design decisions

### 3.1 Full-width queue first

Both Service operations and Subscription operations use the queue as the
primary workspace. They do not reserve permanent page width for an inspector
and do not select the first row automatically.

This improves:

- column width and scan density;
- comparison between customers or subscriptions;
- clarity that opening evidence is an explicit choice;
- mobile and narrower-window fallback;
- URL restoration without hidden default selection.

### 3.2 Filters belong to the queue toolbar

Status and risk choices are filters, not a second navigation layer. They sit
with search, package/customer constraints, dates, sorting, apply, and clear.

For Subscription operations, the backend owns the risk filter before
pagination. The response keeps the global summary independent from the
filtered total. Unsupported risk values fail validation, and global enrichment
remains bounded rather than silently scanning an unlimited population.

### 3.3 Stable rows stay quiet

Normal service rows remain available through explicit filters but do not
dominate the default workload. Repeated prose explaining that a stable row is
stable is removed from the main scan. Status text remains; normal-state
explanation is available only where it helps a decision.

Opaque Account and subscription identifiers are supporting evidence. They no
longer compete with customer identity in the default row or page header.

### 3.4 Evidence drawer and owning destination

The shared `AdminInspectorDrawer` holds read-only queue evidence while keeping
the queue visible. Its footer links to the object that owns the next action.

Service problems do not all jump to the generic customer overview:

- identity or access issue -> customer Access task;
- account status issue -> customer Overview;
- package or credits issue -> customer Commercial or AI credits task;
- subscription issue -> subscription detail;
- site or runtime-key issue -> customer Sites or site detail.

The queue explains; the owning detail surface mutates.

## 4. Subscription detail decisions

Subscription detail was changed from a long stack of large cards into a
compact decision surface:

- concise conclusion and current subscription facts share the first panel;
- customer, package, period, billing state, and site count use aligned rows;
- budget and usage use a semantic comparison table;
- related sites and recent audit summary use dense tables or compact sections;
- advanced raw subscription evidence starts collapsed;
- the return link validates and preserves the originating Subscription
  operations filters;
- audit detail opens as a human-readable Admin surface instead of navigating
  directly to a JSON API response.

Raw JSON remains an API contract for machines. The operator UI translates event
kind, outcome, actor, time, and technical identifiers into a bounded audit
drawer with loading, empty, error, and retry states.

## 5. Customer detail decisions

### 5.1 Stable task rail

Customer detail keeps the task boundary visible in a compact left rail:

- Overview;
- Commercial;
- AI credits;
- Sites;
- Access;
- Audit.

The selected state uses a quiet background and a narrow accent. Selection,
keyboard focus, disabled state, and mouse click focus remain distinguishable.
The mouse path no longer leaves a second persistent focus outline.

### 5.2 Compact identity and status header

The header shows customer identity, one short conclusion, and compact measured
status. Large empty strips and routine opaque IDs were removed. The first task
surface begins immediately below the header.

### 5.3 Commercial task

Commercial keeps the current coverage conclusion visible. Low-frequency or
long operations move behind explicit entries:

- package options use a shared drawer or bounded workbench;
- Agency quote and trial operations use the shared inspector drawer;
- routine site navigation stays direct;
- destructive or governed mutation keeps object-specific confirmation and
  receipts.

### 5.4 AI-credit task

The current balance, remaining amount, usage ratio, and current-period ledger
summary fit in one compact working panel. All routine entry points are promoted
to one outer operation row:

- open top-up options;
- adjust AI credits;
- view current-period ledger;
- view quota details.

The containers match the task:

- top-up comparison and credit adjustment use shared dialogs;
- the long ledger uses the shared drawer;
- quota detail uses one shared wide dialog with direct tabs for Resource
  limits, AI-credit components, and Advanced quota information.

Nested drawers and nested disclosures were removed. Empty AI-credit component
data keeps a stable, human-readable empty state instead of making the tab
disappear.

## 6. Container selection rule

The following rule emerged from repeated corrections:

| Question | Container |
| --- | --- |
| Must I know this to decide now? | inline |
| Do I need a long read-only record while preserving context? | inspector drawer |
| Do I need a bounded comparison, choice, or mutation? | shared dialog |
| Does the object need a URL, several tasks, or durable history? | detail page |

Bad signals:

- a drawer opens another drawer;
- a dialog requires several nested accordions for routine data;
- the only useful action is hidden in a one-item `More` menu;
- the first viewport contains explanation but not the measured state or next
  action;
- a raw API endpoint is used as a human-facing detail page;
- normal state is more visually prominent than warnings or errors.

When these occur, first remove duplication, then promote the routine action or
choose a container with the correct ownership.

## 7. Development history and corrections

### 7.1 What caused the design defects

The defects were not independent styling mistakes. They came from four
repeated causes:

1. domain adjacency was mistaken for one operator job;
2. new evidence was appended as another card instead of re-evaluating the page
   hierarchy;
3. disclosure was used as a generic space-saving mechanism without a depth
   limit;
4. implementation was evaluated section by section instead of at the actual
   PC viewport and complete operator path.

### 7.2 Effective correction sequence

The effective sequence was:

1. name the operator question and completion condition;
2. assign one page model and one action owner;
3. separate queue discovery from detail mutation;
4. remove duplicate navigation, copy, identifiers, and buttons;
5. align repeated fields in tables or definition rows;
6. choose inline, drawer, dialog, or detail page by task;
7. verify loading, empty, failure, retry, focus, return, and longest-label states;
8. inspect the full 1440-pixel PC screenshot, not isolated components;
9. run structural, type, lint, interaction, and full Admin visual gates;
10. keep local, M4 candidate, Git, accepted M4, production, and human
    acceptance as distinct evidence states.

### 7.3 Why repeated user review was valuable

The user screenshots identified failures that source contracts alone could not
prove:

- filter chips occupying a separate row;
- stable-state prose wasting queue width;
- opaque identifiers competing with names;
- service problems opening the wrong customer destination;
- large empty header regions;
- tabs with visually heavy selected states;
- long pages caused by repeated panels and nested details;
- top-up and quota content using the wrong container;
- action buttons split across different vertical levels;
- mouse focus looking like a second selection state.

Each screenshot was treated as operator-path evidence, then converted into a
reusable rule and an executable contract where practical.

## 8. Engineering review

### Correctness

- Risk filtering is validated and applied before pagination.
- Queue summary and filtered total keep distinct meanings.
- Subscription detail accepts only an internal Subscription operations
  `return_to`; invalid or external values fall back safely.
- Missing credit-component evidence renders an explicit empty state.
- Audit detail handles loading, failure, retry, empty, and ready states.

### Readability and architecture

- Shared `AdminInspectorDrawer`, `AdminWorkbenchDialog`,
  `AdminDataTableFrame`, status, identifier, and empty-state primitives replace
  route-local interaction shells.
- Page files still remain large hotspots. This work does not claim a broad
  feature-module extraction. Future extraction must follow the bounded
  frontend-engineering standard and must not combine a structural migration
  with another product redesign.

### Security and boundaries

- Stored credentials and secrets are untouched.
- No new public endpoint or WordPress write path is introduced.
- Raw audit evidence stays behind internal Admin authentication.
- Return navigation rejects external origins and unrelated Admin paths.
- Cloud remains runtime, commercial, diagnostic, and audit evidence owner; it
  does not become WordPress approval or final-write truth.

### Performance

- Subscription enrichment remains capped and fails closed above the supported
  subscription or related-site population.
- Server-side risk filtering occurs before pagination of the enriched result.
- No new frontend dependency, global store, or unbounded browser fetch is
  introduced.

## 9. Verification record

The implementation used focused source checks during the edit loop and the
repository Admin gates at coherent checkpoints.

Recorded evidence for the final pre-commit worktree:

- focused customer-detail contract: passed;
- frontend type-check and targeted lint: passed;
- focused customer-detail Playwright: `7 passed`;
- focused Admin operator-path hierarchy: `1 passed`;
- `pnpm run check:admin-ui`: passed;
- `pnpm run check:admin-ui:visual`: `34 passed`;
- Admin and Portal i18n completeness: `1763` keys passed;
- local service-route API test: `18 passed`, with one upstream Starlette
  deprecation warning;
- `git diff --check` and `pnpm run check:release-policy`: passed;
- `pnpm run check:fast`: not executed because the isolated source worktree
  intentionally has no `.env`; the command stopped before Docker or tests with
  `.env not found`, and no credential file was copied as a workaround;
- M4 candidate deploy: passed after the package-script gate change correctly
  triggered the build-input fingerprint;
- focused M4 `tests/api/test_service_routes.py`: `18 passed`, with the same
  upstream Starlette deprecation warning;
- M4 candidate `/`: HTTP `200`;
- M4 candidate `/health/live`: HTTP `200`;
- unauthenticated customer detail: HTTP `307`, expected Admin login redirect.

Candidate state at closeout:

```text
acceptance_state=candidate
promotion_pr=none
source_revision=1ce0e52e214a0e08d1c56d17ea63be565410f666
source_branch=codex/admin-service-subscription-split-latest-20260731
source_dirty=true
alembic_revision=20260731_0077 (head)
```

The feature commit and pushed branch establish Git evidence; they do not
establish merge or accepted M4 evidence.

## 10. Evidence states and remaining work

| State | Result recorded by this closeout |
| --- | --- |
| Local source and browser | verified for the changed Admin seams |
| M4 candidate | validated from the feature worktree; candidate only |
| Git commit and branch push | delivered by the commit containing this record |
| Pull request and required checks | not claimed by this document |
| Merged `master` | not claimed by this document |
| Accepted M4 promotion | requires merged current `master`, a clean promotion, and relevant smoke |
| Production | not changed |
| Human/external acceptance | pending explicit operator review |

Known non-blocking debt:

- the customer-detail route remains a high-responsibility hotspot;
- the Admin shell retains one manifest-recorded route-local dialog exception;
- the shared candidate contains multiple coherent Admin route changes and is
  therefore larger than an ideal one-responsibility review;
- production and multi-admin identity/audit expansion remain outside scope.

## 11. Rollback

The UI and documentation changes can be reverted as one feature commit. The
backend subscription risk filter is additive and may be reverted with its
route/domain tests. No data migration, credential change, production change,
or WordPress write contract is required for rollback.

Do not preserve obsolete menus, legacy filters, or nested disclosure variants
as hidden compatibility switches. Git history is the rollback mechanism.

## 12. Future checklist

Before changing these Admin surfaces again:

- [ ] Name the route's operator question and completion condition.
- [ ] Confirm the manifest page model.
- [ ] Keep Service operations and Subscription operations separate.
- [ ] Keep Package catalog and AI credit packs separate.
- [ ] Keep queue discovery separate from owning-detail mutation.
- [ ] Put current conclusion, measured state, and routine entries in the first
      PC viewport.
- [ ] Use a drawer for long read-only evidence.
- [ ] Use a shared dialog for bounded comparison or mutation.
- [ ] Use a detail page for durable multi-task objects.
- [ ] Reject nested overlays and routine multi-level disclosures.
- [ ] Keep normal state quiet and abnormal state explicit.
- [ ] Treat opaque identifiers as supporting evidence.
- [ ] Verify selected, focus, disabled, loading, empty, error, and retry states.
- [ ] Run the focused contracts, type/lint, Admin gates, and PC interaction
      evidence.
- [ ] Report candidate, commit, merge, accepted M4, production, and human
      acceptance separately.
