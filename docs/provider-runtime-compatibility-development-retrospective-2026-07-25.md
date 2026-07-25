# Provider Runtime Compatibility Development Retrospective — 2026-07-25

Status: stage closed for source, protected merge, accepted M4 provider-edge
execution, and real cache evidence; production is unchanged.

Scope: the assessment, boundary decisions, implementation, review, M4
acceptance, real `gpt-5.5` provider cohort, and follow-up decomposition for the
P0-P2 provider-runtime compatibility work inspired by
`earendil-works/pi`.

This is a development retrospective and handoff record. It is not a new public
runtime contract, production approval, GA claim, pricing decision, WordPress
write authorization, or permission to import Pi's agent architecture.

## Executive Summary

The useful lesson from the upstream project was not "replace the current
runtime with Pi." The useful lesson was to strengthen the provider edge while
preserving the existing product boundary:

1. normalize provider-specific usage and errors before they reach runtime and
   commercial consumers;
2. make prompt-cache affinity deterministic, site-isolated, and prompt-free;
3. expose cache-read, cache-write, uncached-input, reasoning, and cost-estimate
   evidence without changing AI-credit policy;
4. reject a known context overflow before an upstream call, without rewriting
   WordPress-owned input;
5. defer streaming until a versioned WordPress operation contract owns the
   transport and terminal-usage semantics.

The implementation merged through PR `#243` as `ed5ddf6a`. A clean current
`master` was promoted to M4 Preview, and the accepted development runtime ran a
bounded twenty-call cohort against the configured external
`mqzj/openai -> gpt-5.5` Responses instance.

The cohort produced real evidence:

- `20 / 20` successful calls;
- `20 / 20` exact output-contract matches;
- `84,660` input tokens;
- `11,700` uncached input tokens;
- `72,960` cache-read tokens;
- `0` cache-write tokens;
- `86.18%` observed cache-hit ratio;
- `3,461 ms` first-call latency;
- `3,070 ms` warm-call median latency;
- `5,481 ms` overall p95 latency.

The evidence closeout merged through PR `#252` as `3133be02`. It deliberately
does not claim monetary savings because the model catalog was unpriced, and it
does not claim real P2 completion because the catalog reported
`context_window=0`.

The honest stage result is:

- P0 real-provider execution and normalization: passed;
- P1 cache affinity and cache-usage evidence: passed;
- P1 monetary benefit: pending trusted price metadata;
- P2 deterministic behavior: passed;
- P2 real-provider preflight: pending trusted context metadata;
- signed WordPress title-generation external-provider E2E: pending separate
  scope.

## Historical Sequence

### 1. Begin with assessment, not dependency adoption

The initial question was what could be learned from the upstream project and
which recommendations were valuable for the current Cloud repository.

The assessment separated mechanisms from product architecture:

| Upstream idea | Decision |
| --- | --- |
| Provider-neutral error and usage normalization | Adopt as original Python code at the existing provider edge |
| Cache-read and cache-write accounting | Adopt as additive evidence |
| Stable prompt-cache affinity | Adopt with site-isolated hashed identity and no raw prompt retention |
| Context-overflow recognition and token estimation | Adopt as conservative preflight |
| Agent loop, sessions, compaction, tool registry, orchestration | Reject for this scope |
| Node sidecar or direct `pi-ai` dependency | Reject |
| Generic streaming protocol | Defer pending a versioned WordPress contract |

This distinction prevented a useful compatibility improvement from becoming a
second runtime product or control plane.

### 2. Freeze P0-P2 acceptance boundaries

The work was staged conceptually even though the final source landed in one
focused PR:

- P0 owned the compatibility corpus, normalized usage, and normalized error
  taxonomy;
- P1 owned cache affinity, cache-token evidence, and explicit cost-estimate
  modes, but not billing-policy changes or benefit claims;
- P2 owned known-context preflight and fallback behavior, but not prompt
  truncation, summarization, rewriting, or compaction.

Grouping source changes did not collapse their acceptance gates. P0 could pass
on real execution, P1 could pass cache evidence while monetary evidence
remained pending, and P2 could pass deterministic tests while live acceptance
remained blocked by missing metadata.

### 3. Implement at the provider and routing seams

PR `#243` changed the existing Python seams instead of adding infrastructure:

- provider compatibility helpers and error normalization;
- OpenAI and Anthropic usage normalization;
- prompt-cache affinity with compatibility retry;
- additive provider result and usage-meter evidence;
- routing propagation for context and cache-price metadata;
- context-budget assessment before provider spend;
- focused provider, routing, commercial, runtime, and contract coverage.

It added no database migration, second scheduler, queue system, agent platform,
public chat protocol, or WordPress write path.

### 4. Separate candidate validation from accepted runtime

The implementation was tested on the candidate branch, reviewed against a
moving `master`, merged through protected GitHub checks, and then promoted from
a clean current `master` worktree to M4 Preview.

The accepted runtime evidence used:

- source revision `26c1478fd1d85c7556918fc05f4cc253a2155c8c`,
  which contained `ed5ddf6a`;
- `acceptance_state=accepted`;
- clean `master` source;
- healthy API, frontend, PostgreSQL, Redis, proxy, and workers;
- HTTP `/` and `/health/live` returning `200`;
- Alembic at `20260717_0068 (head)`.

This was important because a candidate that works on M4 is not the same as
reviewed source in `master`, and merged source is not the same as the revision
currently visible on M4.

### 5. Run a bounded real provider cohort

The real cohort ran at the Cloud provider-adapter edge inside the accepted M4
API container. It used:

- the configured external `openai` connection labelled `mqzj`;
- model `gpt-5.5`;
- Responses endpoint;
- profile `text.free-gpt55`;
- one non-sensitive stable validation prefix;
- twenty changing scene inputs;
- a maximum output budget of 16 tokens per request;
- a three-consecutive-failure stop condition;
- scalar metrics and hashes only.

It did not record credentials, raw prompts, or raw outputs. It did not modify
provider configuration, WordPress routing, AI-credit policy, production, or
Cloudflare.

The first request reported no cached input. Requests 2 through 20 each reported
`3,840` cache-read tokens and `393` uncached input tokens. This proved that the
cache-affinity and usage-normalization mechanisms worked with the selected
real connection and model.

The latency figures remain observational. Without a randomized, concurrent,
no-cache control, the difference between first-call and warm-call latency must
not be described as causal cache acceleration.

### 6. Close evidence through protected Git

The cohort result and its limitations were added to the compatibility evidence
record through PR `#252`.

That docs-only PR passed the protected documentation and security checks,
including PR-body validation, secret scanning, scope classification, targeted
backend checks, frontend scope checks, CI observability, and CodeQL. It merged
as `3133be02`.

The docs-only merge did not trigger another M4 deployment. The runtime code
under test was already accepted on M4; deploying a Markdown-only revision
would have added motion without new runtime evidence.

## Delivery Ledger

| Layer | Result | What it proves | What it does not prove |
| --- | --- | --- | --- |
| P0 deterministic suite | Passed | usage/error compatibility behavior is covered | real external-provider behavior |
| P0 real provider cohort | Passed | selected external provider and model executed successfully with normalized evidence | WordPress user-facing E2E |
| P1 cache affinity | Passed | stable site-isolated hashed key is generated | every provider/model will support it |
| P1 cache evidence | Passed | selected cohort reported real cache-read tokens | monetary savings or causal latency improvement |
| P1 cost mode | Correctly `unpriced` | missing price metadata fails honestly | free usage or zero upstream billing |
| P2 deterministic preflight | Passed | known context limits reject before provider spend | selected live model has trustworthy context metadata |
| P2 live preflight | Pending metadata | no false live claim was made | operational completion |
| WordPress title E2E | Pending separate scope | boundary remains explicit | user adoption or final save behavior |
| Production | Not changed | development scope was preserved | production readiness or GA |

## Architecture And Product Lessons

### Borrow mechanisms, not ownership

An upstream project can contain good low-level ideas and an unsuitable product
shape at the same time. Evaluate each mechanism against the current ownership
boundary instead of importing the upstream architecture as a package.

For this project:

- WordPress owns Ability, prompt/preset, approval, preflight, review, and final
  write truth;
- the Addon signs and transports the bounded operation contract;
- Cloud routes, executes, normalizes, meters, and reports runtime evidence;
- M4 supplies disposable development runtime evidence;
- GitHub `master` remains reviewed source truth.

### Normalize once at the provider edge

Provider-specific field shapes should be converted into one internal model
before routing, commercial, usage, or diagnostics consumers see them. This
reduces repeated conditionals and makes tests comparable across providers.

The normalized model must preserve enough detail to avoid false accounting:

- total input;
- uncached input;
- cache read;
- cache write;
- output;
- reasoning;
- cost-estimate mode.

### Evidence fields are not pricing policy

Recording cache-read tokens does not authorize a cache discount. Calculating a
runtime estimate does not change AI credits, entitlement, invoice, or package
truth. Technical evidence and commercial policy must evolve through separate
decisions and tests.

### Metadata quality can be the actual blocker

The P2 algorithm existed and passed deterministic tests, but
`context_window=0` prevented honest real-provider acceptance. Similarly,
missing price metadata required `cost_estimate_mode=unpriced`.

The correct response to missing metadata is not to infer values from a model
name. It is to identify an authoritative source, define ownership and
effective time, or remain explicitly pending.

### A no-benefit result is valid

A real cohort may show zero cache hits, no meaningful latency change, or no
economic benefit. That is a valid result if the instrumentation and cohort are
sound. Acceptance must reward truthful observation rather than force a positive
product narrative.

### Streaming is a contract change, not an adapter toggle

Streaming affects event types, ordering, reconnect, replay, cancellation,
backpressure, terminal usage, error projection, and WordPress consumption.
Enabling upstream SSE without a versioned downstream contract would break the
existing completion and evidence model.

## Development Method

The reusable loop is:

1. **Inventory current truth**
   - inspect the worktree, current `origin/master`, contracts, runtime state,
     provider configuration shape, and existing evidence;
   - distinguish current facts from historical notes.
2. **State one contradiction**
   - examples: provider fields are incompatible; cache evidence is discarded;
     known overflow spends an upstream call; metadata is missing.
3. **Freeze a change envelope**
   - record owner, files, contracts, non-goals, gates, rollback, and external
     systems that must remain unchanged.
4. **Choose the narrowest owning seam**
   - prefer provider-edge normalization, routing metadata, a focused gate, or a
     decision record over a new platform or dependency.
5. **Build deterministic evidence first**
   - capture provider variants, negative cases, fallback behavior, accounting,
     and privacy constraints in tests.
6. **Publish a candidate through protected Git**
   - preserve dirty work with a clean worktree;
   - stage exact files;
   - let required checks decide merge eligibility.
7. **Promote accepted source to M4**
   - bind evidence to clean current `master`, the merged PR, and the deployed
     revision.
8. **Run a bounded real cohort**
   - cap calls and output;
   - define stop conditions;
   - retain scalar evidence only;
   - treat failure or no benefit as acceptable findings.
9. **Separate conclusions**
   - source correctness;
   - runtime behavior;
   - measured provider benefit;
   - WordPress user flow;
   - production;
   - human acceptance.
10. **Stop when the current contradiction is resolved**
    - record remaining work as independent scopes rather than silently
      expanding the session.

## Work Review Report

### Original goals

- assess which upstream provider-runtime ideas were valuable;
- apply the valuable P0-P2 mechanisms without moving product ownership;
- validate the implementation proportionally;
- run a real accepted-provider cohort;
- preserve the history and hand off the remaining work honestly.

### Completion

- [x] P0 compatibility implementation merged and real-provider execution
  passed.
- [x] P1 cache affinity and real cache-token evidence passed.
- [x] P2 deterministic preflight behavior merged and tested.
- [x] M4 accepted deployment and focused runtime tests passed.
- [x] Real cohort evidence was documented and merged.
- [x] Production and WordPress control-plane boundaries remained unchanged.
- [ ] P1 monetary benefit remains pending trusted price metadata.
- [ ] P2 live acceptance remains pending trusted context metadata.
- [ ] WordPress title-generation external-provider E2E remains a separate
  user-flow task.

### Problems found

| Severity | Specific problem | Root cause | Improvement |
| --- | --- | --- | --- |
| Must correct | The earlier project retrospective still described PR `#243` as an unmerged draft after it had merged and completed a real cohort. | A time-sensitive delivery state was embedded in a broader retrospective and was not reconciled during the later closeout. | Update the stale status in the same focused documentation PR and link to this current closeout record. |
| Should correct | A provider-adapter cohort can be misread as WordPress title-generation E2E. | Provider execution, signed connector transport, local review, and final save are different acceptance layers. | Label the cohort as provider-edge evidence everywhere and keep the WordPress flow as an independent milestone. |
| Should correct | `cost=0` could be misread as free execution. | The selected model was unpriced, so zero was an absence of estimate rather than proof of zero upstream billing. | Always pair the numeric field with `cost_estimate_mode=unpriced` and prohibit savings claims until trusted rates exist. |
| Suggested improvement | First-call and warm-call latency invite a causal cache narrative. | The cohort was observational and had no randomized no-cache control. | Report latency descriptively; require a controlled comparison before claiming causality. |
| Suggested improvement | P0-P2 source landed together even though their live gates differ. | The implementation seams overlap, while acceptance depends on different external evidence. | Keep one focused source PR when coherent, but maintain separate acceptance rows and follow-up scopes. |

### What worked well

- the work began read-only and boundary-first;
- the implementation borrowed narrow mechanisms instead of importing a second
  runtime architecture;
- user dirty work was preserved through clean worktrees and exact staging;
- candidate, merge, accepted M4, cohort, production, and user E2E states stayed
  distinct;
- the real cohort had a call cap, failure stop condition, short output budget,
  and prompt/output privacy constraints;
- the final evidence retained negative conclusions instead of manufacturing a
  benefit claim.

### Next focus

1. Close the signed WordPress title-generation external-provider E2E using a
   disposable local connection and local review/write ownership.
2. Establish an authoritative `context_window` metadata source, then run P2
   real-provider acceptance.
3. Establish trusted dated price metadata, then calculate observed cache
   economics without changing AI-credit policy.
4. Continue to defer streaming until the versioned connector contract exists.

For a future session, provide this document and
[Pi-Inspired Provider Runtime Compatibility Evidence](pi-provider-runtime-compatibility-evidence-2026-07-25.md)
as the starting context, then revalidate all runtime and Provider facts before
acting.

## Stop Rule

This stage should stop here. The current provider compatibility contradiction
is resolved at source and real cache-evidence level. The remaining items have
different owners, prerequisites, and acceptance gates and should proceed as
three independent tasks.

Do not expand this closeout into:

- production deployment;
- WordPress routing changes;
- guessed model metadata;
- billing-policy changes;
- a new Provider platform;
- generic streaming;
- prompt, preset, Ability, workflow, or write ownership in Cloud.

## Related Records

- [Provider Runtime Evidence Surface Validation](provider-runtime-evidence-surface-validation-2026-07-25.md)
- [Pi-Inspired Provider Runtime Compatibility Evidence](pi-provider-runtime-compatibility-evidence-2026-07-25.md)
- [Project Remediation and Development Retrospective](project-remediation-and-development-retrospective-2026-07-25.md)
- [Text Model Provider Integration Decision](text-model-provider-integration-decision-2026-07-11.md)
- [Development and Validation Operating Model](development-validation-operating-model-v1.md)
- [M4 Preview AI Development Standard](m4-preview-ai-development-standard-v1.md)
- [Cloud Content Generation Boundary](cloud-content-generation-boundary-v1.md)
