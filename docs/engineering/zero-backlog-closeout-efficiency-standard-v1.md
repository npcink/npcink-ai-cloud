# Zero-Backlog Closeout Efficiency Standard v1

Status: active engineering standard.

Purpose: prevent a multi-session closeout from spending one undifferentiated
clock on source changes, evidence collection, human decisions, and resource
retirement. This standard records the three controls adopted after the seven
session closeout review on 2026-10-26.

This document supplements the [Development and Delivery Efficiency Standard](../development-delivery-efficiency-standard-v1.md),
the [Development and Validation Operating Model](../development-validation-operating-model-v1.md),
and the [Parallel AI Collaboration Standard](../parallel-ai-collaboration-standard-v1.md).
It does not authorize production operations, weaken required CI, or turn a
local/M4 result into production evidence.

## 1. Split the completion claim into three tracks

Every backlog item is recorded in three independent tracks. A track may block
its own closeout without blocking unrelated tracks.

| Track | Question | Acceptable completion evidence | Typical blocker |
| --- | --- | --- | --- |
| Engineering | Is the source change implemented and integrated? | focused checks, reviewed PR, required CI, merged `master` | failing test, review finding, merge conflict |
| Evidence | Is the required behavior observed in the named environment? | local, M4 candidate, M4 accepted, or production receipt with identity | missing user, runtime, artifact, or historical receipt |
| Authority | Has the required human decision been made? | explicit scope, acceptance, production, or cleanup authorization | human approval or operator action not yet supplied |

Use the highest state actually proved on each track. Do not write “done” when
only another track is complete. In particular:

- a merged PR does not prove production behavior;
- an M4 receipt does not prove real-user adoption;
- a historical conclusion does not recreate a missing original receipt;
- a user approval for one batch does not authorize a different batch unless
  the approval explicitly covers it.

### Required task record

Before work starts, write one row in the active ledger containing:

```text
item, repository, owner, lane, expected files, non-goals,
engineering state, evidence state, authority state,
verification gate, stop condition, next action
```

When a track is blocked, record the blocker and move to the next independent
row. Do not keep a whole session “in progress” merely because one external
track is waiting.

## 2. Timebox evidence search and retries

Evidence work must answer a named question. Before a search or retry, record:

1. the exact artifact, path, revision, or environment being sought;
2. the bounded sources and commands that may be used;
3. the evidence that would change the decision;
4. the stop condition and the resulting disposition.

The default stop rules are:

- two consecutive failures with the same external-transfer signature: stop
  automatic retries and preserve the failure receipt;
- one complete bounded local/index search with no new named source: seal the
  result as `NOT_LOCATED` and do not repeat the same scan;
- a second independent blocker in the same lane: preserve the first seam and
  move the second issue to a new backlog row;
- a missing human or real-user event: mark `WAITING_EXTERNAL_EVENT`; never
  manufacture the event with fixtures, CI, M4, or paid Provider calls.

Reuse an existing receipt only when its source revision, dependency/build
identity, environment, command, and risk question still match. Otherwise make a
new receipt and state why the old one is insufficient. Keep local, CI, M4
candidate, merged, M4 accepted, production, and human evidence separate.

## 3. Maintain one live ledger and immutable history

There is exactly one active ledger for a closeout. It is the only document used
for current counts, open PRs, worktrees, owners, blockers, and next actions.
Historical receipts, sealed packets, and dated closeouts are immutable evidence
and must not be edited to make current counts look correct.

When facts change:

1. create a successor ledger or dated correction;
2. cite the old packet and state precisely what is superseded;
3. update the current counts and links in the successor;
4. run link, formatting, and hash checks where applicable;
5. leave the sealed predecessor untouched.

The live ledger must distinguish at least:

```text
OPEN_PR
MERGED_PENDING_ACCEPTANCE
EVIDENCE_PENDING
WAITING_HUMAN_AUTHORITY
WAITING_EXTERNAL_EVENT
NOT_LOCATED
DEFERRED_BY_SCOPE
READY_TO_RETIRE
RETIRED
```

Do not count an item twice because it appears in a historical packet and a
successor. Do not keep an item open after it is retired, and do not delete an
item merely because its evidence is inconvenient.

## 4. Closeout sequence

Use this order for a multi-repository closeout:

1. refresh the active ledger from current GitHub and local repository state;
2. clear source/CI blockers one lane at a time;
3. separate missing evidence and human decisions into waiting rows;
4. reconcile branches, worktrees, locks, and ignored deliverables without
   reset, force, or broad deletion;
5. write the successor ledger and final closeout report;
6. archive a session only when its rows are `MERGED`, `RETIRED`, or explicitly
   `WAITING_*` with an owner, trigger, and next review point.

The closeout is complete only when the ledger is internally consistent, all
open PRs have a disposition, every worktree has an owner or retirement receipt,
and every remaining external item is explicitly named. “No code changes left”
alone is not a zero-backlog claim.

## 5. Retrospective fields

At the end of each multi-session effort, record:

- wall-clock duration and active execution time when known;
- time spent in coding, CI/M4, external waiting, user decisions, and cleanup;
- the first point at which each blocker was known;
- repeated searches or retries that should have stopped earlier;
- stale ledger or ownership information that caused rework;
- one concrete process change for the next effort.

This keeps efficiency claims factual. A long wall-clock duration is not itself
a failed implementation, but it is a signal to split independent tracks and
tighten stop conditions.
