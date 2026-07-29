# Cloud Image Context Evidence Runtime Contract v1

`npcink-cloud/image-context-evidence` is a Cloud hosted vision runtime ability for
WordPress media review surfaces.

It accepts bounded public media URLs or same-site short-TTL source artifacts
from a connected local plugin, calls the configured `vision.ai` hosted model
profile, and returns
`image_context_evidence.v1` evidence for ALT/caption suggestion workflows.

## Runtime Boundary

- Cloud owns hosted model execution and result normalization.
- Local WordPress plugins own media enumeration, operator review, and any
  governed handoff to WordPress abilities/Core.
- The result is suggestion-only evidence. It is not a WordPress write, approval
  record, workflow registry entry, or audit source of truth.

## Request

- `ability_name`: `npcink-cloud/image-context-evidence`
- `contract_version`: `image_context_evidence_request.v1`
- `profile_id`: `vision.ai`
- `execution_kind`: `image_context_evidence`
- `execution_pattern`: `inline`
- `data_classification`: `public_site_media_metadata` for URL-only requests or
  `internal` when any item uses a source artifact
- `storage_mode`: `result_only`

Input may be the request object directly or under
`image_context_evidence_request`. It must include 1 to 10 items. Each item must
include `attachment_id` and exactly one source mode:

- `source_url` and/or `thumbnail_url`; or
- one canonical `source_artifact_id` created by the same authenticated site.

Artifact inputs are admitted before run creation, revalidated and
checksum-read immediately before Provider preparation, and converted to a
transient data URL only at the private Provider edge. Artifact bytes, Base64,
storage keys, and local filesystem paths do not enter the runtime request,
result, ordinary diagnostics, or relational storage. Existing per-image 8 MiB
validation applies, with a 24 MiB aggregate Artifact budget per request.

Forbidden input includes provider secrets, confirmation tokens, approval
decisions, and any WordPress write/control fields.

## Result

The result contract is `image_context_evidence.v1`:

- `artifact_type`: `image_context_evidence`
- `items`: evidence keyed by requested `attachment_id`
- `requires_human_visual_check`: `true`
- `write_posture`: `suggestion_only`
- `direct_wordpress_write`: `false`

Each item may include `visual_summary`, `visible_text`, `subject_tags`,
`alt_text_basis`, `caption_basis`, `confidence`, and `uncertainty_flags`.

If the provider does not return parseable structured evidence, the run fails
instead of fabricating visual evidence from text-only metadata.
