# Provider Pricing And Cache Economics Revalidation — 2026-07-25

Status: source/local investigation complete. The corrected M4 candidate,
PR/CI, merge, and accepted promotion remain pending at this record revision.
Production was not changed.

This is the independent price/cache-economics work item. It does not change AI
credits, plans, entitlement, invoices, cache-discount policy, WordPress
ownership, or production.

## Change Envelope

- Repository: `npcink-ai-cloud`, on the independent
  `codex/m4-title-adoption-cache-economics` PR branch whose parent is the
  merged P2 revision `08f96927`.
- Focused module: DB-managed Provider price metadata, runtime cost estimator,
  additive usage meters, existing 20-call cache cohort, and evidence docs.
- Source change: deterministic tests for the exact cohort calculation and
  cache-meter isolation from AI credits.
- Runtime configuration: read-only validation of the existing M4 `mqzj`
  model override; no new mutation in this correction.
- Public/internal API changes: none.
- Real Provider call budget for the correction: zero; no further call is
  allowed after the call-cap audit below.
- Explicit non-goals: gateway invoice truth, user billing, credit/plan policy,
  causal latency claims, prompt padding, WordPress routing/control truth,
  production, Cloudflare, or Gitee.
- Rollback: revert this test/documentation PR. To remove the M4 estimate
  baseline, restore the prior context-only `gpt-5.5` override and run the
  existing Provider connection test/catalog sync.

## Before And Actual Investigation

The independent item began from:

- freshly fetched `origin/master=08f969272eeae26de4983b441f0eaf6e60cc7fe0`;
- M4 `accepted`, `promotion_pr=261`, clean `master@08f96927`;
- historical 20-call cohort records still carrying
  `cost_estimate_mode=unpriced`;
- historical aggregate usage: `84,660` input, `11,700` uncached input,
  `72,960` cache read, `0` cache write, and `411` output tokens.

Historical `unpriced` evidence is immutable. This item does not rewrite those
rows or imply the gateway actually charged the reconstructed amount.

### Call-cap audit and stop

A concurrently prepared first version of PR `#262` ran a WordPress
title/summary browser cohort before this independent audit. Read-only M4
evidence showed:

- item-one E2E calls at `05:01-05:02Z`: `3`;
- later browser/provider calls at `05:40-05:55Z`: `36`;
- total calls in the current three-item execution window: `39`;
- successes: `39 / 39`;
- no three-consecutive-failure condition occurred.

This exceeded the requested total cap of `30`. Auto-merge for PR `#262` was
disabled immediately after discovery. No further Provider call was made. The
unrelated controlled-adoption narrative was removed from the corrected net
diff; the scalar call-cap incident remains recorded here rather than hidden.

## Price Source, Meaning, And Ownership

The M4 `mqzj` gateway catalog establishes that the configured lane exposes
`gpt-5.5`, but it does not publish a gateway tariff. The current numeric basis
is the official OpenAI model record:

<https://developers.openai.com/api/docs/models/gpt-5.5>

Retrieved `2026-07-25`, it lists the standard non-regional rates:

| Component | Runtime estimate rate |
| --- | ---: |
| ordinary/uncached input | `5.00 USD / 1M tokens` |
| output | `30.00 USD / 1M tokens` |
| cache read / cached input | `0.50 USD / 1M tokens` |
| cache write normalized bucket | `5.00 USD / 1M tokens` |

The cache-write value is an operator modeling rule, not a second OpenAI fee.
For this Responses lane the observed cache-write bucket is zero. If a
normalized write bucket appears, charging it at the ordinary input rate is the
conservative no-discount treatment.

The official record also describes long-context and regional uplifts. The
observed cohorts did not cross the stated long-context threshold and the
configured baseline is explicitly non-regional, so those uplifts are not
applied here.

### Runtime ownership contract

- Numeric source: official OpenAI `gpt-5.5` list price.
- Hosted control point: the operator-managed
  `mqzj.model_metadata_overrides["gpt-5.5"]`.
- Currency: USD.
- Unit: USD per one million tokens, matching the estimator's `/ 1_000_000`
  calculation.
- Runtime `effective_at`: the operator connection test/catalog sync at
  `2026-07-25T05:50:43.359168+00:00`.
- Source retrieval/snapshot: `retrieved_2026-07-25`,
  `gpt-5.5-2026-04-23`.
- Source limitation: this is a runtime-estimate baseline, not proof of
  `api.mqzj.top` invoice rates, markup, discount, credits, tax, or FX.
- Invalidation: remove/revalidate the price override when the official model
  page/snapshot changes, the gateway changes its upstream identity, the
  configured lane becomes regional/long-context, or the source/revision can no
  longer be reviewed.
- Reference/recognition catalog: descriptive only; never runtime cost, billing,
  credits, or local control truth.

Unknown handling remains conservative:

- no rates: `unpriced`, no monetary claim;
- a missing cache rate with ordinary input known:
  `conservative_input_rate`, cache tokens charged at ordinary input;
- another required missing component: `partial_rates`, not a trusted total;
- explicit ordinary/output/cache rates: `standard_rates` without observed
  cache tokens and `cache_rates` when cache-read/write tokens are present.

## Live Metadata And Priced-Path Verification

A read-only query after the M4 connection test returned:

```text
connection_status=ready
last_tested_at=2026-07-25T05:50:43.359168+00:00
last_sync_at=2026-07-25T05:50:43.359168+00:00
catalog_revision=catalog-20260725055044513972-5e5b6125
price_input=5.0
price_output=30.0
runtime_pricing.cache_read=0.5
runtime_pricing.cache_write=5.0
source=https://developers.openai.com/api/docs/models/gpt-5.5
```

The post-sync persisted sample contained `21` successful calls. It is retained
only as already-existing priced-path evidence:

- `18,156` input and `1,882` output tokens;
- `0` cache-read/write tokens;
- stored modeled cost `$0.147240`;
- `21 / 21` emitted `cost_estimate_mode=standard_rates`;
- each call had exactly one `provider_calls`, `cost`,
  `input_tokens_uncached`, `tokens_in`, `tokens_out`, and `tokens_total` row;
- additive-meter violations: `0`;
- `tokens_total != tokens_in + tokens_out` violations: `0`;
- checked raw prompt/result/credential payload violations: `0`.

These short calls do not validate real post-price cache hits. The accepted
cache-aware calculation is instead deterministic and uses the earlier
20-call observed token structure.

## Existing 20-Call Cohort Repricing

The calculation retains the original scalar observations and applies the
operator-declared official-list baseline retrospectively.

| Component | Formula | Estimated amount |
| --- | --- | ---: |
| ordinary input | `11,700 * $5.00 / 1M` | `$0.058500` |
| observed cache read | `72,960 * $0.50 / 1M` | `$0.036480` |
| cache write | `0 * $5.00 / 1M` | `$0.000000` |
| output | `411 * $30.00 / 1M` | `$0.012330` |
| observed-token total | sum above | `$0.107310` |

The no-cache counterfactual prices every observed input token at the ordinary
input rate while leaving observed output unchanged:

```text
input: 84,660 * $5.00 / 1M = $0.423300
output: 411 * $30.00 / 1M = $0.012330
counterfactual total = $0.435630
```

Modeled difference:

- estimated saving: `$0.435630 - $0.107310 = $0.328320`;
- estimated saving ratio: `$0.328320 / $0.435630 = 75.37%`;
- observed cache-read token ratio: `72,960 / 84,660 = 86.18%`.

Cost-mode interpretation:

- persisted historical mode: `unpriced` and unchanged;
- documentation-only retrospective mode:
  `retrospective_official_list_price_baseline`;
- deterministic runtime estimator mode for the same scalar mix:
  `cache_rates`;
- actual post-sync no-cache sample mode: `standard_rates`.

The `$0.328320` is an observational, modeled amount under official OpenAI list
rates. It is not a realized gateway invoice saving. The cohort was not a
randomized no-cache control, so latency observations do not establish causal
speedup.

## Additive Meters And Credits

The compatibility estimator partitions input into:

```text
uncached input + cache read + cache write = total input
```

It charges those mutually exclusive buckets once, then adds output. The exact
cohort regression asserts:

- `11,700 + 72,960 + 0 = 84,660`;
- observed estimator total `$0.107310`, mode `cache_rates`;
- no-cache total `$0.435630`, mode `standard_rates`;
- difference `$0.328320`.

AI credits remain independent of Provider cost estimates:

- `tokens_total` remains the token-credit source;
- its existing policy remains `ceil_per_1000`;
- `input_tokens_uncached`, `cache_read_tokens`, `cache_write_tokens`, and
  `cost` produce no credit component;
- cache hits therefore do not silently discount credits, plans, entitlement,
  or user billing.

## Source/Local Verification

The corrected branch adds two deterministic tests:

1. exact 20-call cohort repricing and no-double-count calculation;
2. cache/cost meter rows do not alter the existing `tokens_total` credit rule.

Commands are recorded with their exact results after the final corrected
source is executed:

```text
/Users/muze/gitee/npcink-ai-cloud-m4-ops/.venv/bin/python -m pytest \
  tests/domain/test_provider_compatibility.py \
  tests/domain/test_ai_credit_policy.py -q
32 passed in 0.22s

/Users/muze/gitee/npcink-ai-cloud-m4-ops/.venv/bin/ruff check \
  tests/domain/test_provider_compatibility.py \
  tests/domain/test_ai_credit_policy.py
All checks passed!

git diff --check
passed with no output

relative Markdown link validation
passed
```

## M4 Candidate, PR, And Acceptance

The corrected seven-path candidate synchronized through the private relay. The
initial relay download hit its bounded 120-second curl timeout after receiving
most of the bundle, resumed under the existing script, completed in `145s`,
and the overall sync exited `0`. Migration, worker restart, Nginx validation,
and service checks completed.

The focused candidate command then ran both changed test files:

```text
pnpm run m4:preview:test -- --focused \
  tests/domain/test_provider_compatibility.py \
  tests/domain/test_ai_credit_policy.py
32 passed in 0.62s
```

Status reported `acceptance_state=candidate`, branch
`codex/m4-title-adoption-cache-economics`, seven dirty paths, all eight
services running, required services healthy, Alembic
`20260717_0068 (head)`, and HTTP `200` for `/` and `/health/live`.

| State | Result |
| --- | --- |
| source/local verified | Passed: 32 focused tests, Ruff, diff check, and link check |
| candidate validated on M4 | Passed: 32 focused tests; services/HTTP/migration healthy |
| PR/CI | PR #262 open; auto-merge disabled during correction |
| merged into master | Pending |
| accepted on M4 | Pending post-merge clean-master promotion |
| production | Not changed |
| human/external acceptance | Pending |

## Unverified Boundaries

- Actual `api.mqzj.top` invoice price remains externally unverified.
- No post-price real cache hit was observed.
- No causal latency, content-quality, or natural-adoption claim is made.
- Production, AI credits, packages, entitlement, invoices, and cache-discount
  policy were not changed.
- WordPress remains Ability, prompt/preset, review/approval, preflight, audit,
  and final-write truth.

## Rollback

- Source/docs: revert PR `#262`.
- Runtime estimate baseline: restore the preceding context-only model override,
  run the existing Provider connection test/catalog sync, and verify the lane
  returns `unpriced`.
- No migration or data rewrite exists. Historical evidence remains readable.

## Related Records

- [Pi-Inspired Provider Runtime Compatibility Evidence](pi-provider-runtime-compatibility-evidence-2026-07-25.md)
- [Provider Runtime Evidence Surface Validation](provider-runtime-evidence-surface-validation-2026-07-25.md)
- [Provider Context Window And P2 Revalidation](provider-context-window-p2-revalidation-2026-07-25.md)
- [WordPress Title External Provider E2E Revalidation](wordpress-title-external-provider-e2e-revalidation-2026-07-25.md)
- [M4 Preview AI Development Standard](m4-preview-ai-development-standard-v1.md)
- [Cloud Content Generation Boundary](cloud-content-generation-boundary-v1.md)
