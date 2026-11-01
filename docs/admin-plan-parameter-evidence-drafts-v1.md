# Admin plan parameter evidence and drafts v1

Status: local development candidate, 2026-11-02. B5-02 (Plan editor),
B5-03, B5-04 and B5-05 (Plan catalog) only. Credit packs, subscriptions,
production operations and commercial policy changes are outside this batch.
The [existing CAS transaction](admin-plan-parameters-concurrency-v1.md) remains.

## Submitted intent and ordinary drafts

The existing nine-field editor distinguishes an unsent ordinary draft from a
sent operation whose outcome is unknown. X, footer Close, Escape, history,
internal navigation and same-route target links use explicit draft protection;
browser refresh/exit uses beforeunload. Ordinary drafts may be discarded.
Discard/leave never deletes a sent unknown operation.

Before PATCH dispatch, `sessionStorage` stores the original idempotency key,
Plan, PlanVersion, source revision, nine numeric values and original input
strings under `admin.plan-parameters.v1:<plan_id>`. Same-tab reload/close/reopen
restores that snapshot and blocks parameter and sales writes. Unavailable or
malformed storage fails closed; it is never silently removed. This is same-tab
recovery, not cross-device persistence. Closing the browser tab may lose it.

Network loss, timeout, replay rejection, unknown 409, server errors, malformed
success and failed/unmatched confirmation preserve the intent. Only explicit
known nonexecuting validation/revision rejection permits editing again. No new
key, automatic PATCH replay or background retry is used to resolve uncertainty.
Target generations and operation identity prevent late responses from touching
another Plan or its ordinary draft. Same-target reads preserve a dirty draft and
its original CAS baseline. The open editor survives background catalog changes.

## Exact confirmation contract

`GET /internal/service/admin/plans/{plan_id}/parameter-operations/{operation_id}`
requires `source_revision`. The exact Admin proxy path retains
`can_manage_catalog`. Valid internal auth or a real Admin cookie follows a
SELECT-only business chain: no commit, explicit flush, audit success write,
reconciliation, billing backfill, bootstrap or heavyweight projection/refetch.
Existing 401/403 security rejection auditing remains in force; the no-business-
write guarantee applies to authorized confirmation, not every rejected HTTP GET.

The existing parameter PATCH transaction adds `parameter_operation` to its
single `plan_version.publish` success audit and response: action
`parameters.update`, source revision and nine normalized persisted values,
including the canonical self-serve Offer price. Other publication paths do not
gain parameter evidence. No schema migration or second successful audit occurs.

Confirmation requires exactly one successful persisted audit matching the
original actor, key, PATCH path, event, Plan, Version scope and action/revision.
The recorded Version must remain the current selected Version belonging to that
Plan; current Version and canonical Offer values must equal the recorded nine
values. Missing, legacy, duplicate, wrong actor/target/action/revision, moved
Version or changed current values return `unconfirmed` with null current/receipt.
Identical values alone never prove this operation executed.

A confirmed response returns original bindings, audit event ID, normalized current
values and current revision. The browser validates all bindings, original Version
and nine submitted values. It clears only matching storage and updates local
editor/catalog projections plus the existing audit receipt. It does not call
ordinary detail/catalog/accounts/sites/ledger refetches. Storage deletion failure
keeps the operation frozen. Read confirmation does not claim a new publication
policy: the existing current-version status and sales withdrawal rules remain. The shared receipt accepts an optional summary override only here, so a successful current-draft update does not claim publication; other callers retain their existing summary.

PATCH success projections must also carry the actual Version target, source
revision/action and all nine values. An empty/wrong/stale body cannot show
successful completion; the submitted form stays frozen for explicit GET proof.

## Catalog and information hierarchy

The catalog validates items, tier templates, unique targets, real Version/maps,
critical numeric fields and subscription counts before replacing data or its
loaded timestamp. Legal empty arrays display empty state. Invalid first reads
show Retry; invalid background reads retain the last successful catalog with a
visible stale/error notice. Existing canonical-tier selection remains. Recovery
buttons address actual Plan IDs and remain reachable on initial catalog failure.

| Category | Placement |
| --- | --- |
| Always visible | Target, unknown/blocking reason, submitted price/credits, frozen form, GET recovery, storage failure, stale catalog and Retry |
| On demand | Existing parameter/diagnostic workbench, existing field explanations, explicit leave confirmation |
| Technical evidence | Original key/revision disclosure; existing persisted audit receipt with event ID |
| Removed duplicates | None; no new summary dashboard, golden replacement or hidden dynamic state |

The [implementation ledger](admin-information-hierarchy-implementation-ledger.md)
records scoped disposition. Local test, PC screenshots and iteration failures
are recorded in the [dated handoff](history/engineering/2026/admin-plan-evidence-drafts-2026-11-02.md).
CI, M4 candidate/accepted, merge, human visual acceptance and production are
separate states; mocked-browser evidence does not prove deployment behavior.
