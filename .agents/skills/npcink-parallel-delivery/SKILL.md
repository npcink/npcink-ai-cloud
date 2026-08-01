---
name: npcink-parallel-delivery
description: Coordinate bounded parallel Codex agents and one integration owner for Npcink AI Cloud repository work. Use when the user explicitly invokes $npcink-parallel-delivery, asks one task to delegate independent investigation or implementation in parallel, or wants a multi-part Cloud change delivered without managing several top-level chats. Do not use for a trivial single-file edit, a simple question, or work whose parts share one unresolved contract or mutable runtime.
---

# Npcink Parallel Delivery

Keep one main task accountable for the result. Hide coordination mechanics
from the user unless ownership, risk, or a blocker needs a decision.

## Establish the delivery owner

Treat the main agent as the sole Integrator. Follow `AGENTS.md` and
`docs/parallel-ai-collaboration-standard-v1.md`, then:

1. Inspect the checkout, worktrees, open human PRs, and shared-runtime state.
2. Write one compact change envelope and identify conflict domains.
3. Keep Git staging, commits, pushes, PR publication, CI follow-up, M4
   mutation, and final acceptance in the main task.
4. Preserve dirty or peer-owned work and use one locked isolated worktree when
   implementation is authorized.

Do not ask the user to assign Builder or Integrator roles. Report only the
focused outcome, material ownership conflict, or required decision.

## Decide whether to delegate

Delegate only when at least two bounded activities can make useful progress
without competing for the same source or mutable environment. Prefer these
parallel activities:

- code-path exploration and impact mapping;
- browser, console, network, or read-only runtime evidence;
- test selection, log diagnosis, or review;
- implementation of one already-bounded conflict domain.

Stay in the main task for a narrow edit, an unresolved design decision, a
single failing seam, or work where coordination costs more than it saves.
Use at most three subagents at once.

## Select agents

- Use `npcink_explorer` for read-only source and contract mapping.
- Use `npcink_evidence` for browser, test, CI, log, and runtime evidence that
  does not mutate shared state.
- Use `npcink_worker` for one bounded implementation after ownership and
  expected files are clear.

When these project agents are unavailable in the current session, use the
closest built-in agents with the same restrictions. Give every subagent an
exact question, expected output, allowed paths, forbidden mutations, and stop
condition.

Run read-only agents in parallel. Never run two writers in the same conflict
domain. When `npcink_worker` edits, the main agent and other subagents stop
editing that domain until the worker returns.

Subagents must not stage, commit, push, publish or update a PR, request
auto-merge, operate M4, deploy, or claim acceptance. They return concise
evidence and changed-file lists to the main task.

## Integrate and verify

After subagents return:

1. Re-read the actual files and diff in the integration worktree; summaries
   are leads, not source truth.
2. Resolve contradictions before editing or accepting worker output.
3. Run the narrowest useful gate for the changed seam.
4. Use a read-only agent for an independent review when risk or change size
   justifies it; do not repeat an already equivalent review.
5. Inspect exact staged files and let only the main task commit and publish.
6. Enter the protected merge lane only when no other human PR owns it. If the
   lane is occupied, stop at a clean committed local-ready state and continue
   useful read-only work instead of polling noisily.
7. Let the main task alone schedule authorized M4 evidence after the merge
   lane and runtime owner permit it.

Do not weaken a gate to make parallel work appear faster. Separate local, CI,
merged `master`, M4 candidate, M4 accepted, production, and human acceptance.

## Communicate efficiently

Send user updates only at meaningful transitions:

- scope and delegation started;
- evidence changed the plan or exposed a blocker;
- implementation reached a coherent checkpoint;
- PR/CI/M4 state materially changed;
- final outcome.

The final response must lead with the delivered outcome, name the verification
that actually passed, and label anything not observed as `未测量`. Do not dump
internal receipts, agent transcripts, or routine polling output.

## Stop safely

Stop mutation and return to investigation when ownership is ambiguous, a peer
owns the conflict domain, the merge lane is occupied, M4 has another owner, or
the task requires a product decision that changes scope. Preserve all work and
ask the user only when the repository and available evidence cannot resolve
the decision safely.
