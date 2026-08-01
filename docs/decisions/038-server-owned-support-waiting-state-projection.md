# ADR-038: Server-owned support waiting-state projection

## Status

Accepted.

## Date

2026-08-01.

## Context

The Admin support queue originally had four workflow statuses: `open`,
`in_progress`, `resolved`, and `closed`. Those values describe the ticket
lifecycle but do not answer the operator's scheduling question: “Who is
waiting for whom, and since when?”

Earlier UI risk logic used creation or update timestamps and browser-side
status heuristics. That was insufficient because:

- an internal note updates the record without transferring the public
  conversation to the customer;
- an attachment can be the latest public customer or operator activity;
- a resolved ticket can retain urgent priority without remaining active work;
- sorting one fetched page cannot establish a global support queue;
- multiple consumers would otherwise invent different waiting semantics.

The support service already owns public messages, public attachments, workflow
status, and the Admin service projection. It is therefore the narrowest owner
able to project waiting state transactionally without creating a second
support workflow or WordPress control plane.

## Decision

Persist a server-owned support waiting-state projection on each support
request:

- `waiting_on`: `operator`, `customer`, or `none`;
- `waiting_since`: the activity time that established the current wait;
- `first_operator_response_at`;
- `last_customer_activity_at`;
- `last_operator_public_activity_at`.

Transitions are:

| Event | Result |
| --- | --- |
| Customer creates, publicly replies, publicly attaches, or reopens | `waiting_on=operator`; waiting starts at that activity |
| Operator publicly replies or publicly attaches | `waiting_on=customer`; waiting starts at that activity |
| Operator writes an internal note | waiting owner and clock unchanged |
| Ticket becomes resolved or closed | `waiting_on=none`; waiting clock cleared |
| Completed ticket is reopened by status | restore from the latest recorded public customer/operator activity |

`first_operator_response_at` is set once by the first public operator message
or attachment. Notification delivery success or failure does not decide the
conversation owner because the public Portal record is the canonical customer
conversation; delivery is separate operational evidence.

The Admin list API may filter `waiting_for_operator` and `overdue`. It applies
those filters and global risk order before pagination. The first overdue rule
uses a fixed 48-hour threshold until a separately reviewed product policy owns
a configurable SLA.

Active urgent/critical tickets or active tickets waiting for the operator for
at least 48 hours are critical. Other active tickets waiting for the operator,
or high-priority active tickets, are warnings. Active tickets waiting for the
customer are monitored. Resolved and closed tickets are stable.

The Portal projection does not expose the five internal scheduling fields.
They are Cloud Admin service-plane evidence, not customer-visible workflow or
WordPress control-plane truth.

Migration `20260801_0078` backfills public message and public attachment
activity, ignores internal activity, assigns complete tickets to `none`, and
has a tested downgrade.

## Alternatives considered

### Infer waiting state from workflow status in the browser

Rejected. `in_progress` does not prove the customer is next, and `open` does
not encode attachments, reopens, or internal-note behavior. Different
consumers would drift.

### Use `updated_at` as the waiting clock

Rejected. Internal notes, administrative status updates, feedback, and other
record changes can update the ticket without transferring the public
conversation.

### Introduce “waiting for customer” as a fifth workflow status

Rejected. Workflow completion and conversation turn are orthogonal. Combining
them would multiply status transitions, complicate existing Portal behavior,
and lose the ability to represent an active ticket awaiting either party.

### Calculate waiting state on every list query from the timeline

Rejected for the current service. It would repeat correlated aggregation in a
high-frequency paginated queue and make indexing, filtering, and migration
semantics harder to reason about. The persisted projection is transactionally
updated with the owning activity.

### Add assignment, AI reply, or a configurable SLA center now

Rejected as scope expansion. The immediate operator problem was truthful
attention ordering. Assignment, automation, and SLA policy need independent
product, authorization, audit, and failure contracts.

## Consequences

- Queue labels, filters, summaries, and sort use one canonical service-owned
  meaning.
- Internal work can be recorded without falsely resetting the customer wait.
- Public attachments participate in the same conversation turn as messages.
- The Admin UI can remain dense and mostly presentational instead of owning a
  second state machine.
- Every public support mutation must update the projection in the same
  transaction; bypassing the repository seam can cause drift.
- The 48-hour threshold is an explicit current product rule, not a configurable
  SLA promise.
- Historical backfill accuracy depends on the retained public message and
  attachment timeline.

## Verification

Implementation and future changes must prove:

- customer, operator, internal-note, attachment, resolve, reopen, and failed
  notification paths;
- first-response immutability after later operator activity;
- global sorting and attention filtering before pagination;
- Portal non-disclosure of internal scheduling fields;
- migration backfill from public messages and attachments, internal-event
  exclusion, check constraint, indexes, and downgrade;
- local domain/API/migration tests plus M4 PostgreSQL migration head and
  focused runtime evidence for schema changes.

The accepted initial implementation is PR
[#450](https://github.com/npcink/npcink-ai-cloud/pull/450), merged as
`6fd4e5a12d5d31c08d7518e6721f0913d5f8e16a` and promoted with
`promotion_pr=450`, `acceptance_state=accepted`, `source_branch=master`, and
`source_dirty=false`.

## Rollback

For an unaccepted candidate, revert the source and run the migration downgrade
on only the disposable candidate database when safe. After merge, use a
reviewed revert or superseding ADR and coordinate application rollback with
the reversible `20260801_0078` schema downgrade. Do not delete projection
columns while code still reads or writes them, and do not patch M4 or
production directly.
