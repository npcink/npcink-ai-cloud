# SEO Specialist Runtime Pause

Status: development candidate, 2026-10-18.

Cloud temporarily rejects dedicated SEO/AEO/GEO tasks at the WordPress
operation contract boundary, with `wordpress_operation.feature_paused` (HTTP
400). The check precedes both legacy task handling and task-contract validation,
so a local task contract does not bypass availability. Local Ability definitions,
WordPress approvals and final writes remain outside Cloud.

The paused identifiers are recorded in `PAUSED_DISCOVERABILITY_TASKS` in
`app/domain/wordpress_ai_connector/contracts.py`. Ordinary title, summary,
excerpt, translation, classification, slug and ALT tasks stay available. This
is a runtime availability list, not an Ability registry or prompt-keyword ban.
An article or image request may still discuss SEO as ordinary subject matter.

SEO-only editorial review is refused. Mixed review retains grammar,
readability and accessibility; result normalization removes specialist review
types. New Nightly inspection results use `nightly_content_quality_score.v3`
and do not penalize absent or short SEO descriptions. Existing v2 results are
not rewritten, and result/history read endpoints remain unchanged.

There is no migration, destructive cleanup, data backfill, new service or
runtime configuration. Existing specialist implementations remain for a future
reviewed restoration. Restore by reverting this focused change and repeating
the current contract, consumer and runtime gates; do not treat old approvals,
caches or historical scores as new execution permission.

The corresponding product and transport pause belongs to Workflow Toolbox and
Cloud Addon. Toolkit, Core, Adapter and Eval are not modified by this task, so
this record does not claim a platform-wide SEO write prohibition. See the
[three-repository implementation record](../../npcink-workflow-toolbox/docs/seo-specialist-pause-implementation-2026-10-18.md)
for the exact evidence state and remaining runtime limitations.
