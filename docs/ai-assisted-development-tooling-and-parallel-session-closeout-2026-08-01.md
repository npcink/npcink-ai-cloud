# AI-Assisted Development Tooling and Parallel Session Closeout

Status: historical closeout and operating synthesis.

Date: 2026-08-01.

Purpose: consolidate the July 2026 Codex CLI recovery, CodeGraph evaluation,
and parallel AI development lessons into one durable handoff for future human
and AI sessions.

This document records evidence and reusable reasoning. The current normative
authorities remain:

- [AGENTS.md](../AGENTS.md);
- [Development and Validation Operating Model](development-validation-operating-model-v1.md);
- [Parallel AI Collaboration Standard](parallel-ai-collaboration-standard-v1.md);
- [M4 Preview AI Development Standard](m4-preview-ai-development-standard-v1.md);
- [Production Release Policy](cloud-production-release-policy-v1.md).

If this retrospective conflicts with an active standard, follow the active
standard. This document does not authorize production changes, shared-runtime
mutation, or broader Cloud product ownership.

## 1. Closeout State

### 1.1 Local Codex CLI

The original failure was not an authentication rejection. The launcher at
`/opt/homebrew/bin/codex` existed, but its macOS ARM native executable was
missing and startup failed with `ENOENT`.

The bounded repair was:

```bash
npm install -g --prefix /opt/homebrew @openai/codex@latest
```

The July 2026 acceptance sequence proved three different facts:

1. `codex --version` proved the executable could start;
2. `codex login status` reported `Logged in using ChatGPT`;
3. an ephemeral, read-only real request returned `CODEX_LOGIN_OK`.

The third check mattered: an installed executable and a stored login state do
not prove that a real request can complete. The real smoke used a temporary
directory, read-only sandbox, ephemeral state, ignored user configuration, and
disabled nonessential plugins, apps, remote plugins, and browser use.

Current read-only recheck on 2026-08-01:

- executable: `/opt/homebrew/bin/codex`;
- version: `codex-cli 0.146.0`;
- login status: `Logged in using ChatGPT`.

No new real model request was required for this documentation-only closeout.
Version, authentication, network behavior, and product availability are
time-sensitive and must be rechecked when they matter.

### 1.2 CodeGraph

CodeGraph was evaluated as an optional local structural index, not as project
infrastructure. The evaluation found:

- strong value for Python backend call-path and impact exploration;
- weaker value for frontend URL strings, Next.js catch-all proxy chains,
  dynamic configuration, generated contracts, cross-repository seams, and
  some auth-to-test mappings;
- materially higher context cost than a simple native search for small or
  string-oriented questions.

The local configuration uses:

- executable: `/Users/muze/.local/bin/codegraph`;
- version observed on 2026-08-01: `1.5.0`;
- MCP transport: local `stdio`;
- telemetry disabled;
- daemon disabled.

`CODEGRAPH_NO_DAEMON=1` prevents a separate persistent daemon; it does not
mean that the process list should contain no CodeGraph process. Active Codex
sessions may each own a `codegraph serve --mcp` stdio child. Multiple such
session-owned children were observed during this closeout. Do not kill them as
generic cleanup or treat them as shared-runtime ownership.

The reference worktree remains detached at `658e5cf5`, while the observed
`origin/master` on 2026-08-01 was `a5e05cd2`. `codegraph status` reported its
index as up to date relative to that detached worktree, not relative to current
`master`. Therefore it is a historical reference until refreshed. A stale or
missing index is not a development blocker.

PR [#429](https://github.com/npcink/npcink-ai-cloud/pull/429) recorded the
durable boundary in `AGENTS.md` and the development operating model. CodeGraph
must remain optional, local, ignored, reversible, and absent from CI, M4,
production, release, and shared runtime environments.

### 1.3 Parallel AI development

The project moved from informal simultaneous sessions to explicit ownership
and evidence boundaries. The key operating result is not "run more agents";
it is "parallelize independent work while serializing scarce truth-changing
lanes."

The repository now uses:

- one implementation owner per conflict domain;
- one protected human merge lane;
- one shared-runtime operation owner;
- builder, integrator, and investigator roles for an operator-declared queue;
- a clean committed `local-ready` handoff from builders;
- at most two accepted ready items waiting behind the item in the merge lane;
- locked auxiliary worktrees throughout implementation, review, and merge.

PR [#443](https://github.com/npcink/npcink-ai-cloud/pull/443) is the current
role and delivery-policy reference. The parallel collaboration standard, not
this history document, owns the normative details.

## 2. Development Reasoning That Generalizes

### 2.1 Prove the real outcome, not an adjacent condition

Each gate answers one question:

| Evidence | Proves | Does not prove |
| --- | --- | --- |
| executable version | the binary starts | authentication or request success |
| login status | a login state is present | a real request can complete |
| read-only request | the selected CLI path can reach the service | repository correctness |
| CodeGraph query | the index can suggest relationships | active-worktree truth |
| local test | the changed seam passes locally | merge or runtime acceptance |
| PR checks | the pushed revision satisfies merge gates | merge or M4 promotion |
| merged `master` | reviewed integration source truth | M4 or production state |
| M4 promotion | clean merged source is accepted on M4 | production validation |
| production validation | the approved release path completed | human product acceptance |

Completion language must name the highest evidenced state instead of reducing
all states to "done."

### 2.2 Separate accelerators from authorities

Codex, CodeGraph, browser tools, M4, caches, tunnels, and CI can accelerate
discovery or provide evidence. They do not become new sources of product,
source, approval, workflow, or release truth.

Use this authority order for code work:

1. current active-worktree files and explicit product contracts;
2. Git diff and exact revision identity;
3. the narrowest relevant tests and actual consumer behavior;
4. protected CI and reviewed merge state;
5. runtime and release evidence appropriate to the requested lane.

Tool output is a lead until confirmed against the owning source and consumer.

### 2.3 Parallelize by independence, not by session count

More sessions help only when their work products can be combined without
destroying ownership or invalidating evidence. Good parallel work includes:

- read-only investigation for a named owner;
- clearly disjoint conflict domains and worktrees;
- independent review of an existing diff;
- reproduction or evidence collection that does not mutate shared state.

Serialize:

- edits to one route, service, contract, migration head, or policy domain;
- merge-ready human PRs when protected checks require a current base;
- M4 and other shared stateful validation;
- final acceptance and production decisions.

Starting more builders after the ready queue is full creates work in progress,
not throughput. Redirect spare sessions to investigation, review, reproduction,
or clearing the current bottleneck.

### 2.4 Treat dirty work as ownership evidence

A dirty checkout is not clutter to remove. It may contain user work, another
session's implementation, an untracked deliverable, or runtime-operation
evidence.

The safe response is:

1. inspect status and ownership;
2. preserve the checkout;
3. create a clean current `origin/master` worktree for unrelated work;
4. lock that auxiliary worktree immediately;
5. stage only exact task files;
6. unlock only after the documented lifecycle conditions are met.

Never use reset, stash, broad staging, global prune, or force removal merely to
make the environment look clean.

### 2.5 Choose the smallest useful feedback loop

A fast narrow check is valuable when it covers the changed seam. A full suite
is valuable when it answers an integration-risk question. Repeating a broad
gate without a new question adds latency but little evidence.

The normal sequence is:

```text
direct inspection
  -> exact local check
  -> actual consumer check when applicable
  -> protected PR checks
  -> conditional M4 candidate
  -> merged-master promotion when runtime acceptance is required
```

Documentation-only changes normally require link, formatting, scope, diff, and
protected docs CI checks. They do not require M4 by default.

### 2.6 Put guidance at the correct durability level

Use the smallest surface that future sessions will reliably read:

| Guidance type | Durable location |
| --- | --- |
| mandatory session behavior | `AGENTS.md` |
| repeatable development and validation flow | operating standard or runbook |
| expensive-to-reverse architecture decision | ADR |
| historical facts, outcomes, and lessons | dated closeout or retrospective |
| transient command output | task evidence, not permanent policy |

CodeGraph required no ADR because it is a reversible, optional local workflow
convention. The parallel ownership model belongs in a standard because it
governs repeated repository behavior.

## 3. Standard Operating Sequence

### 3.1 Start with facts

1. Run `git status --short --branch`.
2. Read `README.md`, `AGENTS.md`, the parallel collaboration standard, the
   development operating model, and the relevant product boundary.
3. Fetch `origin` when the current baseline matters.
4. Inventory worktrees, open human PRs, and available task ownership when
   another session may be active.
5. Declare role, conflict domain, branch/worktree, expected files, merge-lane
   intent, shared-runtime intent, dependencies, verification, and rollback.
6. Use and lock a clean isolated worktree when the visible checkout is dirty,
   stale, or owned by another task.

### 3.2 Investigate before selecting tools

Start with `rg`, direct files, Git history, and the owning tests. Use CodeGraph
when the question is structural and spans enough Python or TypeScript code to
justify the index. Return to native inspection for strings, dynamic routing,
generated artifacts, cross-repository behavior, and final verification.

For a CLI or environment problem, separate these questions:

1. Does the launcher resolve?
2. Does the executable start?
3. Is the expected login/configuration present?
4. Can the smallest safe real operation complete?
5. Did the check preserve repository and credential boundaries?

Repair only the failed layer. Do not reinstall, reauthenticate, or rewrite
configuration before evidence identifies that layer.

### 3.3 Implement within one conflict domain

Write a compact change envelope before editing. Keep one session accountable
for the coherent diff. Other sessions may investigate or review, but do not
silently change the same domain.

Verify the exact consumer path and run the narrowest useful gate. Inspect
status and diff before staging. Stage named files only and verify the cached
file list before committing.

### 3.4 Deliver through the correct lane

In a declared multi-session queue, a builder stops at a clean committed
`local-ready` receipt. The integrator refreshes the baseline, admits one item
to the merge lane, owns the PR and required checks, and schedules shared M4
work only when the change requires it.

In a normal single-session task, the same session may perform both roles, but
the evidence states remain separate. Use the repository PR publisher and
template; do not bypass protected checks.

### 3.5 Close out without destroying evidence

Report:

- actual files and conflict domain;
- branch, topic commit, PR, and merge commit separately;
- local, CI, M4 candidate, M4 accepted, production, and human states;
- worktree lock state and whether lifecycle conditions permit unlock;
- preserved dirty or stale work that was intentionally not changed;
- residual risks, rollback, and the next owner when work remains.

Do not delete a branch or worktree solely because it is old, pushed, or dirty.
Cleanup requires exact ownership, clean state, merged/no-unique-commit proof,
no open PR, no active use, and the repository's closeout policy.

## 4. Failure Patterns and Corrections

| Failure pattern | Correction |
| --- | --- |
| `codex` launcher exists but raises `ENOENT` | verify the missing native executable, reinstall the package at the established prefix, then prove version, login, and a minimal real request |
| login status passes but a request times out | isolate network and optional plugin/app initialization; retry a minimal read-only request before declaring authentication broken |
| CodeGraph misses a frontend route or auth path | use `rg`, direct route/proxy/config files, Git diff, and owning tests |
| CodeGraph says "up to date" on a detached reference | compare the reference SHA with current `origin/master`; status is relative to the indexed worktree |
| multiple `serve --mcp` processes appear | identify their parent sessions; stdio children are expected and must not be killed as a generic daemon cleanup |
| a new MCP server is unavailable in an existing session | start a new CLI session; do not assume dynamic registration |
| two sessions edit different files in one contract | treat them as one conflict domain and select one owner |
| an old checkout appears far behind | fetch first and compare current `origin/master`; do not turn a stale snapshot into a project conclusion |
| a PR is green | report `PR verified`; confirm merge separately |
| M4 candidate works | report candidate evidence; merge and promote clean `master` before calling it accepted |
| a worktree looks stale | inspect lock, status, unique commits, PR, process, and task ownership; age alone authorizes nothing |

## 5. Reusable Closeout Checklist

### Local tools

- [ ] executable path and version verified when relevant;
- [ ] authentication checked without printing credentials;
- [ ] a minimal real read-only request used when login proof is required;
- [ ] optional tooling remains optional and local;
- [ ] reference-index SHA compared with current source before use.

### Parallel source work

- [ ] role and conflict-domain owner declared;
- [ ] clean isolated worktree used and locked when required;
- [ ] merge lane and shared runtime have one owner;
- [ ] exact files and contracts recorded;
- [ ] builders stop at `local-ready` in a declared queue;
- [ ] ready queue limit respected.

### Verification and delivery

- [ ] narrowest useful local gate recorded;
- [ ] actual consumer checked when behavior changed;
- [ ] exact files staged and cached diff inspected;
- [ ] PR template and protected publisher used;
- [ ] CI, merge, M4, production, and human states reported separately;
- [ ] rollback and remaining risks recorded.

### Lifecycle

- [ ] original dirty work preserved;
- [ ] topic worktree remains locked while task or PR is active;
- [ ] unlock conditions verified after merge and clean closeout;
- [ ] no force cleanup, broad prune, or unsupported branch deletion performed.

## 6. Non-Goals

This closeout does not:

- make CodeGraph, Codex MCP, or any local AI tool a project dependency;
- define a second source, workflow, approval, or release control plane;
- add mutable task ownership infrastructure, background daemons, or Git hooks;
- authorize automated worktree deletion or broad repository cleanup;
- change Cloud, WordPress, M4, production, or credential ownership;
- prove that historical version numbers, login state, indexes, PRs, or runtime
  state remain current after the observation dates above.

Future sessions should reuse the principles and remeasure the facts.
