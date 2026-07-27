# ADR-032: Defer Provider Credential Delegation And Text Streaming

## Status

Accepted.

## Date

2026-07-27.

## Context

The hosted text path currently keeps provider credentials, provider execution,
routing, fallback, usage metering, credit accounting, health evidence, and
diagnostics inside Npcink AI Cloud. WordPress owns the Ability, prompt and
preset truth, review, approval, preflight, and final write.

Two possible latency and capacity optimizations were considered:

1. after a user starts an AI request, return a one-time provider credential
   plus prompts and background context so the caller can invoke a provider such
   as DeepSeek directly;
2. keep provider execution in Cloud, but expose a versioned SSE or equivalent
   incremental text response so WordPress can display output before the model
   finishes.

The first shape appears to remove a Cloud network hop, but it does not remove
model execution. It replaces the existing caller-to-Cloud-to-provider path with
one Cloud credential/context exchange followed by a caller-to-provider request.
It also moves upstream credential exposure, provider compatibility, retry,
fallback, usage reconciliation, abuse control, and failure diagnosis to the
caller.

At the time of this decision, the checked DeepSeek public text API described
ordinary bearer API keys and account-level concurrency. No evidence was found
for a general text-generation credential that is simultaneously single-use,
short-lived, model-scoped, token-bounded, and safe for an untrusted browser.
Provider capabilities are time-sensitive and must be checked again before any
future design relies on them.

The second shape can improve time to first visible text, but it is not a
Cloud-only switch:

- `POST /v1/runtime/execute` currently returns a terminal JSON envelope;
- provider execution currently normalizes a terminal provider result before
  recording final usage and run state;
- the Cloud Addon rejects generic `stream` input and uses a bounded JSON
  request/response transport;
- the WordPress AI connector returns a terminal `GenerativeAiResult`;
- an end-to-end implementation must define partial-output, disconnect,
  buffering, fallback, idempotency, metering, and final-result semantics across
  Cloud, Addon, reverse proxy, WordPress, and the actual editor surface.

The repository focus lock is to prove and observe the hosted text loop through
the normal runtime and Toolbox path. There is not yet representative evidence
that waiting for a terminal response is a material user problem, that users
cancel or repeat requests because no partial text is visible, or that
incremental delivery would improve outcomes enough to repay the cross-repository
complexity.

## Decision

Keep Cloud-hosted provider execution and the current terminal JSON runtime path
as the default.

Do not:

- return platform-owned provider credentials to WordPress, browsers, third-party
  callers, or customer-controlled runtimes;
- create or rotate an upstream provider API key per user request;
- describe an ordinary provider API key as one-time merely because Cloud plans
  to revoke it after use;
- return hidden provider configuration, internal routing policy, or Cloud-owned
  prompt/context material as a client-side provider bundle;
- add a generic provider passthrough endpoint;
- add a public text-streaming contract, SSE endpoint, stream ticket, Addon
  relay, or editor streaming surface in the current phase.

Provider credentials remain encrypted Cloud service-plane configuration.
Provider calls continue through the existing hosted runtime so
`provider_call_records`, `usage_meter_events`, credit entries, health,
fallback, and error evidence remain coherent.

Streaming remains a conditional optimization, not an approved implementation
milestone. This ADR intentionally does not reserve endpoint names, media types,
event names, database states, or public schemas for a future streaming
contract. A future implementation must define those details from fresh
consumer and provider evidence instead of treating exploratory discussion as a
compatibility commitment.

## Reopen Conditions

Reopen text streaming only when all of the following evidence exists:

1. a representative cohort identifies the exact user-facing task where waiting
   is harmful; short title, excerpt, or metadata generation alone is not enough;
2. current-path measurements include provider time, total wall time, p50 and
   p95 latency, failures, cancellations, and repeated requests;
3. evidence shows that incremental visibility, rather than model quality,
   network placement, context size, provider selection, or unclear UI state, is
   the important unmet need;
4. the actual WordPress consumer has a bounded suggestion-only preview capable
   of rendering increments without mutating post content;
5. an internal fake-provider prototype has a success threshold defined before
   the run and demonstrates a material time-to-first-visible-text improvement
   without worse completion latency, error rate, or ledger reconciliation;
6. Cloud, Addon, proxy, and WordPress owners accept the implementation and
   maintenance cost.

Use a 30% or greater improvement in p50 time to first visible text as the
default materiality threshold unless the experiment plan records a different
product-backed threshold before testing. This is an experiment gate, not a
claim about current performance.

Reopen provider credential delegation only when the selected provider
officially supports a purpose-built client credential with independently
verified expiry, audience, endpoint, model, spend or token, and replay bounds.
Even then, delegation requires a separate security and commercial decision; a
provider feature does not automatically make it appropriate for the Npcink
hosted plan.

## Minimum Boundary If Streaming Is Reopened

A future design must preserve these rules:

- provider credentials never leave Cloud;
- WordPress remains Ability, prompt/preset, approval, preflight, and final-write
  truth;
- Cloud normalizes provider-specific streams instead of exposing raw upstream
  events as the Npcink contract;
- partial deltas are transient display data, not a stored result, adoption
  event, audit success, or WordPress write;
- only a validated terminal result may become the normal
  `cloud_connector_result` suggestion;
- retry or fallback may occur before the first visible delta, but must not
  silently splice another provider's output after a delta has reached the user;
- disconnect and partial billing evidence fail honestly instead of being
  reported as a successful zero-usage run;
- reverse-proxy buffering, compression, timeouts, backpressure, and client
  cancellation are verified in the real M4 and WordPress consumer path;
- the implementation stays within the existing FastAPI, PostgreSQL, Redis,
  worker, and Docker Compose stack and does not add another workflow or
  scheduler truth.

## Optional BYOK Boundary

A future user-owned-key mode is a separate product shape from platform
credential delegation.

If it is ever approved:

- the credential belongs to the customer and stays in a server-side local
  connector or another explicitly reviewed secret store;
- it is never injected into browser code;
- the local runtime must clearly own provider cost and availability;
- Cloud-hosted quota, fallback, billing, and provider evidence must not be
  claimed for calls Cloud did not execute;
- prompt and Ability truth remain local instead of being reconstructed as a
  Cloud prompt registry.

This ADR does not approve or schedule BYOK.

## Alternatives Considered

### Return a platform provider API key and revoke it after the request

Rejected. Revocation after exposure is not a single-use guarantee. The caller
may copy or replay the credential during the validity window, and Cloud loses
reliable request, usage, cost, and output evidence.

### Put a virtual-key gateway in front of every provider

Rejected for the current phase. A gateway can produce scoped virtual
credentials, but it remains another server-side hop and introduces another
location for credentials, quotas, aliases, retries, health, and telemetry. It
does not make the caller-to-provider path truly direct and cannot replace the
Cloud commercial ledger.

### Implement Cloud SSE immediately

Rejected for the current phase. The safe protocol is technically feasible, but
the consumer is terminal-result based and the user benefit is unmeasured.
Implementing Cloud, Addon, proxy, and editor changes before proving the need
would spend the project's complexity budget ahead of the hosted text loop.

### Improve the terminal path first

Accepted. Measure the real path, prefer the appropriate provider/model, bound
context, reuse connections where supported, prevent duplicate submissions, and
show honest request-stage status. These changes can address latency or waiting
confusion without introducing a new public protocol.

## Development Retrospective

### What Was Done Well

- The assessment traced credentials, prompts, execution, fallback, metering,
  and final writes instead of comparing only network diagrams.
- Provider documentation was checked before assuming that a normal API key
  could safely become an ephemeral browser credential.
- The proposed streaming path preserved provider secrets and local WordPress
  write authority.
- Existing dirty work was treated as unrelated and preserved.

### What Needed Correction

The first response moved too quickly from "direct provider credentials are
unsafe" to "implement a versioned Cloud streaming contract." That produced a
technically safer candidate but had not yet shown that streaming was the
current product bottleneck.

The root mistake was solution-first optimization: answering how to build the
best stream before proving why the project should own one now. The correction
is to separate three questions:

1. Is the existing experience measurably poor?
2. Is incremental visibility the cause-specific remedy?
3. Only then, what is the smallest safe contract?

### Reusable Engineering Lessons

1. **Distinguish efficiency metrics.** Total latency, time to first visible
   text, throughput, Cloud connection occupancy, and provider cost are
   different problems and must not share one vague "faster" claim.
2. **Removing a visible hop may move responsibility instead of work.** Count
   credential exchange, context transfer, retries, reconciliation, and support
   paths before claiming a simpler architecture.
3. **Trace the final consumer before designing a public API.** A provider can
   stream while the Addon, PHP API, proxy, or editor still buffers the whole
   response.
4. **Do not use prompts as security controls.** A caller that can read a prompt
   can modify it. Authorization, quotas, data handling, and write control need
   enforceable contracts.
5. **Partial output changes failure semantics.** Once text is visible, silent
   retry and fallback can mix providers or duplicate content. Streaming is a
   run-lifecycle decision, not a rendering flag.
6. **Keep canonical evidence at the execution boundary.** Usage, cost,
   entitlement, and provider health remain trustworthy when Cloud owns the
   provider call.
7. **Treat public event shapes as long-lived contracts.** Do not publish event
   names during exploration and assume they can be freely changed later.
8. **Spend complexity only against measured demand.** A fake-provider spike is
   cheaper and more reversible than a cross-repository production feature.
9. **Separate development evidence from release claims.** A protocol unit test,
   M4 stream proof, merged revision, production validation, and improved user
   outcome are independent states.

## Consequences

- The current public runtime and Addon contracts remain unchanged.
- No migration, new endpoint, provider adapter change, infrastructure, M4
  candidate action, production action, or provider spend is introduced.
- The project keeps a durable reason for rejecting future proposals that merely
  rename a platform API key as one-time.
- Future agents have explicit evidence gates and minimum boundaries if user
  behavior later justifies streaming.
- Users continue to wait for terminal results in the current WordPress AI path;
  honest stage feedback and measured terminal-path optimization remain the
  lower-cost improvement options.

## Verification And Rollback

This is a documentation-only decision. Verify Markdown links, repository
documentation classification, release-policy consistency, and protected
docs-only CI. M4 preview and production validation are not applicable.

Rollback by reverting this ADR and its README link through the normal GitHub
workflow. A rollback removes the recorded decision only; it does not change
runtime behavior because this decision introduces no implementation.

## Related Documents

- [Text Model Provider Integration Decision](../text-model-provider-integration-decision-2026-07-11.md)
- [Provider Runtime Compatibility Development Retrospective](../provider-runtime-compatibility-development-retrospective-2026-07-25.md)
- [Pi Provider Runtime Compatibility Evidence](../pi-provider-runtime-compatibility-evidence-2026-07-25.md)
- [Cloud Content Generation Boundary](../cloud-content-generation-boundary-v1.md)
- [Development And Validation Operating Model](../development-validation-operating-model-v1.md)
