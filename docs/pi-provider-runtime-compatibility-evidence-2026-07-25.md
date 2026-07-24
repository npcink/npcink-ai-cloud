# Pi-Inspired Provider Runtime Compatibility Evidence — 2026-07-25

Status: validated M4 candidate; production is unchanged.

## Decision

Npcink AI Cloud adopts a bounded subset of provider-compatibility ideas from
`earendil-works/pi`:

1. normalize provider error and usage differences at the provider edge;
2. expose prompt-cache usage and cost-estimate evidence;
3. reject a known context-budget overflow before spending an upstream call;
4. keep streaming deferred until the WordPress operation contract has a
   versioned streaming surface.

Cloud does **not** adopt Pi's agent loop, session orchestration, tool registry,
compaction behavior, or runtime ownership model. WordPress remains the source
of truth for abilities, workflows, approval, preflight, audit, and writes.

## Evidence Sources

The upstream implementation was reviewed at Pi revision
[`a9f5b1c123a4f13457e88522a3be89aeb4823d66`](https://github.com/earendil-works/pi/tree/a9f5b1c123a4f13457e88522a3be89aeb4823d66):

- provider-neutral cache usage and cost fields in
  [`packages/ai/src/types.ts`](https://github.com/earendil-works/pi/blob/a9f5b1c123a4f13457e88522a3be89aeb4823d66/packages/ai/src/types.ts);
- OpenAI cached-token normalization in
  [`openai-responses-shared.ts`](https://github.com/earendil-works/pi/blob/a9f5b1c123a4f13457e88522a3be89aeb4823d66/packages/ai/src/api/openai-responses-shared.ts);
- Anthropic cache-read/cache-write accounting in
  [`anthropic-messages.ts`](https://github.com/earendil-works/pi/blob/a9f5b1c123a4f13457e88522a3be89aeb4823d66/packages/ai/src/api/anthropic-messages.ts);
- cross-provider overflow recognition in
  [`overflow.ts`](https://github.com/earendil-works/pi/blob/a9f5b1c123a4f13457e88522a3be89aeb4823d66/packages/ai/src/utils/overflow.ts);
- conservative context estimation in
  [`estimate.ts`](https://github.com/earendil-works/pi/blob/a9f5b1c123a4f13457e88522a3be89aeb4823d66/packages/ai/src/utils/estimate.ts).

Current provider behavior was cross-checked against the official
[OpenAI prompt-caching guide](https://developers.openai.com/api/docs/guides/prompt-caching)
and the official
[Anthropic Python SDK usage types](https://github.com/anthropics/anthropic-sdk-python).

The implementation in this repository is an original Python implementation
against existing Cloud contracts. It adds no Pi package, JavaScript runtime, or
sidecar dependency.

## Boundary

Owned by this change:

- provider request compatibility;
- provider error taxonomy;
- provider usage and cost-estimate evidence;
- internal routing metadata needed for a context preflight;
- additive usage-meter rows.

Explicitly not owned:

- WordPress ability or workflow registration;
- prompt or preset control truth;
- WordPress write execution;
- approval, preflight, or audit truth;
- automatic prompt rewriting, truncation, summarization, or compaction;
- a public generic chat, tool, session, or streaming protocol.

The existing public provider-call result field set is unchanged. No database
migration is required.

## Before Baseline

Source baseline:

- Cloud: `origin/master` at `6dca97ccd0c3969caca5c4981fc29c930a0c377f`;
- focused existing tests: `63 passed in 5.03s`;
- deterministic probe uses synthetic provider responses and rates, not live
  production billing or latency.

| Capability | Before |
| --- | --- |
| OpenAI cache usage | `tokens_in=1000`; cached/write breakdown discarded |
| OpenAI cache affinity | no `prompt_cache_key` |
| OpenAI synthetic cost | `0.012`, with all 1000 input tokens charged at the ordinary input rate |
| Anthropic cache usage | `tokens_in=100`; 800 cache-read and 100 cache-write tokens discarded |
| Anthropic synthetic cost | `0.002`, undercounting cache read/write components |
| Context overflow | `provider.invalid_request` |
| Route context metadata | no `context_window` in the runtime candidate snapshot |
| Local overflow preflight | absent; the selected provider would receive the request |

Synthetic rates used by the comparison:

- ordinary input: 10 USD / million tokens;
- output: 20 USD / million tokens;
- cache read: 1 USD / million tokens;
- cache write: 12 USD / million tokens.

These rates are deliberately simple test inputs. They do not claim current
production prices or realized savings.

## Implemented Result

### P0 — Provider Compatibility Corpus

- OpenAI Responses, Chat Completions, and DeepSeek-compatible flat usage fields
  normalize to total input, uncached input, cache read, cache write, output, and
  reasoning tokens.
- Anthropic's `input_tokens`, `cache_read_input_tokens`, and
  `cache_creation_input_tokens` normalize without losing or double-counting
  input.
- context-overflow signatures map to `provider.context_overflow`;
- rate-limit, throttling, ordinary validation, and `429` responses are excluded
  from overflow classification;
- the new taxonomy is non-retryable on the same candidate but fallback-eligible
  for another model/provider.

### P1 — Prompt Cache Affinity and Evidence

- OpenAI text requests with a recognized stable prefix receive a
  site-isolated `prompt_cache_key`;
- the key contains hashes only: no site ID, ability text, scene text, prompt,
  credential, or user content is sent in the key;
- dynamic `Scene input` changes retain the same key, while a different site,
  model, ability, profile, contract version, or stable prefix changes the key;
- an OpenAI-compatible endpoint that rejects `prompt_cache_key` is retried
  without it and marked unsupported for the adapter lifetime;
- cache-read, cache-write, and uncached-input token rows are persisted as
  additive usage-meter evidence;
- cost evidence records whether explicit cache rates, conservative ordinary
  input rates, partial rates, provider-model rates, or no rates were used;
- provider-supplied runtime cache prices can flow from catalog raw metadata
  into the internal routing snapshot without turning the reference-model
  catalog into billing truth.

This does not guarantee a cache hit. OpenAI still applies its own prompt-length
and prefix-identity eligibility rules, so short WordPress operations may show
zero cached tokens. Anthropic cache writes are not forced by this change
because they have separate write economics and the current operation prompt is
not yet modeled as explicit cacheable blocks.

The additive cache meter rows are evidence only. The existing AI-credit policy
continues to derive token credits from `tokens_total`; this change does not
silently introduce a cache discount or change package entitlement policy.

### P2 — Context Budget Preflight

- known model context windows flow into the runtime candidate snapshot;
- the estimator counts ASCII, CJK/non-ASCII text, messages, tools, and bounded
  image placeholders;
- the estimate includes the requested output budget and a bounded safety
  margin;
- a rejected preflight records only scalar estimates and never persists prompt
  content;
- a rejected candidate consumes zero provider tokens and zero provider cost,
  then follows the existing fallback policy;
- Cloud never edits, truncates, summarizes, or compacts the prompt.

### P3 — Streaming Remains Deferred

Streaming is intentionally not enabled by this change.

The current WordPress operation contract explicitly rejects generic `stream`,
`messages`, `tools`, sessions, and other chat-control fields. The Cloud adapter
also expects a complete JSON response before output preparation, evidence
recording, artifact finalization, and the existing result projection.

Streaming may enter implementation only after all of the following exist:

1. a versioned WordPress operation contract with named stream event types;
2. bounded ordering, reconnect, replay, cancellation, timeout, and backpressure
   semantics;
3. a terminal usage event that preserves provider-call and commercial
   accounting;
4. a failure projection that cannot expose provider prompt/body data;
5. additive non-stream fallback and explicit compatibility behavior;
6. proof that Cloud is transport/runtime owner only and does not become a
   second chat, ability, workflow, approval, or write-control plane.

Until then, adding provider SSE support would improve transport latency at the
cost of breaking the accepted product boundary, so it remains out of scope.

## Deterministic After Comparison

| Capability | After |
| --- | --- |
| OpenAI cache usage | `100 uncached + 800 cache-read + 100 cache-write = 1000 total input` |
| OpenAI cache affinity | hashed `npcink-pc-v1-*` key present for the stable WordPress prefix |
| OpenAI synthetic cost | `0.005` with the explicit cache rates above |
| Anthropic cache usage | `100 uncached + 800 cache-read + 100 cache-write = 1000 total input` |
| Anthropic synthetic cost | `0.004`, correcting the former undercount |
| Context overflow | `provider.context_overflow`, non-retryable and fallback-eligible |
| Route context metadata | context window and optional cache prices survive routing serialization |
| Local overflow preflight | a `75 input + 20 output + 16 margin > 100 window` request is rejected before the provider call |

Focused implementation tests:

- final local candidate: `92 passed in 10.49s`;
- final M4 candidate: `92 passed in 10.57s`;
- repository Ruff: passed;
- repository mypy: `244 source files` passed;
- Cloud anti-drift and provider-env retirement: passed.

The deterministic comparison proves normalization, routing, and rejection
behavior. It does not claim realized production cache-hit rate, provider
latency reduction, or billing savings; those require an accepted provider
cohort with live usage evidence.

## Validation Evidence

Final candidate identity:

- branch: `codex/pi-provider-runtime-compat`;
- source base: `6dca97ccd0c3969caca5c4981fc29c930a0c377f`;
- acceptance state: `candidate`;
- Alembic: `20260717_0068 (head)`;
- M4 API, frontend, PostgreSQL, Redis, and proxy: healthy;
- M4 HTTP `/` and `/health/live`: `200`.

Gates:

- M4 contract/domain coverage:
  `1403 passed, 4 skipped, 0 failed` in `634.43s`;
- M4 API coverage:
  `926 passed, 0 failed` in `516.75s`;
- after the review narrowed overflow text matching to 400/413/422 responses,
  the exact final bundle reran all affected provider/runtime tests:
  `92 passed, 0 failed`;
- local exact-final focused suite: `92 passed, 0 failed`;
- Ruff: passed;
- mypy: `244 source files` passed;
- `check:anti-drift`: passed.

The documented `m4:preview:test -- --full` command currently reaches an empty
Bash-array expansion on the source Mac's Bash 3.2. The equivalent explicit
target set, `tests/contract tests/domain`, was therefore run through the same
M4 test runner. Local `check:seam` also intentionally did not copy `.env` or
start a second Docker runtime; its complete API suite and health/perimeter
behavior were validated on M4 instead.

## Acceptance Ledger

| Layer | Status | Evidence |
| --- | --- | --- |
| Local focused behavior | Passed | 92 focused tests plus deterministic before/after probe |
| Repository-wide gates | Passed | Ruff, mypy, anti-drift; M4 contract/domain and API suites |
| M4 candidate sync | Passed | candidate source applied under the remote deployment lock |
| M4 focused runtime validation | Passed | exact-final 92 tests; services healthy; HTTP smoke passed |
| GitHub CI / merge | Pending | candidate branch only |
| Production | Not changed | no production action authorized |
| Human acceptance | Pending | operator review remains separate |

## Rollback

The change has no database migration and no data rewrite. Roll back by reverting
the focused commit. Existing provider-call records and public result fields
remain readable; the additive cache meter rows simply stop being emitted.
