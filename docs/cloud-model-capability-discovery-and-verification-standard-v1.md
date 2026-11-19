# Cloud Model Capability Discovery and Verification Standard v1

Status: active engineering and product standard.

Purpose: define how Cloud decides whether a Provider model can be used for a
specific runtime capability. This standard applies to text, image input
(vision), embeddings (vector), image generation, audio generation, and video
generation.

## 1. Plain-language Rule

An upstream model's advertised capability is not the same as the capability of
the configured Provider route:

```text
official model capability
  -> external catalog reference
  -> current Provider endpoint verification
  -> Cloud routing eligibility
```

Third-party or official metadata may discover and pre-classify a model. Cloud
must only route a model after the exact Provider connection, model id, endpoint,
and request format have passed a capability-specific probe.

For example, OpenAI may document that GPT-5.4 accepts images, while an
OpenAI-compatible gateway may omit modality metadata or fail to forward image
input. The Cloud model must remain unverified until that route is checked.

## 2. Scope and Boundary

Cloud owns hosted catalog metadata, Provider compatibility evidence, routing
eligibility, probe results, usage evidence, and runtime execution.

The local WordPress stack continues to own ability and workflow truth, prompts,
approval, preflight, adoption, final writes, and publication. This standard
does not create a second model registry or a second local control plane.

This standard is about capability verification only. It does not authorize a
Provider, model, prompt, preset, or WordPress write that another contract
forbids.

### 2.1 Capability reliability is not output quality

Keep two evidence loops separate:

| Evidence loop | Question answered | Typical evidence |
| --- | --- | --- |
| Capability reliability | Can this exact Provider route execute the capability correctly and consistently? | probe success, timeout, authentication, quota, explicit unsupported response, valid artifact or vector |
| Product/output quality | Was the result useful, relevant, accurate, and worth adopting? | accept, reject, replace, edit distance, recommendation click/adoption, human review |

A successful vision probe does not prove that ALT text is accurate. A valid
embedding vector does not prove that related-content ranking is relevant. A
decodable image or audio artifact does not prove that its content is good.
Conversely, a timeout or quota error says nothing about the model's semantic
quality. Do not use capability-probe success rate as a recommendation-quality
score or training label.

## 3. Capability Taxonomy

| Cloud capability | Input | Expected output | Example profile |
| --- | --- | --- | --- |
| `text` | text | text/structured text | text generation |
| `vision` | text plus image/file | text/structured evidence | image ALT vision |
| `embedding` | text | numeric vector | vector search |
| `image_generation` | text, optional image | image artifact | featured image |
| `audio_generation` | text | audio artifact | voice output |
| `video_generation` | text, optional image | video artifact or job | video output |

Capabilities are independent. A model verified for `vision` is not thereby
verified for `image_generation`, `audio_generation`, or `video_generation`.

## 4. Evidence States

Every Provider/model/capability combination has one of these states:

- `unverified`: metadata suggests the capability, but the current route has not
  passed a probe;
- `verified`: the capability-specific probe succeeded for the exact route;
- `unsupported`: the Provider explicitly rejected the capability or returned a
  stable, capability-specific incompatibility;
- `verification_failed`: timeout, authentication, quota, network, or another
  transient/unknown failure prevented a conclusion.

Only `verified` instances are routing-eligible. `unsupported` and
`verification_failed` must not be silently converted to one another. A
transient failure must remain retryable rather than permanently blacklisting a
model.

## 5. External Metadata

Cloud may use official Provider documentation and reputable open metadata
projects such as [models.dev](https://github.com/anomalyco/models.dev),
[LiteLLM](https://github.com/BerriAI/litellm), and the OpenRouter model
directory as discovery and cross-check sources.

External metadata may provide fields such as:

- `input_modalities`;
- `output_modalities`;
- `supports_vision`;
- context and output limits;
- Provider and endpoint notes.

External metadata is reference evidence, not runtime authority. It may be
stale, describe the upstream model rather than a gateway deployment, or omit
Provider-specific request restrictions. Cloud must record the source and
retrieval/revision information when using it, and must not mark an instance
`verified` from metadata alone.

### 5.1 Partial Provider Catalogs

An OpenAI-compatible Provider's model-list response is discovery evidence, not
deletion authority for models the operator has explicitly enabled. When a
non-empty refresh omits an enabled model, Cloud keeps a bounded runtime
candidate for that Provider/model route and marks it:

- `catalog_source=configured_selection`;
- `upstream_status=missing_from_latest_catalog`;
- health unknown and capability unverified.

The candidate remains visible so the operator can run the capability-specific
probe. It is not routing-eligible for vision, image generation, or audio
generation until that probe succeeds. A completely empty or failed Provider
catalog response must not replace the last usable catalog. Disabling the model
removes this continuity protection on the next successful refresh.

Admin projections may expose `catalog_source` and `upstream_status` to explain
why a model is visible. UI copy must distinguish "seen in the last upstream
catalog" from current route verification.

### 5.2 Independent image operation declarations

Image generation and editing are separate endpoint declarations on one model,
not mutually exclusive model categories. The runtime/evidence capability stays
`image_generation`; `image_generations` (JSON) and `image_edits` (multipart)
remain separate route fingerprints, candidate lists and verification results.

In `/admin/ai-resources`, Configure → Model management → the model's
Details / capabilities entry owns capability corrections for every supported
model type. The existing `feature` override permits text, vision, embedding or
image; it uses the existing operator source/revision fields, filled by the UI.
Image models additionally expose two independent checkboxes: generation and
editing. Switching to a non-image type explicitly clears both image flags, so
stale provider metadata and legacy image endpoints cannot restore image routes.
Conflicting upstream base capability tags are removed when an operator type
is present. Other metadata and transport identities remain preserved.
There is no image-only row entry, persistent automatic mode, or third-party
known-model fallback table. The row shows compact capabilities; the shared
scope note explains once that saving does not verify support. Text/vision
model tests remain inside the same details entry, disabled while that model's
capability draft differs from the saved configuration. Verification still
uses saved configuration. Frequent filters and counted enable/disable actions
remain visible; batch edits retain confirmation and only save with the supplier.

Before the operator saves a model's image choices, a non-empty
`supported_endpoints` list from the provider supplies the initial values.
Existing adapter inference can still suggest generation for an image model;
model names, image input, and broad OpenAI compatibility never imply editing.
Without explicit editing metadata the editing checkbox starts unchecked.

The supplier form's existing save action captures the selected image models'
values in `config.model_metadata_overrides[model_id].image_capabilities`:

```json
{"image_generation": true, "image_editing": false}
```

These two saved booleans take precedence over later provider metadata. Refresh
and partial catalogs keep the choices; there is no restore-auto control.
New flags require neither a source/revision field nor a second registry.
Existing price/context/response-format metadata and legacy endpoint declarations
are retained. Legacy declarations still require their existing provenance;
new boolean choices take precedence without altering legacy instance identity.
The existing 100-model override bound applies.

Checkboxes only permit an operation as a candidate. Verification remains
separate for generation and editing, keyed by the exact route fingerprint.
Only the existing verification flow can grant fresh verified evidence.
An unchecked operation is removed on catalog refresh and blocked before any
upstream dispatch when a stale binding remains. An enabled image model missing
from a partial catalog remains unverified with unknown health. Generation and
editing retain their existing instance identities when toggled independently.

## 6. Capability Probes

Each capability has a minimal, bounded probe contract:

| Capability | Probe | Success condition |
| --- | --- | --- |
| `text` | short deterministic text request | valid text/structured response |
| `vision` | standard non-sensitive test image plus a fixed question | valid text/evidence response that consumed the image |
| `embedding` | one short text input | numeric vector returned with stable dimension |
| `image_generation` | lowest-cost simple prompt | valid image artifact can be fetched and decoded |
| `audio_generation` | one short sentence | valid audio artifact can be fetched and decoded |
| `video_generation` | lowest duration/quality accepted by the Provider | job completes or a valid asynchronous job contract is returned; a completed artifact is required before routing as fully verified |

Probes must use synthetic or approved non-sensitive fixtures, bounded timeouts,
and the lowest reasonable token, resolution, duration, or item count. They must
not write to WordPress or create permanent Cloud media records.

For artifact capabilities, a successful HTTP response alone is insufficient:
the returned bytes and media type must be validated. For asynchronous video,
job acceptance and artifact completion are separate evidence levels.

## 7. Configuration Save Flow

The Admin action should be named **Verify and save** for a model that is not
already verified:

1. The UI shows external metadata as `unverified` and identifies its source.
2. The operator selects a model and capability.
3. Cloud executes the capability-specific probe for the exact Provider route.
4. On success, Cloud stores the evidence and saves the candidate binding.
5. On explicit incompatibility, Cloud rejects the save with a clear reason.
6. On timeout or infrastructure failure, Cloud does not save and reports that
   verification could not be completed; the operator may retry.

An already verified result may be saved without another paid probe while its
evidence is fresh and the route fingerprint is unchanged.

## 8. Evidence Cache and Invalidation

Probe evidence is keyed by the complete route fingerprint:

```text
Provider connection + upstream model id + capability + endpoint variant + request format
```

It must not be keyed by model name alone. A single model can support vision on
one Provider and text-only behavior on another.

Verified Provider-route evidence expires after 30 days in the current internal
development stage. Expired evidence is not projected as verified, cannot be
used to save a runtime profile, and is filtered from runtime routing until the
operator verifies that route again. Cloud does not automatically spend Provider
budget to renew it. Invalidate evidence earlier when the Provider connection,
model id, endpoint variant, request schema, or relevant model revision changes.

## 9. Cost and Failure Controls

- Do not generate paid calls solely to populate the catalog.
- Prefer metadata-only discovery until an operator actually selects a
  capability.
- Reuse a fresh verified result for the same route fingerprint instead of
  issuing another Provider call. Expired or route-mismatched evidence must run
  a new probe; failed evidence remains manually retryable.
- Use the smallest valid probe and enforce per-Provider probe budgets.
- Do not retry the same external-transfer failure indefinitely.
- Never classify a network or quota failure as `unsupported`.
- Keep probe prompts, images, and provider payloads out of ordinary quality
  summaries; retain only metadata and bounded diagnostics.

Video and high-resolution image probes require stricter operator confirmation
because they can be materially more expensive than text, vector, or vision
probes.

## 10. UI Requirements

The model directory and runtime profile editor should expose:

- capability under test;
- evidence state;
- evidence source and revision;
- Provider and endpoint;
- last verification time;
- a reason for rejection or an actionable retry state.

Do not label a model simply as “supports vision” when that statement comes only
from an external catalog. Prefer “视觉候选，尚未验证” until the exact route
passes.

The runtime-profile Admin may expose a compact, read-only probe summary. Keep
it behind a low-frequency disclosure so configuration remains the primary job.
The summary may show attempts, verified/failed counts, success rate, capability,
instance, recent error code, and time window. It must state or preserve the
semantic boundary above: these numbers diagnose route reliability and cost;
they do not rank generated content or recommendations.

## 11. Single-Operator Observation Policy

During internal development with one real operator:

1. Use vision, embedding, image generation, and audio generation normally.
2. Let configuration-time verification create metadata-only evidence; do not
   manufacture a fixed number of paid probes.
3. Reuse fresh verified evidence and retry only failed, expired, or changed
   routes when the operator has a real configuration need.
4. Inspect error distribution when a real failure appears or after enough
   natural attempts exist to reveal a repeated pattern.
5. Change Provider routing, timeout, or adapter behavior only when evidence
   identifies a concrete failure class. A tiny sample is diagnostic evidence,
   not a percentage baseline or SLA.

The metadata-only probe audit may retain capability, state, route fingerprint,
instance scope, error code, and time. It must not retain the probe prompt,
image, audio, Provider credential, or raw Provider payload. Product-quality
improvement uses its own consented feedback contracts and must not infer human
preference from capability probes.

## 12. Rollout Order

Implement the shared evidence shape and probe result contract first, then add
capability probes in this order:

1. vision, because it currently blocks ALT and image understanding;
2. embedding, because probes are cheap and vector quality depends on route
   correctness;
3. image generation, because artifact validation is already a product need;
4. audio generation;
5. video generation, after cost and asynchronous job evidence are settled.

The first implementation should reuse existing Provider adapters, catalog
models/instances, runtime profile validation, artifact lifecycle, and usage
evidence. It should not introduce LiteLLM, a new gateway, or another registry
merely to obtain capability labels.

## 13. Decision Summary

The accepted design is:

> External metadata discovers candidates. Configuration-time probes verify the
> exact Provider route. Only verified capabilities are routable. Results are
> cached by route fingerprint and invalidated when the route changes.

This avoids manually testing every model in advance while preventing the
opposite failure: trusting a model's marketing or upstream metadata when the
configured gateway cannot actually execute that capability.
