# Cloud Portal Customer Workspace UI Standard v1

Status: active engineering and product standard.

Purpose: define the information architecture, state semantics, density,
action hierarchy, and verification rules for the Npcink AI Cloud Portal
customer workspace. The Portal is PC-first in the current stage and remains a
bounded customer-facing projection of Cloud service evidence.

This standard does not authorize a second WordPress control plane, new Portal
APIs, mobile-first redesign, production deployment, or exposure of internal
operator diagnostics.

## 1. Product Boundary

Portal may show customer-facing projections for:

- connected sites and the current site context;
- account package, AI credit, entitlement, and usage evidence;
- support tickets and recent customer-visible activity;
- site service health, Site Knowledge coverage, and bounded next actions;
- account contact and supported sign-in methods.

Portal must not expose or own:

- WordPress ability, workflow, prompt, preset, router, approval, preflight, or
  final-write truth;
- provider IDs, model IDs, raw prompts, raw customer content, cache keys,
  internal cost breakdowns, or operator-only diagnostics;
- account/site mutation that is not already authorized by the existing Portal
  contract;
- inferred health truth created only to fill an empty UI.

The Portal explains Cloud evidence. It does not invent a second source of
truth.

## 2. Page Model

Every primary Portal route should be understandable through the same scan
sequence:

```text
identity and current state
  -> one primary issue or action, when present
  -> compact supporting evidence
  -> task-specific records or controls
  -> low-frequency and destructive actions
```

The normal route composition is:

| Layer | Responsibility |
| --- | --- |
| Workspace header | Page identity, short description, passive metadata, one status, and at most one primary contextual issue |
| Summary rail | Two to four directly comparable account or site facts; never a second page introduction |
| Primary section | The main customer job for the route |
| Secondary section | Additional evidence, history, or configuration needed for the same job |
| Disclosure | Support identifiers, unavailable optional methods, advanced detail, or destructive actions |

A page must not repeat the title, site name, URL, status, or primary action in
multiple adjacent cards.

## 3. Shared Workspace Header

Use `PortalWorkspaceHeader` for primary Portal routes.

The header fields have distinct ownership:

- `title`: the route or selected-site identity;
- `description`: one sentence explaining the customer job;
- `titleAccessory`: a compact normal or passive status;
- `metadata`: passive facts such as site URL, period, current package, last
  activity, or update time;
- `contextPanel`: one actionable warning or current-focus item;
- `actions`: page-level actions that remain useful regardless of a warning;
- `metrics`: a compact continuous rail only when two or more comparable facts
  materially improve scanning.

Rules:

1. Omit `eyebrow` when it restates the title or adds no navigation value.
2. Do not place the same status in both `titleAccessory` and `contextPanel`.
3. A warning panel contains one clear title, one evidence-based explanation,
   and one best next action.
4. Do not use the header as a second dashboard. Detailed entitlement, usage,
   or record data belongs in the owning section.
5. Do not show account metrics before the required site/account context exists.

## 4. Status Semantics

Lifecycle, health, capacity, and processing state are separate concepts. They
must not share a vague label such as `状态` when that creates a false
contradiction.

| Concept | Example label | Source |
| --- | --- | --- |
| Connection lifecycle | `接入状态 / 已接入` | `site.status` |
| Service health | `服务状态 / 需关注` | monitoring and customer-status projection |
| Package capacity | `站点容量已超限` | entitlement resource limit |
| AI credit availability | `AI 积分不可用` | account quota projection |
| Ticket workflow | `待处理 / 处理中 / 已解决` | support request status |

Rules:

1. Name the object and condition: prefer `站点容量已超限` over `需要关注`.
2. Do not call a lifecycle-active site `就绪` when service health is unknown or
   degraded. Use `已接入`.
3. Do not mark an exactly-full allowance as over limit unless the authoritative
   projection explicitly classifies it as limited.
4. A quota action must lead to package/credit handling, not a generic site
   support action.
5. A service warning must not automatically become a connection warning. Map
   quota, connection, and other service evidence separately.

## 5. Information Density

Higher density is useful when it shortens scanning without hiding meaning.

Use a table when records share stable comparable fields, especially for:

- sites;
- support tickets;
- audit activity;
- service checks;
- usage or payment records.

Use a compact summary rail when there are two to four comparable metrics and
no row-level actions.

Use cards when content is heterogeneous, explanatory, or action-led. Do not
turn every fact into an independent card.

PC table rules:

- use semantic `table`, `thead`, `tbody`, `th`, and `scope`;
- keep the primary identity in the first column;
- keep status and dates scannable;
- place row actions at the right edge;
- remove columns that repeat an account-level fact on every row;
- use horizontal overflow as a bounded fallback, not as the normal PC layout;
- do not show an action column containing repeated no-op buttons.

## 6. Action Hierarchy

Each visible surface should answer: what is the best next action now?

Priority order:

1. one primary action for the current blocking condition;
2. one or two secondary actions for ordinary route tasks;
3. text links for tertiary navigation;
4. disclosure for low-frequency or destructive actions.

Examples:

- AI credits unavailable: prioritize `购买 AI 积分`;
- site capacity exceeded: prioritize `查看套餐` or `升级套餐`;
- connection/service evidence needs review: prioritize `提交工单`;
- site removal: place under `其他操作`, while preserving authorization,
  confirmation, cooldown explanation, and error handling.

Do not repeat the same action in the header, a nearby card, and a table row.

## 7. Empty, Loading, and Error States

Missing data is a state, not empty space.

Every async section must provide:

- a bounded loading state;
- an actionable error state or retry;
- an explicit empty state when the projection is valid but contains no data;
- no fabricated zero, normal, or ready status when the request failed.

When no site context is selected:

- identify the missing context once;
- provide one path to select a site;
- suppress package/usage metrics that could be mistaken for current-site data;
- keep account-level actions available only when their backend contract truly
  supports an account-level request.

## 8. Customer Copy and Localization

Customer copy should describe observable facts and next actions in plain
language.

Use:

- `最近证据`, `当前周期`, `明确错误事件`, `接入状态`;
- specific resource labels such as `活动站点容量` or `站点知识`;
- stable localized explanations derived from typed projection fields.

Avoid:

- generic `需要关注` without the affected object;
- internal runtime, provider, cost, token, trace, or workflow terminology in
  the default view;
- directly rendering backend English summaries into a localized customer
  page;
- copy that implies Cloud can approve, write, publish, or govern WordPress.

Support identifiers and raw diagnostic references stay behind a disclosure
and appear only when they can help resolve a failure.

## 9. State Ownership and Performance

Prefer existing route/session projections and shared display helpers.

Rules:

- do not add per-site API fan-out to make a site list look more informative;
- distinguish list lifecycle state from detail health state instead of joining
  them with extra requests;
- keep account-level capacity outside repeated site rows;
- resolve customer labels in shared pure helpers when multiple components need
  the same mapping;
- keep React component modules free of exported non-component helpers when
  doing so would degrade Fast Refresh; place shared display logic under
  `frontend/src/lib/`;
- treat backend strings as untrusted display input and map them to bounded
  customer-facing categories before rendering.

## 10. PC-First Scope

The current delivery scope is PC-first.

- Primary browser gates use a normal PC viewport and both light and dark mode.
- Desktop tables and header geometry are the current acceptance target.
- Existing mobile fallbacks must remain functional, but this standard does not
  require a mobile information-architecture rewrite in the current phase.
- Do not distort the PC model solely to optimize an unapproved mobile redesign.

Any future mobile phase should define its own navigation, disclosure, table-to-
card mapping, and touch-target acceptance before implementation.

## 11. Accessibility and Interaction

- use real headings and preserve one `h1` per route;
- use semantic tables and labels for selectors;
- keep buttons and links aligned with their actual behavior;
- preserve keyboard access to `details`, selectors, dialogs, and pagination;
- retain visible focus states;
- keep dialog confirmation and disabled/loading behavior intact when moving an
  action;
- do not use color as the only status signal.

## 12. Implementation and Review Checklist

Before editing:

- identify the route's customer job and authoritative state owner;
- list repeated information and competing actions;
- classify the change as L0, L1, or L2;
- state whether the work is PC-only or changes mobile behavior;
- confirm that no API fan-out or control-plane ownership shift is required.

During implementation:

- reuse `PortalWorkspaceHeader`, `PortalMetricStrip`, status, section, and page-
  state primitives;
- centralize shared customer display mappings;
- update English and Chinese copy together;
- update the relevant Portal contract and E2E assertions;
- preserve permissions, destructive confirmations, and error paths.

Before publication:

- run targeted ESLint and TypeScript checks;
- run the affected Portal unit contracts;
- run the focused Portal browser/E2E path;
- verify the target PC routes in light and dark mode;
- inspect console errors and untranslated backend copy;
- run `git diff --check`;
- use `m4:preview:sync` for current Cloud frontend source when runtime preview is
  required;
- report candidate, pushed, merged, and accepted states separately.

## 13. Rollback

A Portal UI rollback should revert the focused frontend, translations, tests,
and this standard update through Git. Do not patch M4 directly, weaken Portal
authorization, restore removed internal details, or create compatibility API
fields solely to reproduce an older layout.
