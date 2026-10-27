# Cloud Admin Feedback And Layout Contract v1

Status: active.

Purpose: keep the platform-admin workspace task-first, stable during mutations,
and auditable without turning operation receipts into primary page content.

## 1. Scope

This contract applies to `frontend/src/app/admin/**` and shared admin UI
components. It governs page hierarchy, mutation feedback, form errors,
background work, and audit receipt presentation.

It does not change Cloud API contracts, authorization, audit persistence,
provider routing, local plugin truth, WordPress approval, or WordPress writes.

## 2. Product Boundary

The admin workspace is a bounded `platform_admin` service-plane surface. It may
operate Cloud-owned accounts, sites, commercial records, provider connections,
runtime diagnostics, service configuration, and audit evidence.

It must not become a second WordPress control plane, local ability registry,
workflow registry, prompt/router/preset owner, or WordPress write owner.

## 3. Page Hierarchy

Admin pages should follow this order when the content exists:

1. compact page title and primary cross-page actions;
2. optional compact summary metrics;
3. task toolbar with tabs, search, filters, and create actions;
4. primary table, list, or focused working surface;
5. contextual drawer or dialog for create, edit, inspect, and audit detail.

The page title or summary panel must not become a catch-all container for
mutation notices, receipts, forms, diagnostics, and secondary help.

Persistent boundary guidance should use a concise information hint or nearby
help entry. It should not interrupt the primary task on every visit.

### 3.1 Progressive disclosure

- Keep the current object, textual state, frequent action, and next step visible.
  Errors, unconfirmed evidence, save blockers, and potential Provider cost must
  not be available only on hover.
- Short non-interactive explanations use the shared `AdminHelpTip`, available
  through hover, keyboard focus, and click. Interactive or long content uses an
  explicit disclosure, dialog, or drawer.
- Put batch maintenance, reference preferences, historical
  evidence, and other infrequent operations behind clearly named disclosures
  or More menus. Preserve recovery functionality and confirmation safeguards;
  low frequency alone does not justify deleting a capability.
- Show model context, reference price, and capability detail on demand instead
  of repeating them in every row. Hide pagination when the result has one page.
- Remove repeated descriptions and prose explaining the UI design itself.
  Do not replace compact working tables with extra cards or nested tables.

## 4. Feedback Taxonomy

### 4.1 Transient success

Use the global Toast surface for completed save, test, enable, disable, delete,
copy, and refresh operations when no further operator decision is required.

- Toast must not change document flow or move the table.
- Default duration is 5 seconds.
- Copy names the affected object and the completed outcome.
- A success Toast may point to persistent audit detail.
- Each operation has one announcement owner. If a visible inline result or
  receipt already announces the outcome, do not also show the same Toast.
  Keep Toast feedback when a receipt is only reachable through a closed
  latest-operation entry, or when no inline outcome exists.
- Put browsing filters next to the list and label their scope/persistence.
  Do not present a view-only selector as a saved mutation setting.

### 4.2 Contextual form feedback

Keep validation, credential, and test failures inside the active dialog,
drawer, or field group when the operator must correct the current form.

- Field errors stay below the affected field.
- Form-level errors stay near the form actions.
- Corrective feedback remains until resolved or dismissed.

### 4.3 Page-blocking failure

Use a persistent inline alert at the affected data surface when the page cannot
load or the primary task cannot continue. Include a retry action when retry is
safe and meaningful.

### 4.4 Background operation

Show queued or running work on the affected row or in a bounded task-status
surface. Do not represent unfinished work as a success Toast.

### 4.5 Auditable mutation receipt

Every governed Cloud mutation that returns an audit receipt must preserve it.
The receipt is durable follow-up evidence, not a second success banner.

- Keep the latest receipt reachable from the task toolbar, affected object, or
  contextual detail surface.
- Store a visible receipt above any panel that is unmounted by an operation's
  refresh or task-tab switch. Removing a duplicate Toast must not leave the
  operator without a durable result after that refresh.
- Default feedback is a compact, localized business result (for example,
  “用途配置已保存，后续调用将按新配置选择模型。”), with an optional
  “查看变更记录” link. Derive the result from the receipt event and outcome;
  never infer successful execution or validation from a successful save.
- Keep backend summaries, machine event/outcome values, scope IDs, record IDs
  and copyable raw receipts behind a default-closed “操作详情” disclosure or
  existing contextual inspector. Do not show a second oversized success card
  containing English backend prose on Chinese pages.
- Failed, partial, unknown results and unavailable audit records remain explicit
  in the default view. Unknown outcomes must not inherit success styling/copy.
- Open full receipt data in a dialog, drawer, or dedicated audit view.
- Preserve copyable receipt text, audit filters, scope, outcome, and audit event
  reference.
- `Receipt` names the mutation result returned to the operator. `Audit evidence`
  names the persisted service-plane event. `Operation result` names the business
  outcome. `Audit unavailable` means only the audit write failed; it must not be
  rewritten as an operation failure.
- Navigate to the persistent Admin audit workspace, never directly to the raw
  audit JSON API. Prefer an exact `audit_event_id`. When an event ID is not
  available, require a bounded exact filter set that includes the idempotency
  key, event kind, scope kind, and scope ID. Hide the link when that context is
  incomplete or unsupported.
- Preserve the backend `audit_state` separately from the mutation `outcome`.
  `persisted` means the audit follow-up entry exists; `unavailable` means the
  best-effort operation record could not be saved, independently of whether
  the operation succeeded or failed; `not_applicable` is reserved for operations whose contract does
  not require audit evidence.
- When `audit_state=unavailable`, keep the actual operation summary, show
  an explicit audit warning, hide the audit-trail link, and tell the operator
  not to repeat the mutation solely to manufacture audit evidence.
- Do not permanently expand the page title or summary panel with receipt cards.

## 5. Interaction Rules

- Create and edit flows use a dialog or drawer when the list remains the main
  task.
- Successful mutations refresh the affected row without resetting unrelated
  filters or scroll position.
- Destructive actions require confirmation and identify the affected object.
- Loading, empty, error, success, and disabled states must remain distinct.
- Feedback must be announced with the appropriate `status` or `alert` live
  region without announcing normal page content as an error.
- Keyboard focus must remain in the active dialog and return to a meaningful
  trigger after close when the shared dialog primitive supports it.

## 6. Visual Rules

- Use one primary accent and the existing admin neutral palette.
- Avoid nested full-width cards when spacing or a single divider communicates
  the hierarchy.
- Keep tables and toolbars stable when transient feedback appears.
- Prefer compact status text or badges on the affected row over detached status
  panels.
- Dark mode and light mode must preserve the same information hierarchy.

## 7. Supplier Page Pilot

The supplier workspace is the first implementation of this contract:

- supplier save and delete outcomes use global Toast; standalone connection
  checks use one row-level result naming the completed stage;
- automatic catalog refresh after save does not create another row success;
  next-step content offers an action, and partial catalog failure stays with retry;
- form-specific guidance and failures stay in the provider dialog;
- the latest backend receipt remains stored;
- a compact `Latest operation` toolbar action opens receipt detail;
- the page summary no longer renders duplicate success and receipt cards.

## 8. Verification Gates

For a feedback or layout change, run the narrowest applicable set:

```bash
pnpm --dir frontend run type-check
pnpm --dir frontend run lint
pnpm --dir frontend run test:i18n-contract
pnpm --dir frontend run test:contracts
pnpm run check:fast
```

PC is the current product scope; mobile and tablet are not acceptance targets.
Use the selective verification contract in
[frontend-pc-scope-and-selective-verification-v1.md](frontend-pc-scope-and-selective-verification-v1.md).
Verify changed geometry at the narrow PC preview (~1056px) and ordinary desktop.
Check dark styling when colors, surfaces, or interactive state styling changes;
do not repeat unrelated theme/device matrices for copy-only changes.
