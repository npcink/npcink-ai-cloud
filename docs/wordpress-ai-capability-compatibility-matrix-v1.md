# WordPress AI Provider Compatibility Matrix v1

This matrix records the current projection between the local WordPress AI
Abilities, the Cloud task family, and the expected result shape. It is a
verification ledger, not a second Ability registry: WordPress remains the
owner of Ability names, input schemas, output schemas, prompts, permissions,
and final application.

| Ability | Cloud task | Input projection | Output shape | Cloud route | Status |
| --- | --- | --- | --- | --- | --- |
| `ai/title-generation` | `title_generation` | `source_text` | plain text after Ability-schema extraction | short text | mapped; historical candidate evidence below, current AI 1.5 quality unverified |
| `ai/excerpt-generation` | `excerpt_generation` | AI 1.5+ opaque `source_text`; legacy source/instruction projection | plain text | short text | mapped; historical candidate evidence below, current AI 1.5 quality unverified |
| `ai/meta-description` | `meta_description` | normalized source + instruction | plain text | short text | mapped; historical candidate evidence below, current AI 1.5 quality unverified |
| `ai/summarization` | `content_summary` | `source_text` | plain text | editorial | mapped; historical candidate evidence below, current AI 1.5 quality unverified |
| `ai/content-resizing` | `content_rewrite` | opaque `source_text` + optional `rewrite_action` | plain text | editorial | mapped; historical candidate evidence below, current AI 1.5 quality unverified |
| `ai/content-translation` | `content_translation` | `source_text` + `target_language` | plain text | short text | mapped; historical candidate evidence below, current AI 1.5 quality unverified |
| `ai/slug-generation` | `slug_generation` | `prompt` | JSON object from Ability schema | short text | mapped; historical candidate evidence below, current AI 1.5 quality unverified |
| `ai/content-classification` | `content_classification` | `prompt` | JSON object | classification | mapped; historical candidate evidence below, current AI 1.5 quality unverified |
| `ai/editorial-notes` | `editorial_notes` | `prompt` | JSON object from Ability schema | classification | mapped; historical candidate evidence below, current AI 1.5 quality unverified |
| `ai/editorial-updates` | `editorial_updates` | `source_text` | plain text | editorial | mapped; AI 1.5 local save patch verified with synthetic Ability/browser scenarios; hosted quality unverified |
| `ai/comment-analysis` | `comment_moderation` | `prompt` | JSON object | classification | mapped; historical candidate evidence below, current AI 1.5 quality unverified |
| `ai/suggest-reply` | `comment_reply_suggest` | `prompt` | plain text | editorial | mapped; historical candidate evidence below, current AI 1.5 quality unverified |
| `ai/alt-text-generation` | `alt_text_suggest` | media Artifact + prompt | plain text | vision | mapped vision; historical candidate evidence below, current quality unverified |
| `ai/image-prompt-generation` | `image_prompt_generation` | `prompt` | plain text | short text | mapped; historical candidate evidence below, current AI 1.5 quality unverified |

## Current source audit — 2026-11-17

This table is a record directory, not a feature switch or runtime registry.
The rows above describe the current source projection. Historical acceptance
below must not be read as fresh acceptance of installed AI 1.5.0. The
[first-batch audit and evidence](history/engineering/2026/wordpress-editor-feature-audit-2026-11-17.md)
records five real-WordPress/fake-HTTP cases for title, excerpt and resizing;
it does not establish hosted-model quality or browser adoption. The
[second batch](history/engineering/2026/wordpress-editorial-save-correctness-2026-11-17.md)
separately verifies the native editorial-update save/Notes consumer using a
local upstream patch and synthetic Ability results; this is not an upstream release.

The installed AI 1.5.0 also registers these abilities, absent from the current
Addon scene map and task compatibility list:

| Ability | Current Addon support | Disposition |
| --- | --- | --- |
| `ai/block-container-label-generation` | unsupported by this connector | local content/document context → block label; separate adaptation and review needed |
| `ai/revision-change-summary` | unsupported by this connector | local revision pair → change summary; separate adaptation and review needed |
| `ai/type-ahead` | unsupported by this connector | cursor/surrounding context → completion; outside first batch |

An enabled upstream switch or a configured text model does not prove a
particular Ability is mapped. Preserve failure-closed behavior; do not quietly
route unknown abilities through generic chat. Existing SEO specialist pauses
remain authoritative, including meta-description restrictions.

For resizing, `request.rewrite_action` is optional and limited to
`shorten|expand|rephrase`, only for `content_rewrite`. Old callers without it
retain their local length instruction; Cloud no longer unconditionally demands
same-length output. Expansion doubles only the computed default output budget,
within the existing 65,536-token ceiling. Explicit positive caller budgets and
model/context/output completeness checks remain authoritative. This optional
field does not transfer local prompt or final-write ownership to Cloud.

## Followthrough — 2026-11-18

The [current batch](history/engineering/2026/wordpress-translation-and-feature-followthrough-2026-11-18.md)
adds draft-aware title regeneration in a local AI 1.5 patch, six translation
language regressions, seven WordPress summary/translation/slug/classification/Notes
cases, and four intercepted image/comment cases. Title review was browser-tested;
comment analysis legitimately writes analysis metadata. The initial four free
local-model samples omitted composed metadata during output evaluation and the
native response format during direct HTTP execution; that acceptance claim is
withdrawn. Full-chain replay correctly rejects the JSON-string title. A later
single title uses the real Provider adapter/schema and passes; this is still one
sample, not representative quality. Translation script/length false rejections
have nine before-failing cases and 185 passing domain tests after correction;
API tests pass 254. Summary omissions remain a quality limit. Full hosted
execution, representative semantic accuracy and human adoption remain separate.

The three unmapped abilities above remain unsupported: container labels need
local block adoption review; revision summaries need revision-pair/privacy/diff
validation; type-ahead remains deferred pending core value and bounded call/privacy
semantics. No generic fallback or feature activation was added.

## Verification states

- **mapped + contract tested**: the Addon projection and Cloud contract have
  focused automated coverage.
- **mapped + schema projection**: the Ability is projected from its local
  output schema and routed through the shared runtime, but still requires a
  real WordPress editor acceptance pass before being called end-to-end
  verified.
- **needs adaptation**: the local Ability schema or media handoff is not yet
  compatible with the shared connector envelope.
- **unsupported**: the connector does not advertise the Ability.

## Historical candidate evidence snapshot (predates this audit)

The earlier candidate validation exercised the Addon's unified WordPress
acceptance command by capability family and combined the reports offline:

- thirteen non-visual abilities and one visual alt-text ability passed in
  disposable local WordPress;
- the combined Eval Lab report passed 134/134 deterministic checks;
- WordPress content state remained unchanged;
- the focused M4 provider/runtime test passed on the dirty candidate worktree.

The acceptance combiner in Eval Lab rejects duplicate Ability ids and incomplete
write evidence, so the visual run can be performed immediately after the
candidate vision configuration and then evaluated together with the text,
structured, editorial, and comment runs.

The visual run is sensitive to M4's periodic provider health scan: historical
quality failures can temporarily remove the candidate vision route. The preview
procedure therefore re-applies the candidate configuration immediately before
the visual acceptance run. This does not weaken production health scoring.

The Addon and Cloud now both fail closed when the projected `schema_hash` does
not match the projected input and output schemas. The unified acceptance report
also records `ability_registered`, `schema_hash`, per-case `evidence_state`,
and the top-level `local_verified` state when all fixed fixtures pass without a
WordPress write. Cloud applies the schema-depth allowance to both
`input_schema` and `output_schema`; ordinary runtime JSON remains on the
stricter depth limit.

This snapshot is candidate evidence, not merge, production, or human editorial
acceptance. The acceptance report remains reproducible from the Addon command
`composer acceptance:wp-ai-provider` with the optional comment and media
fixtures configured locally.

Cloud must fail closed when a structured result does not match the projected
Ability schema. It must never invent a replacement schema or apply a result to
WordPress. The Addon remains a transport and projection layer; the official
WordPress AI plugin remains the UI, review, and write owner.

## Acceptance order

1. Run the Cloud contract and connector tests for the text, structured, and
   vision groups.
2. Exercise one representative Ability from each group in a disposable local
   WordPress editor.
3. Record the observed Ability name, Cloud task, response shape, provider,
   and human application result before promoting a capability to “verified”.
