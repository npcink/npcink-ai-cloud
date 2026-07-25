# WordPress Title Provider E2E And Context Preflight Validation — 2026-07-25

Status: accepted on the Local WordPress -> M4 Preview path. Production was not
changed. This record closes the signed WordPress title-generation external
Provider E2E and the provider-runtime P2 real accepted-context preflight for
the current `mqzj/gpt-5.5` lane. It does not close cache monetary evidence.

Scope:

- Local site: `https://magick-ai.local`, explicitly reporting environment
  `local`;
- WordPress `7.1-beta3-62839`;
- official WordPress AI plugin `1.2.0`;
- Npcink Cloud Addon `0.1.3`;
- M4 Preview Cloud runtime;
- Cloud Provider connection `mqzj`, internally using the existing
  OpenAI-compatible adapter identity `openai`;
- upstream model `gpt-5.5`.

This is a validation and runtime-metadata record, not a production release,
WordPress write API, pricing decision, cache-savings claim, or second
WordPress control plane.

## Outcome

Both requested outcomes passed:

1. A real browser E2E sent signed WordPress AI requests through the verified
   Addon to M4 Cloud and the external Provider. The title suggestion remained
   review-only until the editor performed one ordinary local WordPress save.
2. The M4 `mqzj` connection received an explicit, source-attributed
   `gpt-5.5` context window of `1,050,000` tokens. After live catalog resync,
   three new WordPress connector requests recorded accepted context preflight
   evidence.

The price fields remain unset. Cache economics remain a separate later phase.

## Change Envelope

- Source repository: `npcink-ai-cloud`, clean worktree from current
  `origin/master`.
- Runtime configuration target: M4 Preview Provider connection `mqzj`.
- WordPress/Add-on source changes: none.
- Public API changes: none.
- Internal API changes: none; the existing provider-connection and
  provider-evidence surfaces were used.
- Database migration: none.
- Production: unchanged.
- Prompt, preset, router, Ability, workflow, approval, review, and final write
  truth: unchanged.
- Credentials: neither printed nor stored in this record.
- Price metadata: deliberately omitted.
- Rollback: remove the `gpt-5.5` entry from
  `model_metadata_overrides`, run the existing Provider connection test to
  resync the catalog, and revert this documentation change.

## Authoritative Context Basis

The context value was accepted only after two independent facts aligned:

- the live `api.mqzj.top` Provider catalog, refreshed through the saved M4
  `mqzj` connection on `2026-07-25`, listed `gpt-5.5`;
- the official OpenAI API model page for `gpt-5.5` stated a `1,050,000` token
  context window and listed snapshot `gpt-5.5-2026-04-23`:
  <https://developers.openai.com/api/docs/models/gpt-5.5>.

The M4 connection now carries only:

```json
{
  "gpt-5.5": {
    "context_window": 1050000,
    "source": "https://developers.openai.com/api/docs/models/gpt-5.5",
    "revision": "retrieved_2026-07-25; gpt-5.5-2026-04-23"
  }
}
```

The subsequent live Provider connection test passed and synchronized catalog
revision `catalog-20260725050123183366-c0a2cc2e`. The stored catalog row then
reported:

- `model_id=gpt-5.5`;
- `provider_id=openai`, the adapter identity used by connection `mqzj`;
- `context_window=1050000`;
- `price_input=null`;
- `price_output=null`;
- the source and dated revision above in
  `operator_metadata_override`.

The gateway connection name and the adapter Provider ID must not be conflated:
`mqzj/gpt-5.5` is the operator-facing lane; `openai/gpt-5.5` is the existing
internal Provider-call evidence lane.

## Before And After

| Evidence | Before | After | Result |
| --- | ---: | ---: | --- |
| Local Addon verified | Historical gap: `false` | `true` | Passed |
| WordPress AI connector enabled | Historical gap: `false` | `true` | Passed |
| Real title review before persistence | Not closed | Generated title visible in review modal | Passed |
| WordPress writes before explicit Save/Update | Not measured | `0` | Passed |
| WordPress writes from explicit Save/Update | Not measured | `1` | Passed |
| Revision delta after explicit save | Not measured | `+1` | Passed |
| Temporary draft cleanup | Not closed | deleted and verified absent | Passed |
| Temporary authentication session cleanup | Not closed | destroyed and verified absent | Passed |
| `gpt-5.5` catalog context | `null` / effective `0` | `1,050,000` | Passed |
| Connector lane evidence records | `5` | `8` | Three new live calls |
| Accepted context preflights | `0` | `3` | Passed |
| Context-preflight rejection | `0` | `0` | No false reject observed |
| Provider-call success | `5 / 5` | `8 / 8` | `100%` |
| Provider-call errors / fallbacks | `0 / 0` | `0 / 0` | Passed |
| Metering completeness | `100%` | `100%` | Passed |
| Input-token detail coverage | `100%` | `100%` | Passed |
| Price metadata | absent | absent | Intentionally deferred |

The “historical gap” values come from the prior read-only local inspection.
The numeric provider before/after comparison uses the same
`npcink-cloud/connector-runtime`, `gpt-5.5` M4 evidence lane during this
validation session.

## Signed WordPress Title E2E

The verified path was:

```text
official WordPress AI Ability/UI
  -> Npcink Cloud Addon scene validation and HMAC transport
  -> POST /v1/runtime/execute on M4
  -> mqzj OpenAI-compatible Provider connection
  -> gpt-5.5
  -> suggestion_only result
  -> WordPress review UI
  -> editor dirty state
  -> one explicit local Save/Update
```

The browser run created one isolated draft and locked autosave. It then
observed:

- `ai/title-generation`: HTTP `200`;
- `ai/summarization`: HTTP `200`;
- `ai/content-resizing` with `input.action=rephrase`: HTTP `200`;
- generated title text was visible before `Insert`;
- the persisted post and revisions were unchanged after generation;
- `Insert` changed only the editor dirty state;
- the persisted post and revisions were still unchanged after `Insert`;
- no fixture post or autosave REST write occurred before explicit
  `Save/Update`;
- one ordinary WordPress post REST write occurred after the explicit action;
- the saved title equaled the reviewed suggestion;
- non-target sentinel blocks remained unchanged;
- one new revision was created;
- the draft remained a draft;
- the temporary login session and draft were both removed and verified absent.

The Cloud evidence route separately observed the corresponding external lane:

- `provider_id=openai`;
- `model_id=gpt-5.5`;
- `ability_name=npcink-cloud/connector-runtime`;
- five external calls before context metadata and three more after it;
- all eight calls succeeded;
- zero errors and zero fallbacks;
- `6,742` input tokens and `866` output tokens in the eight-call lane;
- no prompt or result payloads exposed by the evidence response.

This proves the ownership split in practice: Cloud generated a suggestion, the
Addon signed and transported it, and only WordPress performed the final write
after explicit local review.

## Provider-Runtime P2 Context Preflight

Before the metadata update, the same connector lane had:

- five successful Provider calls;
- zero accepted context-preflight records;
- decision reason `provider_evidence.context_metadata_missing`.

After the metadata update and live catalog sync, the second isolated browser
run added three successful Provider calls. The evidence summary then reported:

- accepted preflight records: `3`;
- rejected preflight records: `0`;
- rejected calls with upstream usage: `0`;
- calibration sample count: `3`;
- estimate-to-actual ratio p50: `0.826455`;
- estimate-to-actual ratio p95: `0.858871`;
- absolute estimation error p95: `212` tokens;
- underestimated records: `3`;
- maximum underestimate: `212` tokens;
- context-preflight evidence status: `observed`.

The estimator was conservative enough for these small WordPress text requests
to remain far inside the model budget, but it underestimated actual input by up
to `212` tokens. That calibration should continue to be watched; this small
sample does not justify changing estimator safety margins.

The public runtime body cap is `1,048,576` bytes, far below what would be
needed to exceed a `1,050,000` token model context through this path. Therefore
this run does not manufacture a live oversized WordPress request merely to
exercise rejection. Deterministic provider-runtime tests remain the evidence
that a rejected context assessment records zero upstream usage. The real
evidence here is the accepted-preflight path with authoritative metadata and no
observed false reject.

## Local Evidence Artifacts

The browser artifacts are intentionally not committed because they are Local
WordPress UI evidence. Their local paths are disposable; hashes preserve the
validation identity without storing prompts, results, cookies, or credentials
in Git.

| Artifact | SHA-256 |
| --- | --- |
| machine-readable browser summary | `82ccf4bca57a174fde17052c84dffaad75dec7828f5a9fbf69ee0dcc8136b789` |
| review screenshot | `e892c35c3417beab3bcdf4dbf66235f4d50d4462d85ebe85e573b11503048610` |
| saved screenshot | `d639c07bafbebf7ad078b9002d5aa68f9183ec59f2837276c40b23028d56893e` |

Local artifact directory:

```text
/tmp/npcink-p2-title-e2e-context-after-20260725
```

The machine summary records `pre_save_post_writes=0`,
`explicit_save_writes=1`, `revision_delta=1`, `title_saved=true`, and cleanup
of both the temporary post and authentication session.

## Deferred Price And Cache Economics

The next phase is explicitly recorded but not started:

> Obtain a trusted, dated gateway pricing declaration, then calculate cache
> economics.

That phase must obtain gateway-specific effective rates, not assume that
official OpenAI list prices are what `api.mqzj.top` bills. The dated evidence
must distinguish at least:

- uncached input price;
- cached-input or cache-read price;
- cache-write price, if any;
- output price;
- long-context surcharges or thresholds;
- batch, flex, priority, regional, subscription, credit, or free-lane effects;
- currency, tax, unit, effective date, and revision.

Only after those fields are trustworthy may the existing token evidence be
used to calculate cache cost per successful call or claim monetary benefit.
Until then, `price_input`, `price_output`, cache rates, and monetary savings
remain unset and unclaimed.

Follow-up on `2026-07-25`: the user authorized official OpenAI `gpt-5.5` list
prices as a clearly labeled interim calculation baseline. M4 price metadata,
the priced evidence cohort, and observed/counterfactual cache economics are
recorded in
[WordPress Title And Summary Controlled Trial And Cache Economics](wordpress-title-summary-controlled-trial-and-cache-economics-2026-07-25.md).
The historical gateway-specific billing limitation above remains in force.

## Verification And Boundaries

Closeout results:

- Cloud focused provider/context tests:
  `248 passed, 1 existing deprecation warning`;
- Cloud full contract + domain equivalent:
  `1,426 passed, 3 skipped, 1 existing deprecation warning`;
- Addon `composer run test:all`: passed, including PHP lint, behavior
  contracts, and the no-write static boundary search;
- Local WordPress browser E2E before and after the context metadata update:
  both passed and cleaned their temporary drafts and sessions;
- central cross-repository matrix:
  `npcink-abilities-toolkit`, `npcink-governance-core`,
  `npcink-ai-client-adapter`, `npcink-workflow-toolbox`, and
  `npcink-cloud-addon` passed;
- `git diff --check`: passed.

The central matrix's `npcink-ai-cloud` launcher failed before collecting any
test because it requires Docker Compose and the local Docker daemon was not
running. The same clean Cloud source was therefore checked directly through
the repository virtual environment with the full `tests/contract` and
`tests/domain` suites above. This is an explicit environment exception, not a
hidden passing matrix result. The existing warning is Starlette's deprecation
notice for the current `httpx` TestClient integration.

Boundary result:

- WordPress Ability, prompt, review, and write truth stayed local;
- Addon stayed transport-only;
- Cloud stayed runtime and read-only evidence only;
- no direct Cloud or Addon WordPress write was introduced;
- no new Provider price or billing truth was created;
- no production, AI Credit, streaming, agent loop, scheduler, or control-plane
  expansion occurred.

## Related Records

- [Independent WordPress Title External Provider E2E Revalidation](wordpress-title-external-provider-e2e-revalidation-2026-07-25.md)
- [Independent Provider Context Window And P2 Revalidation](provider-context-window-p2-revalidation-2026-07-25.md)
- [Provider Runtime Evidence Surface Validation](provider-runtime-evidence-surface-validation-2026-07-25.md)
- [Pi-Inspired Provider Runtime Compatibility Evidence](pi-provider-runtime-compatibility-evidence-2026-07-25.md)
- [Cloud Content Generation Boundary](cloud-content-generation-boundary-v1.md)
- [P5 Hardening Release Audit](p5-hardening-release-audit-2026-07-17.md)
