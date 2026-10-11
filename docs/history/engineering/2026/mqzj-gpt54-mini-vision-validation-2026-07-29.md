# MQZJ GPT-5.4 Mini Vision Validation — 2026-07-29

Status: M4 candidate evidence.

This record validates `gpt-5.4-mini` as an image-input candidate through the
existing MQZJ OpenAI-compatible Provider connection. It does not authorize
production deployment, change WordPress media ownership, or establish a
permanent Cloud media library.

## Configuration evidence

The MQZJ `/models` response exposed `gpt-5.4-mini` without modality metadata,
so the generic Provider adapter initially classified it as `text`. The
candidate source adds an evidence-gated `feature` field to
`model_metadata_overrides`: a feature override is ignored unless both `source`
and `revision` are present.

The M4 Provider connection records:

| Field | Value |
| --- | --- |
| Model | `gpt-5.4-mini` |
| Feature | `vision` |
| Context window | `400000` |
| Input price | USD `0.75` per million tokens |
| Cached-input price | USD `0.075` per million tokens |
| Output price | USD `4.50` per million tokens |
| Cache-write estimate | USD `0.75` per million tokens |
| Evidence source | `https://developers.openai.com/api/docs/models/gpt-5.4-mini` |
| Upstream endpoint variant | `responses` |

The prices intentionally follow the official OpenAI standard tariff selected
by the operator. They are runtime cost estimates and are not evidence of an
MQZJ invoice or markup policy.

## Controlled image smoke

The smoke used one existing non-sensitive Local WordPress media-library image:
a 1024 by 1024 PNG illustration of a blue ceramic mug on a white background.
The original image bytes entered Cloud through the existing 15-minute Artifact
path. No public media URL or permanent Cloud media-library record was created.

| Evidence | Result |
| --- | --- |
| M4 run | `run_60715d4df0ab4af3b559c446f5e9da7b` |
| Profile | `vision.ai` |
| Provider | `openai` adapter backed by MQZJ |
| Model | `gpt-5.4-mini` |
| Instance | `openai-global-gpt-5-4-mini` |
| Fallback used | `false` |
| Result contract | `image_context_evidence.v1` |
| Structured result | succeeded |
| Confidence | `0.98` |
| Input tokens | `1834` |
| Output tokens | `150` |
| Estimated cost | USD `0.00205` |
| Provider latency | `7531 ms` |

The returned evidence correctly identified a blue ceramic mug illustration on
a white background, found no visible text, and emitted suggestion-only ALT and
caption bases. It did not claim or perform a WordPress write.

After the successful no-fallback smoke and a second catalog refresh, the
catalog-managed M4 `vision.ai` candidate chain resolves in this order:

1. `openai-global-gpt-5-4-mini`
2. `openai-global-qwen-qwen3-omni-30b-a3b-captioner`
3. `openai-global-qwen-qwen3-omni-30b-a3b-instruct`
4. `openai-global-qwen-qwen3-omni-30b-a3b-thinking`

`vision.ai` is a generic Cloud runtime profile rebuilt from catalog
capabilities, not one of the WordPress Connector profiles saved by the Hosted
Runtime Profiles admin surface. Its durable configuration is therefore the
evidence-backed `vision` classification: each catalog refresh reconstructs the
chain with GPT-5.4 mini first while retaining the eligible Qwen fallback pool.
The controlled pilot request explicitly disabled fallback, so its Provider
evidence is attributable only to GPT-5.4 mini.

The temporary host and container transfer files were deleted. The Artifact
record and object remain subject to the normal short-TTL lifecycle.

## Boundary and next gate

- WordPress remains attachment, approval, metadata, insertion, publication,
  and deletion truth.
- Cloud owns only hosted catalog metadata, routing, execution, usage evidence,
  and the temporary Artifact lifecycle.
- M4 is candidate evidence only. GitHub merge plus clean `master` promotion is
  required before this source change is accepted on M4.
- The next product gate is the frozen first-20-image evidence pilot under the
  CNY 50 hard cap, with per-image attachment matching and human review.
