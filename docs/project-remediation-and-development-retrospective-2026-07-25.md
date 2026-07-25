# Project Remediation and Development Retrospective — 2026-07-25

Status: completed source and workflow closeout; the upstream Python image
candidate remains unresolved.

Scope: the evidence-led review, prioritization, implementation, publication,
and operational verification completed around the Python 3.14 CVE watch and
the FC/OSS image-processing readiness record, plus the current delivery status
of the P0-P2 provider-runtime compatibility recommendations.

This is an evidence record, not a new architecture decision, production
approval, GA claim, or extension of any security exception.

## Executive Summary

The useful outcome of this stage was not a broad rewrite. It was a small set of
durable corrections:

1. Convert a time-sensitive Python base-image risk from repeated manual
   observation into a repository-owned daily watch.
2. Preserve a useful FC/OSS image-processing decision record without merging
   the superseded implementation history that surrounded its original draft.
3. Prove the new watch in GitHub Actions instead of stopping at source
   completion.
4. Keep every change inside the existing Cloud boundary: Cloud remains the
   hosted runtime and evidence layer; WordPress remains the control, approval,
   and final-write owner.
5. Separate provider-compatibility source implementation from merge state,
   live acceptance, and measured product benefit.

The stage produced two merged pull requests:

- `#241`, merged as `dd203b8b`, added the Python CVE upstream watch and its
  contracts.
- `#228`, merged as `840f3f7d`, preserved and reconciled the FC/OSS readiness
  decision.

The manual workflow proof was GitHub Actions run `30139544203`, executed from
`master` revision `89a8d685`. It completed successfully and recorded
`status=waiting_for_candidate`, `python_version=3.14.6`, and
`fixed_image_claimed=false`.

Therefore the implementation and observation loop is closed, but the governed
Python findings are not resolved. No supported fixed image candidate was
observed, and the existing exception still expires on 2026-08-05.

## Starting Situation

The work began with three kinds of uncertainty that had to be separated.

### Repository and worktree uncertainty

The active checkout already contained unrelated modified and untracked files,
including draft decision records and media documentation. Another M4 worktree
also contained independent in-progress work. Treating either checkout as a
clean implementation base would have mixed ownership and made rollback
ambiguous.

The safe response was:

- inventory the worktrees first;
- preserve all pre-existing edits;
- create focused clean worktrees from the current `origin/master`;
- stage only named files;
- never use broad reset, checkout, stash, or `git add -A` cleanup.

### Source completion versus risk resolution

The repository already pinned the current official `python:3.14-alpine`
candidate. Registry inspection still reported Python 3.14.6 and the same image
index. There was no supported new candidate to repin.

Changing a digest without a real upstream candidate, removing allowlist entries
without a fresh scan, or claiming the CVEs fixed would have converted a known
risk into false evidence. The correct implementation was an observation and
fail-closed seam, not a cosmetic dependency change.

### Useful history versus current authority

The FC/OSS image-processing analysis existed with an older dirty branch whose
other contents included superseded M4 work and a stale RDS draft. Merging that
branch wholesale would have reintroduced obsolete implementation history and
duplicated current decisions.

The correct action was to salvage the single useful decision record onto a
clean current base, reconcile it with the accepted RDS PostgreSQL 18 direction,
and leave obsolete drafts outside the merge.

## P0-P2 Learning And Delivery Status

The provider-runtime recommendations were learned as bounded mechanisms, not
as permission to import the upstream product architecture. The accepted
learning boundary is:

- borrow provider error normalization, cross-provider compatibility behavior,
  context-overflow detection, prompt-cache affinity, and cache token/cost
  accounting;
- do not add `pi-ai` as a dependency, a Node sidecar, an Agent/session/tool
  platform, a second control plane, or a public-contract migration;
- keep cache identity site-scoped and derived from bounded stable inputs;
- never retain raw prompts in a cache key;
- never silently truncate, compact, or rewrite WordPress-owned input;
- keep streaming deferred until a versioned WordPress connector contract owns
  it.

The current delivery state is:

| Priority | Recommendation | Current evidence | Honest status |
| --- | --- | --- | --- |
| P0 | Build a provider compatibility corpus and normalize provider messages, usage, and errors. | Draft PR `#243` adds original Python compatibility primitives, provider-focused tests, error normalization, and cross-provider cache-usage handling. Its recorded focused suite and protected checks passed on its then-current base. | Source implemented in a draft PR; not merged into `master`. |
| P1 | Record cache read/write usage and cost evidence only after hosted text acceptance. | Draft PR `#243` adds cache-read/cache-write accounting, explicit cost-estimate modes, and a hashed site-isolated OpenAI cache-affinity key. Its comparison uses synthetic rates and explicitly claims no production savings. | Mechanism implemented; real accepted-provider cache-hit rate, latency, and cost benefit remain unverified. |
| P2 | Add token-budget and context-overflow preflight without silently rewriting prompts. | Draft PR `#243` carries known model context windows through routing, rejects known overflow before an upstream call, and may use the existing candidate fallback chain. It does not truncate or rewrite input. | Source implemented in a draft PR; not merged or live-acceptance complete. |

Grouping P0-P2 into one draft branch does not collapse their acceptance gates.
P0 and P2 still require a current-base review and protected merge. P1 still
requires a real accepted hosted-text cohort before any cache-efficiency,
latency, or savings claim.

These changes also do not close the separate WordPress title-generation E2E
proof. That proof still requires an enabled and verified Addon, a running Cloud
candidate, and a real `generate -> review -> insert -> normal save` path with
adoption evidence. Provider contracts or M4 health alone are not equivalent to
that user-facing acceptance.

## Implementation Sequence

### 1. Freeze boundaries before editing

The repository README, Cloud content boundary, task-pack retirement boundary,
Agent/Workflow metadata projection, feedback quality gate, and legacy hosted
runtime guardrails were checked first.

The resulting change envelope fixed these non-goals:

- no second WordPress control plane;
- no second ability, workflow, skill, MCP, OpenClaw, prompt, preset, or router
  truth;
- no new scheduler or workflow engine;
- no production mutation;
- no M4 control-plane change;
- no secret copying between worktrees.

### 2. Add an upstream Python image watch

Pull request `#241` added:

- [`scripts/check-python-cve-upstream.py`](../scripts/check-python-cve-upstream.py);
- [the daily GitHub Actions workflow](../.github/workflows/python-cve-upstream-watch.yml);
- [the dated upstream checkpoint](python-3-14-cve-upstream-checkpoint-2026-07-24.md);
- contract tests and release-policy checks;
- a Docker Dependabot entry for candidate discovery.

The watch:

- resolves the official OCI image index;
- compares the registry digest with the repository pin;
- inspects the image-reported Python version;
- records Linux/AMD64 and Linux/ARM64 manifest digests;
- returns `waiting_for_candidate` only while the candidate is unchanged and
  the exception has not expired;
- fails visibly when a candidate changes or the exception expires;
- never claims that an unchanged image is fixed.

The branch had to be rebased because `master` advanced while the PR was open.
The rebase was followed by an exact `--force-with-lease`, not an unrestricted
force push. Required checks passed before protected auto-merge.

### 3. Reconcile the FC/OSS readiness record

Pull request `#228` preserved
[Image Processing FC/OSS Readiness — 2026-07-20](image-processing-fc-oss-readiness-2026-07-20.md)
and linked it from the README and
[Media Derivative Operations Runbook](media-derivative-operations-runbook-v1.md).

The record intentionally:

- keeps host, workload, console, and price observations date-bounded;
- treats repository contracts and current ADRs as higher authority;
- points to ADR-022 for the accepted external RDS PostgreSQL 18 direction;
- does not authorize FC, OSS, direct object upload, semantic moderation, or
  production migration;
- preserves PostgreSQL run truth, the `ArtifactStore` seam, signed delivery,
  transfer-only ACK semantics, and local WordPress write ownership.

Rebasing the old documentation commit produced one expected README list
conflict. The resolution retained all newer M4 references and added only the
FC/OSS entry. No stale RDS draft or superseded M4 implementation was imported.

### 4. Prove the workflow operationally

Source merge was not treated as operational completion. After `#241` reached
`master`, the workflow was confirmed active and manually dispatched once.

Run `30139544203` completed successfully:

- checkout passed;
- official-image inspection passed;
- the evidence summary was recorded;
- the final result remained `waiting_for_candidate`;
- Python remained 3.14.6;
- `fixed_image_claimed` remained false.

The daily schedule remains `15 1 * * *` (01:15 UTC). The manual run proved the
workflow path; future scheduled runs supply continuing evidence.

## Verification Model

Verification was proportional to the touched seam.

### Python watch batch

The implementation used focused contract tests, Ruff, Mypy, the release-policy
gate, live registry observation, protected GitHub checks, and a real
`workflow_dispatch` run.

The important distinction was:

- unit and contract tests proved behavior;
- registry inspection proved the candidate state at a point in time;
- GitHub Actions proved the automation path;
- none of them proved that the current Python image was vulnerability-free.

### Documentation batch

The documentation batch verified:

- repository-relative Markdown links;
- referenced repository paths and package commands;
- the dated Alibaba Cloud reference URLs;
- staged-diff formatting;
- staged-diff secret scanning;
- protected PR checks.

A local `check:fast` attempt stopped before tests because the isolated worktree
did not contain the developer's private `.env`. That was reported as a missing
local prerequisite, not as a passing test and not as a source regression.
Secrets were not copied merely to make a checkbox green. The remote
documentation-classified CI completed successfully.

## What Worked

### Facts before recommendations

The process inspected repository contracts, Git history, PR state, registry
state, worktree dirtiness, branch protection, and workflow execution before
changing anything. This prevented advice based on an old branch or mutable tag
name from becoming implementation truth.

### One contradiction at a time

The immediate contradiction was not "how to redesign the whole project." It
was:

- a risk exception had a deadline;
- no supported fixed candidate existed;
- manual observation was not durable enough.

The minimum useful resolution was a fail-closed watch. FC/OSS documentation was
handled later as a separate module.

### One module per session

Security observation and architecture-history reconciliation were kept in
separate focused batches. That reduced conflict scope, made validation
proportional, and allowed each PR to explain one reason for change.

### Current authority over historical completeness

Historical material was not merged merely because it contained useful text.
The useful record was extracted and reconciled against current ADRs. Current
code, contracts, accepted ADRs, and protected `master` remained authoritative.

### Evidence states stayed separate

The work consistently distinguished:

- written source;
- local checks;
- pushed branch;
- protected PR checks;
- merged `master`;
- operational workflow proof;
- actual upstream vulnerability resolution;
- production or GA authorization.

This prevented a successful automation run from being misreported as a fixed
base image.

## What Failed or Needed Correction

### A stale branch could not be merged directly

Both focused branches had fallen behind `master`. The correct recovery was to
rebase each small change, resolve only the observed conflict, rerun gates, and
push with an exact lease.

Reusable rule: do not merge a stale feature branch just to rescue one useful
document. Replay the smallest intentional commit onto the current base.

### Local full checks were not always meaningful

The isolated docs worktree lacked `.env`, so Compose stopped before executing
`check:fast`. Copying a private environment into an ephemeral worktree would
have increased secret exposure without adding useful documentation evidence.

Reusable rule: report prerequisites and non-execution precisely. Use the
narrowest meaningful local gate and let protected CI provide the repository
environment where appropriate.

### A configured schedule was not yet operational proof

After merge, the workflow existed and was active, but no run record existed
yet. A manual dispatch closed that gap.

Reusable rule: for new automation, verify configuration, activation, one real
run, recorded evidence, and expected failure semantics. Source presence alone
is incomplete.

### Dirty worktree cleanup remained intentionally deferred

The original checkout still contains pre-existing drafts and overlapping files.
They were neither deleted nor silently marked obsolete in this stage.

Reusable rule: preserving user work is more important than making every local
checkout visually clean. Cleanup requires a separate inventory and explicit
decision.

## Reusable Development Method

Use the following loop for similar work:

1. **Inventory**
   - inspect branch, worktrees, uncommitted files, remote base, open PRs, and
     current runtime evidence;
   - identify source truth, runtime truth, and human acceptance separately.
2. **State the contradiction**
   - describe the most important gap in one sentence;
   - distinguish unavailable external prerequisites from local defects.
3. **Write a compact change envelope**
   - target module;
   - intended change;
   - explicit non-goals;
   - public contracts;
   - files allowed and forbidden;
   - gates;
   - rollback.
4. **Choose the smallest closed loop**
   - prefer a watch, gate, adapter, decision record, or focused fix over broad
     platform expansion;
   - stay inside `FastAPI + PostgreSQL + Redis + worker + Docker Compose`
     unless a separately accepted decision proves otherwise.
5. **Implement in a clean worktree**
   - branch from current `origin/master`;
   - preserve dirty checkouts;
   - stage named files only.
6. **Validate by risk**
   - documentation: links, references, sensitive data, formatting;
   - contracts: focused tests and static checks;
   - automation: a real run and recorded evidence;
   - release: exact artifact, scan, replay, and human gate.
7. **Publish through protected Git**
   - rebase when the base advances;
   - use exact `--force-with-lease` when rewriting a reviewed branch;
   - require protected checks;
   - verify the remote merge commit.
8. **Stop honestly**
   - record what is complete;
   - record what remains external or human-gated;
   - do not continue adding features after the contradiction is resolved.

## Current Remaining Work

There is no immediate code change justified by the current evidence.

The Python watch should continue daily. When it reports a changed candidate:

1. inspect the new official index and both required platform manifests;
2. confirm the image-reported Python version;
3. repin the exact digest;
4. rebuild the exact release images for the required architectures;
5. run fresh vulnerability scans;
6. rerun release-policy, exact-bundle, and replay gates;
7. remove only findings proven fixed;
8. publish the change through a focused protected PR.

If no supported candidate exists when the exception expires on 2026-08-05,
controlled production validation must stop and a new explicit risk decision is
required. The watch must not renew the exception automatically.

The original dirty checkout may be reconciled later, but only as a separate
cleanup batch that inventories each draft against current `master`. It is not a
blocker for the merged source or the active watch.

The provider-runtime compatibility draft should be handled as a separate code
module:

1. rebase PR `#243` onto the current `origin/master`;
2. review the combined P0-P2 diff against the original staged acceptance
   boundaries;
3. rerun focused compatibility, routing, provider, static, anti-drift, and
   protected PR gates;
4. merge only if P0/P2 remain bounded and no prompt, session, tool, workflow,
   or control-plane ownership moved;
5. treat P1 after merge as an observation phase, using a real accepted hosted
   text cohort to compare cache-hit rate, latency, tokens, and cost;
6. retain a no-benefit outcome as valid evidence and do not tune billing or
   advertise savings without measured results.

Streaming remains deferred. It requires a separately versioned connector
contract and must not be slipped into the compatibility merge.

## Boundary Closeout

This stage changed no product ownership:

- local WordPress/plugin code remains the only control plane and final-write
  owner;
- Cloud remains hosted runtime, service detail, diagnostics, and evidence;
- Redis, callbacks, queues, workflow metadata, and GitHub Actions remain
  signals or projections, not canonical WordPress or runtime truth;
- no new infrastructure, registry, scheduler truth, workflow engine, or
  Cloud-side CMS write path was introduced.

The stage is complete when measured as source, protected merge, and automation
proof. The upstream Python remediation remains an observed dependency, not a
completed fix.

## Related Records

- [Python 3.14 CVE Upstream Checkpoint — 2026-07-24](python-3-14-cve-upstream-checkpoint-2026-07-24.md)
- [Python 3.14.6 Controlled Production Validation Risk Decision — 2026-07-21](python-3-14-6-controlled-production-validation-risk-decision-2026-07-21.md)
- [Cloud Production Release Policy](cloud-production-release-policy-v1.md)
- [Image Processing FC/OSS Readiness — 2026-07-20](image-processing-fc-oss-readiness-2026-07-20.md)
- [Media Derivative Operations Runbook](media-derivative-operations-runbook-v1.md)
- [Cloud Content Generation Boundary](cloud-content-generation-boundary-v1.md)
