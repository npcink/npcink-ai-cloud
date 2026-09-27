# WordPress AI Provider Compatibility Matrix v1

This matrix records the current projection between the local WordPress AI
Abilities, the Cloud task family, and the expected result shape. It is a
verification ledger, not a second Ability registry: WordPress remains the
owner of Ability names, input schemas, output schemas, prompts, permissions,
and final application.

| Ability | Cloud task | Input projection | Output shape | Cloud route | Status |
| --- | --- | --- | --- | --- | --- |
| `ai/title-generation` | `title_generation` | `source_text` | plain text after Ability-schema extraction | short text | M4 + WordPress acceptance verified |
| `ai/excerpt-generation` | `excerpt_generation` | `prompt` | plain text | short text | M4 + WordPress acceptance verified |
| `ai/meta-description` | `meta_description` | `prompt` | plain text | short text | M4 + WordPress acceptance verified |
| `ai/summarization` | `content_summary` | `source_text` | plain text | editorial | M4 + WordPress acceptance verified |
| `ai/content-resizing` | `content_rewrite` | `source_text` | plain text | editorial | M4 + WordPress acceptance verified |
| `ai/content-translation` | `content_translation` | `prompt` | plain text | short text | M4 + WordPress acceptance verified |
| `ai/slug-generation` | `slug_generation` | `prompt` | JSON object from Ability schema | short text | M4 + WordPress acceptance verified |
| `ai/content-classification` | `content_classification` | `prompt` | JSON object | classification | M4 + WordPress acceptance verified |
| `ai/editorial-notes` | `editorial_notes` | `prompt` | JSON object from Ability schema | classification | M4 + WordPress acceptance verified |
| `ai/editorial-updates` | `editorial_updates` | `source_text` | plain text | editorial | M4 + WordPress acceptance verified |
| `ai/comment-analysis` | `comment_moderation` | `prompt` | JSON object | classification | M4 + WordPress acceptance verified |
| `ai/suggest-reply` | `comment_reply_suggest` | `prompt` | plain text | editorial | M4 + WordPress acceptance verified |
| `ai/alt-text-generation` | `alt_text_suggest` | media Artifact + prompt | plain text | vision | M4 + WordPress acceptance passed; candidate health reset required before each run |
| `ai/image-prompt-generation` | `image_prompt_generation` | `prompt` | plain text | short text | M4 + WordPress acceptance verified |

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

## Current evidence snapshot

The latest candidate validation exercised the Addon's unified WordPress
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
