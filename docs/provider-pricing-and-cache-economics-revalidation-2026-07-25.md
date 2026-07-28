# Provider Pricing And Cache Economics Revalidation — 2026-07-25

Status: source/local and corrected M4 candidate verified. Correction PR `#264`
passed CI, merged as `f478d3dd`, and was accepted on M4 from clean `master`.
Production was not changed. Human/external acceptance of the third-party
gateway's actual settlement price is explicitly deferred until the reopening
conditions below are met.

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

This exceeded the requested total cap of `30`. An attempt was made to disable
PR `#262` auto-merge immediately after discovery, but the checks/merge race had
already completed; the first version merged as `2fe8052c`. No further Provider
call was made. A correction branch was created from that exact current
`master`, and the unrelated controlled-adoption narrative was removed from
its net diff. The scalar call-cap incident remains recorded here rather than
hidden.

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

The first corrected seven-path candidate synchronized through the private
relay. Its initial relay download hit the bounded 120-second curl timeout after
receiving most of the bundle, resumed under the existing script, completed in
`145s`, and the overall sync exited `0`.

After the PR `#262` merge race was discovered, the correction commit was
cherry-picked onto exact current `origin/master=2fe8052c` as
`7b2f045a67fc6da8c96503fdf8f3a9cf5fbdaa04`. That clean correction candidate
synchronized with bundle
`1bf87e6272e6938211a3e8a3141cb38c150460ae03a35060cc714c210372263e`.
Migration, worker restart, Nginx validation, and service checks completed.

The focused candidate command then ran both changed test files:

```text
pnpm run m4:preview:test -- --focused \
  tests/domain/test_provider_compatibility.py \
  tests/domain/test_ai_credit_policy.py
32 passed in 0.61s
```

The correction was then rebased onto the newer exact
`origin/master=dbd892d6` without changing its scoped content. Final PR head
`bbc6cefb14ad43313c01ff6d07d7182f4da338a4` synchronized as a clean candidate
with bundle
`719adbb5cfc9ea7d0e40725cc74935b73cd1434867f0d8f477b920c1a5c4363c`;
the two exact new pytest nodes passed.

PR `#264` passed all required checks (`12` successful, `5` scope-skipped,
`0` failed); `backend-targeted` completed in `8m03s`. It merged into `master`
as `f478d3dd81e46bb675166436000a5bd7193817ae`.

The accepted promotion reported:

- `acceptance_state=accepted`;
- `promotion_pr=264`;
- `source_revision=f478d3dd81e46bb675166436000a5bd7193817ae`;
- `source_branch=master`;
- `source_dirty=false` and `source_dirty_paths=0`;
- accepted source bundle
  `2ffeca228c8d837e724e503fe00730dae1a9405694b09c533c03ce6b7e8b910c`;
- all eight services running, required services healthy;
- Alembic `20260717_0068 (head)`;
- HTTP `200` for `/` and `/health/live`.

The post-merge accepted-runtime command was:

```text
pnpm run m4:preview:test -- --focused \
  tests/domain/test_provider_compatibility.py::test_observed_provider_cohort_repricing_uses_cache_rates_without_double_counting \
  tests/domain/test_ai_credit_policy.py::test_cache_usage_meters_do_not_discount_token_credit_component
2 passed in 0.04s
```

| State | Result |
| --- | --- |
| source/local verified | Passed: 32 focused tests, Ruff, diff check, and link check |
| candidate validated on M4 | Passed: 32 focused tests, then the two exact new nodes on final rebased candidate; services/HTTP/migration healthy |
| PR/CI | PR #262 first version merged in a race; correction PR #264 passed 12 required checks with 5 scope-skipped and 0 failures |
| merged into master | Correction PR #264 merged as `f478d3dd` |
| accepted on M4 | Passed: PR #264, clean `master@f478d3dd`, post-merge exact tests 2 passed |
| production | Not changed |
| human/external acceptance | Deferred until a reopening condition below is met; not accepted |

## Third-Party Settlement Price Deferral

Decision recorded `2026-07-25`: do not pursue or claim acceptance of the
`mqzj` gateway's actual settlement price before there is commercial evidence
to validate. The official OpenAI list-price baseline remains useful only for
runtime cost estimation and observational cache-economics evidence. It is not
the gateway's invoice truth and must not drive user billing, AI credits, plan
entitlement, cache discounts, or margin claims.

This decision is `human/external acceptance pending`, with lifecycle state
`deferred_until_real_user_or_invoice_evidence`. It is not an acceptance,
waiver, or conversion of estimated cost into settled cost. No Provider call,
M4 change, production change, or external configuration change is required to
record the deferral.

Reopen this work before the first paid-user launch if Provider cost affects
pricing, entitlement, spend limits, or margin decisions. Also reopen it when
any of the following occurs:

- the gateway supplies a valid tariff, invoice, settlement statement, or
  signed commercial schedule;
- a real-user trial creates the first reviewable settlement record;
- the gateway changes currency, token unit, upstream model, regional tier,
  long-context tier, cache treatment, markup, discount, tax, or effective
  date;
- observed external spend reaches an operator-approved materiality threshold.
  No threshold is invented by this record; it must be stated explicitly when
  the operator adopts one.

The reopened acceptance must independently record:

- the authoritative external source and evidence owner;
- currency, unit, ordinary input, output, cache-read, and cache-write treatment;
- effective period, regional/long-context tier, discount/markup, tax, and FX
  handling where applicable;
- a scalar reconciliation between Cloud's runtime estimate and the external
  settlement record, including variance and any double-count check;
- whether the connection must remain `unpriced`, or whether an updated
  operator-managed runtime estimate is justified;
- a separate reviewed decision for any user billing, AI credits, plans,
  entitlement, or cache-discount policy change.

Until then, keep the gateway settlement field externally unverified and retain
`unpriced` whenever no trustworthy rate applies. Existing scalar usage and
cost-estimate evidence may continue to be collected without prompts, outputs,
credentials, or other protected payloads. A non-paid trial should retain an
operator-controlled spend cap and alerting boundary rather than treating this
deferral as unlimited cost authorization.

## Unverified Boundaries

- Actual `api.mqzj.top` invoice price remains externally unverified and its
  human/external acceptance is deliberately deferred under the lifecycle above.
- No post-price real cache hit was observed.
- No causal latency, content-quality, or natural-adoption claim is made.
- Production, AI credits, packages, entitlement, invoices, and cache-discount
  policy were not changed.
- WordPress remains Ability, prompt/preset, review/approval, preflight, audit,
  and final-write truth.

## Rollback

- Corrected source/docs: revert PR `#264`; PR `#262` remains the recorded
  superseded merge-race revision.
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
