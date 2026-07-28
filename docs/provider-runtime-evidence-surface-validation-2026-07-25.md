# Provider Runtime Evidence Surface Validation — 2026-07-25

Status: source merged through PR `#256` as
`e4fa6fdb65cd2b17a5cc846d3653360dfcd096ea` and promoted from a clean current
`master` to M4 Preview with `acceptance_state=accepted`. Production, signed
WordPress title-generation E2E, monetary benefit, and live P2
context-preflight acceptance are not claimed.

Follow-up: the signed Local WordPress title-generation external Provider E2E
and the live accepted-context preflight were subsequently closed on M4 Preview
in [WordPress Title Provider E2E And Context Preflight Validation](wordpress-title-provider-e2e-and-context-preflight-validation-2026-07-25.md).
The statements below remain the time-bounded result of this earlier cohort.
Monetary benefit remains unclaimed.

Scope: the next provider-runtime evidence phase after the accepted
Pi-inspired P0-P2 compatibility work. This record covers an internal read-only
evidence surface, accepted-context scalar propagation, cache-affinity
application evidence, a bounded operator-declared metadata seam, and one
small real RuntimeService cohort.

This is not a public runtime contract, pricing policy, AI-credit change,
WordPress control-plane change, prompt or result log, provider-configuration
decision, or production approval.

## Outcome

The merged source resolves the observability gap without importing Pi's agent
architecture or adding a second runtime:

- `GET /internal/service/runtime/provider-evidence/summary` aggregates existing
  provider-call and usage-meter rows;
- the response is internal-only, read-only, filterable, capped at `10,000`
  provider-call rows, and reports truncation;
- it contains scalar usage, latency, error, fallback, cache, cost-mode, and
  context-preflight evidence, but no prompt, result, credential, or cache key;
- OpenAI-compatible execution records whether prompt-cache affinity was
  actually applied;
- accepted context-budget assessments now reach usage evidence just as rejected
  assessments already did;
- connection config may provide a bounded, sanitized
  `model_metadata_overrides` map for context and token prices;
- no metadata override was applied to the `mqzj` gateway because no
  authoritative gateway declaration was available.

The real candidate cohort completed `8 / 8` RuntimeService calls successfully
against `openai/gpt-5.5`. The internal evidence route returned HTTP `200` and
reported:

- metering completeness: `100%`;
- input-token detail coverage: `100%`;
- cache-affinity applied: `8 / 8`;
- cache-read observed: `6 / 8`;
- cache-read ratio: `57.485%`;
- errors: `0`;
- fallbacks: `0`;
- p50 latency: `2,855 ms`;
- p95 latency: `3,252 ms`;
- cost mode: `unpriced`;
- context preflight: not observed because `context_window=0`.

The engineering decision is to retain the evidence surface and cache-affinity
mechanism, make no monetary claim, leave live P2 pending authoritative context
metadata, and make no breakpoint, fallback, streaming, or billing-policy
tuning from this small cohort.

## Change Envelope

- Repository: `npcink-ai-cloud` only.
- Focused module: provider runtime execution evidence and internal diagnostics.
- Public contract: unchanged.
- Internal contract: additive `m1` evidence-summary route.
- Database migration: none.
- Frontend: unchanged.
- WordPress Ability, prompt, preset, workflow, approval, review, and write
  truth: unchanged.
- Provider credentials and configuration values: not recorded in this
  evidence.
- New infrastructure, sidecar, queue, scheduler, and agent loop: none.
- Rollback: revert the focused source and evidence commits; no data migration
  rollback is required.

## Before And After

The before cohort and after cohort answer different questions:

- before: accepted M4 provider-adapter-edge compatibility and cache behavior;
- after: candidate M4 full RuntimeService persistence and internal evidence
  projection.

Their latency and cache ratios are observational, not a randomized
same-payload causal benchmark.

| Evidence | Before: accepted provider edge | After: RuntimeService candidate | Interpretation |
| --- | ---: | ---: | --- |
| Source | `26c1478f` containing PR `#243` | `66e2f4b7` in Draft PR `#256` | Different delivery states remain explicit |
| Calls | `20 / 20` succeeded | `8 / 8` succeeded | Runtime-path sample added without repeating a large cohort |
| Persistent metering completeness | Not measured through RuntimeService | `8 / 8`, `100%` | New evidence gap closed |
| Cache-affinity applied evidence | Mechanism exercised, no persisted applied flag | `8 / 8` | Actual application is now queryable |
| Cache-read records | `19 / 20` | `6 / 8` | Both cohorts observed real cache reads |
| Cache-read ratio | `86.18%` | `57.485%` | Both exceed the provisional `20%` usefulness threshold; ratios are not directly comparable |
| First-call latency | `3,461 ms` | `3,252 ms` | Descriptive only |
| Warm/overall p50 | warm median `3,070 ms` | overall p50 `2,855 ms` | Descriptive only; no causal speedup claim |
| Overall p95 | `5,481 ms` | `3,252 ms` | Observed `2,229 ms` lower, but sample and path differ |
| Error rate | `0%` | `0%` | No observed regression |
| Fallback rate | `0%` | `0%` | No observed regression |
| Monetary evidence | Blocked: unpriced model | Blocked: missing explicit cache rates | No savings claim |
| Live context preflight | Blocked: `context_window=0` | Blocked: `context_window=0` | Metadata seam exists; no guessed value was installed |
| Prompt/result privacy | Scalar and hashes only | `no_store`; scalar evidence response only | Boundary preserved |

## Runtime Cohort

The M4 candidate used:

- source revision `66e2f4b7b2987df164dac4cde268a9aedc7c2b13`;
- `acceptance_state=candidate`;
- a dedicated disposable validation site;
- profile `text.free-gpt55`;
- provider/model `openai/gpt-5.5`;
- the Responses endpoint selected by existing routing;
- one non-sensitive stable instruction prefix and eight changing scene
  markers;
- `max_output_tokens=16`;
- `storage_mode=no_store`;
- fallback disabled;
- a three-consecutive-failure stop condition;
- scalar output only.

Per-call evidence:

| Call | Latency ms | Input | Output | Uncached input | Cache read | Cache write | Error |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 3,252 | 3,674 | 21 | 3,674 | 0 | 0 | none |
| 2 | 2,873 | 3,674 | 21 | 3,674 | 0 | 0 | none |
| 3 | 2,848 | 3,674 | 20 | 858 | 2,816 | 0 | none |
| 4 | 2,973 | 3,674 | 20 | 858 | 2,816 | 0 | none |
| 5 | 2,855 | 3,674 | 23 | 858 | 2,816 | 0 | none |
| 6 | 3,124 | 3,674 | 20 | 858 | 2,816 | 0 | none |
| 7 | 2,458 | 3,674 | 9 | 858 | 2,816 | 0 | none |
| 8 | 2,442 | 3,674 | 9 | 858 | 2,816 | 0 | none |
| **Total** | — | **29,392** | **143** | **12,496** | **16,896** | **0** | **0** |

The first two requests reported no cache read; requests three through eight
reported `2,816` cache-read tokens each. This confirms runtime persistence and
projection of real cache evidence. It does not prove why the provider began
reporting cache reads on the third request, or that cache caused a latency
change.

## Decision Gates

| Gate | Provisional threshold | Result | Decision |
| --- | --- | --- | --- |
| Metering completeness | `100%` | `100%` | Passed |
| Input detail coverage | `100%` | `100%` | Passed |
| Useful cache-read ratio | at least `20%` when cache is expected | `57.485%` | Passed for this lane |
| Error/fallback regression | no increase above `1` percentage point | both remained `0%` | Passed observationally |
| p95 latency guard | no degradation above `5%` | observed lower p95 | Passed observationally; not causal |
| Cache cost per success | at least `10%` improvement with trusted rates | rates absent | Blocked |
| Live P2 false rejects | `0`, with authoritative context metadata | metadata absent; false rejects not observable | Blocked |
| Rejected-call upstream usage | `0` | no live rejected calls in this cohort | Not applicable; deterministic coverage remains |

## Verification Ledger

Local clean-worktree evidence:

- contract: `766 passed`;
- domain: `658 passed, 3 skipped`;
- API: `928 passed`;
- post-rebase focused: `161 passed`;
- health/perimeter equivalent: `9 passed`;
- Ruff changed files: passed;
- mypy: `245` source files passed;
- frontend type-check and lint: passed;
- anti-drift and provider-env retirement: passed.

M4 candidate evidence:

- API, frontend, PostgreSQL, Redis, proxy, and workers healthy;
- `/` and `/health/live`: HTTP `200`;
- Alembic: `20260717_0068 (head)`;
- focused candidate suite: `171 passed`;
- domain: `658 passed, 3 skipped`;
- full contract attempt: `765 passed, 2 skipped, 1 failed`.

The one M4 full-contract failure was
`test_pytest_weight_refresh_is_reproducible_and_fail_closed`. The M4
development image does not contain GitHub CLI, so
`refresh-pytest-duration-weights.sh -- 123` returned the earlier
`[error] GitHub CLI (gh) is required` status `1` instead of reaching the
expected invalid-argument status `2`. The same contract passed in the local
clean worktree where `gh` is installed. Neither the script, Docker image, nor
that contract is changed by PR `#256`; this is retained as an environment
exception rather than hidden or fixed by expanding the provider scope.

Accepted closeout evidence:

- every required PR `#256` check passed, including backend-targeted, CodeQL,
  dependency audit, secret scan, frontend, scope classification, PR-body
  contract, and CI observability;
- squash merge:
  `e4fa6fdb65cd2b17a5cc846d3653360dfcd096ea`;
- `acceptance_state=accepted`;
- `promotion_pr=256`;
- `source_branch=master`;
- `source_dirty=false`;
- accepted deployment time: `2026-07-25T04:44:15Z`;
- accepted HTTP smoke: `/` and `/health/live` returned `200`;
- accepted evidence-route smoke: HTTP `200`, revision `m1`, `8` records,
  success rate `100%`, metering completeness `100%`, cache-read ratio
  `57.485%`, monetary status `blocked_missing_explicit_cache_rates`, and
  context-preflight status `not_observed`.

The accepted promotion reused the candidate runtime and frontend images
because the merged image inputs were identical. It updated the source and
acceptance ledger, reran migration and health checks, and did not repeat the
external provider cohort.

## Boundary And Stop Rule

The new internal surface is runtime-detail evidence only. It must not become:

- a public analytics API;
- a prompt, result, credential, or cache-key log;
- a WordPress Ability, workflow, approval, review, or write owner;
- an authority that guesses third-party gateway context or price metadata;
- AI-credit, entitlement, invoice, or package truth;
- a reason to enable generic streaming or import Pi's agent architecture.

This phase stops after protected source review and merge, candidate M4
evidence, the small RuntimeService cohort, and clean-master M4 accepted
promotion. Production and signed WordPress title-generation E2E remain
separate scopes.

## Related Records

- [WordPress Title Provider E2E And Context Preflight Validation](wordpress-title-provider-e2e-and-context-preflight-validation-2026-07-25.md)
- [Provider Runtime Compatibility Development Retrospective](provider-runtime-compatibility-development-retrospective-2026-07-25.md)
- [Pi-Inspired Provider Runtime Compatibility Evidence](pi-provider-runtime-compatibility-evidence-2026-07-25.md)
- [Development and Validation Operating Model](development-validation-operating-model-v1.md)
- [M4 Preview AI Development Standard](m4-preview-ai-development-standard-v1.md)
- [Cloud Content Generation Boundary](cloud-content-generation-boundary-v1.md)
