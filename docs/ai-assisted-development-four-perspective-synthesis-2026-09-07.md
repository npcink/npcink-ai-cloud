# AI Assisted Development Four Perspective Synthesis - 2026-09-07

Status: dated cross-session synthesis and development guide; not current
runtime, M4, production, entitlement, or human-value authority.

## 1. Purpose and Reading Rule

This document consolidates the four historical conversations about solo
AI-assisted development, formal release, end-user experience, and platform
administration, together with the subsequent remediation and repository
closeout work. It records the reasoning that should survive those
conversations without presenting old findings as current defects.

Use it to understand why the current workflow has its boundaries. Before
acting on any item, re-check current source, `origin/master`, open pull
requests, worktrees, M4 status, production revision, and consumer evidence.
The active standards and code are authoritative; this document is evidence
and synthesis.

## 2. Source Conversations and Their Questions

| Conversation | Question answered | Durable lesson |
| --- | --- | --- |
| Solo AI development | Can one operator keep an AI-heavy repository coherent? | Throughput is not the same as maintainability; task boundaries, independent review, and user evidence must be explicit. |
| Formal release | Is the current source safe to call GA or promote? | A live process and green CI do not prove business readiness; release requires one frozen candidate and a complete evidence chain. |
| User experience | Where does a real user lose the next safe action? | Error states need recovery actions, and account/site/service state must not be collapsed into one status. |
| Platform administration | Where can an operator make or diagnose an unsafe change? | Effective runtime state, audit identity, confirmation, partial success, and discovery must be visible at the point of action. |

The conversations were read as historical evidence. Their titles, dated
branches, screenshots, and old revisions are not current state by themselves.

## 3. Findings That Generalize

### 3.1 The central contradiction

AI can increase implementation throughput faster than a single operator can
review boundaries, maintain context, collect user evidence, and close old
worktrees. The resulting risk is not only incorrect code. It is a repository
that is locally green, heavily documented, and still uncertain about user
value or the exact source being released.

The correct response is to reduce the size of each decision, not to stop
using AI or to add a larger process layer:

```text
current facts -> one bounded problem -> one owner -> one consumer proof
  -> one reviewed change -> one explicit evidence state -> closeout
```

### 3.2 User and operator state are state machines

Several apparently separate defects had the same root cause: the interface
showed a label without showing the next valid transition.

- A site can be bound, inactive, suspended, or credential-invalid.
- A Cloud service can be healthy, degraded, unverified, or unavailable.
- A support request can be open, waiting, resolved, or closed.
- A draft can be saved, validation-blocked, or published.
- A provider connection can be configured, selected, or actually effective.

Do not use one green badge or one generic error message for all of these. Each
visible state must identify its owner, its severity, and the safest next action.
If no safe self-service action exists, the support action must carry the
account/site context and the reason into the diagnostic path.

### 3.3 Evidence states are not interchangeable

The following states answer different questions and must remain separate:

`local verified` -> `candidate validated on M4` -> `PR verified` ->
`merged into master` -> `accepted on M4` -> `production validated` ->
`human accepted`.

The following are not substitutes for one another:

- a passing unit test for a user workflow;
- an HTTP 200 liveness response for business readiness;
- a green PR for an M4 runtime observation;
- an M4 candidate for a production deployment;
- technical events or credits for human product value.

Every closeout should name the highest state actually proved and list the next
missing state instead of saying only “done”.

### 3.4 Source text contracts have a narrow job

Source-reading or regular-expression contracts are useful for forbidden
patterns, file ownership, route registration, and stable architectural
markers. They are weak evidence for behavior. A behavior change needs a
pytest, Vitest, Playwright, or equivalent consumer assertion, especially for
authentication, tenant isolation, billing, state transitions, failure
recovery, and destructive actions.

Do not replace every source contract. Restrict it to the boundaries it can
prove and add behavior evidence for what users or operators can observe.

### 3.5 Worktree and release scope are part of correctness

A dirty checkout, stale branch, mixed task, or old M4 candidate changes what
the code means. The safe unit is one current-base slice with an explicit
rollback, not a convenient historical branch containing several plausible
fixes. A production promotion is a frozen envelope; unrelated repairs and
documentation changes belong in a separate reviewed change.

## 4. Historical Problem Ledger

This ledger preserves the original observations and the resulting disposition.
It is not a claim that every original line still exists.

### 4.1 Solo development and repository control

The solo-development review found mixed worktrees and branches, very large
modules, a high proportion of source-text tests, a large active-document set,
and too little independent user evidence. It also found that local and
production Python versions and deprecation warnings could drift even while
tests passed.

The durable response was to require a current baseline, a compact change
envelope, one active task, narrow gates, independent read-only review for
high-risk work, lifecycle-based worktree cleanup, and natural rather than
manufactured observation samples. The repository later added a read-only
maintainability inventory and three narrow anti-regression gates; it did not
adopt a whole-repository LOC cap or a mechanical test-ratio quota.

### 4.2 Formal release readiness

The release review found production business endpoints returning `500` while
liveness remained `200`, a large and non-unique promotion span, missing formal
smoke evidence, unresolved supply-chain signals, and no completed non-author
user loop. The correct conclusion was `NO-GO for GA`, followed by controlled
readiness work rather than a broad deployment.

The durable response is to distinguish liveness from business readiness,
freeze one exact candidate, validate the relevant consumer path, preserve a
real rollback, and treat paid usage, production traffic, and human acceptance
as bounded evidence rather than numbers to manufacture.

### 4.3 End-user experience

The user review found that three failure paths could show an error but no
recovery action: inactive sites, suspended sites, and rejected connector
credentials. It also found an unclear post-registration handoff, a broken
single-site support context, conflicting site/service status labels, silent
reopening of closed tickets, weak verification-code ergonomics, stale FAQ
wording, and ambiguous knowledge states.

The durable response is to design each error state with a recovery action,
make registration continue through the Addon connection path, distinguish
account/site/service ownership, make state-changing replies explicit, and
test the smallest and most failure-prone consumer paths at mobile and PC
viewports.

### 4.4 Platform administration

The administrator review found implicit payment callback origin selection,
missing final confirmation for public compliance publication, unclear
effective provider selection, hard-coded operator identity in compliance
history, mobile-wide tables hiding primary actions, non-URL-managed tabs,
unannounced model-result truncation, partial-success saves, weak batch failure
feedback, incomplete audit filters, hard-to-discover diagnostics, and native
browser confirmation dialogs.

The approved remediation split these into small changes: operator/audit
identity and filters, explicit partial-success and retry feedback, shared
confirmation and troubleshooting entry points, followed by bounded module
extraction and maintainability gates. Mobile wide-table redesign and other
lower-value navigation polish remain explicit deferrals rather than hidden
scope.

## 5. What Was Actually Delivered After the Reviews

The subsequent staged work provides the current source evidence for the
historical ledger:

| Stage | Result | Evidence state |
| --- | --- | --- |
| Repository baseline | Stale branches were archived with a recovery bundle and removed; worktree topology was reduced to the main checkout and M4 operations worktree. | merged/clean repository evidence |
| Admin core | PRs `#902`, `#903`, and `#904` merged; CI compatibility repair `#905` also merged. | merged into `master`; Admin gates passed |
| Dependency queue | `#187` and `#244` merged; malformed, stale, or non-updatable Dependabot items were closed with reasons. | no open PRs at closeout |
| Maintainability inventory | PR `#906` added advisory inventory and classified the dated-active document set without creating a second closeout index. | merged into `master` |
| Module split | PR `#907` extracted Site Compliance Admin routes from `service.py`, preserved paths/auth/audit/error contracts, and passed focused M4 API tests. | accepted on M4 |
| Preventive gates | PR `#908` added route-family, behavior-evidence, and dated-active-authority guardrails. | merged into `master`; current M4 source promotion |

At the final closeout, `origin/master` was `02091ebd`, `production` remained
`b9d6f02d`, no production deployment occurred, M4 was accepted for the current
master revision, and the worktree audit reported no manual-review items.
Those values are a dated closeout fact; recheck them before using this table
for a future release.

## 6. Reusable Operating Rules

### Rule 1 — Start from facts

Run `git status --short --branch`, read the repository entry points, fetch the
current baseline when it matters, and inspect open PRs, worktrees, M4, and
production revisions before relying on a dated record.

### Rule 2 — One problem, one slice, one owner

Write the focused module, intended outcome, non-goals, contracts, expected
files, verification, and rollback before editing. Do not combine Portal,
Admin, release, dependency, and structural refactor work because they appear
in the same historical conversation.

### Rule 3 — Trace ownership before changing the surface

For every state or action, identify whether account, membership, principal,
site, service, local WordPress, Cloud runtime, or operator audit owns the
truth. Simplify visible controls only after preserving the underlying
transition and authorization.

### Rule 4 — Design failure as a path

For each user or operator error class, define the message, owner, recovery
action, support context, retry semantics, and terminal condition. Add a
behavior test for the failure path, not only a source marker for the UI text.

### Rule 5 — Keep technical and human evidence separate

Record provider calls, credits, runs, technical sessions, M4, production, and
human-value observations separately. Collect only privacy-safe metadata and do
not manufacture paid calls, traffic, ratings, or observation samples.

### Rule 6 — Use the narrowest effective gate

Use local focused checks first. Use M4 only for the Cloud/runtime question it
can answer. Let GitHub required checks decide merge eligibility. Promote a
clean current `master` before claiming M4 acceptance. Do not repeat a broad
gate without a distinct risk question.

### Rule 7 — Review with a fresh context at risk boundaries

An implementation agent should not be the only evaluator of L2, auth,
billing, migration, runtime, module-boundary, or release-sensitive changes.
The independent reviewer is read-only and reports findings; fixes return to
the owning implementation slice.

### Rule 8 — Treat release as a frozen envelope

No unrelated code, docs, workflow, or cleanup enters a production promotion
after it starts. If a blocker appears, stop, preserve evidence, fix through a
separate reviewed path, and regenerate the candidate.

### Rule 9 — Clean by lifecycle, not appearance

An old branch, existing directory, clean status, or stale date is not deletion
authority. Confirm ownership, unique commits, open PRs, protected role,
recovery material, and current callers before removing anything.

### Rule 10 — Stop when the next evidence is external

If the next state needs a missing credential, operator authorization, paid
Provider call, production mutation, or non-author user, report that exact
missing evidence. Do not turn adjacent green checks into an inferred pass.

## 7. Current Disposition and Explicit Deferrals

The historical findings that were in scope for the remediation plan are
closed at the source/CI/M4 level documented above. The following are not
silently “fixed” by this synthesis:

- no real non-author user/value cohort has been manufactured or inferred;
- production has not been deployed by this closeout;
- Admin mobile wide-table redesign remains deferred;
- subscription name/email search remains deferred;
- collapsed-sidebar abbreviations and shortcut-copy polish remain deferred;
- broad giant-module refactoring remains deferred except for the bounded Site
  Compliance extraction pilot;
- full commercial front-office and payment/reconciliation expansion remains
  outside the current Cloud boundary.

These are deliberate scope decisions, not missing documentation. A future
task must re-open them with a current issue ledger, owner, consumer evidence,
and acceptance gate.

## 8. Recommended Next Use

When starting a new task, use this document to recover the reasoning, then
route to the active standard rather than copying this entire history into the
task prompt:

1. read the current `README.md`, `AGENTS.md`, and development validation model;
2. select the owning seam and one active boundary document;
3. create the change envelope and classify the risk tier;
4. select one consumer proof and one rollback;
5. execute the narrowest gate, then widen only when evidence requires it.

The next product decision should be driven by a real user or operator need,
not by the existence of another historical review list.

## 9. Closeout Receipt

```text
SYNTHESIS_RECEIPT
- source conversations: solo development, formal release, user experience, platform administration
- source evidence: four referenced Codex tasks plus current repository closeout history
- implementation evidence: PRs #902-#908 and current master closeout
- release evidence: no production deployment; M4 accepted for the then-current master revision
- user/human evidence: no non-author value claim made
- retained history: original task conversations remain archived evidence
- current authority: active repository standards and current source/runtime state
- rollback: this document and index entry can be reverted without runtime mutation
```
