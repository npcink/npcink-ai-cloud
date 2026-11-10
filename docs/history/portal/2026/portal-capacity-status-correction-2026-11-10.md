# Portal capacity and site status correction — 2026-11-10

Status: source candidate; not a production fix receipt.

## Scope and boundary

The production billing page labeled full site slots as capacities requiring
attention. The service page treated an intentionally inactive site as a global
incident and emphasized both its state and activation action. Account quota
and the user-accessible site list also appeared to contradict each other.

Only Portal presentation and existing activation dialog labels change. No
backend enforcement, credentials, ownership, billing, subscription, provider,
WordPress write path or paused feature changes. No migration or new requests.

## Disposition

- Full bound/active site slots keep their used/limit/remaining values without
  the package alert or an alarm on the entitlement row. Real overages still
  alert; exhausted credits and full knowledge indexing retain their warnings.
- Inactive bindings remain visible with neutral status text. They do not by
  themselves produce a global incident or onboarding failure, even when
  selected. Suspended/provisioning/unknown/missing-URL states remain attention.
- When inactive bindings exist, the home metric names active and inactive
  counts. Activation is a text action; a full allowance names the explicit
  active-site switch in both row and confirmation dialog. Existing selection,
  cancellation and server validation remain intact; no automatic replacement.
- If account bound count differs from accessible list length, the billing list
  explicitly displays both scopes. It does not expose inaccessible objects or
  replace account capacity with a principal's visible count.

## Content inventory and visual scope

Always visible: used/limit/remaining, active/inactive counts, site identity,
state, real restrictions, activation/switch action and any scope difference.
On demand: existing package help, usage dialogs and overflow operations.
Technical evidence: ownership inventory and local browser receipts.
Removed duplication: global warning triggered solely by inactive bindings,
inactive amber capsules and a solid primary activation button.

The site table remains a record directory using the existing 56rem shell.
No new tab/drawer/disclosure or shared primitive geometry is introduced.
Targeted PC review covers 1440px and 1280px, light/dark, home/billing, the
switch dialog, keyboard Escape and restored focus. Golden files are unchanged.

## Historical ownership review

A bounded production SELECT ran in a read-only transaction against the installed
`86be17ed14da1f15a847de91b75460d18079771a` manifest. It found three active
account bindings but only two unreleased principal bindings. The third site
is inactive; its principal binding was released while account ownership remains
active. This explains the difference; it is not proof of corrupted ownership.

Do not automatically restore principal access, archive the site, delete its
history, or stop charging its slot. A later operator decision must identify the
intended owner and exact site, choose retained account ownership versus release,
then use an audited supported operation with before/after capacity evidence.
No production data mutation is part of this source fix.

## Verification and release state

Local: type-check and focused lint passed; five existing Portal/i18n contracts
passed. The unit runner executed all 84 suites / 1,170 tests successfully.
Initial browser slice: 10 passed, 2 failed because the new test expected the
wrong localized text and omitted a selected-site telemetry suppression fixture.
Those fixture/assertion issues were corrected; targeted rerun: 4 passed.
Additional dialog focus/Escape and saved PC captures: 2 passed. No writes,
external model traffic, unexpected requests or page crashes were accepted.

M4 candidate, CI, merged, M4 accepted, production and human visual acceptance
remain separate states and will be recorded as they occur. This document does
not authorize deployment. Source rollback is a revert; there is no data rollback.
