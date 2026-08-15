# Portal Customer Workspace UI Closeout and Retrospective — 2026-08-14

Status: dated merged and M4-accepted implementation evidence.

This record summarizes the Portal PC interface improvement started on 2026-08-14
and delivered through four protected pull requests on 2026-08-15. It is evidence
for the merged Portal implementation and clean-`master` M4 acceptance described
below. It is not production deployment evidence, external customer acceptance,
or authority to change the Portal/WordPress ownership boundary.

The active rules extracted from this work live in
[Cloud Portal Customer Workspace UI Standard v1](cloud-portal-customer-workspace-ui-standard-v1.md).

## 1. Objective

The Portal had accumulated multiple individually reasonable sections that did
not form a coherent customer workspace. Common symptoms were:

- page headers used different geometry and information order;
- small eyebrow labels repeated the title;
- status, package, site, and contact facts appeared in adjacent cards;
- important conditions used the generic label `需要关注` without naming the
  affected object;
- site connection lifecycle `active` could be shown as `就绪`, while health,
  recorded errors, and quota pressure were separate facts;
- service and knowledge information used tall metric cards even when the data
  was naturally tabular;
- low-frequency and destructive actions competed with ordinary tasks;
- missing or delayed projections left blank-looking areas or ambiguous yellow
  warnings;
- localized pages could surface raw English backend summaries.

The approved direction was PC-first. Mobile-specific redesign was explicitly
deferred.

## 2. Delivery Chain

| PR | Scope | Merge revision | M4 state |
| --- | --- | --- | --- |
| [#733 Improve Portal record table density](https://github.com/npcink/npcink-ai-cloud/pull/733) | tickets and activity record density | `bed4b01d` | accepted after clean-`master` promotion |
| [#734 Unify Portal workspace foundation](https://github.com/npcink/npcink-ai-cloud/pull/734) | shared header, compact summary rail, home, site table, UI standard | `a293b591` | accepted after clean-`master` promotion |
| [#735 Simplify Portal account record routes](https://github.com/npcink/npcink-ai-cloud/pull/735) | account, package, usage, support, and activity routes | `8565ea89` | accepted after clean-`master` promotion |
| [#736 Separate Portal site service semantics](https://github.com/npcink/npcink-ai-cloud/pull/736) | site detail, service checks, Site Knowledge, monitoring display semantics | `75b75470` | accepted after clean-`master` promotion |

The final observed M4 acceptance state for this sequence was:

- `acceptance_state=accepted`;
- `promotion_pr=736`;
- `source_revision=75b75470869789f9d23f9903a9c0e6a22e205320`;
- `source_branch=master`;
- `source_dirty=false`;
- `/=200` and `/health/live=200`.

These facts prove the accepted M4 preview revision. They do not prove that the
same revision is deployed to production.

## 3. Change Sequence

### Phase 1: improve stable record density

Tickets and activity use tables because they contain repeated comparable
records. The change reduced decorative card repetition while retaining filters,
pagination, support evidence, and row-level actions.

### Phase 2: establish a shared Portal workspace foundation

`PortalWorkspaceHeader` became the shared header model with bounded ownership
for the title, one title accessory, passive metadata, one contextual issue, and
a continuous summary rail. The home and site list adopted the same hierarchy.

Account-level capacity was removed from each site row and retained as one
shared capacity summary. Desktop site rows kept selection, open-site, lifecycle,
and authorized removal behavior; low-frequency lifecycle and removal actions
moved behind `其他操作`.

### Phase 3: simplify account-record routes

The primary routes were reduced to one customer job each:

- home: current account/site condition and the best next action;
- package: current rights, package limit condition, and commercial action;
- usage: current-period AI credit evidence and records;
- support: ticket creation, site context, filtering, and history;
- account: contact email and available sign-in methods;
- activity: selected-site customer-visible activity and support evidence.

### Phase 4: separate site and service semantics

The site list and site detail had appeared contradictory because several facts
were displayed under generic status language. The accepted model separates:

- connection lifecycle: `已接入` or the actual lifecycle state;
- service operation: normal, inactive, or needs attention;
- recorded error events: an independent count for the monitoring window;
- usage pressure: derived from the actual threshold, not merely from the name
  of the highest configured quota metric.

The header title accessory owns connection lifecycle only. Service and quota
conditions remain in their contextual rows. A quota-only issue routes to the
package surface and does not turn the service-operation row into a connection
problem.

No per-site monitoring fan-out was added to the site list. The implementation
fixed wording and state ownership instead of paying an N-per-site API cost.

### Phase 5: compact the site record

The site detail header now owns the site name, address, recent activity,
connection lifecycle, and one contextual issue/action. The duplicated account
shortcut and issue sections were removed.

Service evidence is one semantic table rather than several metric cards. Site
Knowledge uses a compact continuous summary. One visible `提交工单` action is
retained. Site removal remains under `其他操作`, preserving permission,
confirmation, cooldown, and error behavior.

## 4. Corrections Found During Validation and Review

Source inspection and contract tests did not expose every customer-visible or
edge-state defect. Browser validation and protected review found and corrected:

1. `提交工单` appeared both in the header and service content.
2. A Chinese page displayed a raw English backend quota summary.
3. The header repeated `需要关注` in both the title and warning panel.
4. Exporting a pure display helper from a React component module caused a Fast
   Refresh full-reload warning.
5. A quota-only action could mark service/connection as unhealthy and route the
   customer to support instead of package handling.
6. The first compact desktop site table revision hid lifecycle and authorized
   removal controls; review restored them under `其他操作`.
7. An inactive monitoring overview could render the service-operation row as
   `正常`; review added explicit inactive preservation.
8. Treating `quota.top_pressure !== none` as an alert produced false warnings
   for any configured quota. Pressure now requires an over-limit state or the
   defined 90% customer-action threshold.

These findings reinforce a durable rule: validate the rendered consumer,
inspect its console, and test semantic edge states after the structure looks
correct in source.

## 5. Development Lessons

### Start with semantics, not geometry

The highest-value improvement was separating connection lifecycle, service
health, recorded errors, capacity, quota pressure, and workflow state. Once the
terms were correct, the layout became simpler.

### Remove duplicated ownership before increasing density

Compressing duplicate cards creates a denser duplicate interface. First decide
which component owns each fact and action; then compact the remaining content.

### One primary issue is enough above the fold

Customers need the most important current condition and the next action. Other
issues can remain in the detailed section or disclosure. Repeating every issue
in the header weakens hierarchy.

### Tableization is selective

Tables work for stable records and comparable checks. They are poor containers
for explanations, onboarding, heterogeneous choices, or one-off empty states.
The goal is faster comparison, not maximum rows per screen.

### Do not pay API cost to fix wording ambiguity

The site list/detail mismatch looked like a missing-data problem but was
primarily a labeling and ownership problem. Clear semantics avoided a new
monitoring fan-out path.

### Backend evidence needs a customer display model

Typed fields and bounded categories should drive customer copy. Raw backend
summaries remain useful operator evidence but can be technical, untranslated,
or too broad for the customer surface.

### Destructive discoverability is a product decision

Moving site lifecycle/removal actions behind `其他操作` changes discoverability.
Permission, confirmation, cooldown, failure handling, and browser coverage must
therefore be preserved even when the handler itself is unchanged.

### Preview, merge, acceptance, production, and human evidence are separate

Focused local checks and M4 sync support fast iteration. Direct M4 sync is only
candidate evidence. Protected PR checks and merge establish repository truth;
clean-current-`master` promotion establishes M4 acceptance. Production release
and real-user acceptance require separate evidence.

## 6. Boundary Outcome

The work remained inside the Portal customer workspace:

- no Portal API shape changed;
- no provider or model detail was exposed;
- no prompt, preset, ability, workflow, approval, or final-write truth moved to
  Cloud;
- no production or WordPress mutation occurred;
- no per-site monitoring fan-out was added;
- existing authentication, site selection, support, billing, and site-removal
  contracts remained the state owners.

## 7. Verification Evidence

Evidence collected across the four protected batches included:

- TypeScript `--noEmit` and targeted ESLint;
- Portal i18n completeness and focused UI/boundary contracts;
- pure display-semantic regression tests, including inactive health, low quota
  usage, and quota-only error separation;
- real local Chromium Portal path coverage, including the full 15-scenario
  workspace suite and focused correction scenarios;
- `git diff --check` and explicit staged-file review;
- GitHub required checks and automated review resolution;
- M4 candidate sync for changed source checkpoints;
- clean-current-`master` M4 promotion after each merged PR;
- final M4 health evidence listed in the delivery chain.

Cloudflare Access blocked unauthenticated human navigation to the M4 product
surface. No credentials were submitted and no M4 human visual acceptance is
claimed. The local real-Chromium runs are the PC/browser evidence for this
closeout; external customer acceptance remains outstanding.

## 8. Remaining Work

- Mobile information architecture remains deferred as a separate product
  phase.
- Production candidate selection, protected production release, and
  authenticated production smoke require their own operator-controlled gate.
- Core Admin operator-task acceptance should be evaluated separately; this
  Portal closeout does not validate Admin workflows.
- Real editor validation of the WordPress Ability -> Addon -> Cloud runtime ->
  reviewed adoption loop remains the principal product-evidence task.
- Structural debt and further Portal expansion should be prioritized only from
  production, operator, and editor evidence rather than from visual preference.

## 9. Rollback

Rollback is a focused Git revert of the relevant Portal PR or this documentation
record. Do not patch M4 directly, restore raw internal diagnostics to the
customer surface, add compatibility API fields solely to recover the older
layout, or move WordPress control-plane truth into Cloud.
