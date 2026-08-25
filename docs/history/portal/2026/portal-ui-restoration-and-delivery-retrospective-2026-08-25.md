# Portal UI Restoration and Delivery Retrospective - 2026-08-24 to 2026-08-25

Status: time-bounded Portal historical evidence; not current Portal authority.

Current authority: [Cloud Portal Customer Workspace UI Standard](../../../cloud-portal-customer-workspace-ui-standard-v1.md).

This record explains why a previously adjusted Portal interface disappeared,
how it was restored through protected pull request
[#865](https://github.com/npcink/npcink-ai-cloud/pull/865), which defects were
found during closeout, and which reusable rules were added to the active Portal
standard. It proves only the named source, CI, and M4 evidence. It is not
production deployment or real-customer acceptance evidence.

## 1. Problem and Root Cause

The operator observed that an earlier Portal layout adjustment was no longer
present. The visible symptom looked like a later UI regression, but repository
history showed a more precise cause: the intended Portal commits existed on an
archived development line and had never become part of the current protected
`master` history. Subsequent work therefore continued from a baseline that did
not contain the adjustment.

The failure was not caused by browser cache, M4 drift, a feature flag, or a
single CSS override. The missing integration state was the cause:

```text
implemented and locally committed
  != pushed through protected PR
  != merged into master
  != accepted from merged master
```

This distinction matters because a screenshot, a clean topic branch, and a
working direct M4 preview can all show an intended interface without making it
durable repository truth.

## 2. Restoration Envelope

The restoration was intentionally bounded to the Portal account/site
workspace. It restored the earlier design intent on top of then-current
`origin/master` rather than replacing current files with an old snapshot.

Restored behavior included:

- removing the Portal home management-site selector;
- keeping package, usage, and tickets independent from selected-site context;
- hiding site search until more than 20 visible sites, except when a query is
  already active;
- removing persistent active/bound capacity tags from the site register while
  retaining relevant account warnings in the account header;
- presenting `View site` as the primary text navigation and lifecycle changes
  as an ordinary secondary action;
- keeping site removal under `Other actions` with authorization,
  confirmation, cooldown explanation, and error handling intact.

The replay began from the intended historical commits and then added current-
baseline reconciliation for duplicate i18n keys and regression tests. API,
authentication, data ownership, entitlement semantics, and production release
were explicit non-goals.

## 3. Delivery Evidence

| State | Evidence |
| --- | --- |
| Final topic revision | `fb5ac418138e4de0394866a4f6dc3f8773e9191c` |
| Protected PR | [#865 Restore the simplified Portal account workspace](https://github.com/npcink/npcink-ai-cloud/pull/865) |
| Required checks | frontend, backend aggregate, PR body contract, Secret scan, JavaScript/TypeScript CodeQL, and Python CodeQL passed |
| Merge state | squash merged on 2026-08-24 at `d3aca0f40ba8aab44a510c189ea1c1ad4f7ae0ee` |
| M4 accepted state | `acceptance_state=accepted`, `promotion_pr=865`, `source_branch=master`, `source_dirty=false` |
| Accepted source revision | `d3aca0f40ba8aab44a510c189ea1c1ad4f7ae0ee` |
| Portal HTTP evidence | `/portal` produced the expected login redirect and the login destination returned `200` |
| Production and human evidence | not applicable / not measured |

Local verification for the final behavior included TypeScript, focused ESLint,
the complete frontend contract suite, `git diff --check`, and the 25-scenario
Portal Playwright workspace suite. The final full browser suite passed `25/25`
in 33.3 seconds.

## 4. Corrections Found During Closeout

The first restoration candidate looked correct in the browser and passed the
focused Portal tests, but the broader delivery chain found four additional
problems.

### 4.1 A stale cross-cutting contract still required the retired selector

The first protected frontend check failed because
`portal-cookie-route-refresh-contract.mjs` still required
`handleSelectSite`. The selector had been intentionally removed, but only the
three most obvious regression tests had been updated.

The correction kept strict site selection in the session owner while changing
the site-register contract to prohibit hidden account-context mutation. The
complete frontend contract suite then passed.

Lesson: focused tests prove the edited seam; they do not prove that an older
repository-wide source contract no longer encodes the retired behavior.

### 4.2 An active URL query could hide its own clearing control

The restored search threshold used only the visible site count. A bookmarked
or historical `?q=` URL with 20 or fewer sites still filtered the rows while
hiding the search input. A customer could see an empty or partial list with no
way to clear the filter.

The correction shows search when the list exceeds the threshold or a query is
active. Browser regression coverage now opens a two-site account with a query,
verifies the input remains visible, clears it, and verifies the URL and full
site set recover.

Lesson: conditional control visibility must account for active state, not only
the threshold that normally reveals the control.

### 4.3 Removal authorization depended on unrelated selected context

Removing the management-site selector exposed an older coupling: the site
register displayed removal only when a row matched `selectedSiteId`, even
though each `Site` already carried its service-projected `allowed_actions`.
Authorized removal of another site would have required changing context on an
unrelated route.

The correction gates each row with its own `allowed_actions` projection. The
browser suite verifies that both selected and unselected authorized rows expose
the removal confirmation path.

Lesson: row actions belong to row authorization. Selected context is not a
general permission proxy.

### 4.4 The desktop disclosure could be clipped by the table scroller

The first desktop `Other actions` menu was absolutely positioned inside an
`overflow-x-auto` table wrapper. CSS overflow-axis behavior could clip the
last-row menu or force nested scrolling, making the destructive action vanish
immediately after opening the disclosure.

The correction keeps the desktop disclosure content in normal table flow. A
static regression contract prevents absolute positioning from returning, and
the browser path verifies that the action is visible after expansion.

Lesson: a logically correct action is still broken when its container makes it
unreachable.

## 5. Development Method That Worked

### Establish repository truth before touching the UI

The investigation compared current `origin/master`, exact historical commits,
PR state, worktrees, and M4 status. This ruled out cache and runtime theories
and identified a branch-integration failure before any reconstruction work.

### Restore intent, not old files

Historical commits supplied the intended change, but current `master` remained
the baseline. Replaying a bounded patch preserved newer source changes and made
translation/test conflicts explicit. Copying an old component wholesale would
have hidden those conflicts and risked removing later fixes.

### Separate semantics from presentation

The recovery preserved account/site ownership rather than merely reproducing
the old pixels. Account package, usage, tickets, and capacity warnings remained
account-owned; site lifecycle and row actions remained site-owned. That
ownership model directly resolved the removal-permission defect.

### Let each evidence layer answer a different question

- focused contracts answered whether the intended structure was protected;
- the complete contract suite found stale cross-cutting expectations;
- Playwright found URL-state and reachability defects;
- protected review found usability interactions missed by the first pass;
- required checks established merge eligibility;
- clean-`master` M4 promotion established accepted preview source.

No one layer was treated as a substitute for the others.

### Close review findings with regression evidence

All three automated review conversations were answered with the implementing
revision and corresponding contract/E2E proof before resolution. Auto-merge
remained blocked until both required checks and conversation resolution were
complete.

## 6. Reusable Rules

The active Portal standard now requires:

1. current-`master` and exact-commit investigation before restoring a missing
   interface;
2. protected merge evidence before a UI change is called durable;
3. the complete frontend contract suite before publication, after focused
   inner-loop tests;
4. an operable clearing path whenever URL or local filter state is active;
5. row-level authorization for row actions;
6. clipping-aware validation for disclosures inside scrolling containers;
7. revision-aligned M4 sync after the final source change and clean-`master`
   promotion for accepted M4 evidence;
8. review resolution backed by an implementing revision and regression test.

These rules are normative in the
[Cloud Portal Customer Workspace UI Standard](../../../cloud-portal-customer-workspace-ui-standard-v1.md),
not in this dated record.

## 7. Stopping Decision and Remaining Scope

The frozen restoration ledger is closed: the intended Portal behavior is
merged into `master`, protected checks passed, and M4 accepted the merged
revision. Production deployment and human customer acceptance were not
requested and are not inferred.

No further Portal redesign follows automatically from this closeout. Reopen
the surface only for a current defect, observed customer friction, an approved
mobile phase, or a product-contract change with its own evidence envelope.

## 8. Closeout Receipt

```text
Scope: restore the simplified Portal account/site workspace and close the protected merge/M4 acceptance chain
Issue ledger: missing branch-only UI, stale selector contract, hidden active search, selected-context removal coupling, clipped desktop disclosure
Source evidence: PR #865; topic fb5ac418; merged master d3aca0f4
Release evidence: production not requested; no production claim
Runtime/consumer evidence: M4 accepted PR 865 from clean master; Portal login redirect resolved to HTTP 200; local Playwright 25/25
Deferred evidence: production deployment and real-customer acceptance not applicable/not measured
External-operation budget and actual use: four source syncs, zero deploys, one clean-master promotion; no paid Provider calls
Rollback: revert PR #865 through a protected PR and promote the resulting clean master when M4 evidence is required
Final state: frozen restoration ledger closed at merged master and M4 accepted; production/human states remain separate
```

## 9. Documentation Rollback

Revert the documentation PR that introduced this record and the associated
active-standard additions. Do not rewrite this historical evidence to match a
future Portal state; update the active standard or add a newer dated record.
