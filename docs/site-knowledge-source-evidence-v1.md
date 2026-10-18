# Site Knowledge retained-source and delivery evidence v1

Cloud remains the owner of retrieval qualification. WordPress is the public
content truth; Addon delivers sanitized text and bounded counters. No new REST
route, scheduler, registry, approval store or WordPress write lane is introduced.

An explicit Cloud operator may reconcile a complete, fresh public post/page
snapshot using `python -m app.domain.site_knowledge.source_evidence`. Dry-run is
the default; `--apply` is allowed only in development/test. The snapshot must
bind the exact site URL, declared count, unique `(source_type, source_id)` keys,
timestamp, and the exact expected retained-target ids. Missing indexed public
sources or an unexpected difference fail closed. Partial/capped snapshots must
never qualify as complete. Comments/media and other sites are outside this seam.

Apply reuses `mark_unmanifested_sources_stale`: records and embeddings remain,
and `post_status=stale` excludes them from existing public-status search before
ranking/limit. For Zilliz, existing chunk rows are upserted with the same ids,
vectors and text and the stale status before SQL qualification is committed.
Failure rolls back SQL and is safe to repeat; a partially mirrored vector store
can hide targets conservatively until a successful retry. No delete/rebuild,
embedding/rerank request or ranking-weight change occurs. A bounded receipt in
the existing site metadata records the snapshot digest, not a second manifest
registry. A later ordinary public-content refresh may requalify a republished
source. Frozen v1 source/index observations remain the offline comparison.
`source_eligibility_receipt` is a timestamped last-action receipt, not current
index counts or an independent eligibility authority; row status remains truth.

Addon post/page documents may add `delivery_evidence`:

- `contract_version=site_knowledge_delivery_evidence.v1`;
- `projection_version=wordpress_public_text_bytes.v1`;
- `length_basis=sanitized_public_text_before_byte_limit`;
- nonnegative integer `source_bytes`, `source_chars`, `delivered_bytes`,
  `delivered_chars`, positive `max_bytes`, and boolean `truncated`.

Counters describe the existing sanitized text, not raw private content. Cloud
checks the delivered counters against the actual received UTF-8 text and checks
source/delivery/limit consistency. Missing evidence stays unknown; malformed
evidence is rejected. The existing 1,800-byte projection and embedding input
stay identical. The metadata is excluded from content hashes. Cloud keeps its
own `content_truncated` meaning; separate `delivery_truncated` and the aggregate
`truncated`/status count include upstream clipping.

The operator can attach evidence to unchanged indexed documents in the same
snapshot. Every delivered content hash must match before any mutation; existing
vectors, chunk ids, text, embedding space and indexed timestamps stay intact.
Rollback is an owner-reviewed status restoration of the exact retained cohort
and matching external payloads, or normal refresh after actual republication;
it does not require deleting or reconstructing retained content.

## Development verification, 2026-10-19

The M4 candidate at `97ccdb892a3af8488a843857c8f50e340dde636b` passed
63 focused domain/API cases. The fresh WordPress snapshot contained 1,999
public sources. The operator action isolated exactly 64 historical documents
and 78 chunks, preserved their retained-content digest, attached evidence to
12 unchanged documents, and made zero embedding calls. The qualified pool is
1,999 documents/2,217 chunks; retained records remain stored separately.

Eval Lab's SQL READ ONLY comparison produced all 48 observations and exactly
reproduced the original 24 frozen-v1 results using the retained pool. Actual
Addon transport returned HTTP 200 JSON for all 24 queries, matching the new
qualified-pool results, with no retained ids. Only the two recommendation
families for article 5825 changed: historical target 278162 no longer occupies
rank one and the next eligible target fills the bounded result list. This
proves qualification behavior, not improved semantic accuracy.

The 12 delivery hashes match; six sources expose upstream clipping. The text
limit and embedding inputs have not expanded. Execution artifacts are retained
in Eval Lab under `link-recommendation/generated/source-eligibility-v2-2026-10-19/`.
These are developer observations, not human gold or production acceptance.
