# WordPress Title And Summary Controlled Trial And Cache Economics — 2026-07-25

Status: accepted as development evidence on M4 Preview. Production was not
changed. Human or external-customer acceptance remains pending.

This record closes the next development-evidence step after the signed
WordPress title external Provider E2E and real context-window preflight:

1. resolve the M4 candidate to an accepted revision;
2. collect `20` controlled title/summary adoption decisions through the real
   WordPress review-and-save path;
3. apply the user-approved official OpenAI `gpt-5.5` list prices as an
   explicitly non-gateway-billing baseline;
4. calculate observed and counterfactual prompt-cache economics.

The controlled cohort is deliberately a transport, review-ownership, and
metering validation. It is not evidence that ordinary users naturally accepted
the suggestions, and it is too small and too synthetic to establish content
quality.

## Change Envelope

- Source repository: `npcink-ai-cloud`, documentation only.
- Runtime configuration target: accepted M4 Preview Provider connection
  `mqzj`.
- Consumer under test: disposable drafts on the Local WordPress site
  `https://magick-ai.local`.
- Public or internal API changes: none.
- WordPress, Addon, or Cloud source changes: none.
- Database migration: none.
- Production and production Provider configuration: unchanged.
- Prompt, preset, Ability, workflow, review, approval, and final-write truth:
  unchanged.
- Credentials, prompts, and raw model outputs retained in Git: none.
- Runtime rollback: restore the preceding context-only
  `model_metadata_overrides.gpt-5.5` entry and run the existing Provider
  connection test/catalog sync.
- Documentation rollback: revert this record and its index links.

## Before And After

| Evidence | Before this step | After this step | Result |
| --- | ---: | ---: | --- |
| M4 acceptance state | feature/P2 sources entered as `candidate` | `accepted` at `08f96927`, PR `#261` | Passed |
| Controlled browser runs | `0` | `10` complete runs | Passed |
| Controlled title decisions | `0` | `10` direct-adopt | Passed |
| Controlled summary decisions | `0` | `10` direct-adopt | Passed |
| WordPress writes before explicit save | not measured for this cohort | `0` | Passed |
| Explicit local save writes | `0` | `10` | Passed |
| Total revision delta | `0` | `+10` | Passed |
| Temporary drafts remaining | not applicable | `0` | Passed |
| Temporary WP-CLI sessions remaining | not applicable | `0` | Passed |
| `gpt-5.5` input/output price metadata | absent | `$5.00` / `$30.00` per 1M tokens | Added |
| cache-read price metadata | absent | `$0.50` per 1M tokens | Added |
| priced post-sync calls | `0` | `21` | Observed |
| priced-cohort cache-read/write tokens | `0 / 0` | `0 / 0` | No cache hit |
| observed cache savings | unpriced | `$0.00` | No current benefit |

## M4 Acceptance Resolution

PR `#259`, `feat: close public portal product gaps`, merged with all reported
CI and CodeQL checks passing. The normal M4 promotion command then accepted
merge revision:

```text
b12eab5200d5839bdb819eea408c64310479abde
```

The post-promotion status reported:

- `acceptance_state=accepted`;
- `promotion_pr=259`;
- `source_branch=master`;
- `source_dirty=false`;
- all required services healthy;
- `/=200` and `/health/live=200`;
- Alembic `20260717_0068 (head)`;
- required ports bound to loopback.

During closeout, the focused P2 regression and evidence record merged through
PR `#261`. Its backend targeted gate, frontend gate, CodeQL, dependency audit,
secret scan, PR-body contract, and CI observability checks passed. The clean
current `master` was then promoted again. Final M4 state was:

```text
acceptance_state=accepted
promotion_pr=261
source_revision=08f969272eeae26de4983b441f0eaf6e60cc7fe0
source_branch=master
source_dirty=false
source_dirty_paths=0
```

This was an M4 development acceptance action, not a production deployment.

## Controlled WordPress Cohort

The repository's existing browser gate was run ten times against:

- WordPress `7.1-beta3-62847`, environment `local`;
- official WordPress AI `1.2.0`;
- Npcink Cloud Addon `0.1.3`;
- the accepted M4 tunnel at `127.0.0.1:18010`;
- the existing `mqzj` connection and normalized `openai/gpt-5.5` lane.

Each isolated run:

1. created one synthetic draft;
2. requested one title suggestion and one summary suggestion through the
   official WordPress AI review UI;
3. directly adopted both reviewed suggestions;
4. confirmed there was no post or autosave write before explicit local save;
5. performed one ordinary WordPress save;
6. confirmed the saved title and summary, sentinel integrity, draft status,
   and one new revision;
7. exercised one paragraph rephrase as an additional transport check;
8. removed and verified absence of the temporary draft and authentication
   session.

The result was `20` controlled direct-adopt decisions: `10` titles plus `10`
summaries. The additional `10` rephrase calls are not counted as adoption
decisions.

Aggregate machine evidence:

| Measure | Result |
| --- | ---: |
| complete runs | `10 / 10` |
| title direct-adopt decisions | `10` |
| summary direct-adopt decisions | `10` |
| title/summary edited or rejected decisions | `0` by test design |
| pre-save WordPress writes | `0` |
| explicit-save WordPress writes | `10` |
| revision delta | `+10` |
| successful Provider calls in the cohort | `30` |
| failed HTTP responses | `0` |
| cleaned drafts | `10 / 10` |
| destroyed temporary sessions | `10 / 10` |
| distinct title hashes | `6 / 10` |
| distinct summary hashes | `9 / 10` |

The duplicate title hashes reflect the fixed synthetic fixture and deterministic
task shape. They are a warning against treating this cohort as a content
quality or diversity benchmark.

Two attempts were excluded before the ten complete runs:

- one preflight stopped on a transient Local WordPress maintenance page;
- one run completed the save screenshot but its browser process hung during
  close; its draft was already absent and the exact matching temporary session
  was removed through a targeted cleanup.

Neither excluded attempt contributes to the `20` decisions. Final read-only
cleanup found zero matching drafts and zero matching temporary WP-CLI
sessions.

## Official Price Baseline

Per the user's authorization, the current official OpenAI price is used as the
calculation baseline. It is not represented as proof of the amount billed by
the third-party `api.mqzj.top` gateway.

Source retrieved on `2026-07-25`:

<https://developers.openai.com/api/docs/models/gpt-5.5>

For the standard, non-regional lane:

| Price component | USD per 1M tokens |
| --- | ---: |
| uncached input | `$5.00` |
| cached input / cache read | `$0.50` |
| output | `$30.00` |

The same official model record states that requests exceeding `272,000` input
tokens are charged at `2x` input and `1.5x` output rates, and that regional
processing adds `10%`. Neither condition applied to this cohort.

The official prompt-caching guide states that automatic caching requires
prompts of at least `1,024` tokens and an exact shared prefix:

<https://developers.openai.com/api/docs/guides/prompt-caching>

For models before `GPT-5.6`, a cache write has no separate surcharge. The
runtime field `price_cache_write=5.0` therefore models the total uncached input
price on a cache miss/write, not an additional fee on top of input tokens.

The accepted M4 metadata became:

```json
{
  "context_window": 1050000,
  "price_input": 5.0,
  "price_output": 30.0,
  "price_cache_read": 0.5,
  "price_cache_write": 5.0,
  "source": "https://developers.openai.com/api/docs/models/gpt-5.5",
  "revision": "retrieved_2026-07-25; gpt-5.5-2026-04-23; standard_nonregional; cache_write_modeled_at_input_rate"
}
```

The existing Provider connection test passed and synchronized catalog revision
`catalog-20260725055044513972-5e5b6125`. The stored model catalog and runtime
pricing projection both reported the values above.

## Observed Cost And Cache Economics

The exact post-price-sync cohort contained:

- `21` successful, fully priced calls;
- `18,156` input tokens;
- `1,882` output tokens;
- `0` cache-read tokens;
- `0` cache-write tokens;
- `$0.147240` total modeled cost;
- `$0.007011` modeled average cost per call.

The reproducible baseline is:

```text
(18,156 / 1,000,000 * $5.00)
+ (1,882 / 1,000,000 * $30.00)
= $0.147240
```

Input tokens per call ranged from `650` to `1,002`, with p50 `945`. All
`21 / 21` prompts were below the official `1,024`-token automatic-caching
threshold. Therefore:

- observed eligible calls: `0`;
- observed cache reads: `0`;
- observed cache savings: `$0.00`;
- observed cache return for the current short editor lane: none.

For planning only, if a future workload made the stated fraction of all input
tokens eligible cache hits while output usage stayed unchanged, the same
cohort would model as:

| Input-token cache-hit ratio | Modeled cost | Savings | Savings rate | Cost per call |
| ---: | ---: | ---: | ---: | ---: |
| `0%` | `$0.1472400` | `$0.0000000` | `0.00%` | `$0.0070114` |
| `25%` | `$0.1268145` | `$0.0204255` | `13.87%` | `$0.0060388` |
| `50%` | `$0.1063890` | `$0.0408510` | `27.74%` | `$0.0050661` |
| `75%` | `$0.0859635` | `$0.0612765` | `41.62%` | `$0.0040935` |
| `100%` | `$0.0655380` | `$0.0817020` | `55.49%` | `$0.0031209` |

These rows are counterfactual sensitivity scenarios, not observed savings.
They assume the eligible token share is actually served at the cached-input
rate and do not model third-party gateway markup, discounts, credits, tax, or
currency conversion.

## Decision

Do not pad the current WordPress prompts merely to cross `1,024` tokens. That
would increase cost and latency without evidence of a reusable exact prefix.

Keep the existing cache-affinity and metering evidence, but defer cache-specific
optimization until a real workload shows both:

1. prompts at or above the official eligibility threshold; and
2. a stable, repeated exact prefix large enough to produce cache-read tokens.

At that point, compare observed `cache_read_tokens`, end-to-end latency, output
quality, and actual gateway invoices against this official-list-price
baseline. Gateway-specific billing remains unverified.

## Verification

Completed gates:

- ten complete Local WordPress browser runs passed title review, summary
  review, no-write-before-save, one explicit save, revision, sentinel,
  session-cleanup, and draft-cleanup assertions;
- the accepted M4 Provider connection remained `ready` after source
  synchronization, and a post-sync database query returned the exact context
  and price metadata recorded above;
- P2 PR `#261` merged after all required checks passed, and final M4 status
  accepted its clean `master` revision;
- Cloud `check:anti-drift`: passed;
- relative Markdown targets in all four changed/indexed records: passed;
- price and sensitivity arithmetic: independently recomputed from the exact
  token counts;
- `git diff --check`: passed;
- the central cross-repository matrix passed
  `npcink-abilities-toolkit`, `npcink-governance-core`,
  `npcink-ai-client-adapter`, `npcink-workflow-toolbox`, and
  `npcink-cloud-addon`.

The matrix's `npcink-ai-cloud` launcher failed before collecting a test because
it intentionally addresses the original user worktree and invokes local Docker
Compose, while the local Docker daemon was not running. The original worktree's
six pre-existing dirty paths remained untouched. This documentation-only
branch passed its direct anti-drift and link gates; the browser and M4 runtime
checks above are the scoped behavioral evidence. The matrix exception is not
reported as a passing Cloud gate.

## Evidence Artifacts And Boundaries

Disposable aggregate artifact directory:

```text
/tmp/npcink-title-summary-controlled-20260725
```

SHA-256 of the ten concatenated machine summaries:

```text
07604cf36e1fb3e35e50e7a6714828191bbf5509bf5198c0c73dc01269e23b84
```

The artifacts remain outside Git and must not be treated as durable production
telemetry. The committed record retains counts, versions, hashes, and bounded
IDs only; it does not retain Provider credentials, cookies, prompts, or raw
model outputs.

Boundary result:

- WordPress remained review, approval, and final-write owner;
- the Addon remained signed transport and result validation;
- Cloud remained runtime execution, Provider metadata, and read-only evidence;
- M4 remained development validation rather than production truth;
- production, AI Credit, entitlement, workflow, scheduler, and control-plane
  behavior were not changed;
- human/external acceptance, edit/reject distribution, natural adoption rate,
  and content-quality improvement remain unverified.

## Related Records

- [Provider Context Window And P2 Revalidation](provider-context-window-p2-revalidation-2026-07-25.md)
- [WordPress Title External Provider E2E Revalidation](wordpress-title-external-provider-e2e-revalidation-2026-07-25.md)
- [WordPress Title Provider E2E And Context Preflight Validation](wordpress-title-provider-e2e-and-context-preflight-validation-2026-07-25.md)
- [Provider Runtime Evidence Surface Validation](provider-runtime-evidence-surface-validation-2026-07-25.md)
- [M4 Preview AI Development Standard](m4-preview-ai-development-standard-v1.md)
- [Cloud Content Generation Boundary](cloud-content-generation-boundary-v1.md)
