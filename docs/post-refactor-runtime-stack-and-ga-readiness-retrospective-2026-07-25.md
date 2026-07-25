# Post-Refactor Runtime Stack And GA-Readiness Retrospective — 2026-07-25

## Status

Project-history and next-stage closeout.

This record summarizes the runtime-language discussion, the completed P0-P5
refactor, Provider and WordPress validation, the development/acceptance model,
and the remaining GA-readiness work.

It is not a new production approval, GA authorization, Provider-call
authorization, legal opinion, pricing decision, or permission to expand the
Cloud control plane. Current code, accepted ADRs, protected `master`, and the
status authorities referenced below remain more authoritative than this
summary.

## Executive Summary

The project no longer has a general architecture or language-rewrite problem.
The WordPress-first P0-P5 refactor is engineering-complete, the bounded Cloud
runtime has passed deterministic load/soak evidence, and the current
WordPress-to-Cloud GPT5.5 text path has passed the development acceptance
layers required to prove its transport, routing, review, and local-write
boundary.

The current stack should remain:

- Python and FastAPI for the Cloud API, hosted runtime, Provider adapters,
  durable evidence, PostgreSQL repositories/migrations, and workers;
- Node.js and TypeScript for the Next.js public/Admin/Portal frontend and
  browser-facing BFF;
- PHP for the WordPress-local Ability, permission, review, approval, apply,
  audit, and final-write boundary;
- Go only as a future measured stateless high-concurrency sidecar;
- Rust only as a future measured CPU-heavy or memory-sensitive deterministic
  processing kernel.

No current evidence triggers a Node.js, PHP, Go, or Rust rewrite. The next
stage is security-gated real-editor value observation followed by a deliberate
GA decision.

The immediate hard gate is the controlled Python 3.14.6 CVE exception. A live
repository-owned upstream check at `2026-07-25T09:52:10Z` still reported:

- `status=waiting_for_candidate`;
- `python_version=3.14.6`;
- `fixed_image_claimed=false`;
- exception expiry `2026-08-05`.

Until that exception is resolved, do not expand production validation or start
the real-user trial. Preparation may continue, but feature growth and language
experiments remain paused.

## Current Authority And Evidence State

| Area | Current conclusion | Highest supported state |
| --- | --- | --- |
| P0-P5 WordPress-first refactor | Complete; do not reopen as a cleanup program | Engineering complete with controlled-production evidence |
| Hosted GPT5.5 Provider compatibility | Selected real Provider/model cohort passed | Merged and accepted on M4 |
| WordPress title external-Provider E2E | Review and explicit local save passed; Cloud remained suggestion-only | Local WordPress and accepted M4 development path |
| Context-window preflight | Trusted `1,050,000`-token metadata and real-route/synthetic-overflow behavior passed | Merged and accepted on M4 |
| Runtime price/cache estimate | Official list-price estimate and cache accounting passed | Merged and accepted on M4 |
| Gateway settlement price | No trustworthy invoice or tariff exists | Deliberately deferred |
| P5-B4 load/soak | Three formal baselines passed | Local engineering acceptance, not production SLO |
| Latest `master` in production | Not implied by development merges | Separate release decision required |
| Real-editor value and GA | Not proven | Pending security gate and bounded trial |

Evidence states remain distinct:

```text
source/local verified
  -> candidate validated on M4
  -> PR verified
  -> merged into master
  -> accepted on M4
  -> separately approved production validation
  -> human/external acceptance
  -> deliberate GA decision
```

No earlier state may be relabeled as a later one.

## Development History

### 1. Boundary contraction came before platform expansion

The successful refactor did not turn Cloud into a SaaS replacement for
WordPress. It removed or contracted orchestration, task-pack, prompt/preset
advisor, workflow-registry, thick Portal, and duplicate control-plane
surfaces.

The frozen ownership remains:

- WordPress owns local identity/permission, Ability and workflow truth,
  prompt/context assembly, review, approval, preflight, apply, final writes,
  and local audit;
- the Addon validates, signs, transports, and projects bounded results;
- Cloud owns hosted execution, Provider routing, usage/entitlement evidence,
  queue/runtime state, diagnostics, temporary artifacts, and signed delivery;
- Redis coordinates; PostgreSQL remains durable truth;
- M4 provides disposable integration evidence; GitHub `master` remains source
  truth.

This contraction made later text, media, Portal/Admin, security, and release
evidence comparable. Expanding platforms before closing these seams would have
multiplied ambiguity.

### 2. P0-P5 closed behavior and evidence, not every possible feature

The final refactor closure established:

- one canonical identity/site/connector model;
- the normal WordPress title, summary, and selected-text rewrite path;
- bounded streamed media artifacts with signed pull and transfer-only ACK;
- a contracted Portal/Admin service surface;
- deterministic load/soak, security, release-bundle, restore, matrix, and
  controlled-production evidence.

Completion did not authorize GA, unrestricted customer rollout, more CMS
platforms, streaming, additional media types, a workflow engine, or permanent
media storage. Those are demand-triggered future decisions.

### 3. Performance evidence did not reveal a language ceiling

P5-B4 retained one failed single-worker capacity-edge record and then accepted
three comparable two-proof-worker baselines. Each accepted baseline recorded:

- `5,113 / 5,113 / 5,113` observed/database/succeeded runs;
- `29 / 29` checks;
- zero transport failures and unexpected HTTP `5xx`;
- provider-excluded API p95 between `86.209` and `89.467 ms`;
- provider-excluded API p99 between `97.130` and `117.303 ms`;
- queue-wait p95 below the frozen `10 s` threshold;
- zero queue/runtime residue.

The high-cardinality PostgreSQL proof's highest query p95 was `4.4282 ms`,
below the `50 ms` engineering threshold.

These are not production SLOs and do not authorize two production workers.
They do show that changing implementation language is not the next
performance action. A future miss must first isolate Provider latency, network,
query shape, indexes, transaction scope, worker sizing, retries, and
configuration before opening a language prototype.

### 4. Provider compatibility borrowed mechanisms, not ownership

The useful upstream lessons were implemented as bounded Provider-edge
mechanisms:

- error and usage normalization;
- cross-provider compatibility samples;
- cache-affinity and cache token/cost evidence;
- deterministic context-overflow preflight;
- honest unknown/unpriced modes.

The project did not import `pi-ai`, a Node.js sidecar, Agent/session/tool
platform, workflow registry, or second control plane.

The accepted real `gpt-5.5` cohort completed `20 / 20` calls, recorded `72,960`
cache-read tokens and an `86.18%` observed cache-read ratio, and retained no raw
prompt, result, credential, or cache-key projection.

Context and pricing acceptance remained separate:

- official versioned model metadata plus an operator-managed runtime override
  established the `1,050,000`-token context window;
- official OpenAI list price is a labeled runtime-estimate baseline;
- it is not evidence of the `mqzj` gateway's settlement price or customer
  billing truth.

This separation prevented missing metadata from being filled with guesses and
prevented a numeric `0` from being described as free usage.

### 5. The real WordPress consumer closed the transport/control boundary

The accepted development path traced:

```text
WordPress Ability and review UI
  -> Addon validation, signing, and bounded transport
  -> Cloud hosted routing and Provider execution
  -> mqzj/openai -> gpt-5.5
  -> suggestion_only result
  -> WordPress review
  -> explicit local Save/Update
```

The title flow proved:

- the suggestion was visible before insertion;
- generation and insertion caused zero WordPress persistence writes;
- one explicit local Save/Update caused one write and one revision;
- the draft and sentinel content remained bounded;
- Cloud retained Provider/run/meter evidence but performed no WordPress write.

This closes engineering E2E for the disposable Local WordPress/M4 path. It
does not prove broad adoption, editorial quality, support cost, or real-user
value.

### 6. Development delivery became an explicit evidence pipeline

The July M4/CI remediation established:

- source-only authoring on the Mac;
- protected GitHub `master` as integration truth;
- candidate and accepted M4 states;
- private transient source relay and disposable package cache;
- focused inner-loop tests;
- required GitHub checks as merge authority;
- clean post-merge promotion from the stable operations worktree.

This fixed the historical failure mode where a runtime-only correction worked
on M4 but was not preserved in Git. It also stopped full contract/domain suites
from becoming the save-time loop.

The Provider-call ledger added one further guardrail: all worktrees of one
Cloud clone share a fail-closed local budget, and every real dispatch must
claim one call before execution. It addresses the concrete incident where an
intended maximum of `30` calls became `39`. It is development/operator tooling,
not billing, entitlement, runtime quota, or Cloud control-plane truth.

## Runtime Language Strategy

| Language | Current owner | Allowed future role | Rejected use |
| --- | --- | --- | --- |
| Python | Cloud API, runtime, Provider, repositories, migrations, workers, diagnostics | Measured bounded async/query/worker tuning | Whole-backend replacement without evidence |
| Node.js/TypeScript | Next.js frontend and browser BFF | TypeScript-only SDK or long-connection sidecar after an admission gate | Durable runtime, billing, entitlement, or WordPress governance truth |
| PHP | WordPress-local plugins and connector | Versioned contract/fixture consumers | Cloud application rewrite or shared control-plane implementation |
| Go | None in the current Cloud runtime | Stateless callback, HMAC, event, or gateway seam after repeated measured failure | Public runtime or PostgreSQL/commercial truth owner |
| Rust | None in the current Cloud runtime | Pure media/compression/parsing kernel after CPU/memory evidence | General API, repository, commercial, or worker rewrite |

### Sidecar or kernel admission gate

A Node.js, Go, or Rust candidate requires all of:

1. one named workload repeatedly misses an accepted target in comparable
   disposable local/staging evidence;
2. Provider/network, query/index, worker, retry, and configuration causes are
   excluded;
3. the smallest current-stack correction has before/after evidence;
4. the candidate owns one stateless or deterministic responsibility behind an
   existing contract;
5. PostgreSQL remains durable truth and WordPress ownership is unchanged;
6. no new queue, workflow engine, Kubernetes, service mesh, or control plane
   is required;
7. rollback is a configuration/routing return to the proven Python path;
8. the measured benefit exceeds implementation, deployment, security, and
   operations cost.

A language microbenchmark alone is insufficient.

## Principal Contradiction And Next Stage

The strategic contradiction has changed:

```text
engineering capability is proven
        versus
real-editor value is not proven
```

The immediate tactical blocker is the Python 3.14.6 CVE exception. Therefore
the ordered next stage is:

### Gate 1: Resolve the Python image exception

Continue the daily read-only upstream watch. When the first supported fixed
candidate appears:

1. pin the exact image/digest;
2. rebuild the Linux/AMD64 release bundle;
3. run a fresh container scan;
4. remove only findings proven fixed;
5. run the same-bundle double replay and release-policy checks;
6. merge through protected Git and promote accepted `master`;
7. make any production promotion a separate operator-approved release.

If no fixed candidate is available by `2026-08-05`, stop expansion and make a
new explicit risk decision. Do not silently extend the existing exception.

### Gate 2: Run one bounded real-editor observation loop

Only after Gate 1 and a separately approved trial:

- use `2-3` real editors across at least `2` independent WordPress sites;
- include title, summary, and selected-text rewrite;
- reserve at most `30` Provider calls in the shared ledger;
- claim each call immediately before dispatch;
- retain scalar IDs, timing, token, cost-mode, outcome, and reason codes only;
- retain no raw prompt, output, credential, or customer content in the trial
  record.

Observe:

- technical success, error, fallback, and latency;
- accepted as-is, accepted after editing, and rejected outcomes;
- task completion time and edit burden;
- support interventions;
- cost per accepted suggestion;
- duplicate dispatch or charge;
- WordPress writes before explicit save;
- cross-site leakage.

Safety invariants are zero tolerance:

- non-governed WordPress writes;
- cross-site data leakage;
- duplicate side effects or unexplained Provider calls;
- secret/customer-content retention in evidence;
- budget bypass or aggregate uncertainty.

The first cohort establishes a truthful baseline. Do not invent an adoption
claim before the observation exists.

### Gate 3: Make a deliberate GA decision

Record exactly one result:

- **go:** security, value, operations, support, and compliance evidence justify
  a bounded rollout;
- **modify:** value exists, but one named seam needs a bounded correction;
- **hold:** the first cohort is insufficient, so repeat at the same scale;
- **stop:** value is weak or support/risk/cost is disproportionate.

Production promotion is never an automatic consequence of merge or M4
acceptance. Public compliance, operator facts, retention enforcement, legal
review, backup, monitoring, certificate, and release operations remain
separate GA gates.

## Work Explicitly Paused

Until the security gate and first real-editor observation close, pause:

- further homepage/Admin/Portal polish beyond already-started closeout work;
- broad commercial front-office expansion;
- streaming without a versioned connector contract;
- Typecho, Z-BlogPHP, Ghost, or other CMS expansion;
- new orchestration, scheduler, queue, workflow, Agent, prompt, or registry
  platforms;
- Node.js, PHP, Go, or Rust rewrites;
- additional cache/latency optimization without material spend, latency, or
  user evidence;
- gateway settlement-price claims without a trustworthy tariff, invoice, or
  settlement record.

## Reusable Development Method

1. Read current status authority before historical plans.
2. Inventory worktrees, branches, PRs, M4 state, and production state before
   changing anything.
3. State one contradiction and one owning module.
4. Freeze boundaries, non-goals, files, gates, and rollback in a change
   envelope.
5. Build deterministic evidence before spending external calls.
6. Validate the actual consumer, not a convenient neighboring layer.
7. Keep source, candidate, PR, merge, accepted M4, production, and human
   acceptance states separate.
8. Preserve failed and no-benefit evidence instead of rerunning it away.
9. Use focused inner-loop checks and let each evidence layer answer its own
   question.
10. Stop when the bounded contradiction is resolved; do not turn a closeout
    into a new platform.

## Work Review Report

### Original goals

- decide whether Node.js, PHP, Go, or Rust should replace the Cloud backend;
- ground the answer in the actual repository rather than language preference;
- identify the real next stage after P0-P5 and Provider validation;
- preserve the conclusions as durable project history;
- close the active frontend PR through protected Git and accepted M4
  promotion;
- publish this documentation through a separate focused PR.

### Completion status

- [x] Current runtime, frontend, migrations, tests, workers, and deployment
      topology were inventoried.
- [x] Node.js, PHP, Go, Rust, and the existing Python stack were compared
      against current ownership and measured evidence.
- [x] The P0-P5 status authority, P5-B4 evidence, Provider closeouts,
      WordPress E2E, CVE decision, M4 model, and Provider-call ledger were
      reconciled.
- [x] The active homepage change was kept separate from this project-history
      document.
- [x] Homepage PR #270 passed protected checks and was merged into `master` at
      revision `3fc59bc59fb1b0a07c728238d547e28a107c2979`.
- [x] The next stage was narrowed to security gate, bounded real-editor
      observation, and deliberate GA decision.
- [ ] Post-merge accepted M4 promotion for PR #270 remains pending. At
      closeout, M4 was occupied by the newer uncommitted
      `codex/fix-dark-header` candidate (`source_dirty=true`,
      `source_dirty_paths=3`), so the older revision was not promoted over it.
- [ ] Human/external acceptance remains intentionally pending.
- [ ] The Python fixed-image candidate remains externally unavailable at the
      timestamp recorded above.

### Problems found

| Severity | Specific problem | Root cause | Correction |
| --- | --- | --- | --- |
| Must correct | An earlier local draft attempted to use `docs/decisions/021-bounded-polyglot-runtime-language-strategy.md`, but it was never committed or published; current `master` correctly uses ADR-021 for release-scoped runtime network authority. | The document was created in a dirty, branch-local context before reconciling current ADR numbering and Git truth. | Do not rewrite ADR history. Preserve the valid language analysis in this dated retrospective on a clean current-`master` branch and publish it through the repository PR contract. |
| Must correct | An initial next-stage recommendation repeated the older P5-B3/P5-B4 pending sequence even though the later status authority records P0-P5 as engineering-complete. | A historical audit was read before the newer authoritative closeout. | Always resolve the status-authority chain first; keep older audits as evidence of then-current gaps, not present status. |
| Should correct | Engineering validation accumulated faster than real-editor value evidence. | The work optimized for deterministic closure and safe boundaries, which was necessary but became the dominant activity after the architecture was already stable. | Stop structural expansion and use the next approved external-call budget only for a bounded real-editor cohort. |
| Should correct | An intended maximum of `30` real Provider calls previously became `39`. | Separate worktrees and experiments lacked one shared atomic budget. | Use the merged common-Git-dir Provider-call ledger and reconcile claims to Provider records. |
| Suggested improvement | Active worktrees and branches changed while closeout work was underway. | Multiple focused tasks legitimately shared the same clone and M4 integration runtime. | Inspect before every mutation, preserve user work, use clean task worktrees, and never delete an active relay lock without owner/process verification. |

### What worked well

- Architecture recommendations changed when current evidence contradicted the
  initial assumption.
- The WordPress/Cloud ownership boundary remained stable through every
  Provider, M4, frontend, and documentation decision.
- Failed, pending, production, and external-human states were reported
  explicitly.
- Runtime performance was measured before considering another language.
- The active dirty worktree was preserved by moving documentation into an
  independent clean worktree.
- Provider spend, secrets, production, and WordPress configuration were not
  mutated for this retrospective.

### Next-session focus

- React immediately when the upstream Python candidate changes.
- Do not start the real-editor cohort before the CVE gate and explicit trial
  approval.
- When the trial starts, use one shared ledger, one controlling clone, a
  maximum of `30` calls, and complete claim-to-Provider reconciliation.
- Treat user adoption and support burden as primary evidence; do not reopen the
  architecture merely because more abstraction is possible.
- Keep the latest `master`, accepted M4 revision, deployed production revision,
  and human acceptance state separate in every completion report.

## Rollback

This record and its README link change no runtime behavior. Revert the focused
documentation commit to remove them.

No database, API, worker, M4, production, Provider, Cloudflare, or WordPress
rollback is required.

## References

- [Runtime Stack Decision History](runtime-stack-decision-history-2026-07-09.md)
- [WordPress-first Cloud Runtime Refactor](decisions/004-wordpress-first-cloud-runtime-refactor.md)
- [P5-B4 Runtime Load/Soak Closeout](p5-b4-runtime-load-soak-closeout-2026-07-19.md)
- [Post-P5 Final Integration And Production Validation Closeout](post-p5-final-integration-and-production-validation-closeout-2026-07-22.md)
- [Provider Runtime Compatibility Development Retrospective](provider-runtime-compatibility-development-retrospective-2026-07-25.md)
- [Provider Three-Item Closeout And Development Retrospective](provider-three-item-closeout-and-development-retrospective-2026-07-25.md)
- [WordPress Title External Provider E2E Revalidation](wordpress-title-external-provider-e2e-revalidation-2026-07-25.md)
- [Provider Call Ledger And Next-Stage Deferral](provider-call-ledger-and-next-stage-deferral-2026-07-25.md)
- [Python 3.14 CVE Upstream Checkpoint](python-3-14-cve-upstream-checkpoint-2026-07-24.md)
- [Python 3.14.6 Controlled Production Validation Risk Decision](python-3-14-6-controlled-production-validation-risk-decision-2026-07-21.md)
- [Development And Validation Operating Model](development-validation-operating-model-v1.md)
- [M4 Preview AI Development Standard](m4-preview-ai-development-standard-v1.md)
- [Frontend Public And Portal Release Checklist](frontend-public-portal-release-checklist-v1.md)
