# ADR-057: Keep WordPress AI Quality Evidence Payload-Free

## Status

Accepted. This decision applies to the WordPress AI connector runtime and its
development acceptance reports.

## Date

2026-09-29

## Context

The official WordPress AI plugin accepts a successful connector result only
when the result has the expected Ability shape and usable content. A provider
can still return HTTP 200 with an empty response, a malformed translation, or
an empty editorial suggestion set. The Cloud runtime already fails closed for
these cases, but the Addon acceptance report previously showed only a generic
provider failure. That made it impossible to distinguish a provider quality
failure from a contract, configuration, or transport failure without reading
Cloud-side evidence.

The WordPress editor must remain simple and the official plugin must remain
unchanged. Diagnostic data must therefore stay out of the official Ability
result and must never contain source text, generated text, prompts, or
credentials.

## Decision

1. Structure-sensitive connector tasks (translation, taxonomy JSON, editorial
   notes, and Slug JSON) use temperature `0.0` by default. An explicit local
   request temperature remains authoritative.
2. Translation prompts explicitly preserve Gutenberg delimiters, HTML tags,
   block order, links, attributes, and code markers; only visible human text
   may be translated.
3. Editorial-notes prompts require at least one actionable suggestion when an
   objective issue is present. An empty array remains valid when no material
   issue exists.
4. When Cloud rejects unusable connector output, it records only a bounded
   `output_quality_reason` under the versioned
   `wordpress_ai_connector_quality.v1` diagnostic contract. A successful retry
   clears the transient diagnostic.
5. Runtime execute responses include the existing `cloud_run_state.v1` object
   as an additive `run_state` field. Its error projection may contain the
   quality contract version and reason, but never content payloads.
6. The Addon keeps the official WordPress error message unchanged. Its
   development-only acceptance report records `provider_run_id`, failure
   stage, Cloud error code, and quality reason when available.

## Alternatives considered

### Relax the quality gate

Rejected. Accepting an empty or structurally unsafe translation would move a
provider defect into the WordPress editor and could corrupt block content.

### Add a Cloud-specific UI

Rejected. The official WordPress AI plugin owns the editor interaction. Cloud
diagnostics belong in acceptance evidence and operator tooling, not a second
editor surface.

### Store prompts or generated content in diagnostics

Rejected. It would expand Cloud's data ownership and make a development
diagnostic path a content-retention path.

## Consequences

- Repeated provider output is more reproducible for structure-sensitive tasks.
- A failed acceptance case can identify `translation_structure_drift`,
  `empty_output_text`, or another bounded reason without inspecting content.
- A successful retry does not leave stale failure evidence on the run.
- The runtime response is additive and remains compatible with existing Addon
  consumers that ignore unknown fields.
- Provider quality can still vary; fixed WordPress acceptance samples and Eval
  Lab remain required for semantic confirmation.

## Verification

- Cloud focused connector, projection, and API suites pass.
- Addon PHP syntax, behavior, static, and forbidden-write checks pass.
- M4 candidate acceptance passes the full fixed WordPress suite with 14/14
  cases and no WordPress writes.
- Eval Lab deterministic quality evaluation passes the translation, block
  translation, editorial-notes, category, and tag samples.

## Rollback

Revert the Cloud and Addon commits together. Do not remove the fail-closed
quality gate while rolling back the diagnostic projection; if the response
field must be withdrawn, first update the Addon consumer and its contract
tests in the same reviewed change.
