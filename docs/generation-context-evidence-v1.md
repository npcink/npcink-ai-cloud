# Generation Context Evidence v1

Status: candidate contract; see [dated validation and remaining gates](background-evidence-and-cron-handoff-2026-09-09.md).

## Scope and Meaning

WordPress connector results may include `result.generation_context`, with
`contract_version=generation_context_evidence.v1`. This is Cloud execution
evidence, not approval, publishing, model obedience, or output-quality evidence.
An embedding call alone does not establish that context was applied.

Cloud snapshots validated metadata immediately after preparing the provider
request and before provider execution. Public request metadata and provider
output are not evidence sources. The snapshot contains no source text, retrieved
chunks, titles, credentials, or prompts. Generic runtime tasks are unchanged.

## Fields

| Field | Meaning |
| --- | --- |
| `status` | `applied`, `unavailable`, or `not_requested` |
| `mode` | A supported task-specific context mode, or `none` |
| `reason` | Bounded reason consistent with status |
| `reference_count` | Number of assembled references, not embedding calls or source posts |
| `context_chars` | Assembled context character count, not tokens or total prompt length |

`applied` requires `references_applied`, a supported mode, and positive counts.
Style profiles allow at most one reference and 400 characters; taxonomy history
allows 20 references and 1200 characters, following existing context policies.
Counts reject booleans, strings, floats, negative values, and nested objects.

`unavailable` has zero counts and one of: `task_policy_unavailable`,
`scene_input_empty`, `retrieval_failed`, `insufficient_evidence`,
`context_assembly_failed`, `no_usable_references`.
`not_requested` has zero counts and `reference_disabled_or_unsupported`.
Unknown contract versions, malformed values, or missing snapshots are omitted,
not coerced into successful evidence. Old runs remain unrecorded; never infer
their context status from provider/embedding calls.

## Persistence and Compatibility

The field is additive to successful connector results. Inline execution and
queued execution use the same preparation and finalization path. Result polling
returns the stored snapshot, without rerunning retrieval or reconstructing it.
The separate run-status endpoint is not extended by this change.

For `no_store`, only the original in-memory response may contain the snapshot.
Database results, subsequent polling, and idempotent replay omit it. Existing
result-retention expiry continues to reject expired result requests. There is
no separate evidence table or retention policy.

## Validation and Rollback

Focused tests are in `tests/domain/test_wordpress_ai_generation_context.py`,
`tests/domain/test_wordpress_operation_runtime.py`, and
`tests/api/test_wordpress_ai_connector_runtime.py`. They cover value validation,
actual request assembly, failure/disabled states, metadata spoofing and mutation,
worker persistence, no-store, historical absence, and retention expiry.

This change does not modify WordPress content, Addon UI, model configuration,
database schema, or production. Reverting the scoped code removes future
projection; existing results remain compatible additive JSON. Candidate M4
validation is not merged-master acceptance or proof for historical live runs.
