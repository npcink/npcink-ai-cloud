# Provider Context Window And P2 Revalidation — 2026-07-25

Status: source/local verified and candidate validated on M4 Preview. PR, merge,
and accepted promotion are pending at the time of this record. Production was
not changed.

This record independently revalidates the `mqzj/openai -> gpt-5.5` context
metadata source and the Provider-runtime P2 preflight. WordPress title E2E and
trusted price/cache monetary evidence remain separate work items.

## Change Envelope

- Repository: `npcink-ai-cloud`, in a clean `codex/*` worktree created from the
  freshly fetched `origin/master`.
- Focused module: DB-managed Provider connection metadata projection and
  runtime context-budget preflight evidence.
- Intended source change: add one deterministic fail-closed regression test and
  this independent evidence record.
- Runtime configuration change: none in this work item; the existing M4
  `mqzj` override was inspected read-only.
- Public contracts changed: none.
- Internal contracts changed: none.
- Explicit non-goals: no guessed context value, reference-catalog control
  truth, pricing decision, credit/entitlement change, prompt mutation,
  WordPress control-plane ownership, production operation, or Cloudflare
  operation.
- Files that must not change: WordPress/Add-on source, Provider credentials,
  routing configuration, production configuration, billing and credit policy.
- Gates: focused local tests, focused M4 tests, read-only live metadata and
  scalar usage evidence, `git diff --check`, PR CI, then M4 accepted promotion.
- Real Provider calls: zero. The normal-path check re-queries one same-day call
  already made by the independent WordPress E2E item.
- Rollback: revert the test/documentation commit. If the runtime metadata itself
  must be rolled back, remove only the `gpt-5.5` override from the `mqzj`
  connection, run the existing connection test/catalog sync, and verify that
  no positive context-window claim remains.

## Before

The item started after fetching current Git truth:

- `origin/master=49ecfa3edb184bdb43077ce4eb9aee703a5ec8b2`;
- the historical `3133be02` revision was not treated as current;
- the original user worktree remained dirty and untouched;
- the isolated worktree branch was
  `codex/provider-context-window-p2`;
- M4 initially represented the accepted preceding source, then was explicitly
  synchronized as a candidate for this focused test.

The earlier provider-cohort record correctly reported
`context_window=0` at its observation time. That historical value was not
reused. Current M4 Provider connection and catalog state were queried again.

## Metadata Source And Ownership Investigation

Four possible sources were evaluated:

| Source | Finding | Runtime authority |
| --- | --- | --- |
| live `mqzj` Provider catalog | lists `gpt-5.5`; proves model presence on the configured gateway lane | model-presence corroboration, not a context-number source |
| official OpenAI model metadata | the versioned `gpt-5.5` page states a `1,050,000` token context window and snapshot `gpt-5.5-2026-04-23` | authoritative numeric source for this named upstream model |
| DB-managed Provider connection | `mqzj.model_metadata_overrides["gpt-5.5"]` explicitly carries the value, source, and dated revision | current hosted runtime control truth |
| reference/recognition catalog | may contain descriptive model metadata | never billing or local/runtime control truth |

Official source:
<https://developers.openai.com/api/docs/models/gpt-5.5>.

The current M4 read-only query returned:

- connection `mqzj`, type `openai_compatible`, status `ready`, enabled, and
  `source_role=execution_source`;
- last connection test and catalog sync:
  `2026-07-25T05:50:43.359168+00:00`;
- override `context_window=1050000`;
- override source equal to the official page above;
- revision containing retrieval date `2026-07-25` and snapshot
  `gpt-5.5-2026-04-23`;
- resulting catalog row `openai/gpt-5.5`, status `available`,
  `context_window=1050000`, revision
  `catalog-20260725055044513972-5e5b6125`.

`mqzj` is the operator connection identity. `openai` is the normalized adapter
and Provider-call identity. They describe the same configured execution lane
without making the gateway name a second Provider contract.

### Ownership contract

- Owner: the platform operator managing the DB Provider connection.
- Storage/control point:
  `ProviderConnection.config_json.model_metadata_overrides`, scoped to the
  exact model ID.
- Unit: tokens.
- Source requirement: a Provider official/versioned model record, corroborated
  by the configured gateway's live catalog for model presence.
- Update evidence: source URL, source snapshot/revision, retrieval date,
  successful connection test, and resulting hosted catalog revision.
- Freshness/invalidation: revalidate when the gateway stops listing the model,
  the official page or snapshot changes, the connection changes upstream, or
  the stored source/revision is missing or no longer reviewable.
- Invalid/unknown handling: remove the numeric override, resync the connection,
  expose the context metadata as unknown, and stop claiming P2 real preflight
  acceptance. Do not infer a replacement from the model name.
- Rollback: remove only this model's override, test/resync the connection, and
  verify both the catalog and route no longer project a positive value.

The current override revision also contains pricing-related operator notes.
Those fields and their trust basis are deliberately not accepted by this item;
they are investigated independently in the price/cache monetary work item.

## P2 Runtime Investigation

The current source path is fail-closed when a known limit is exceeded:

1. the routed candidate carries a positive `context_window`;
2. `assess_context_budget` computes bounded scalar estimates for input,
   requested output, and safety margin;
3. `enforce_context_budget` raises
   `ProviderExecutionError("provider.context_overflow")` before
   `provider.execute`;
4. the rejected attempt records zero input tokens, zero output tokens, and zero
   Provider cost;
5. the existing policy alone decides whether a later candidate may be tried.

The preflight neither edits nor replaces the request payload. It does not
truncate, summarize, compress, or rewrite prompts. The rejected evidence
contains scalar estimates only.

When context metadata is unknown, Cloud does not invent a limit. It records the
metadata gap and leaves the upstream Provider's authoritative rejection
available for normalization. That condition cannot be described as accepted
P2 local preflight.

## Change

One deterministic regression test was added:

`test_context_preflight_fails_closed_without_rewriting_or_upstream_usage`

It uses synthetic oversized input and asserts:

- the Provider adapter receives zero attempts;
- the caller-owned input payload remains byte-for-byte unchanged;
- the run fails as `provider.context_overflow`;
- one bounded rejected Provider-call record is retained;
- tokens in/out and cost are all zero;
- retries and fallback remain zero/false under a no-fallback policy;
- the usage context contains only scalar budget fields and no input content.

The existing neighboring fallback test remains the policy proof: an
overflowing primary candidate is skipped before upstream execution, then the
configured secondary candidate runs successfully without Cloud modifying the
payload.

## Verification

### Source/local

Commands and exact results:

```text
/Users/muze/gitee/npcink-ai-cloud-m4-ops/.venv/bin/python -m pytest \
  tests/domain/test_runtime_provider_execution.py::test_context_preflight_fails_closed_without_rewriting_or_upstream_usage -q
1 passed in 2.48s

/Users/muze/gitee/npcink-ai-cloud-m4-ops/.venv/bin/python -m pytest \
  tests/domain/test_provider_compatibility.py \
  tests/domain/test_runtime_provider_execution.py \
  tests/domain/test_openai_provider.py \
  tests/domain/test_provider_runtime_evidence.py -q
78 passed in 1.53s

git diff --check
passed with no output
```

Before adding the regression, the same four-file M4 baseline was
`77 passed in 5.11s`.

### Candidate validated on M4

After `pnpm run m4:preview:sync`, the focused candidate command ran the new
fail-closed test, the existing fallback test, and the complete compatibility
file:

```text
pnpm run m4:preview:test -- --focused \
  tests/domain/test_runtime_provider_execution.py::test_context_preflight_fails_closed_without_rewriting_or_upstream_usage \
  tests/domain/test_runtime_provider_execution.py::test_context_preflight_skips_small_model_and_falls_back_without_upstream_call \
  tests/domain/test_provider_compatibility.py
23 passed in 1.01s
```

M4 status then reported:

- `acceptance_state=candidate`;
- source revision `49ecfa3e...`;
- source branch `codex/provider-context-window-p2`;
- `source_dirty=true`, as expected before commit;
- all eight services running, required services healthy;
- Alembic `20260717_0068 (head)`;
- `/=200` and `/health/live=200`.

The final six-path source bundle was synchronized once more. The exact new
node then passed `1 / 1` in `0.56s`; status remained `candidate`, all services
remained running, required health checks remained green, and the
migration/HTTP results were unchanged.

### Real normal-path scalar evidence

No additional Provider call was needed. A read-only query revalidated the
same-day WordPress title run
`run_fc433b55d0ab4139bf0aa065391739fa`:

- run `succeeded`;
- profile `wp-ai.short-text`;
- contract `cloud_connector_runtime.v1`;
- Provider/model/instance
  `openai / gpt-5.5 / openai-global-gpt-5-5`;
- fallback false and error absent;
- `context_preflight=accepted`;
- context window `1,050,000`;
- estimated input `781`, requested output `48`, safety margin `2,048`, and
  estimated total `2,877` tokens;
- observed Provider usage `950` input and `105` output tokens;
- the usage payload contained none of the checked raw input, prompt, message,
  result, output, key, or secret fields.

This proves a normal real route passed P2 and called the external Provider. The
synthetic overflow test proves rejection before an upstream call without
wasting real tokens.

## Unverified Boundaries

- Production and production Provider connections were not changed or tested.
- This item does not establish that the gateway billing exactly matches
  OpenAI's public list price.
- It does not accept or calculate monetary cache savings.
- It does not provide customer, operator, or other external human acceptance.
- It does not claim that unknown metadata is a valid P2 preflight result.
- It does not alter WordPress Ability, prompt/preset, approval, preflight, audit,
  or write ownership.

## Acceptance Ledger

| State | Result |
| --- | --- |
| source/local verified | Passed: 78 focused tests; new exact test 1/1 |
| candidate validated on M4 | Passed: 23 focused tests; services/HTTP/migration healthy |
| PR/CI | Pending |
| merged into master | Pending |
| accepted on M4 | Pending post-merge promotion from clean current `master` |
| production | Not changed |
| human/external acceptance | Pending |

## Related Records

- [WordPress Title External Provider E2E Revalidation](wordpress-title-external-provider-e2e-revalidation-2026-07-25.md)
- [WordPress Title Provider E2E And Context Preflight Validation](wordpress-title-provider-e2e-and-context-preflight-validation-2026-07-25.md)
- [Pi-Inspired Provider Runtime Compatibility Evidence](pi-provider-runtime-compatibility-evidence-2026-07-25.md)
- [M4 Preview AI Development Standard](m4-preview-ai-development-standard-v1.md)
- [Cloud Content Generation Boundary](cloud-content-generation-boundary-v1.md)
