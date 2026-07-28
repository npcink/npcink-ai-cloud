# CNY Budget Contract Cutover Closeout And Development Retrospective — 2026-07-28

Status: the customer and operator cost-budget contract is CNY-only on
GitHub `master`. The clean CNY cutover merge revision was accepted on M4 at
closeout. Production was not changed.

This record summarizes the reasoning, implementation history, corrections,
verification evidence, and reusable engineering method behind PRs `#327` and
`#330`. It supplements
[ADR-033](decisions/033-cny-accounting-and-provider-cost-evidence.md); it does
not replace that decision, approve a production release, establish a live
foreign-exchange source, or claim that the accounting rate equals a Provider,
bank, Alipay, invoice, or settlement rate.

## Executive Closeout

The work began with a product requirement: customer prices, package budgets,
operator top-ups, and budget decisions should use one understandable
denomination, CNY. Providers may still report raw cost in USD, so replacing
every USD value with a converted number would have destroyed reconciliation
evidence.

PR `#327`, merged as `521131c9`, established the accounting foundation:

- customer and operator decisions use CNY;
- raw Provider `cost` remains USD evidence;
- each new Provider call also emits `cost_cny`;
- the USD and CNY amounts carry the same immutable `accounting_fx` snapshot;
- Cloud owns one operator-managed accounting rate with an explicit,
  versioned fallback;
- browser code formats snapshotted values instead of owning an FX table.

That first implementation also retained compatibility inputs for the old USD
package ceiling and top-up fields. The compatibility assumption was then
re-examined against actual product state. There were no external users and no
production package or top-up history, so a dual contract would have preserved
ambiguity without protecting any real consumer.

PR `#330`, merged as `c61a6522`, completed the hard cutover:

- package versions accept only `max_cost_cny_per_period`;
- operator top-ups accept only `cost_cny_increment`;
- `max_cost_per_period` is rejected explicitly;
- `cost_increment` is rejected as an extra field;
- runtime budget enforcement reads only CNY budget and top-up totals;
- migration `20260728_0076` removes the unreleased USD keys while preserving
  CNY and unrelated metadata;
- raw Provider USD evidence and legacy read-only Provider-cost conversion
  remain intact.

The accepted M4 state recorded at CNY cutover closeout was:

| Evidence | Accepted value |
| --- | --- |
| Pull request | `#330` |
| CNY cutover merge revision | `c61a6522b56f440cbf3cdf116dfc00a964d19c6f` |
| M4 acceptance | `acceptance_state=accepted` |
| M4 source branch | `master` |
| M4 source dirty | `false` |
| Alembic | `20260728_0076 (head)` |
| HTTP smoke | `/=200`, `/health/live=200` |
| Post-merge focused M4 tests | `5 passed` |

This is accepted development integration evidence. It is not production or
external-user acceptance. Later `master` revisions require their own promotion;
this historical record does not claim that M4 always remains on `c61a6522`.

## Final Contract And Ownership

The final model deliberately separates customer contract, Provider evidence,
and accounting interpretation:

| Concern | Canonical value | Owner | Compatibility posture |
| --- | --- | --- | --- |
| Customer price | CNY | Cloud commercial contract | CNY only |
| Package model-cost ceiling | `max_cost_cny_per_period` | Cloud plan version | old USD input rejected |
| Operator top-up | `cost_cny_increment` | Cloud subscription service | old USD input rejected |
| Budget enforcement | `cost_cny` | Cloud commercial runtime | no USD fallback |
| Provider original cost | `cost` in USD | Provider usage evidence | preserved |
| Converted Provider cost | `cost_cny` | Cloud accounting evidence | emitted with the same FX snapshot |
| Historical Provider rows without CNY | read-only legacy conversion | Cloud reporting | identified as legacy conversion |
| Accounting rate | versioned USD/CNY snapshot | Cloud service settings | not a public or WordPress setting |
| Final settlement price | invoice/tariff/paid evidence | external financial truth | not inferred |

WordPress ownership did not change. WordPress remains the Ability, workflow,
review, approval, preflight, and final-write control plane. This change belongs
to Cloud because it concerns hosted Provider cost evidence, commercial budgets,
and operator accounting decisions.

## Why The Old USD Inputs Were Removed

Backward compatibility is valuable only when it protects known consumers,
stored data, or a published contract. It is not automatically safer.

The actual evidence was:

- no external users depended on either old field;
- there was no production package/top-up history to preserve;
- the names did not identify whether a bare `cost` was USD or CNY;
- retaining both paths required every normalizer, headroom calculation,
  renewal, audit, UI fixture, and test to reason about two denominations;
- converting an unlabelled historical value at the current rate would invent
  accounting meaning that was never stored.

The rejected alternatives were:

### Keep both fields indefinitely

Rejected because it would create a permanent dual public contract for no real
consumer. Every later feature would need precedence rules, mixed-input
validation, conversion timing, and test coverage.

### Accept the old fields and silently convert

Rejected because an unversioned conversion is not reproducible. The result
would change when the current accounting rate changes and could be mistaken
for settlement truth.

### Remove raw Provider USD cost

Rejected because raw Provider cost is evidence, not a customer-facing
denomination. Removing it would weaken invoice reconciliation and historical
auditability.

### Rewrite all historical Provider events

Rejected because historical events must remain immutable. New paired evidence
is emitted prospectively; old rows are converted only for explicitly labelled
read-only reporting.

The chosen rule is:

> Use compatibility evidence, not compatibility instinct. With no consumers
> or released data, prefer one explicit contract and a bounded cleanup.

## Implementation Method

### 1. Classify every old-field occurrence before deleting

The initial repository search grouped occurrences by responsibility:

- external input;
- normalized plan or subscription state;
- budget enforcement;
- Admin form and fixtures;
- migration cleanup;
- tests that prove rejection;
- Provider raw-cost evidence.

This classification prevented a dangerous global replacement. The old package
and top-up inputs were removed, while Provider USD evidence was retained.

Future currency work should use the same taxonomy. A matching word such as
`cost`, `usd`, or `legacy` is not enough to decide whether a path is obsolete.

### 2. Reject ambiguity at the input boundary

The package normalizer rejects `max_cost_per_period` with a specific error
directing the caller to `max_cost_cny_per_period`.

The top-up request model forbids extra fields and exposes only
`cost_cny_increment`, so `cost_increment` produces a validation error instead
of being ignored.

Boundary rejection is preferable to downstream guessing because it:

- gives operators immediate, actionable feedback;
- prevents ambiguous data from entering persistence;
- lets downstream budget code remain CNY-only;
- makes removal observable in contract tests.

### 3. Remove fallback logic from all downstream decisions

Changing request models was not sufficient. The work also removed the old
field from:

- runtime defaults and tier templates;
- effective-budget and headroom calculations;
- audit and limit enforcement;
- package-fit conversion;
- current-period top-up totals;
- renewal resets;
- Admin top-up registry and fixtures.

The reusable lesson is:

> A contract cutover is complete only when both writes and reads stop creating
> or interpreting the old representation.

### 4. Use a surgical, idempotent cleanup migration

Migration `20260728_0076` cleans only the unreleased USD keys from:

- `plan_versions.budgets_json`;
- `account_entitlement_snapshots.budgets_json`;
- `account_subscriptions.metadata_json`.

It preserves:

- `max_cost_cny_per_period`;
- `cost_cny`;
- unrelated metadata;
- non-object values such as `NULL`;
- original Provider usage events.

The migration is idempotent. Its downgrade is intentionally a no-op because
recreating USD values would fabricate a denomination and exchange rate.
Rollback retains canonical CNY data and should be performed by reverting the
application decision, not by inventing old financial values.

Two migration review corrections were important:

1. the entitlement snapshot primary key is `id`, not the assumed
   `snapshot_id`;
2. a cleaner must return non-object values unchanged, otherwise `NULL` metadata
   is silently rewritten to `{}`.

These are general migration rules:

- inspect the real table contract instead of inferring column names;
- test idempotency;
- test preservation, not only deletion;
- include `NULL` and unrelated metadata cases;
- do not promise a reversible downgrade when the missing information cannot be
  reconstructed honestly.

### 5. Preserve paired Provider evidence

Runtime metering continues to record:

- `cost`: the Provider-reported USD amount;
- `cost_cny`: the amount converted using the captured accounting rate;
- `accounting_fx`: base, quote, rate, effective time, source, version, and
  fallback state.

Both amounts must describe the same event and snapshot. Later rate changes do
not rewrite the event.

This separation avoids two common accounting errors:

- treating an operator accounting rate as a live market or settlement rate;
- replacing source evidence with a derived display value.

## Verification History And Corrections

### Local focused validation

The development loop used the narrowest useful checks first:

- Ruff on changed Python files, then repository-wide Ruff;
- relevant API, migration, commercial runtime, payment, subscription, and
  monitoring tests;
- frontend type-check and lint;
- frontend static currency contracts;
- `check:anti-drift`;
- migration-head validation.

The principal focused selections passed with:

- `53 passed` in the broader relevant backend selection;
- `15 passed` for the final migration/runtime/API/monitoring selection;
- exact tests for Provider cost evidence, image source, Web Search, and the
  portal formatting repair.

Optional local Playwright runs exposed existing baseline drift in navigation
counts, a duplicate heading locator, and Portal fixtures. Those failures were
reported separately and were not presented as currency-contract failures.
Required GitHub frontend checks later passed.

### M4 candidate validation

The first M4 migration attempt exposed the incorrect snapshot primary key.
After correction, the migration reached `20260728_0076`.

A later sync encountered API port `8010` with no listener because the Cloud
services were already stopped by concurrent preview activity. The broad
recovery command was also blocked by an unrelated unmanaged Ollama listener.
The correct response was not to seize or terminate Ollama. Only the exact
Cloud-owned services were restarted:

- `api`;
- `frontend`;
- `proxy`;
- `worker`;
- `callback-worker`;
- `ops-worker`.

The source was then synced again and focused M4 tests passed. After every code
or test correction, the candidate was re-synced so M4 did not retain stale
source evidence.

This incident reinforced three operational rules:

1. diagnose runtime state before treating an HTTP probe failure as a code
   failure;
2. use exact service lifecycle commands instead of broad recovery when another
   process owns the blocker;
3. never claim the current candidate after source changes until it is synced
   again.

### GitHub CI feedback

The first PR run found a repository-wide Ruff failure in an unchanged Portal
test: one line was 101 characters. The minimal expression-only formatting
repair was added, its owning test passed, and the full Ruff gate became green.

The complete backend shards then found five stale expectations. Runtime already
emitted `cost_cny`, but tests for text execution, failed Provider execution,
Provider characterization, Web Search, and image source still expected only
raw `cost`.

The correct fix was to update the tests to assert both evidence meters. Removing
`cost_cny` from runtime would have made CI green by violating ADR-033.

The final PR revision passed:

- PR body contract;
- secret scan;
- dependency audit;
- backend static checks;
- frontend checks;
- PostgreSQL encryption regression;
- Python 3.14 Alpine image smoke;
- CodeQL;
- all three backend pytest shards.

This is a useful pattern:

> When a broad gate fails, decide whether it found a product defect, a stale
> test contract, or unrelated baseline drift before editing implementation.

### Merge And Accepted M4 Promotion

The final feature revision was merged through PR `#330` as `c61a6522`.
Candidate behavior was not called accepted merely because it had passed on M4.

A clean `master` worktree was fast-forwarded to the exact current
`origin/master`, then promoted with:

```bash
pnpm run m4:preview:promote -- --pr 330
```

Acceptance required all of:

- `acceptance_state=accepted`;
- `promotion_pr=330`;
- `source_branch=master`;
- `source_dirty=false`;
- source revision `c61a6522`;
- Alembic `20260728_0076 (head)`;
- healthy API, frontend, proxy, PostgreSQL, and Redis;
- HTTP liveness;
- relevant post-merge focused tests.

Production remained unchanged.

## Reusable Development Lessons

### Compatibility must follow product reality

Ask these questions before retaining a legacy field:

1. Is the field published?
2. Does a real external consumer send it?
3. Is there stored production data that cannot be migrated safely?
4. Can its denomination and semantics be reconstructed?
5. What is the operational cost of supporting both forms?

If the first three answers are no, compatibility is usually speculative. A
single explicit contract plus a cleanup migration is often safer.

### Put units in financial field names

Bare names such as `cost`, `price`, or `limit` are acceptable only when the
surrounding evidence contract defines the currency unambiguously. User and
operator inputs should encode the denomination, such as
`max_cost_cny_per_period`.

For Provider evidence, retain the original field only when its unit is part of
the Provider contract and snapshot metadata makes that meaning durable.

### Separate source evidence from decision currency

The source amount answers, “What did the Provider report?”

The CNY amount answers, “What accounting value did Cloud derive at that
captured rate?”

The package budget answers, “What CNY limit should the product enforce?”

Those are related but not interchangeable facts. Keeping them separate
prevents an accounting estimate from silently becoming invoice or settlement
truth.

### Migration tests must prove non-destruction

Deletion-only assertions are insufficient for JSON cleanup. Tests should prove:

- target keys are removed;
- canonical replacement values survive;
- unrelated nested data survives;
- `NULL` and unexpected shapes survive;
- a second migration run makes no further change.

### Narrow tests accelerate discovery; full CI completes discovery

Focused tests gave rapid feedback for the intended seam. Full CI found stale
consumers outside the initial selection. Both were necessary, but they served
different purposes.

Do not run the full suite after every edit. Do not treat focused green tests as
proof that every consumer contract is current.

### Evidence states must remain explicit

The sequence was:

```text
local verified
  -> candidate validated on M4
  -> PR required checks passed
  -> merged into master
  -> clean master promoted
  -> accepted on M4
```

None of those states implies production deployment or external-user
acceptance.

### Dirty worktrees are an ownership boundary

The active checkout contained unrelated user work. The currency cutover and
this retrospective used isolated worktrees instead of reset, stash, broad
staging, or overwrite. This preserved both histories and made exact staging
auditable.

### Operational recovery should be narrow

An unmanaged service that blocks a broad recovery command does not authorize
taking it over. Inspect service ownership, restart only the task-owned
components, and rerun the failed evidence step.

## Future Currency-Change Checklist

Before implementing another currency or price contract:

1. identify customer, operator, Provider, payment, invoice, and settlement
   truths separately;
2. inventory real consumers and stored production data;
3. choose one canonical decision currency;
4. encode denomination in external field names;
5. preserve raw source evidence;
6. snapshot every conversion input needed for reproducibility;
7. define fallback state visibly and never call it live or settlement truth;
8. decide compatibility from evidence;
9. write a preservation-focused migration contract;
10. reject ambiguous old input at the boundary;
11. remove old downstream read and write paths;
12. search all runtime, worker, reporting, Admin, fixture, and test consumers;
13. run focused local tests;
14. validate the exact candidate on M4 when runtime or migration behavior
    changes;
15. let required CI expose missed consumers;
16. promote only clean merged `master`;
17. report production and external acceptance separately.

## Deferred And Explicit Non-Goals

This closeout does not add or authorize:

- a user-selectable currency;
- a browser-owned exchange-rate table;
- a live FX feed;
- retroactive rewriting of Provider events;
- an inferred Provider settlement price;
- a second WordPress control plane;
- production deployment.

Before real paid use or margin acceptance, an operator must review the fallback
accounting rate. Settlement-price acceptance must wait for trustworthy tariff,
invoice, paid-user, or explicit spend evidence.

## Rollback

The source change can be reverted through Git and reviewed normally.

The data migration must not fabricate removed USD values during downgrade.
Canonical CNY fields and immutable Provider evidence remain the recoverable
truth. Reintroducing another package or top-up denomination requires a new
explicit decision, named fields, precedence rules, migration design, and
consumer evidence.

## References

- [ADR-033: CNY Accounting And Provider Cost Evidence](decisions/033-cny-accounting-and-provider-cost-evidence.md)
- [Development And Validation Operating Model](development-validation-operating-model-v1.md)
- [M4 Preview AI Development Standard](m4-preview-ai-development-standard-v1.md)
- [PR #327: Unify cost accounting in CNY](https://github.com/npcink/npcink-ai-cloud/pull/327)
- [PR #330: Remove unreleased USD budget compatibility](https://github.com/npcink/npcink-ai-cloud/pull/330)
