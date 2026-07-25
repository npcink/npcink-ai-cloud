# Provider Three-Item Closeout And Development Retrospective — 2026-07-25

Status: the three development work items are closed at their explicitly
bounded acceptance levels. WordPress title generation and P2 context preflight
passed the Local WordPress/M4 development path. Runtime price estimation and
cache economics passed, while the third-party gateway's actual settlement
price remains deliberately deferred for human/external acceptance. Production
was not changed.

This record reconciles current Git truth after the earlier provider-runtime
compatibility stage. It summarizes the development history, final evidence
states, corrections, and reusable engineering method. It does not rewrite the
time-stamped evidence records, approve production, create gateway billing
truth, change AI credits or entitlement, or authorize Cloud-side WordPress
writes.

## Executive Closeout

The original compatibility work merged through PR `#243` as `ed5ddf6a`.
The accepted M4 runtime then completed a real twenty-call
`mqzj/openai -> gpt-5.5` cohort, and PR `#252` recorded the result as
`3133be02`. That stage proved P0 real Provider execution and P1 cache evidence,
but correctly left three separate gaps:

1. the signed WordPress title-generation external-Provider E2E;
2. an authoritative positive `context_window` and P2 real-route acceptance;
3. trusted price metadata and cache monetary estimation.

Those gaps were handled independently rather than combined into one runtime
change:

| Work item | Development result | Git truth | Highest accepted state |
| --- | --- | --- | --- |
| WordPress title external Provider E2E | Real Local WordPress review flow passed through Addon, M4, `mqzj/openai`, and `gpt-5.5`; final write remained local and explicit | PR `#260`, `49ecfa3e` | Functional Local WordPress/M4 path passed; docs merged |
| `context_window` and P2 | Official versioned model metadata plus a DB-managed connection override established `1,050,000` tokens; normal route passed and synthetic overflow failed before Provider execution | PR `#261`, `08f96927` | Merged and accepted on M4 |
| Price metadata and cache economics | Official OpenAI list price became a labeled runtime-estimate baseline; deterministic cohort repricing and no-double-count credit isolation passed | correction PR `#264`, `f478d3dd`; acceptance PR `#266`, `d87f23ae` | Merged and accepted on M4 |
| Gateway settlement price | No trustworthy `mqzj` invoice/tariff was available; no settlement amount was invented | deferral PR `#268`, `fd751236` | Human/external acceptance deliberately deferred |

Production, Cloudflare, AI credits, plans, entitlement, invoices, and
WordPress ownership were not changed by any of these closeouts.

## Current Ownership Boundary

The validated chain preserves one control plane:

```text
WordPress Ability and UI
  -> Addon validation, signing, and bounded transport
  -> Cloud hosted routing and Provider execution
  -> mqzj OpenAI-compatible connection
  -> gpt-5.5
  -> suggestion_only result
  -> WordPress review
  -> explicit local Save/Update
```

Ownership remains:

- WordPress: Ability, prompt/preset, permission, review, approval, preflight,
  audit, editor state, and final write truth;
- Addon: scene validation, connector contract, signing, transport, and bounded
  result projection;
- Cloud: hosted runtime, Provider routing/execution, normalized errors and
  usage, context-budget enforcement, cost estimates, and runtime evidence;
- M4: disposable development integration and acceptance evidence;
- GitHub `master`: reviewed development source truth;
- production: a separate operator-approved release target.

The connection name `mqzj` and normalized Provider adapter identity `openai`
describe the same configured execution lane at different layers. They must not
be presented as two independent Providers or collapsed into a new public
contract.

### Repository and plugin source truth

The local directory name `/Users/muze/gitee` is a source-workspace convention;
it does not determine the remote hosting service. This Cloud/WordPress
repository family currently publishes through GitHub and must not be pushed to
Gitee.

WordPress plugin changes belong in their owning source repositories under that
local workspace, for example `npcink-cloud-addon`,
`npcink-abilities-toolkit`, `npcink-governance-core`,
`npcink-ai-client-adapter`, and `npcink-workflow-toolbox`. An installed plugin
under a Local Sites `wp-content/plugins` directory is a disposable consumer or
acceptance fixture, not source truth. This three-item closeout changed only the
Cloud repository; it did not modify WordPress plugin source.

## Work Item One: WordPress Title External Provider E2E

### Before

The provider-edge cohort did not prove the signed WordPress consumer flow.
Earlier local inspection had also found the Addon unverified/disabled and the
browser gate stale against the installed WordPress AI version. A successful
adapter call therefore could not be called WordPress E2E.

### Actual result

The independent revalidation traced the current route before spending a
Provider call:

- `ai/title-generation` projected to `title_generation`;
- Cloud mapped the operation to `wp-ai.short-text`;
- the live binding resolved to instance `openai-global-gpt-5-5`;
- `mqzj` declared `gpt-5.5`, while the local Ollama connection did not;
- the contracts remained `cloud_connector_runtime.v1` and
  `wordpress_operation.v1`;
- the returned result remained `suggestion_only=true`.

The disposable Local WordPress browser flow then passed:

- title-generation HTTP `200`;
- the suggestion was visible for review before insertion;
- generation and insertion caused zero WordPress persistence writes;
- one explicit local Save/Update caused one write and one revision;
- the post remained a draft;
- sentinel content remained unchanged;
- the disposable draft and authentication session were removed;
- Cloud evidence reported Provider `openai` through `mqzj`, model `gpt-5.5`,
  expected profile/instance, no fallback, and no error;
- no raw prompt, raw output, credential, or direct Cloud WordPress write was
  retained.

PR `#260` merged the independent evidence as `49ecfa3e`. It was documentation
for an already accepted M4 runtime path, so a new candidate sync or docs-only
M4 promotion was not required.

### Honest boundary

This closes the development E2E for the disposable Local WordPress/M4 path. It
does not prove production, broad user adoption, content quality, or external
customer acceptance.

## Work Item Two: Authoritative Context Metadata And P2

### Source and ownership

The work did not infer a context size from the model name. It required:

1. the live gateway catalog to corroborate that the configured lane exposed
   `gpt-5.5`;
2. the official versioned OpenAI model record to provide the numeric
   `1,050,000`-token context window;
3. the operator-managed
   `ProviderConnection.config_json.model_metadata_overrides` entry to become
   hosted runtime control truth;
4. a successful connection test/catalog sync to project the value into the
   routed candidate.

The metadata contract records unit, source URL, model snapshot, retrieval date,
catalog revision, invalidation conditions, and rollback. If the source becomes
unreviewable or the gateway stops exposing the model, the numeric override
must be removed and the lane must return to unknown rather than guessing.

### Runtime result

The normal real WordPress title run passed context preflight and then called
the external Provider. The negative path used synthetic oversized input:

- `provider.context_overflow` was raised before `provider.execute`;
- Provider attempts, input/output tokens, and cost were all zero;
- only scalar budget estimates were retained;
- the caller-owned input remained unchanged;
- no truncation, rewrite, summary, compression, or prompt mutation occurred;
- fallback remained governed only by the existing routing policy.

PR `#261` merged the source/test/evidence change as `08f96927`. The clean
merged revision was accepted on M4, and the focused fail-closed behavior
passed there.

### Honest boundary

P2 is closed for the current M4 `mqzj/openai -> gpt-5.5` lane while the
metadata remains valid. This does not establish a universal limit for models
with similar names, production acceptance, or external customer acceptance.

## Work Item Three: Runtime Pricing And Cache Economics

### Price semantics

The official OpenAI `gpt-5.5` list price was accepted only as a dated,
non-regional runtime-estimate baseline:

- ordinary input: `5.00 USD / 1M tokens`;
- output: `30.00 USD / 1M tokens`;
- cache read: `0.50 USD / 1M tokens`;
- normalized cache-write bucket: conservatively modeled at ordinary input
  price;
- historical Provider rows remained immutable and `unpriced`.

This metadata is not proof of the `mqzj` gateway's markup, discount, credits,
tax, FX, regional tier, long-context tier, or final settlement.

### Existing cohort economics

The earlier twenty-call cohort contained:

- `84,660` total input tokens;
- `11,700` uncached input tokens;
- `72,960` cache-read tokens;
- `0` cache-write tokens;
- `411` output tokens;
- `86.18%` observed cache-read token ratio.

Under the official-list runtime-estimate baseline:

| Calculation | Estimated amount |
| --- | ---: |
| ordinary input | `$0.058500` |
| observed cache read | `$0.036480` |
| cache write | `$0.000000` |
| output | `$0.012330` |
| observed-token total | `$0.107310` |
| no-cache counterfactual total | `$0.435630` |
| modeled difference | `$0.328320` |
| modeled difference ratio | `75.37%` |

The estimator partitions mutually exclusive token buckets before adding
output, and deterministic tests prevent double counting. AI credits remain
based on the existing `tokens_total` and `ceil_per_1000` rule; cache meters and
cost rows do not create a credit discount.

The amounts are observational model estimates, not realized savings. The
cohort was not a randomized no-cache control, so it also cannot support a
causal latency claim.

### Correction and final state

The first pricing/adoption record merged through PR `#262` while its scope and
call-cap audit were still being corrected. The authoritative correction:

- stopped all further real Provider calls;
- removed the unrelated controlled-adoption narrative from the net change;
- added deterministic repricing and credit-isolation tests;
- retained the call-cap incident instead of hiding it;
- passed protected CI through PR `#264`;
- merged as `f478d3dd`;
- was promoted from clean `master` and accepted on M4;
- received a post-merge acceptance record through PR `#266`.

PR `#268` then recorded the gateway settlement price lifecycle as
`deferred_until_real_user_or_invoice_evidence`.

### Reopening conditions

Reopen settlement-price acceptance before the first paid-user launch when
Provider cost affects pricing, entitlement, spend limits, or margin. Also
reopen when:

- the gateway provides a valid tariff, invoice, settlement statement, or
  signed commercial schedule;
- a real-user trial creates the first reviewable settlement record;
- currency, unit, upstream identity, cache treatment, tier, markup, discount,
  tax, or effective date changes;
- an explicit operator-defined spend materiality threshold is reached.

Until then, the actual gateway settlement price remains human/external
acceptance pending and must not be used as billing truth.

## What Went Wrong And What Changed

### The real-call budget was not globally enforced

The requested three-item execution allowed at most thirty real Provider calls.
The final audit found thirty-nine calls: three from the independent E2E and
thirty-six from a concurrently prepared browser/provider cohort. All
thirty-nine succeeded, but success does not excuse exceeding the budget.

Improvement:

- allocate one shared call ledger before any item starts;
- reserve a per-item maximum and require an atomic remaining-budget check
  immediately before every dispatch;
- keep the three-consecutive-failure stop condition, but treat it as additional
  protection rather than the call-budget mechanism;
- stop all real calls as soon as aggregate uncertainty appears;
- use existing scalar evidence or synthetic negative cases wherever possible.

### Auto-merge made late correction too slow

An attempt to disable auto-merge after the PR `#262` issue was discovered lost
the checks/merge race.

Improvement:

- finish scope, privacy, call-ledger, and diff audits before invoking
  `pnpm run pr:publish`;
- assume the protected publisher may merge immediately once checks complete;
- correct a merged mistake through a new focused PR instead of rewriting
  history or hiding the incident.

### Time-stamped ledgers became stale

Some independent evidence documents still say that their own PR or merge was
pending because that was true when their source revision was authored.

Improvement:

- preserve those statements as historical evidence;
- use this closeout as the current reconciliation layer;
- bind current status to the merged PR and reachable `master` commit, not to a
  pre-merge branch SHA;
- avoid silently editing historical measurements merely to make every document
  read as current.

### Runtime estimate, settlement, and credits were easy to conflate

A numeric cost field can look authoritative even when it is reconstructed from
list price, and `cost=0` can be misread as free execution.

Improvement:

- always expose and interpret `cost_estimate_mode`;
- keep official/connection pricing, runtime estimates, external settlement,
  and user credit/billing policy as four separate truths;
- return `unpriced` or `partial_rates` when required evidence is missing;
- require a separate commercial decision before changing plans, credits,
  invoices, or cache-discount policy.

### Repository history and active work needed separation

Multiple historical branches and worktrees made it easy to confuse evidence,
environment recovery material, and current development.

Improvement:

- fetch before using any historical SHA;
- create one clean `codex/*` worktree per independent task;
- stage exact paths only;
- remove merged disposable worktrees and topic branches;
- retain archive/environment branches only when they preserve unique recovery
  or local configuration state;
- never obtain cleanliness by resetting, stashing, or overwriting user work.

## Reusable Development Method

The resulting method is:

1. **Reconcile current truth.** Run status, fetch `origin/master`, inspect
   contracts, live configuration shape, and current evidence. Historical SHAs
   are starting clues, not authority.
2. **Name one acceptance contradiction.** Consumer E2E, missing metadata, and
   monetary estimation are different problems with different owners.
3. **Write the change envelope.** Record module, contracts, non-goals, call
   budget, forbidden systems, gates, and rollback before editing.
4. **Trace the real consumer.** Provider-edge success is not WordPress E2E;
   verify Ability, Addon, runtime, review, and local write behavior separately.
5. **Establish metadata provenance.** Use an authoritative external source,
   operator-managed runtime control point, dated revision, invalidation rule,
   unknown behavior, and rollback.
6. **Use synthetic negative tests.** Prove overflow and zero upstream spend
   deterministically; reserve real Provider calls for the smallest useful
   positive path.
7. **Record scalar evidence only.** Keep counts, tokens, modes, IDs, hashes,
   and errors; do not retain raw prompts, outputs, credentials, or cache keys.
8. **Separate evidence states.** Report source/local, candidate M4, PR/CI,
   merged `master`, accepted M4, production, and human/external acceptance
   independently.
9. **Publish only after the final audit.** Once `pr:publish` runs, assume a
   green PR can merge quickly.
10. **Correct transparently.** A failed budget, merge race, missing benefit, or
    unavailable external price is evidence to record, not a reason to
    manufacture a positive result.
11. **Stop at the bounded outcome.** Do not expand a validation task into
    production, billing policy, new orchestration, or a connector protocol.

## Final Acceptance Ledger

| State | WordPress title E2E | Context/P2 | Price/cache economics |
| --- | --- | --- | --- |
| source/local verified | Passed | Passed | Passed |
| candidate validated on M4 | No new source candidate required; consumer ran on accepted M4 | Passed | Passed after correction |
| PR/CI | PR `#260` passed | PR `#261` passed | correction PR `#264`, acceptance PR `#266`, and deferral PR `#268` passed |
| merged into `master` | `49ecfa3e` | `08f96927` | `f478d3dd`, `d87f23ae`, `fd751236` |
| accepted on M4 | Functional consumer path passed on accepted runtime | Passed for PR `#261` | Passed for correction PR `#264` |
| production | Not changed | Not changed | Not changed |
| human/external acceptance | Real customer acceptance pending | Real customer acceptance pending; metadata operationally accepted for M4 | Gateway settlement price deliberately deferred |

## Remaining Deferred Scope

- Streaming remains deferred until a versioned connector contract defines
  event ordering, reconnect/replay, cancellation, backpressure, error
  projection, terminal usage, and WordPress consumption.
- Gateway settlement-price acceptance remains deferred under PR `#268`.
- Production validation remains a separate operator-approved release.
- Real customer adoption, quality, and commercial acceptance remain external
  evidence, not development completion claims.

No additional Provider call, M4 mutation, production operation, or WordPress
plugin change is justified by this documentation closeout.

## Rollback

Revert this documentation PR. The original evidence records, runtime source,
M4 metadata, Provider usage rows, WordPress behavior, and production remain
unchanged.

## Related Records

- [Provider Runtime Compatibility Development Retrospective](provider-runtime-compatibility-development-retrospective-2026-07-25.md)
- [Pi-Inspired Provider Runtime Compatibility Evidence](pi-provider-runtime-compatibility-evidence-2026-07-25.md)
- [WordPress Title External Provider E2E Revalidation](wordpress-title-external-provider-e2e-revalidation-2026-07-25.md)
- [WordPress Title Provider E2E And Context Preflight Validation](wordpress-title-provider-e2e-and-context-preflight-validation-2026-07-25.md)
- [Provider Context Window And P2 Revalidation](provider-context-window-p2-revalidation-2026-07-25.md)
- [Provider Pricing And Cache Economics Revalidation](provider-pricing-and-cache-economics-revalidation-2026-07-25.md)
- [Development And Validation Operating Model](development-validation-operating-model-v1.md)
- [M4 Preview AI Development Standard](m4-preview-ai-development-standard-v1.md)
- [Cloud Content Generation Boundary](cloud-content-generation-boundary-v1.md)
